// Plain HTML emails to Arjun. No em dashes in any generated text.

export interface HotItem {
  name: string; score: number; band: string; lane: string | null; isCustomer: boolean;
  summary: string; sourceName: string; sourceUrl: string; sourceDate: string;
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
  (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[—–]/g, ",");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LANE: Record<string, string> = { outreach: "Outreach", churn_risk: "Churn risk", expansion: "Expansion", re_engage: "Re-engage" };

const wrap = (body: string) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f9fc;font-family:Arial,Helvetica,sans-serif;color:#090014;font-size:14px;line-height:1.5">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6e1f3;border-radius:14px;padding:24px">${body}</div></body></html>`;

const staleNote = (stale: boolean) =>
  stale ? `<p style="background:#fdf0c8;color:#5b4204;padding:8px 12px;border-radius:8px">Data may be stale. The last ingest run did not finish cleanly.</p>` : "";

export function hotListHtml(input: { items: HotItem[]; date: string; warmCount: number; nextDay: string; stale: boolean; dashboardUrl: string }) {
  const { items } = input;
  const footer = `<p style="color:#5f5a70;font-size:12px;margin-top:24px">Scores are computed from verified sources. Open the dashboard to see why.</p>`;
  if (!items.length) {
    return {
      subject: `Hot List: 0 accounts to reach out to (${input.date})`,
      html: wrap(`<h2 style="margin-top:0">Hot List, ${esc(input.date)}</h2>${staleNote(input.stale)}
<p>Nothing hot this time. ${input.warmCount} accounts are warm. Next list on ${esc(input.nextDay)}.</p>
<p><a href="${input.dashboardUrl}" style="color:#5b2fc9">View in dashboard</a></p>${footer}`),
    };
  }
  const rows = items.map((it, i) => `
<div style="border-top:1px solid #e6e1f3;padding:14px 0">
  <div style="font-size:16px;font-weight:bold">${i + 1}. ${esc(it.name)} <span style="font-weight:normal;color:#5f5a70">${cap(it.band)} ${it.score}/10${it.isCustomer ? " · Customer" : ""}${it.lane ? ` · ${LANE[it.lane] ?? it.lane}` : ""}</span></div>
  <div>${esc(it.summary)}</div>
  ${it.sourceUrl ? `<div style="font-size:13px">Source: <a href="${esc(it.sourceUrl)}" style="color:#5b2fc9">${esc(it.sourceName)}</a>${it.sourceDate ? `, ${esc(it.sourceDate)}` : ""}</div>` : ""}
  <div style="font-size:13px">Who to approach: ${it.person ? `${esc(it.person.name)}, ${esc(it.person.title)} (<a href="${esc(it.person.url)}" style="color:#5b2fc9">source</a>)` : "No verified contact found"}</div>
  <div style="font-size:13px"><b>Outreach angle:</b> ${esc(it.angle)}</div>
  ${it.acceptedDraft ? `<div style="font-size:13px;background:#f6f3fc;padding:8px;border-radius:8px;margin-top:6px"><b>Accepted draft:</b><br>${esc(it.acceptedDraft).replace(/\n/g, "<br>")}</div>` : ""}
</div>`).join("");
  return {
    subject: `Hot List: ${items.length} accounts to reach out to (${input.date})`,
    html: wrap(`<h2 style="margin-top:0">Hot List, ${esc(input.date)}</h2>${staleNote(input.stale)}
<p>${items.length} account${items.length === 1 ? "" : "s"} with fresh verified signals. Nothing is sent to prospects automatically.</p>${rows}
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
