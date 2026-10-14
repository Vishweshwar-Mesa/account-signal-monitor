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
  accounts_checked?: number;
  accounts_total?: number;
  resume_from?: string;
  feed_errors?: number;
  hubspot?: string;
  [k: string]: unknown;
}

export const newCounts = (): RunCounts => ({
  discovered: 0, fetched: 0, skipped_seen: 0, gated_out: {}, extracted: 0, rejected_by_validator: {},
  events_written: 0, accounts_rescored: 0, gemini_calls: 0,
});

export async function startRun(db: Db, job: "ingest" | "morning", now = new Date()) {
  // A run still 'running' after 15 minutes was killed by the platform (timeout). Record it as failed so alerts can fire.
  await db.query(
    "update runs set status = 'failed', finished_at = $2, error = coalesce(error, 'No finish recorded: the function was stopped (likely a platform timeout).') where job = $1 and status = 'running' and started_at < $3",
    [job, now, new Date(now.getTime() - 15 * 60_000)]);
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

const STOP_REASON: Record<string, string> = { time_budget: "time limit", max_articles: "article cap", gemini_cap: "Gemini call cap" };

/**
 * What the email and dashboard say about the last ingest. 'stale' only when it failed, never ran or is over 26 hours old.
 * A run stopped by its budget is fresh data with partial coverage; the next run resumes where it stopped.
 */
export function ingestNote(run: { status: string; started_at: string | Date; counts?: Partial<RunCounts> | null } | null | undefined, now: Date): { stale: boolean; text: string } | null {
  if (!run) return { stale: true, text: "No ingest run yet. Data may be stale." };
  if (run.status === "failed") return { stale: true, text: "The last ingest run failed. Data may be stale." };
  if (now.getTime() - new Date(run.started_at).getTime() > 26 * 3600_000) return { stale: true, text: "The last ingest run was over a day ago. Data may be stale." };
  if (run.status !== "partial") return null;
  const c = run.counts ?? {};
  const checked = Number(c.accounts_checked), total = Number(c.accounts_total);
  if (c.stopped && checked && total) return { stale: false, text: `The last ingest checked ${checked} of ${total} accounts before its ${STOP_REASON[c.stopped] ?? c.stopped}. The next run starts with the rest.` };
  if (c.stopped) return { stale: false, text: "The last ingest did not reach every account. The next run starts with the rest." };
  return { stale: false, text: "The last ingest skipped some articles after errors. See the run log." };
}
