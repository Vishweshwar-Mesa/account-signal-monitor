"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DAccount, DashboardData } from "@/lib/dashboard-data";
import { ScoreBadge, Tag, DemoBadge, Section, Empty, BAND_LABEL, LANE_LABEL, bandText, type Band } from "./ui";

const TYPE_LABEL: Record<string, string> = {
  HR_TECH_INTENT: "HR tech intent", LEADERSHIP_CHANGE: "Leadership change", HEADCOUNT_HIRING: "Hiring drive",
  OPERATIONAL_CHALLENGE: "Operational challenge", CAPACITY_EXPANSION: "Capacity expansion", FUNDING_EVENT: "Funding",
  DIGITALISATION_STATEMENT: "Digitalisation statement", COMPLIANCE_PRESSURE: "Compliance pressure", VENDOR_PARTNERSHIP: "New vendor partner",
};
const SECTOR_LABEL: Record<string, string> = {
  retail: "Retail", logistics: "Logistics", hospitality_qsr: "Hospitality and QSR", healthcare: "Healthcare",
  manufacturing: "Manufacturing", facility_staffing: "Facility and staffing services", bpo: "BPO",
};
const IST = "Asia/Kolkata";
const fmtDate = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "");
const age = (d: string | null) => {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
};
const fmtPts = (n: number) => (n > 0 ? `+${n}` : `${n}`);

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export default function Detail({ a, data }: { a: DAccount; data: DashboardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };
  const b = a.score_breakdown;
  const snoozed = a.snoozed_until && new Date(a.snoozed_until) > new Date();
  const hubspotUrl = a.hubspot_company_id && data.hubspotPortal
    ? `https://app-na2.hubspot.com/contacts/${data.hubspotPortal}/record/0-2/${a.hubspot_company_id}` : null;
  const dealUrl = a.hubspot_deal_id && data.hubspotPortal
    ? `https://app-na2.hubspot.com/contacts/${data.hubspotPortal}/record/0-3/${a.hubspot_deal_id}` : null;

  return (
    <article className="card p-4 sm:p-5" aria-busy={pending}>
      {/* Title and about */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-xl sm:text-2xl break-words">{a.name}</h2>
          <p className="text-sm text-muted mt-1">
            {[a.sector ? SECTOR_LABEL[a.sector] ?? a.sector : null, a.hq_city].filter(Boolean).join(" · ")}
            {a.employee_count != null && (
              <>
                {" · "}
                {a.employee_count_is_estimate ? "about " : ""}{a.employee_count.toLocaleString("en-IN")} employees (
                {a.employee_count_source_url ? <a href={a.employee_count_source_url} target="_blank" rel="noopener noreferrer">{a.employee_count_is_estimate ? "estimate, source" : "source"}</a> : "no source"}
                {a.employee_count_as_of ? `, as of ${fmtDate(a.employee_count_as_of)}` : ""})
              </>
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-sm">
            <span>{a.stage ? <>Deal stage: <b>{a.stage}</b></> : a.hubspot_company_id ? <>HubSpot: <b>Lead, no deal yet</b></> : <>HubSpot: <b>Not in CRM yet</b></>}</span>
            {a.is_customer && <Tag tone="primary">Customer</Tag>}
            {a.crm_is_demo && <DemoBadge label="DEMO CRM" />}
            {a.renewal_date && <span className="text-muted">Renewal {fmtDate(a.renewal_date)}</span>}
            {dealUrl && <a href={dealUrl} target="_blank" rel="noopener noreferrer">Open deal in HubSpot</a>}
            {!dealUrl && hubspotUrl && <a href={hubspotUrl} target="_blank" rel="noopener noreferrer">Open in HubSpot</a>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <ScoreBadge score={a.score} band={a.band} size="lg" />
          <div className={`text-sm font-semibold mt-1 ${bandText(a.band)}`}>{a.band ? BAND_LABEL[a.band as Band] : "Not scored"}</div>
          <div className="text-xs text-muted">{a.confidence ? `${a.confidence} confidence` : ""}</div>
        </div>
      </div>

      {/* Lane and flags */}
      <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
        <span>Lane: <b>{a.lane ? LANE_LABEL[a.lane] : a.is_customer ? "Healthy, no action needed" : "None"}</b></span>
        {a.flags.includes("gone_quiet") && <Tag>Gone quiet</Tag>}
        {a.flags.includes("no_contact_30d") && <Tag>No contact 30+ days</Tag>}
        {snoozed && <Tag>Snoozed until {fmtDate(a.snoozed_until)}</Tag>}
        <button type="button" className="btn text-sm ml-auto" disabled={pending}
          onClick={() => run(() => call(`/api/accounts/${a.id}`, "PATCH", { snoozed_until: snoozed ? null : new Date(Date.now() + 7 * 86_400_000).toISOString() }))}>
          {snoozed ? "Unsnooze" : "Snooze 7 days"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-hot">{error}</p>}

      {/* Why this rating */}
      <Section title="Why this rating">
        {!b ? <Empty>Not scored yet. The next ingest run will score this account.</Empty> : (
          <>
            <ul className="flex flex-wrap gap-2">
              {b.contributions.map((c, i) => (
                <li key={i} className="text-sm bg-surface2 border border-border rounded-full px-3 py-1">
                  {c.label} <b className={c.points < 0 ? "text-hot" : ""}>{fmtPts(c.points)}</b>
                </li>
              ))}
            </ul>
            <p className="text-sm mt-2">Raw total <b>{b.raw}</b>, final score <b>{b.score}</b>. {b.thresholds}</p>
            {b.caps.map((c) => <p key={c} className="text-sm mt-1 text-warm">{c}</p>)}
            <p className="text-sm mt-1">{b.toNextBand} Confidence: {b.confidence} ({b.confidenceReason})</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-link min-h-[44px] flex items-center">Verify it yourself</summary>
              <ul className="list-disc pl-5 text-muted">{b.verify.map((v) => <li key={v}>{v}</li>)}</ul>
              {b.events.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {b.events.map((e, i) => (
                    <li key={i} className="text-muted">
                      {e.label}: {e.points} points, {Math.round(e.ageDays)} days old. {e.factors.map((f) => f.label).join(", ")}.
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </>
        )}
      </Section>

      {/* Signals */}
      <Section title="Signals" right={a.contextCount ? <span className="text-xs text-muted">{a.contextCount} context-only item(s) not scored</span> : null}>
        {a.signals.length === 0 ? <Empty>No verified signals in the last 14 days. This account stays Cold until one appears.</Empty> : (
          <ol className="space-y-3">
            {a.signals.map((s) => (
              <li key={s.id} className="flex gap-3">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${s.certainty === "rumour" ? "bg-warm" : "bg-primary"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{s.summary ?? s.title}</div>
                  <div className="text-xs text-muted flex gap-2 flex-wrap mt-0.5">
                    <span>{s.type ? TYPE_LABEL[s.type] ?? s.type : ""}</span>
                    <span>{age(s.published_at)}</span>
                    <span>{s.tier}</span>
                    {s.certainty === "rumour" && <span className="text-warm">Rumour</span>}
                  </div>
                  {s.quote && <blockquote className="text-sm mt-1 border-l-2 border-border pl-2 italic">&ldquo;{s.quote}&rdquo;</blockquote>}
                  <div className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                    <a href={s.url} target="_blank" rel="noopener noreferrer">{s.publisher}, {fmtDate(s.published_at)}</a>
                    <span className="ml-auto flex gap-1">
                      {(["useful", "wrong"] as const).map((v) => (
                        <button key={v} type="button" disabled={pending} aria-pressed={s.feedback === v}
                          className={`btn text-xs ${s.feedback === v ? "bg-tint" : ""}`}
                          onClick={() => run(() => call("/api/feedback", "POST", { signal_id: s.id, verdict: v }))}>
                          {v === "useful" ? "Useful" : "Wrong"}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Who to approach */}
      <Section title="Who to approach">
        {a.people.length === 0 ? (
          <div className="border border-dashed border-border rounded-[10px] p-3 text-sm text-muted">No verified contact found. Nothing is guessed.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {a.people.map((p) => (
              <div key={p.id} className="border border-border rounded-[10px] p-3 bg-surface2">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm">{p.title}</div>
                {p.why && <div className="text-sm text-muted mt-1">{p.why}</div>}
                <div className="text-xs mt-2 flex items-center gap-2 flex-wrap">
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer">Source</a>
                  <span className="text-muted">as of {fmtDate(p.as_of)}</span>
                  <button type="button" className="ml-auto text-xs underline text-muted min-h-[44px]" disabled={pending}
                    onClick={() => { if (confirm(`Remove ${p.name} from this account?`)) run(() => call(`/api/people/${p.id}`, "DELETE")); }}>
                    Remove this person
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <DraftSection a={a} pending={pending} run={run} />

      {/* Tasks and activity */}
      <Section title="Tasks and activity" right={<span className="flex gap-1"><DemoBadge /><Tag tone="primary">HubSpot</Tag></span>}>
        {data.health.hubspot !== "connected" && <p className="text-xs text-muted mb-2">HubSpot not connected. Showing seed data.</p>}
        {a.tasks.length === 0 && a.activities.length === 0 ? <Empty>No tasks or activity logged.</Empty> : (
          <>
            <ul className="space-y-1">
              {a.tasks.map((t) => {
                const overdue = !t.done && t.due_at && new Date(t.due_at) < new Date();
                return (
                  <li key={t.id}>
                    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                      <input type="checkbox" className="w-5 h-5 accent-[var(--primary)]" checked={t.done} disabled={pending}
                        onChange={(e) => run(() => call(`/api/tasks/${t.id}`, "PATCH", { done: e.target.checked }))} />
                      <span className={`text-sm ${t.done ? "line-through text-muted" : ""}`}>{t.title}</span>
                      <span className={`text-xs ml-auto ${overdue ? "text-hot font-semibold" : "text-muted"}`}>
                        {t.due_at ? `${overdue ? "Overdue, " : "Due "}${fmtDate(t.due_at)}` : ""}{t.hubspot_id ? " · linked" : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {a.activities.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {a.activities.map((x) => (
                  <li key={x.id} className="flex gap-2">
                    <span className="text-muted w-24 shrink-0">{fmtDate(x.occurred_at)}</span>
                    <span><b className="capitalize">{x.kind}</b>{x.direction === "inbound" ? " (inbound)" : ""}: {x.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <NotesSection a={a} pending={pending} run={run} />
    </article>
  );
}

function DraftSection({ a, pending, run }: { a: DAccount; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [tone, setTone] = useState<"warm" | "brief" | "curious">((a.draft_tone as "warm") ?? "warm");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.my_draft ?? a.system_draft ?? "");
  const shown = a.my_draft ?? a.system_draft;
  const mailto = `mailto:?subject=${encodeURIComponent(`${a.name}`)}&body=${encodeURIComponent(shown ?? "")}`;
  const hasSignal = a.signals.length > 0;
  return (
    <Section title="Soft-touch draft" right={a.draft_accepted_at ? <Tag tone="primary">Accepted for email</Tag> : null}>
      <div className="flex gap-2 flex-wrap mb-2" role="group" aria-label="Tone">
        {(["warm", "brief", "curious"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border capitalize ${tone === t ? "bg-tint border-primary text-link" : "bg-surface border-border"}`}>
            {t}
          </button>
        ))}
      </div>
      {!hasSignal ? <Empty>No verified signal to cite, so no draft. Drafts always cite a fact.</Empty> : editing ? (
        <>
          <label htmlFor={`draft-${a.id}`} className="text-sm text-muted">Your copy (saved to your own field, never overwritten)</label>
          <textarea id={`draft-${a.id}`} className="w-full mt-1 p-3 rounded-[8px] border border-border bg-surface text-text min-h-[160px]" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2 mt-2 flex-wrap">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => { run(() => call(`/api/accounts/${a.id}`, "PATCH", { my_draft: text })); setEditing(false); }}>Save my copy</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {shown ? (
            <div className="text-sm whitespace-pre-wrap bg-surface2 border border-border rounded-[10px] p-3">
              {a.my_draft && <div className="text-xs text-muted mb-1">Your edited copy</div>}
              {shown}
            </div>
          ) : <Empty>No draft yet. Pick a tone and press Regenerate.</Empty>}
          <div className="flex gap-2 mt-2 flex-wrap">
            <button type="button" className="btn btn-primary" disabled={pending || !shown}
              onClick={() => run(() => call(`/api/accounts/${a.id}`, "PATCH", { draft_accepted_at: a.draft_accepted_at ? null : new Date().toISOString() }))}>
              {a.draft_accepted_at ? "Unaccept" : "Accept for email"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => { setText(shown ?? ""); setEditing(true); }}>Edit</button>
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => call(`/api/accounts/${a.id}/draft`, "POST", { tone }))}>
              {pending ? "Working" : "Regenerate"}
            </button>
            <a className="btn no-underline" href={shown ? mailto : undefined} aria-disabled={!shown}>Open in mail</a>
          </div>
        </>
      )}
      <p className="text-xs text-muted mt-2">No auto-send. Cites the fact above.</p>
    </Section>
  );
}

function NotesSection({ a, pending, run }: { a: DAccount; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [read, setRead] = useState(a.relationship_read ?? "");
  const [contact, setContact] = useState(a.last_contacted_at ? a.last_contacted_at.slice(0, 10) : "");
  return (
    <Section title="Your notes" right={<span className="flex gap-1 items-center">{a.notes_is_demo && <DemoBadge />}<Tag>Yours, never changed by the system</Tag></span>}>
      {editing ? (
        <div className="space-y-2">
          <label className="block text-sm">Notes
            <textarea className="w-full mt-1 p-2 rounded-[8px] border border-border bg-surface text-text min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="block text-sm">Your read on the account
            <input className="w-full mt-1 p-2 min-h-[44px] rounded-[8px] border border-border bg-surface text-text" value={read} onChange={(e) => setRead(e.target.value)} />
          </label>
          <label className="block text-sm">Last contacted
            <input type="date" className="block mt-1 p-2 min-h-[44px] rounded-[8px] border border-border bg-surface text-text" value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => {
              run(() => call(`/api/accounts/${a.id}`, "PATCH", { notes, relationship_read: read, last_contacted_at: contact ? new Date(`${contact}T12:00:00+05:30`).toISOString() : null }));
              setEditing(false);
            }}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="text-sm space-y-1">
          <p>{a.notes || <span className="text-muted">No notes.</span>}</p>
          {a.relationship_read && <p><b>Your read:</b> {a.relationship_read}</p>}
          <p className="text-muted">Last contacted: {a.last_contacted_at ? `${fmtDate(a.last_contacted_at)} (${age(a.last_contacted_at)})` : "not logged"}</p>
          <button type="button" className="btn text-sm mt-1" onClick={() => setEditing(true)}>Edit notes</button>
        </div>
      )}
    </Section>
  );
}
