import type { Db } from "./db";
import productFacts from "../../config/product-facts.json";
import { fmtIst } from "./time";
import { outreachAnglePrompt, whyNowPrompt } from "./ai/prompts";
import type { HotItem, HotArticle, CrmBrief } from "./email/templates";

// Daily Hot List (B08, revises D06 and D10). Three parts:
//  new        accounts not on a recent list, with a qualifying T1/T2 event in the last 14 days
//  updates    accounts already sent, with new verified articles since the last send (continuations)
//  still hot  accounts already sent, nothing new: one line each
// Window: since the previous send, never shorter than 1 day (3 days for the very first send).

const DAY = 86_400_000;
export const RECENT_LIST_DAYS = 14;

export function hotListWindow(lastSend: Date | null, now: Date) {
  const minStart = new Date(now.getTime() - (lastSend ? 1 : 3) * DAY);
  const start = lastSend && lastSend < minStart ? lastSend : minStart;
  return { start, end: now };
}

interface Candidate {
  id: string; name: string; score: number; band: string; lane: string | null; is_customer: boolean; sector: string | null;
  employee_count: number | null; my_draft: string | null; system_draft: string | null; draft_accepted_at: string | null;
  stage: string | null; crm_is_demo: boolean; hubspot_company_id: string | null; hubspot_deal_id: string | null;
}

/** HubSpot-sourced CRM brief for one account (demo CRM data is labelled). */
export async function crmBrief(db: Db, a: Pick<Candidate, "id" | "stage" | "is_customer" | "crm_is_demo" | "hubspot_company_id" | "hubspot_deal_id">, now: Date): Promise<CrmBrief> {
  const last = (await db.query<{ kind: string; direction: string; occurred_at: string; summary: string | null }>(
    "select kind, direction, occurred_at, summary from activities where account_id = $1 and occurred_at <= $2 order by occurred_at desc limit 1",
    [a.id, now])).rows[0];
  const recent = Number((await db.query<{ n: string }>(
    "select count(*) n from activities where account_id = $1 and occurred_at between $2 and $3", [a.id, new Date(now.getTime() - 15 * DAY), now])).rows[0].n);
  const first = (await db.query<{ occurred_at: string }>("select min(occurred_at) occurred_at from activities where account_id = $1", [a.id])).rows[0];
  const open = (await db.query<{ title: string; due_at: string | null }>(
    "select title, due_at from tasks where account_id = $1 and not done order by due_at nulls last", [a.id])).rows;
  const portal = process.env.HUBSPOT_PORTAL_ID;
  const url = portal && (a.hubspot_deal_id || a.hubspot_company_id)
    ? `https://app-na2.hubspot.com/contacts/${portal}/record/${a.hubspot_deal_id ? "0-3" : "0-2"}/${a.hubspot_deal_id ?? a.hubspot_company_id}` : null;
  const stageLine = !a.hubspot_company_id ? "Not in HubSpot yet"
    : a.stage === "Closed Won" ? "Deal won (customer)"
    : a.stage === "Closed Lost" ? "Deal lost"
    : a.stage ? `Deal open at ${a.stage}` : "Company in HubSpot, no deal";
  return {
    inCrm: Boolean(a.hubspot_company_id),
    demo: a.crm_is_demo,
    stage: stageLine,
    lastTouch: last ? `${last.kind}${last.direction === "inbound" ? " (inbound)" : ""} on ${fmtIst(last.occurred_at)}: ${(last.summary ?? "").replace(/^\[DEMO\]\s*/, "")}` : "No activity logged",
    daysSinceTouch: last ? Math.floor((now.getTime() - new Date(last.occurred_at).getTime()) / DAY) : null,
    activity15d: recent,
    relationshipSince: first?.occurred_at ? fmtIst(first.occurred_at, { month: "short", year: "numeric" }) : null,
    openTasks: open.slice(0, 3).map((t) => `${t.title.replace(/^\[DEMO\]\s*/, "")}${t.due_at ? ` (due ${fmtIst(t.due_at, { day: "numeric", month: "short" })})` : ""}`),
    openTaskCount: open.length,
    url,
  };
}

async function articles(db: Db, accountId: string, now: Date, newSince: Date): Promise<HotArticle[]> {
  const rows = (await db.query<{ url: string; publisher: string; title: string; published_at: string | null; fetched_at: string; evidence_quote: string | null; summary: string | null }>(
    `select url, publisher, title, published_at, fetched_at, evidence_quote, extraction->>'one_line_summary' as summary
     from signals where account_id = $1 and gate_result = 'accepted' and coalesce(published_at, fetched_at) >= $2
     order by coalesce(published_at, fetched_at) desc limit 5`,
    [accountId, new Date(now.getTime() - RECENT_LIST_DAYS * DAY)])).rows;
  return rows.map((r) => ({
    publisher: r.publisher, title: r.title, url: r.url, quote: r.evidence_quote, summary: r.summary,
    date: r.published_at ? fmtIst(r.published_at) : "",
    isNew: new Date(r.fetched_at) > newSince, // found after the previous send
  }));
}

export interface HotList { items: HotItem[]; updates: HotItem[]; stillHot: { name: string; score: number; band: string; summary: string }[]; accountIds: string[] }

