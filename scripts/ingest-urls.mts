// Adds researched companies (insert-only) and runs their known article URLs through the SAME
// fetch, gates, Gemini extraction and validators as the daily ingest. Nothing is trusted from the research file
// except the company profile (with its cited headcount); every signal must pass the pipeline.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/ingest-urls.mts data/research/fresh-signals.json
import { readFileSync } from "node:fs";
import { createPostgresDb } from "../src/lib/db";
import { seedAccounts } from "../src/lib/seed";
import { processArticle, liveDeps, type AccountRow } from "../src/lib/pipeline/ingest";
import { newCounts } from "../src/lib/pipeline/runs";
import { rescoreAll } from "../src/lib/pipeline/rescore";

const file = process.argv[2] ?? "data/research/fresh-signals.json";
const data = JSON.parse(readFileSync(file, "utf8")) as { companies: (Record<string, unknown> & { name: string; events: { url: string; headline: string; date: string }[] })[] };
const now = new Date();
const db = await createPostgresDb(process.env.DATABASE_URL!);
await seedAccounts(db, data.companies.map(({ events: _e, ...c }) => ({ ...c, is_active: false })) as never, {}, now);
const counts = newCounts();
const deps = { ...liveDeps, resolve: async (u: string) => u };
for (const c of data.companies) {
  const acc = (await db.query<AccountRow>("select id, name, aliases, domain, newsroom_rss, is_active from accounts where lower(name) = lower($1)", [c.name])).rows[0];
  for (const e of c.events) {
    try {
      const r = await processArticle(db, acc, { title: e.headline, link: e.url, published_at: new Date(`${e.date}T06:00:00Z`), source_name: null, source_url: null }, deps, counts, now);
      const sig = (await db.query<{ gate_result: string; rejected_reason: string | null }>("select gate_result, rejected_reason from signals where url = $1", [e.url])).rows[0];
      console.log(`${c.name.slice(0, 30).padEnd(30)} ${r.padEnd(8)} ${sig?.gate_result ?? "not stored"} ${sig?.rejected_reason ?? ""}`);
    } catch (err) {
      console.log(`${c.name}: error ${(err as Error).message}`);
    }
  }
}
console.log("rescored", await rescoreAll(db, now), JSON.stringify(counts));
console.log((await db.query("select name, score, band from accounts where score >= 5 order by score desc")).rows);
await db.close();
