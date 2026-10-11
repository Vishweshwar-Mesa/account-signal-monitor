import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { eventKey } from "./pipeline/validators";
import { rescoreAll } from "./pipeline/rescore";
import { urlHash } from "./pipeline/validators";

// Seed data loader. Three files, each clearly separated:
//  data/seed/accounts.json  real companies, cited headcount and people (research)
//  data/seed/signals.json   real signals that passed the same gates and validators as live data
//  data/seed/demo-crm.json  DEMO ONLY: stages, notes, last contact, tasks, activities, renewals (R8)
// Inserts only. Existing rows are left alone, so re-seeding never overwrites anything Arjun wrote.

const DAY = 86_400_000;
const readJson = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : null);

export interface SeedPerson { name: string; title: string; role_group: string; source_url: string; as_of: string; why?: string }
export interface SeedAccount {
  name: string; domain?: string | null; aliases?: string[]; sector?: string; hq_city?: string;
  employee_count?: number | null; employee_count_source_url?: string | null; employee_count_as_of?: string | null;
  employee_count_is_estimate?: boolean; employee_count_note?: string | null;
  frontline_share?: string | null; multi_site?: boolean | null; india_footprint?: boolean;
  newsroom_url?: string | null; newsroom_rss?: string | null; is_active?: boolean; people?: SeedPerson[];
}
export interface DemoCrm {
  stage: string; is_customer: boolean; renewal_in_days?: number | null; last_contacted_days_ago?: number | null;
  notes?: string; relationship_read?: string;
  tasks?: { title: string; kind?: string; due_in_days: number; done?: boolean }[];
  activities?: { kind: string; direction?: string; days_ago: number; summary: string }[];
}
interface SeedSignals {
  signals: { account_name: string; url: string; publisher: string; tier: string; published_at: string | null; title: string; evidence_quote?: string | null; extraction?: unknown; gate_result: string; rejected_reason?: string | null }[];
  events: { account_name: string; type: string; subject_key: string; summary: string; event_date: string; magnitude: string; certainty: string; time_scope: string; source_domains: string[]; best_tier: string; competitor?: string | null; signal_urls: string[] }[];
}

export async function seedAccounts(db: Db, accounts: SeedAccount[], crm: Record<string, DemoCrm>, now: Date) {
  const ids = new Map<string, string>();
  for (const a of accounts) {
    const c = crm[a.name];
    const r = await db.query<{ id: string }>(
      `insert into accounts (name, domain, aliases, sector, hq_city, employee_count, employee_count_source_url, employee_count_as_of,
         employee_count_is_estimate, employee_count_note, frontline_share, multi_site, india_footprint, newsroom_url, newsroom_rss,
         is_active, stage, is_customer, renewal_date, owner_email, crm_is_demo, notes, last_contacted_at, relationship_read, notes_is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       on conflict (lower(name)) do nothing returning id`,
      [a.name, a.domain ?? null, a.aliases ?? [], a.sector ?? null, a.hq_city ?? null, a.employee_count ?? null,
        a.employee_count_source_url ?? null, a.employee_count_as_of ?? null, a.employee_count_is_estimate ?? false, a.employee_count_note ?? null,
        a.frontline_share ?? null, a.multi_site ?? null, a.india_footprint ?? true, a.newsroom_url ?? null, a.newsroom_rss ?? null,
        Boolean(a.is_active), c?.stage ?? null, c?.is_customer ?? false,
        c?.renewal_in_days != null ? new Date(now.getTime() + c.renewal_in_days * DAY).toISOString().slice(0, 10) : null,
        c ? process.env.ARJUN_EMAIL ?? null : null, Boolean(c),
        c?.notes ?? null, c?.last_contacted_days_ago != null ? new Date(now.getTime() - c.last_contacted_days_ago * DAY) : null,
        c?.relationship_read ?? null, Boolean(c?.notes || c?.relationship_read || c?.last_contacted_days_ago != null)],
    );
    const id = r.rows[0]?.id ?? (await db.query<{ id: string }>("select id from accounts where lower(name) = lower($1)", [a.name])).rows[0].id;
    ids.set(a.name, id);
    if (!r.rows[0]) continue; // existing account: leave everything as it is
    for (const p of a.people ?? []) {
      await db.query(
        "insert into people (account_id, name, title, why, source_url, as_of, role_group) values ($1,$2,$3,$4,$5,$6,$7)",
        [id, p.name, p.title, p.why ?? null, p.source_url, p.as_of, p.role_group],
      );
    }
    for (const t of c?.tasks ?? []) {
      await db.query("insert into tasks (account_id, title, kind, due_at, done, source) values ($1,$2,$3,$4,$5,'demo')",
        [id, t.title, t.kind ?? "task", new Date(now.getTime() + t.due_in_days * DAY), t.done ?? false]);
    }
    for (const x of c?.activities ?? []) {
      await db.query("insert into activities (account_id, kind, direction, occurred_at, summary, source) values ($1,$2,$3,$4,$5,'demo')",
        [id, x.kind, x.direction ?? "outbound", new Date(now.getTime() - x.days_ago * DAY), x.summary]);
    }
  }
  return ids;
}

export async function seedSignals(db: Db, data: SeedSignals, ids: Map<string, string>) {
  const sigIds = new Map<string, string>();
  for (const s of data.signals) {
    const accountId = ids.get(s.account_name);
    if (!accountId) continue;
    const r = await db.query<{ id: string }>(
      `insert into signals (account_id, url, url_hash, publisher, tier, published_at, title, evidence_quote, extraction, gate_result, rejected_reason, is_seed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,true) on conflict (url) do nothing returning id`,
      [accountId, s.url, urlHash(s.url), s.publisher, s.tier, s.published_at, s.title, s.evidence_quote ?? null,
        s.extraction ? JSON.stringify(s.extraction) : null, s.gate_result, s.rejected_reason ?? null],
    );
    if (r.rows[0]) sigIds.set(s.url, r.rows[0].id);
  }
  for (const e of data.events) {
    const accountId = ids.get(e.account_name);
    const evidence = e.signal_urls.map((u) => sigIds.get(u)).filter(Boolean) as string[];
    if (!accountId || !evidence.length) continue;
    const key = eventKey(accountId, e.type as never, e.subject_key, new Date(e.event_date));
    await db.query(
      `insert into events (account_id, type, event_key, subject_key, summary, event_date, magnitude, certainty, time_scope,
         source_count, source_domains, best_tier, competitor, evidence_signal_ids)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (event_key) do nothing`,
      [accountId, e.type, key, e.subject_key, e.summary, e.event_date, e.magnitude, e.certainty, e.time_scope,
        evidence.length, e.source_domains, e.best_tier, e.competitor ?? null, evidence],
    );
  }
}

export async function seedAll(db: Db, now = new Date()) {
  const research = readJson<{ accounts: SeedAccount[] }>(path.join(process.cwd(), "data", "seed", "accounts.json"));
  const crm = readJson<{ accounts: Record<string, DemoCrm> }>(path.join(process.cwd(), "data", "seed", "demo-crm.json"));
  const sig = readJson<SeedSignals>(path.join(process.cwd(), "data", "seed", "signals.json"));
  if (!research) return { accounts: 0 };
  const ids = await seedAccounts(db, research.accounts, crm?.accounts ?? {}, now);
  if (sig) await seedSignals(db, sig, ids);
  await rescoreAll(db, now);
  return { accounts: ids.size };
}
