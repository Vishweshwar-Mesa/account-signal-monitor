import type { Db } from "../db";
import { scoreAccount, eventPoints, type ScoringEvent, type EventSource } from "../scoring";
import { updateAccountSystemColumns } from "../accounts-write";

// D03: every account is rescored from its events on every run. Nothing stays hot by itself.
export async function rescoreAll(db: Db, now = new Date(), onlyIds?: string[]) {
  const accounts = await db.query<Record<string, unknown> & { id: string }>(
    `select id, employee_count, sector, frontline_share, multi_site, india_footprint, is_customer, last_contacted_at, renewal_date,
            score, band, lane, confidence, flags, top_signal_summary, top_signal_url, last_signal_at
     from accounts ${onlyIds ? "where id = any($1)" : ""}`,
    onlyIds ? [onlyIds] : [],
  );
  const events = await db.query<ScoringEvent & { account_id: string; evidence_signal_ids: string[] }>(
    "select id, account_id, type, event_date, magnitude, certainty, time_scope, best_tier, source_domains, competitor, summary, evidence_signal_ids from events",
  );
  const sigs = await db.query<EventSource & { id: string }>(
    "select id, url, publisher, published_at, evidence_quote as quote from signals where gate_result = 'accepted'",
  );
  const sigById = new Map(sigs.rows.map((s) => [s.id, s]));
  const tasks = await db.query<{ account_id: string; kind: string; due_at: string; done: boolean }>("select account_id, kind, due_at, done from tasks");
  const acts = await db.query<{ account_id: string; kind: string; direction: string; occurred_at: string }>("select account_id, kind, direction, occurred_at from activities");

  let n = 0;
  for (const a of accounts.rows) {
    const evs = events.rows
      .filter((e) => e.account_id === a.id)
      .map((e) => ({
        ...e,
        sources: e.evidence_signal_ids.map((id) => sigById.get(id)).filter(Boolean).map((s) => ({
          url: s!.url, publisher: s!.publisher, published_at: s!.published_at ? new Date(s!.published_at).toISOString() : null, quote: s!.quote,
        })),
      }));
    const r = scoreAccount(
      a as never,
      evs,
      tasks.rows.filter((t) => t.account_id === a.id),
      acts.rows.filter((x) => x.account_id === a.id),
      now,
    );
    const top = r.topEvent;
    const lastSignal = evs.length ? new Date(Math.max(...evs.map((e) => new Date(e.event_date).getTime()))) : null;
    await updateAccountSystemColumns(db, a.id, {
      score: r.score,
      band: r.band,
      confidence: r.confidence,
      lane: r.lane,
      flags: r.flags,
      top_signal_summary: top?.summary ?? null,
      top_signal_url: top?.sources[0]?.url ?? null,
      last_signal_at: lastSignal,
      score_breakdown: r.breakdown,
      scored_at: now,
    });
    // Keep the latest decayed points on each event for display. Scoring always recomputes from scratch.
    for (const e of evs) {
      await db.query("update events set points = $2 where id = $1", [e.id, Math.round(eventPoints(e, now).points * 100) / 100]);
    }
    n++;
  }
  return n;
}
