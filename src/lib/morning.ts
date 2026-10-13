import type { Db } from "./db";
import { istDate, fmtIst, appUrl } from "./time";
import { type Mailer, resendMailer, arjunEmail } from "./email/send";
import { hotListHtml, briefHtml, type BriefData } from "./email/templates";
import { buildHotList, hotListWindow, withTimeout } from "./hotlist";
import { writeText, geminiConfigured } from "./ai/gemini";
import { prepNotePrompt } from "./ai/prompts";
import { startRun, finishRun, failedTwice } from "./pipeline/runs";

const DAY = 86_400_000;
export const STALE_LOCK_MS = 15 * 60_000;
export { hotListWindow } from "./hotlist";

export function nextHotListDay(now: Date) {
  return `tomorrow, ${fmtIst(new Date(now.getTime() + DAY), { weekday: "long", day: "numeric", month: "short" })}`;
}

/** Send lock: one row per kind and IST date. A second insert fails, so retries never double-send. */
export async function acquireSendLock(db: Db, kind: "hotlist" | "brief" | "alert", now: Date, recipient: string, extra: { start?: Date; end?: Date; accountIds?: string[] } = {}) {
  const key = `${kind}:${istDate(now)}`;
  const r = await db.query<{ id: string }>(
    `insert into sends (kind, send_key, sent_at, window_start, window_end, recipient, account_ids) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (send_key) do nothing returning id`,
    [kind, key, now, extra.start ?? null, extra.end ?? null, recipient, extra.accountIds ?? []],
  );
  if (r.rows[0]) return r.rows[0].id;
  // A lock still 'pending' after 15 minutes means the job was killed mid-send (for example a platform timeout).
  // Take it over so the email still goes out. A lock marked 'sent' is never taken over, so no double send.
  const stale = await db.query<{ id: string }>(
    `update sends set sent_at = $2, window_start = $3, window_end = $4
     where send_key = $1 and status = 'pending' and sent_at < $5 returning id`,
    [key, now, extra.start ?? null, extra.end ?? null, new Date(now.getTime() - STALE_LOCK_MS)],
  );
  return stale.rows[0]?.id ?? null;
}

async function briefData(db: Db, now: Date, text: (p: string) => Promise<string>, stale: boolean): Promise<BriefData> {
  const since = new Date(now.getTime() - DAY);
  const signals = await db.query<{ name: string; title: string; publisher: string; url: string; summary: string | null }>(
    `select a.name, s.title, s.publisher, s.url, s.extraction->>'one_line_summary' as summary
     from signals s join accounts a on a.id = s.account_id
     where s.gate_result = 'accepted' and s.fetched_at >= $1 order by s.fetched_at desc limit 15`, [since]);
  const moves = await db.query<{ name: string; old: number; new: number }>(
    `select a.name, (x.old->>'score')::int as old, (x.new->>'score')::int as new
     from audit x join accounts a on a.id = x.account_id
     where x.actor = 'system' and x.at >= $1 and x.old->>'score' is distinct from x.new->>'score' and x.old->>'score' is not null
     order by x.at desc limit 10`, [since]);
  const tasks = await db.query<{ name: string; title: string; due_at: string; kind: string }>(
    `select a.name, t.title, t.due_at, t.kind from tasks t join accounts a on a.id = t.account_id
     where not t.done and t.due_at <= $1 order by t.due_at limit 15`, [new Date(now.getTime() + 7 * DAY)]);
  const renewals = await db.query<{ name: string; renewal_date: string }>(
    "select name, renewal_date from accounts where renewal_date between $1::date and $2::date order by renewal_date",
    [now.toISOString().slice(0, 10), new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10)]);
  const noContact = await db.query<{ name: string; last_contacted_at: string }>(
    "select name, last_contacted_at from accounts where is_active and last_contacted_at < $1 order by last_contacted_at limit 10",
    [new Date(now.getTime() - 30 * DAY)]);
  const churn = await db.query<{ name: string; top_signal_summary: string | null }>(
    "select name, top_signal_summary from accounts where lane = 'churn_risk' order by score desc");
  const top = await db.query<{ id: string; name: string; score: number; band: string; top_signal_summary: string | null; lane: string | null }>(
    `select id, name, score, band, top_signal_summary, lane from accounts
     where score >= 5 and (snoozed_until is null or snoozed_until < $1) order by score desc, last_signal_at desc nulls last limit 3`, [now]);
  const approach = [];
  for (const t of top.rows) {
    const person = (await db.query<{ name: string; title: string }>(
      "select name, title from people where account_id = $1 and removed_at is null order by case role_group when 'hr_head' then 0 else 1 end limit 1", [t.id])).rows[0];
    let note = "";
    try {
      note = await withTimeout(text(prepNotePrompt({ company: t.name, item: "who to approach today",
        facts: `score ${t.score} (${t.band}); lane ${t.lane ?? "none"}; top signal: ${t.top_signal_summary ?? "none"}; contact: ${person ? `${person.name}, ${person.title}` : "no verified contact"}` })));
    } catch {
      note = "";
    }
    approach.push({ name: t.name, score: t.score, band: t.band, summary: t.top_signal_summary ?? "", person: person ? `${person.name}, ${person.title}` : null, note });
  }
  const snap = (await db.query<{ hot: string; warm: string; cold: string; churn: string; expansion: string; customers: string }>(
    `select count(*) filter (where band='hot') hot, count(*) filter (where band='warm') warm, count(*) filter (where band='cold') cold,
            count(*) filter (where lane='churn_risk') churn, count(*) filter (where lane='expansion') expansion, count(*) filter (where is_customer) customers
     from accounts`)).rows[0];
  return {
    date: fmtIst(now, { weekday: "long", day: "numeric", month: "short" }),
    stale,
    signals: signals.rows,
    moves: moves.rows,
    tasks: tasks.rows.map((t) => ({ ...t, due: fmtIst(t.due_at, { day: "numeric", month: "short" }), overdue: new Date(t.due_at) < now })),
    renewals: renewals.rows.map((r) => ({ name: r.name, date: fmtIst(r.renewal_date) })),
    noContact: noContact.rows.map((r) => ({ name: r.name, days: Math.floor((now.getTime() - new Date(r.last_contacted_at).getTime()) / DAY) })),
    churn: churn.rows,
    approach,
    snapshot: Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, Number(v)])) as BriefData["snapshot"],
    dashboardUrl: appUrl(),
  };
}

