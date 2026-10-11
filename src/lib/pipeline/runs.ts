import type { Db } from "../db";

export interface RunCounts {
  discovered: number;
  fetched: number;
  skipped_seen: number;
  gated_out: Record<string, number>;
  extracted: number;
  rejected_by_validator: Record<string, number>;
  events_written: number;
  accounts_rescored: number;
  gemini_calls: number;
  stopped?: string;
  hubspot?: string;
  [k: string]: unknown;
}

export const newCounts = (): RunCounts => ({
  discovered: 0, fetched: 0, skipped_seen: 0, gated_out: {}, extracted: 0, rejected_by_validator: {},
  events_written: 0, accounts_rescored: 0, gemini_calls: 0,
});

export async function startRun(db: Db, job: "ingest" | "morning", now = new Date()) {
  const r = await db.query<{ id: string }>("insert into runs (job, started_at) values ($1, $2) returning id", [job, now]);
  return r.rows[0].id;
}

export async function finishRun(db: Db, id: string, status: "ok" | "partial" | "failed", counts: object, error: string | null) {
  await db.query("update runs set finished_at = now(), status = $2, counts = $3::jsonb, error = $4 where id = $1", [id, status, JSON.stringify(counts), error]);
}

/** True when the last two runs of this job both failed (R5 alert rule). */
export async function failedTwice(db: Db, job: "ingest" | "morning") {
  const r = await db.query<{ status: string }>("select status from runs where job = $1 and status <> 'running' order by started_at desc limit 2", [job]);
  return r.rows.length === 2 && r.rows.every((x) => x.status === "failed");
}
