import "server-only";
import { getDb } from "./db";
import { health, type Health } from "./health";
import type { ScoreBreakdown } from "./scoring";

export interface DSignal {
  id: string; title: string; url: string; publisher: string; tier: string; published_at: string | null;
  quote: string | null; summary: string | null; type: string | null; certainty: string | null; feedback: string | null;
}
export interface DPerson { id: string; name: string; title: string; why: string | null; source_url: string; as_of: string; role_group: string }
export interface DTask { id: string; title: string; kind: string; due_at: string | null; done: boolean; hubspot_id: string | null; source: string }
export interface DActivity { id: string; kind: string; direction: string; occurred_at: string; summary: string | null; hubspot_id: string | null; source: string }
export interface DAccount {
  id: string; name: string; domain: string | null; sector: string | null; hq_city: string | null;
  employee_count: number | null; employee_count_source_url: string | null; employee_count_as_of: string | null;
  employee_count_is_estimate: boolean; employee_count_note: string | null;
  is_active: boolean; hubspot_company_id: string | null; hubspot_deal_id: string | null; stage: string | null; is_customer: boolean;
  renewal_date: string | null; crm_is_demo: boolean;
  notes: string | null; last_contacted_at: string | null; relationship_read: string | null; my_draft: string | null;
  snoozed_until: string | null; draft_accepted_at: string | null; notes_is_demo: boolean;
  score: number | null; band: "hot" | "warm" | "cold" | null; confidence: string | null; lane: string | null; flags: string[];
  top_signal_summary: string | null; last_signal_at: string | null; score_breakdown: ScoreBreakdown | null;
  system_draft: string | null; draft_tone: string | null; scored_at: string | null;
  signals: DSignal[]; contextCount: number; people: DPerson[]; tasks: DTask[]; activities: DActivity[];
}
export interface DashboardData {
  accounts: DAccount[];
  health: Health;
  updatedAt: string | null;
  hubspotPortal: string | null;
  config: { company: string; team: string; user: string };
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

export async function loadDashboard(): Promise<DashboardData> {
  const db = await getDb();
  const [acc, sig, ppl, tasks, acts, fb] = await Promise.all([
    db.query<Record<string, unknown>>("select * from accounts order by score desc nulls last, last_signal_at desc nulls last, name"),
    db.query<Record<string, unknown>>(
      `select id, account_id, title, url, publisher, tier, published_at, evidence_quote, gate_result,
              extraction->>'one_line_summary' as summary, extraction->>'trigger_type' as type, extraction->>'certainty' as certainty
       from signals where gate_result in ('accepted','g4_context') order by published_at desc nulls last`),
    db.query<Record<string, unknown>>("select * from people where removed_at is null order by case role_group when 'hr_head' then 0 when 'ops_head' then 1 else 2 end"),
    db.query<Record<string, unknown>>("select * from tasks order by done, due_at"),
    db.query<Record<string, unknown>>("select * from activities order by occurred_at desc"),
    db.query<{ signal_id: string; verdict: string }>("select distinct on (signal_id) signal_id, verdict from feedback order by signal_id, created_at desc"),
  ]);
  const fbMap = new Map(fb.rows.map((f) => [f.signal_id, f.verdict]));
  const by = <T extends Record<string, unknown>>(rows: T[], id: string) => rows.filter((r) => r.account_id === id);

  const accounts: DAccount[] = acc.rows.map((a) => {
    const id = a.id as string;
    const sigs = by(sig.rows, id);
    return {
      ...(a as unknown as DAccount),
      employee_count_as_of: a.employee_count_as_of ? String(a.employee_count_as_of).slice(0, 10) : null,
      renewal_date: a.renewal_date ? new Date(a.renewal_date as string).toISOString().slice(0, 10) : null,
      last_contacted_at: iso(a.last_contacted_at), snoozed_until: iso(a.snoozed_until), draft_accepted_at: iso(a.draft_accepted_at),
      last_signal_at: iso(a.last_signal_at), scored_at: iso(a.scored_at),
      hubspot_deal_id: (a.hubspot_deal_id as string) ?? null,
      flags: (a.flags as string[]) ?? [],
      signals: sigs.filter((s) => s.gate_result === "accepted").map((s) => ({
        id: s.id as string, title: s.title as string, url: s.url as string, publisher: s.publisher as string, tier: s.tier as string,
        published_at: iso(s.published_at), quote: (s.evidence_quote as string) ?? null, summary: (s.summary as string) ?? null,
        type: (s.type as string) ?? null, certainty: (s.certainty as string) ?? null, feedback: fbMap.get(s.id as string) ?? null,
      })),
      contextCount: sigs.filter((s) => s.gate_result === "g4_context").length,
      people: by(ppl.rows, id).map((p) => ({ ...(p as unknown as DPerson), as_of: String(p.as_of).slice(0, 10) })),
      tasks: by(tasks.rows, id).map((t) => ({ ...(t as unknown as DTask), due_at: iso(t.due_at) })),
      activities: by(acts.rows, id).map((x) => ({ ...(x as unknown as DActivity), occurred_at: iso(x.occurred_at)! })),
    };
  });
  const updatedAt = accounts.reduce<string | null>((m, a) => (a.scored_at && (!m || a.scored_at > m) ? a.scored_at : m), null);
  return {
    accounts,
    health: await health(),
    updatedAt,
    hubspotPortal: process.env.HUBSPOT_PORTAL_ID ?? null,
    config: {
      company: process.env.COMPANY_NAME || "Keka",
      team: process.env.TEAM_NAME || "Enterprise Sales Team",
      user: process.env.USER_NAME || "Arjun",
    },
  };
}
