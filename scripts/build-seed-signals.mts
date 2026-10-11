// Builds data/seed/signals.json by running the REAL pipeline (Google News, fetch, gates, Gemini, validators)
// against the seed accounts in a scratch PGlite database. Nothing is typed in by hand.
// Usage: SM_DISCOVERY_DAYS=30 npx tsx --conditions=react-server --env-file=.env.local scripts/build-seed-signals.mts
import { writeFileSync, readFileSync } from "node:fs";
import { createPgliteDb } from "../src/lib/db";
import { seedAccounts } from "../src/lib/seed";
import { runIngest } from "../src/lib/pipeline/ingest";

const now = new Date();
const accounts = JSON.parse(readFileSync("data/seed/accounts.json", "utf8")).accounts;
const crm = JSON.parse(readFileSync("data/seed/demo-crm.json", "utf8")).accounts;
const db = await createPgliteDb();
delete process.env.HUBSPOT_PRIVATE_APP_TOKEN; // seed build never touches HubSpot
await seedAccounts(db, accounts, crm, now);
const r = await runIngest(db, { now, perAccount: Number(process.env.PER_ACCOUNT || 8), maxArticles: 500, geminiCap: 300, timeBudgetMs: 40 * 60_000 });
console.log("run", r.status, JSON.stringify(r.counts));
if (r.errors.length) console.log("errors:", r.errors.slice(0, 10).join("\n"));

const signals = (await db.query<Record<string, unknown>>(
  `select a.name as account_name, s.url, s.publisher, s.tier, s.published_at, s.title, s.evidence_quote, s.extraction, s.gate_result, s.rejected_reason
   from signals s join accounts a on a.id = s.account_id order by a.name, s.published_at desc nulls last`)).rows;
const events = (await db.query<Record<string, unknown>>(
  `select a.name as account_name, e.type, e.subject_key, e.summary, e.event_date, e.magnitude, e.certainty, e.time_scope,
          e.source_domains, e.best_tier, e.competitor,
          (select array_agg(s.url) from signals s where s.id = any(e.evidence_signal_ids)) as signal_urls
   from events e join accounts a on a.id = e.account_id order by a.name`)).rows;
writeFileSync("data/seed/signals.json", JSON.stringify({
  _note: "Real signals produced by the live pipeline (same gates and validators as production). Quotes max 25 words; no article text stored.",
  generated_at: now.toISOString(),
  run_counts: r.counts,
  signals: signals.map((s) => ({ ...s, published_at: s.published_at ? new Date(s.published_at as string).toISOString() : null })),
  events: events.map((e) => ({ ...e, event_date: new Date(e.event_date as string).toISOString() })),
}, null, 1));
console.log(`wrote ${signals.length} signals (${signals.filter((s) => s.gate_result === "accepted").length} accepted), ${events.length} events`);
const scores = (await db.query<{ name: string; score: number; band: string }>("select name, score, band from accounts order by score desc limit 15")).rows;
console.log(scores.map((s) => `${s.score} ${s.band} ${s.name}`).join("\n"));
await db.close();
