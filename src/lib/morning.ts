import type { Db } from "./db";
import productFacts from "../../config/product-facts.json";
import { istDate, istWeekday, fmtIst, appUrl } from "./time";
import { type Mailer, resendMailer, arjunEmail } from "./email/send";
import { hotListHtml, briefHtml, type HotItem, type BriefData } from "./email/templates";
import { writeText, geminiConfigured } from "./ai/gemini";
import { outreachAnglePrompt, prepNotePrompt } from "./ai/prompts";
import { startRun, finishRun, failedTwice } from "./pipeline/runs";

const DAY = 86_400_000;
export const HOTLIST_DAYS = ["Mon", "Thu"];

/** D06: window is since the previous Hot List send, but never shorter than 3 days. */
export function hotListWindow(lastSend: Date | null, now: Date) {
  const minStart = new Date(now.getTime() - 3 * DAY);
  const start = lastSend && lastSend < minStart ? lastSend : minStart;
  return { start, end: now };
}

export function nextHotListDay(now: Date) {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * DAY);
    if (HOTLIST_DAYS.includes(istWeekday(d))) return `${istWeekday(d) === "Mon" ? "Monday" : "Thursday"} ${fmtIst(d, { day: "numeric", month: "short" })}`;
  }
  return "Monday";
}

/** Send lock: one row per kind and IST date. A second insert fails, so retries never double-send. */
export async function acquireSendLock(db: Db, kind: "hotlist" | "brief" | "alert", now: Date, recipient: string, extra: { start?: Date; end?: Date; accountIds?: string[] } = {}) {
  const key = `${kind}:${istDate(now)}`;
  const r = await db.query<{ id: string }>(
    `insert into sends (kind, send_key, sent_at, window_start, window_end, recipient, account_ids) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (send_key) do nothing returning id`,
    [kind, key, now, extra.start ?? null, extra.end ?? null, recipient, extra.accountIds ?? []],
  );
  return r.rows[0]?.id ?? null;
}

interface Candidate {
  id: string; name: string; score: number; band: string; lane: string | null; is_customer: boolean;
  my_draft: string | null; system_draft: string | null; draft_accepted_at: string | null; snoozed_until: string | null;
}

export async function hotListItems(db: Db, start: Date, now: Date, text: (p: string) => Promise<string>) {
  const rows = await db.query<Candidate>(
    `select a.id, a.name, a.score, a.band, a.lane, a.is_customer, a.my_draft, a.system_draft, a.draft_accepted_at, a.snoozed_until
     from accounts a
     where a.score >= 5 and (a.snoozed_until is null or a.snoozed_until < $2)
       and exists (select 1 from events e where e.account_id = a.id and e.best_tier in ('T1','T2') and e.points > 0
                   and (e.event_date >= $1 or e.first_seen_at >= $1))
     order by a.score desc, a.last_signal_at desc nulls last
     limit 10`,
    [start, now],
  );
  const items: HotItem[] = [];
  for (const a of rows.rows) {
    const ev = (await db.query<{ type: string; summary: string; event_date: string; evidence_signal_ids: string[] }>(
      `select type, summary, event_date, evidence_signal_ids from events where account_id = $1 and best_tier in ('T1','T2')
       order by points desc limit 1`, [a.id])).rows[0];
    const sig = ev ? (await db.query<{ url: string; publisher: string; published_at: string }>(
      "select url, publisher, published_at from signals where id = any($1) order by tier asc limit 1", [ev.evidence_signal_ids])).rows[0] : undefined;
    const person = (await db.query<{ name: string; title: string; source_url: string }>(
      `select name, title, source_url from people where account_id = $1 and removed_at is null
       order by case role_group when 'hr_head' then 0 when 'ops_head' then 1 else 2 end limit 1`, [a.id])).rows[0];
    const angleKey = a.is_customer && (ev?.type === "HR_TECH_INTENT" || a.lane === "churn_risk") ? "HR_TECH_INTENT_CUSTOMER" : ev?.type;
    const angleCfg = (productFacts.angles as Record<string, { angle: string; facts: string[] }>)[angleKey ?? ""] ?? { angle: "Check in", facts: [] };
    const facts = angleCfg.facts.map((f) => (productFacts.facts as Record<string, string>)[f]);
    let angle = angleCfg.angle;
    if (ev) {
      try {
        angle = await text(outreachAnglePrompt({ company: a.name, trigger: ev.type, summary: ev.summary, angle: angleCfg.angle, facts }));
      } catch {
        angle = angleCfg.angle; // template fallback, still product facts only
      }
    }
    items.push({
      name: a.name, score: a.score, band: a.band, lane: a.lane, isCustomer: a.is_customer,
      summary: ev?.summary ?? "", sourceName: sig?.publisher ?? "", sourceUrl: sig?.url ?? "", sourceDate: sig?.published_at ? fmtIst(sig.published_at) : "",
      person: person ? { name: person.name, title: person.title, url: person.source_url } : null,
      angle,
      acceptedDraft: a.draft_accepted_at ? a.my_draft || a.system_draft : null,
    });
  }
  return items;
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
      note = await text(prepNotePrompt({ company: t.name, item: "who to approach today",
        facts: `score ${t.score} (${t.band}); lane ${t.lane ?? "none"}; top signal: ${t.top_signal_summary ?? "none"}; contact: ${person ? `${person.name}, ${person.title}` : "no verified contact"}` }));
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

    // Hot List on Monday and Thursday (D10)
    if (opts.forceHotList || HOTLIST_DAYS.includes(istWeekday(now))) {
      const last = (await db.query<{ sent_at: string }>(
        "select sent_at from sends where kind = 'hotlist' and status = 'sent' order by sent_at desc limit 1")).rows[0];
      const win = hotListWindow(last ? new Date(last.sent_at) : null, now);
      const lock = await acquireSendLock(db, "hotlist", now, to, win);
      if (!lock) counts.hotlist = "already_sent";
      else {
        try {
          const items = await hotListItems(db, win.start, now, text);
          const warm = Number((await db.query<{ n: string }>("select count(*) n from accounts where band = 'warm'")).rows[0].n);
          const { subject, html } = hotListHtml({ items, date: fmtIst(now, { day: "numeric", month: "short", year: "numeric" }), warmCount: warm, nextDay: nextHotListDay(now), stale, dashboardUrl: appUrl() });
          await mailer.send(to, subject, html);
          await db.query("update sends set status = 'sent', account_ids = $2 where id = $1", [lock, []]);
          counts.hotlist = items.length;
        } catch (e) {
          await db.query("delete from sends where id = $1", [lock]); // release the lock so a retry can send
          throw e;
        }
      }
    } else counts.hotlist = "not_today";

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
