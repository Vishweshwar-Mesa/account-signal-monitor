import { ARJUN_COLS, CRM_COLS, SYSTEM_COLS, type Writer } from "./cols";
import type { Q } from "./db";

// The ONLY three ways to update the accounts table (D02).
// Each one rejects keys outside its group, sets app.writer for the Postgres guard trigger,
// and writes an audit row in the same transaction.

export class ColumnOwnershipError extends Error {}

const GROUPS: Record<Writer, readonly string[]> = { system: SYSTEM_COLS, crm: CRM_COLS, user: ARJUN_COLS };
const ACTOR: Record<Writer, string> = { system: "system", crm: "hubspot_sync", user: "arjun" };
const JSON_COLS = new Set(["score_breakdown"]);

export function assertColumns(writer: Writer, patch: Record<string, unknown>) {
  const allowed = GROUPS[writer];
  const bad = Object.keys(patch).filter((k) => !allowed.includes(k));
  if (bad.length) {
    throw new ColumnOwnershipError(`${writer} writer may not write: ${bad.join(", ")}`);
  }
}

interface TxRunner {
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
}

async function guardedUpdate(db: TxRunner, writer: Writer, id: string, patch: Record<string, unknown>) {
  assertColumns(writer, patch);
  const keys = Object.keys(patch);
  if (!keys.length) return;
  await db.tx(async (q) => {
    await q.query("select set_config('app.writer', $1, true)", [writer]);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const before = await q.query(`select ${cols} from accounts where id = $1 for update`, [id]);
    if (!before.rows.length) throw new Error(`account ${id} not found`);
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}${JSON_COLS.has(k) ? "::jsonb" : ""}`).join(", ");
    const values = keys.map((k) => (JSON_COLS.has(k) && patch[k] != null ? JSON.stringify(patch[k]) : patch[k]));
    await q.query(`update accounts set ${sets} where id = $1`, [id, ...values]);
    await q.query(
      "insert into audit (actor, account_id, columns, old, new) values ($1, $2, $3, $4::jsonb, $5::jsonb)",
      [ACTOR[writer], id, keys, JSON.stringify(before.rows[0]), JSON.stringify(patch)],
    );
  });
}

/** Pipeline and scorer. Only SYSTEM_COLS. */
export function updateAccountSystemColumns(db: TxRunner, id: string, patch: Record<string, unknown>) {
  return guardedUpdate(db, "system", id, patch);
}

/** HubSpot sync. Only CRM_COLS. */
export function updateAccountCrmColumns(db: TxRunner, id: string, patch: Record<string, unknown>) {
  return guardedUpdate(db, "crm", id, patch);
}

/** Dashboard, on behalf of signed-in Arjun. Only ARJUN_COLS. */
export function updateAccountUserColumns(db: TxRunner, id: string, patch: Record<string, unknown>) {
  return guardedUpdate(db, "user", id, patch);
}
