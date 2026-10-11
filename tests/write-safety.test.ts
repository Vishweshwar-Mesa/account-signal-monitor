import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { updateAccountSystemColumns, updateAccountUserColumns, updateAccountCrmColumns, ColumnOwnershipError } from "@/lib/accounts-write";
import { runIngest } from "@/lib/pipeline/ingest";
import { runMorning } from "@/lib/morning";
import { generateSoftTouch } from "@/lib/drafts";
import { ARJUN_COLS, CRM_COLS, SYSTEM_COLS } from "@/lib/cols";
import { NOW, fixtureDeps, fakeMailer, fakeText } from "./helpers/fixtures";

// Section 6: the headline requirement. Arjun's own words survive every system job, byte for byte.
let db: Db;
let id: string;
const ARJUN = ["notes", "last_contacted_at", "relationship_read", "my_draft"] as const;
const snapshot = async () =>
  (await db.query<Record<string, string>>(
    "select notes, last_contacted_at::text as last_contacted_at, relationship_read, my_draft from accounts where id = $1", [id])).rows[0];

beforeAll(async () => {
  process.env.ARJUN_EMAIL = "arjun@example.com";
  db = await createPgliteDb();
  const r = await db.query<{ id: string }>(
    `insert into accounts (name, aliases, sector, employee_count, frontline_share, multi_site, is_active, notes, last_contacted_at, relationship_read, my_draft)
     values ('Test Retail Co', '{}', 'retail', 1800, 'high', true, true,
       'Met Ravi at the Mumbai expo. Wants a pilot in Q1. Ünïcode and "quotes" stay exact.', '2026-08-01T10:15:30.123456Z',
       'Warm, but budget is tight until April.', 'Hi Asha, congratulations on the new role.') returning id`);
  id = r.rows[0].id;
});
afterAll(async () => db.close());

describe("write safety (D02)", () => {
  it("full ingest + scoring + morning job leave Arjun's four columns byte-identical", async () => {
    const before = await snapshot();
    const ingest = await runIngest(db, { now: NOW, deps: fixtureDeps(), timeBudgetMs: 60_000 });
    expect(ingest.counts.events_written).toBeGreaterThan(0);
    const mailer = fakeMailer();
    await runMorning(db, { now: NOW, mailer, text: fakeText, forceHotList: true });
    expect(mailer.sent.length).toBe(2);
    const after = await snapshot();
    for (const c of ARJUN) expect(after[c]).toBe(before[c]);
    // and the system really did write its own columns
    const sys = (await db.query<{ score: number; band: string }>("select score, band from accounts where id = $1", [id])).rows[0];
    expect(sys.score).toBeGreaterThanOrEqual(8);
    expect(sys.band).toBe("hot");
  });

  it("a system write to notes throws in code", async () => {
    await expect(updateAccountSystemColumns(db, id, { notes: "overwritten" })).rejects.toThrow(ColumnOwnershipError);
    await expect(updateAccountCrmColumns(db, id, { my_draft: "x" })).rejects.toThrow(ColumnOwnershipError);
    await expect(updateAccountUserColumns(db, id, { score: 10 })).rejects.toThrow(ColumnOwnershipError);
  });

  it("the Postgres trigger rejects a system write to notes even if code is bypassed", async () => {
    await expect(db.tx(async (q) => {
      await q.query("select set_config('app.writer', 'system', true)");
      await q.query("update accounts set notes = 'overwritten' where id = $1", [id]);
    })).rejects.toThrow(/may not change notes/);
  });

  it("the trigger rejects any update with no writer set", async () => {
    await expect(db.query("update accounts set score = 3 where id = $1", [id])).rejects.toThrow(/no writer set/);
  });

  it("regenerating a system draft never changes my_draft", async () => {
    const before = await snapshot();
    const d1 = await generateSoftTouch(db, id, "warm", fakeText);
    const d2 = await generateSoftTouch(db, id, "curious", fakeText);
    expect(d1.length).toBeGreaterThan(0);
    const row = (await db.query<{ system_draft: string; draft_tone: string; my_draft: string }>(
      "select system_draft, draft_tone, my_draft from accounts where id = $1", [id])).rows[0];
    expect(row.system_draft).toBe(d2);
    expect(row.draft_tone).toBe("curious");
    expect(row.my_draft).toBe(before.my_draft);
  });

  it("every guarded write leaves an audit row with the right actor", async () => {
    await updateAccountUserColumns(db, id, { relationship_read: "Changed by Arjun" });
    const a = (await db.query<{ actor: string; columns: string[] }>("select actor, columns from audit where account_id = $1 order by at desc limit 1", [id])).rows[0];
    expect(a).toEqual({ actor: "arjun", columns: ["relationship_read"] });
    const sys = (await db.query<{ n: string }>("select count(*) n from audit where actor = 'system' and 'notes' = any(columns)")).rows[0];
    expect(Number(sys.n)).toBe(0);
  });

  it("code column groups match the database function and do not overlap", async () => {
    for (const [w, cols] of [["system", SYSTEM_COLS], ["crm", CRM_COLS], ["user", ARJUN_COLS]] as const) {
      const r = (await db.query<{ c: string[] }>("select sm_writer_cols($1) c", [w])).rows[0];
      expect([...r.c].sort()).toEqual([...cols].sort());
    }
    const all = [...SYSTEM_COLS, ...CRM_COLS, ...ARJUN_COLS];
    expect(new Set(all).size).toBe(all.length);
  });
});
