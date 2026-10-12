// Plain HTML emails to Arjun. No em dashes in any generated text.

export interface HotArticle { publisher: string; title: string; url: string; date: string; quote: string | null; summary: string | null; isNew: boolean }
export interface CrmBrief {
  inCrm: boolean; demo: boolean; stage: string; lastTouch: string; daysSinceTouch: number | null; activity15d: number;
  relationshipSince: string | null; openTasks: string[]; openTaskCount: number; url: string | null;
}
export interface HotItem {
  name: string; score: number; band: string; lane: string | null; isCustomer: boolean;
  summary: string; why: string; articles: HotArticle[]; crm: CrmBrief;
  person: { name: string; title: string; url: string } | null;
  angle: string;
  acceptedDraft: string | null;
}

export interface BriefData {
  date: string;
  stale: boolean;
  signals: { name: string; title: string; publisher: string; url: string; summary: string | null }[];
  moves: { name: string; old: number; new: number }[];
  tasks: { name: string; title: string; due: string; kind: string; overdue: boolean }[];
  renewals: { name: string; date: string }[];
  noContact: { name: string; days: number }[];
  churn: { name: string; top_signal_summary: string | null }[];
  approach: { name: string; score: number; band: string; summary: string; person: string | null; note: string }[];
  snapshot: { hot: number; warm: number; cold: number; churn: number; expansion: number; customers: number };
  dashboardUrl: string;
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u2014\u2013]/g, ",");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LANE: Record<string, string> = { outreach: "Outreach", churn_risk: "Churn risk", expansion: "Expansion", re_engage: "Re-engage" };

const wrap = (body: string) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f9fc;font-family:Arial,Helvetica,sans-serif;color:#090014;font-size:14px;line-height:1.5">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6e1f3;border-radius:14px;padding:24px">${body}</div></body></html>`;

const staleNote = (stale: boolean) =>
  stale ? `<p style="background:#fdf0c8;color:#5b4204;padding:8px 12px;border-radius:8px">Data may be stale. The last ingest run did not finish cleanly.</p>` : "";

function itemHtml(it: HotItem, i: number, update: boolean) {
  const arts = it.articles.map((x) => `<li style="margin-bottom:6px">${update && x.isNew ? '<b style="color:#c2410c">New:</b> ' : ""}<a href="${esc(x.url)}" style="color:#5b2fc9">${esc(x.title || x.summary)}</a><br><span style="color:#5f5a70">${esc(x.publisher)}${x.date ? `, ${esc(x.date)}` : ""}</span>${x.quote ? `<br><i>"${esc(x.quote)}"</i>` : ""}</li>`).join("");
  const c = it.crm;
  const crm = `<div style="font-size:13px;background:#f6f3fc;border-radius:8px;padding:8px 10px;margin-top:8px">
    <b>From HubSpot${c.demo ? ' <span style="background:#fdf0c8;color:#5b4204;border-radius:4px;padding:0 4px;font-size:11px">DEMO</span>' : ""}:</b> ${esc(c.stage)}.
    ${c.inCrm ? `Last touch: ${esc(c.lastTouch)}${c.daysSinceTouch != null ? ` (${c.daysSinceTouch} days ago)` : ""}. ${c.activity15d} activities in the last 15 days${c.relationshipSince ? `, in contact since ${esc(c.relationshipSince)}` : ""}.` : ""}
    ${c.openTaskCount ? `<br>Open tasks (${c.openTaskCount}): ${c.openTasks.map(esc).join("; ")}.` : ""}
    ${c.url ? `<br><a href="${esc(c.url)}" style="color:#5b2fc9">Open in HubSpot</a>` : ""}
  </div>`;
  return `
<div style="border-top:1px solid #e6e1f3;padding:14px 0">
  <div style="font-size:16px;font-weight:bold">${i + 1}. ${esc(it.name)} <span style="font-weight:normal;color:#5f5a70">${cap(it.band)} ${it.score}/10${it.isCustomer ? " · Customer" : ""}${it.lane ? ` · ${LANE[it.lane] ?? it.lane}` : ""}</span></div>
  <div style="margin-top:4px"><b>Why this account, why now:</b> ${esc(it.why)}</div>
  <div style="font-size:13px;margin-top:6px"><b>Supporting articles</b><ul style="padding-left:18px;margin:4px 0">${arts}</ul></div>
  <div style="font-size:13px">Who to approach: ${it.person ? `${esc(it.person.name)}, ${esc(it.person.title)} (<a href="${esc(it.person.url)}" style="color:#5b2fc9">source</a>)` : "No verified contact found"}</div>
  <div style="font-size:13px"><b>Outreach angle:</b> ${esc(it.angle)}</div>
  ${crm}
  ${it.acceptedDraft ? `<div style="font-size:13px;background:#f6f3fc;padding:8px;border-radius:8px;margin-top:6px"><b>Accepted draft:</b><br>${esc(it.acceptedDraft).replace(/\n/g, "<br>")}</div>` : ""}
</div>`;
}

