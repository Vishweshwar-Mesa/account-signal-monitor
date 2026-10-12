// Exports real accounts and verified signals from DATABASE_URL back into data/seed/*.json, so the seed fallback matches production.
// Demo CRM data stays in data/seed/demo-crm.json and is not exported here.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/export-seed.mts
import { writeFileSync } from "node:fs";
import { createPostgresDb } from "../src/lib/db";
import { dateOnly } from "../src/lib/time";

const db = await createPostgresDb(process.env.DATABASE_URL!);
const acc = (await db.query<Record<string, unknown>>(
  `select id, name, domain, aliases, sector, hq_city, employee_count, employee_count_source_url, employee_count_as_of, employee_count_is_estimate,
          employee_count_note, frontline_share, multi_site, india_footprint, newsroom_url, newsroom_rss, is_active from accounts order by is_active desc, name`)).rows;
const people = (await db.query<Record<string, unknown>>("select account_id, name, title, role_group, source_url, as_of, why from people where removed_at is null")).rows;
writeFileSync("data/seed/accounts.json", JSON.stringify({
  _note: "Real companies. Headcount and people from cited sources (data/research/). Exported from the production database by scripts/export-seed.mts.",
  generated_at: new Date().toISOString().slice(0, 10),
  accounts: acc.map(({ id, ...a }) => ({
    ...a, employee_count_as_of: dateOnly(a.employee_count_as_of),
    people: people.filter((p) => p.account_id === id).map(({ account_id: _x, ...p }) => ({ ...p, as_of: dateOnly(p.as_of) })),
  })),
}, null, 1));
const signals = (await db.query<Record<string, unknown>>(
  `select a.name as account_name, s.url, s.publisher, s.tier, s.published_at, s.title, s.evidence_quote, s.extraction, s.gate_result, s.rejected_reason
   from signals s join accounts a on a.id = s.account_id where s.gate_result in ('accepted','rejected','no_trigger') order by a.name`)).rows;
const events = (await db.query<Record<string, unknown>>(
  `select a.name as account_name, e.type, e.subject_key, e.summary, e.event_date, e.magnitude, e.certainty, e.time_scope, e.source_domains, e.best_tier, e.competitor,
          (select array_agg(s.url) from signals s where s.id = any(e.evidence_signal_ids)) as signal_urls
   from events e join accounts a on a.id = e.account_id order by a.name`)).rows;
writeFileSync("data/seed/signals.json", JSON.stringify({
  _note: "Real signals that passed the same gates and validators as production (live pipeline runs plus researched URLs run through the pipeline). Quotes max 25 words.",
  generated_at: new Date().toISOString(),
  signals: signals.map((s) => ({ ...s, published_at: s.published_at ? new Date(s.published_at as string).toISOString() : null })),
  events: events.map((e) => ({ ...e, event_date: new Date(e.event_date as string).toISOString() })),
}, null, 1));
console.log({ accounts: acc.length, signals: signals.length, events: events.length });
await db.close();