export interface MorningOptions {
  now?: Date;
  mailer?: Mailer;
  text?: (p: string) => Promise<string>;
  forceHotList?: boolean;
}

export async function runMorning(db: Db, opts: MorningOptions = {}) {
  const now = opts.now ?? new Date();
  const mailer = opts.mailer ?? resendMailer;
  const text = opts.text ?? (geminiConfigured() ? writeText : async () => { throw new Error("gemini off"); });
  const runId = await startRun(db, "morning", now);
  const counts: Record<string, unknown> = {};
  try {
    const to = arjunEmail();
    const lastIngest = (await db.query<{ status: string; started_at: string }>(
      "select status, started_at from runs where job = 'ingest' and status <> 'running' order by started_at desc limit 1")).rows[0];
    const stale = !lastIngest || lastIngest.status !== "ok" || now.getTime() - new Date(lastIngest.started_at).getTime() > 26 * 3600_000;
    counts.stale = stale;

    // Hot List every morning (B08): new accounts, updates with continuation articles, still-hot one-liners.
    {
      const last = (await db.query<{ sent_at: string }>(
        "select sent_at from sends where kind = 'hotlist' and status = 'sent' order by sent_at desc limit 1")).rows[0];
      const win = hotListWindow(last ? new Date(last.sent_at) : null, now);
      const lock = await acquireSendLock(db, "hotlist", now, to, win);
      if (!lock) counts.hotlist = "already_sent";
      else {
        try {
          const list = await buildHotList(db, win.start, now, text);
          const warm = Number((await db.query<{ n: string }>("select count(*) n from accounts where band = 'warm'")).rows[0].n);
          const { subject, html } = hotListHtml({ ...list, date: fmtIst(now, { day: "numeric", month: "short", year: "numeric" }), warmCount: warm, nextDay: nextHotListDay(now), stale, dashboardUrl: appUrl() });
          await mailer.send(to, subject, html);
          await db.query("update sends set status = 'sent', account_ids = $2 where id = $1", [lock, list.accountIds]);
          counts.hotlist = { new: list.items.length, updates: list.updates.length, still: list.stillHot.length };
        } catch (e) {
          await db.query("delete from sends where id = $1", [lock]); // release the lock so a retry can send
          throw e;
        }
      }
    }

    // Morning brief, every day
    const lock = await acquireSendLock(db, "brief", now, to);
    if (!lock) counts.brief = "already_sent";
    else {
      try {
        const data = await briefData(db, now, text, stale);
        const { subject, html } = briefHtml(data);
        await mailer.send(to, subject, html);
        await db.query("update sends set status = 'sent' where id = $1", [lock]);
        counts.brief = "sent";
      } catch (e) {
        await db.query("delete from sends where id = $1", [lock]);
        throw e;
      }
    }
    await finishRun(db, runId, "ok", counts, null);
    return { runId, status: "ok", counts };
  } catch (e) {
    await finishRun(db, runId, "failed", counts, String((e as Error).message ?? e).slice(0, 2000));
    await maybeAlert(db, "morning", (e as Error).message, mailer, now);
    throw e;
  }
}

/** R5: a failure alert to Arjun when a job fails twice in a row. */
export async function maybeAlert(db: Db, job: "ingest" | "morning", message: string, mailer: Mailer = resendMailer, now = new Date()) {
  try {
    if (!(await failedTwice(db, job))) return false;
    const to = arjunEmail();
    const lock = await acquireSendLock(db, "alert", now, to);
    if (!lock) return false;
    await mailer.send(to, `Signal Monitor: ${job} job failed twice`, `<p>The ${job} job failed on its last two runs.</p><p>Last error: ${escapeHtml(message)}</p><p>Open the run log: <a href="${appUrl()}/runs">${appUrl()}/runs</a></p>`);
    await db.query("update sends set status = 'sent' where id = $1", [lock]);
    return true;
  } catch {
    return false;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