export function hotListHtml(input: {
  items: HotItem[]; updates?: HotItem[]; stillHot?: { name: string; score: number; band: string; summary: string }[];
  date: string; warmCount: number; nextDay: string; stale: boolean; dashboardUrl: string;
}) {
  const { items } = input;
  const updates = input.updates ?? [];
  const still = input.stillHot ?? [];
  const n = items.length + updates.length;
  const footer = `<p style="color:#5f5a70;font-size:12px;margin-top:24px">Scores are computed from verified sources. Open the dashboard to see why. HubSpot details marked DEMO are demo CRM data.</p>`;
  const stillHtml = still.length
    ? `<h3 style="margin:20px 0 6px">Still on the list (no new articles)</h3><ul style="padding-left:18px;margin:0">${still.map((s) => `<li>${esc(s.name)} (${cap(s.band)} ${s.score}/10)${s.summary ? `: ${esc(s.summary)}` : ""}</li>`).join("")}</ul>`
    : "";
  if (!n) {
    return {
      subject: `Hot List: 0 accounts to reach out to (${input.date})`,
      html: wrap(`<h2 style="margin-top:0">Hot List, ${esc(input.date)}</h2>${staleNote(input.stale)}
<p>Nothing hot this time. ${input.warmCount} accounts are warm. Next list on ${esc(input.nextDay)}.</p>${stillHtml}
<p><a href="${input.dashboardUrl}" style="color:#5b2fc9">View in dashboard</a></p>${footer}`),
    };
  }
  return {
    subject: `Hot List: ${n} accounts to reach out to (${input.date})`,
    html: wrap(`<h2 style="margin-top:0">Hot List, ${esc(input.date)}</h2>${staleNote(input.stale)}
<p>${items.length} new account${items.length === 1 ? "" : "s"}${updates.length ? ` and ${updates.length} update${updates.length === 1 ? "" : "s"}` : ""} with fresh verified signals. Nothing is sent to prospects automatically.</p>
${items.length ? `<h3 style="margin:16px 0 0">New on the list</h3>${items.map((it, i) => itemHtml(it, i, false)).join("")}` : ""}
${updates.length ? `<h3 style="margin:20px 0 0">Updates on accounts already sent</h3>${updates.map((it, i) => itemHtml(it, i, true)).join("")}` : ""}
${stillHtml}
<p style="margin-top:16px"><a href="${input.dashboardUrl}" style="background:#7c46f1;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none">View in dashboard</a></p>${footer}`),
  };
}

const section = (title: string, inner: string) => `<h3 style="margin:20px 0 6px">${title}</h3>${inner}`;
const list = (items: string[], empty: string) => (items.length ? `<ul style="padding-left:18px;margin:0">${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p style="color:#5f5a70;margin:0">${empty}</p>`);

export function briefHtml(d: BriefData) {
  const happened = list(
    [
      ...d.signals.map((s) => `<b>${esc(s.name)}</b>: ${esc(s.summary || s.title)} (<a href="${esc(s.url)}" style="color:#5b2fc9">${esc(s.publisher)}</a>)`),
      ...d.moves.map((m) => `<b>${esc(m.name)}</b> score moved ${m.old} to ${m.new}`),
    ],
    "No new verified signals.",
  );
  const prep = list(
    [
      ...d.churn.map((c) => `<b>Churn risk:</b> ${esc(c.name)}${c.top_signal_summary ? `, ${esc(c.top_signal_summary)}` : ""}`),
      ...d.tasks.map((t) => `${t.overdue ? "<b>Overdue:</b> " : ""}${esc(t.title)} for ${esc(t.name)}, due ${esc(t.due)}${t.kind === "pilot_checkpoint" ? " (pilot checkpoint)" : ""} <span style="color:#5b4204">[demo]</span>`),
      ...d.renewals.map((r) => `Renewal: ${esc(r.name)} on ${esc(r.date)} <span style="color:#5b4204">[demo]</span>`),
      ...d.noContact.map((n) => `No contact for ${n.days} days: ${esc(n.name)} <span style="color:#5b4204">[demo]</span>`),
    ],
    "Nothing due this week.",
  );
  const approach = list(
    d.approach.map((a) => `<b>${esc(a.name)}</b> (${cap(a.band)} ${a.score}/10): ${esc(a.summary)}<br>Contact: ${esc(a.person) || "No verified contact found"}${a.note ? `<br><i>${esc(a.note)}</i>` : ""}`),
    "No account is warm or hot right now.",
  );
  const s = d.snapshot;
  const snap = `<p style="margin:0">Hot ${s.hot} · Warm ${s.warm} · Cold ${s.cold} · Customers ${s.customers} (churn risk ${s.churn}, expansion ${s.expansion})</p>`;
  return {
    subject: `Morning brief, ${d.date}`,
    html: wrap(`<h2 style="margin-top:0">Morning brief, ${esc(d.date)}</h2>${staleNote(d.stale)}
${section("1. What happened yesterday", happened)}
${section("2. Prepare this week", prep)}
${section("3. Who to approach today", approach)}
${section("4. Snapshot", snap)}
<p style="margin-top:16px"><a href="${d.dashboardUrl}" style="color:#5b2fc9">Open the dashboard</a></p>
<p style="color:#5f5a70;font-size:12px">Prep notes are written by Gemini from the verified fields above only. Items marked demo come from demo CRM data.</p>`),
  };
}