export async function buildHotList(db: Db, start: Date, now: Date, text: (p: string) => Promise<string>): Promise<HotList> {
  // "New" means found after the previous send; before any send, after the window start.
  const lastSend = (await db.query<{ sent_at: string }>(
    "select max(sent_at) sent_at from sends where kind = 'hotlist' and status = 'sent' and sent_at < $1", [now])).rows[0]?.sent_at;
  const newSince = lastSend ? new Date(lastSend) : start;
  const prev = new Set((await db.query<{ id: string }>(
    "select distinct unnest(account_ids) id from sends where kind = 'hotlist' and status = 'sent' and sent_at >= $1",
    [new Date(now.getTime() - RECENT_LIST_DAYS * DAY)])).rows.map((r) => r.id));
  const rows = (await db.query<Candidate>(
    `select a.id, a.name, a.score, a.band, a.lane, a.is_customer, a.sector, a.employee_count, a.my_draft, a.system_draft, a.draft_accepted_at,
            a.stage, a.crm_is_demo, a.hubspot_company_id, a.hubspot_deal_id
     from accounts a
     where a.score >= 5 and (a.snoozed_until is null or a.snoozed_until < $2)
       and exists (select 1 from events e where e.account_id = a.id and e.best_tier in ('T1','T2') and e.points > 0 and e.event_date >= $1)
     order by a.score desc, a.last_signal_at desc nulls last`,
    [new Date(now.getTime() - RECENT_LIST_DAYS * DAY), now])).rows;

  const out: HotList = { items: [], updates: [], stillHot: [], accountIds: [] };
  for (const a of rows) {
    if (out.items.length + out.updates.length >= 10) break; // top 10, never padded
    const arts = await articles(db, a.id, now, newSince);
    const wasSent = prev.has(a.id);
    const hasNew = arts.some((x) => x.isNew);
    if (wasSent && !hasNew) {
      out.stillHot.push({ name: a.name, score: a.score, band: a.band, summary: arts[0]?.summary ?? "" });
      out.accountIds.push(a.id);
      continue;
    }
    const item = await buildItem(db, a, arts, now, text);
    (wasSent ? out.updates : out.items).push(item);
    out.accountIds.push(a.id);
  }
  return out;
}

async function buildItem(db: Db, a: Candidate, arts: HotArticle[], now: Date, text: (p: string) => Promise<string>): Promise<HotItem> {
  const ev = (await db.query<{ type: string; summary: string; event_date: string }>(
    "select type, summary, event_date from events where account_id = $1 and best_tier in ('T1','T2') order by points desc limit 1", [a.id])).rows[0];
  const person = (await db.query<{ name: string; title: string; source_url: string }>(
    `select name, title, source_url from people where account_id = $1 and removed_at is null
     order by case role_group when 'hr_head' then 0 when 'ops_head' then 1 else 2 end limit 1`, [a.id])).rows[0];
  const crm = await crmBrief(db, a, now);
  const angleKey = a.is_customer && (ev?.type === "HR_TECH_INTENT" || a.lane === "churn_risk") ? "HR_TECH_INTENT_CUSTOMER" : ev?.type;
  const angleCfg = (productFacts.angles as Record<string, { angle: string; facts: string[] }>)[angleKey ?? ""] ?? { angle: "Check in", facts: [] };
  const facts = angleCfg.facts.map((f) => (productFacts.facts as Record<string, string>)[f]);
  let angle = angleCfg.angle;
  let why = "";
  const verified = [
    `Company: ${a.name}${a.sector ? `, sector ${a.sector}` : ""}${a.employee_count ? `, about ${a.employee_count} employees` : ""}.`,
    `Score ${a.score} of 10 (${a.band}). Relationship lane: ${a.lane ?? "none"}.`,
    ...arts.slice(0, 3).map((x) => `Verified article (${x.publisher}, ${x.date}): ${x.summary ?? x.title}`),
    `CRM: ${crm.stage}. Last touch: ${crm.lastTouch}${crm.daysSinceTouch != null ? ` (${crm.daysSinceTouch} days ago)` : ""}. Activities in the last 15 days: ${crm.activity15d}.`,
  ].join("\n");
  try {
    if (ev) angle = await text(outreachAnglePrompt({ company: a.name, trigger: ev.type, summary: ev.summary, angle: angleCfg.angle, facts }));
  } catch {
    angle = angleCfg.angle; // template fallback, still product facts only
  }
  try {
    why = await text(whyNowPrompt({ company: a.name, verified }));
  } catch {
    why = `${ev?.summary ?? "A verified trigger was reported"}. ${crm.daysSinceTouch != null ? `Last contact was ${crm.daysSinceTouch} days ago.` : "No contact is logged yet."}`;
  }
  return {
    name: a.name, score: a.score, band: a.band, lane: a.lane, isCustomer: a.is_customer,
    summary: ev?.summary ?? "", why, articles: arts, crm,
    person: person ? { name: person.name, title: person.title, url: person.source_url } : null,
    angle,
    acceptedDraft: a.draft_accepted_at ? a.my_draft || a.system_draft : null,
  };
}
