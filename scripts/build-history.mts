// Account history: runs the same gates, Gemini extraction and validators over the last 90 days.
// Items older than 14 days are stored as gate_result 'history' (context only, never scored, no events).
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/build-history.mts [perAccount]
import { createPostgresDb } from "../src/lib/db";
import { processArticle, liveDeps, queryNames, type AccountRow } from "../src/lib/pipeline/ingest";
import { fetchFeed, bingNewsUrl } from "../src/lib/pipeline/news";
import { newCounts } from "../src/lib/pipeline/runs";
import { geminiCalls } from "../src/lib/ai/gemini";

const perAccount = Number(process.argv[2] ?? 4);
const now = new Date();
const db = await createPostgresDb(process.env.DATABASE_URL!);
const counts = newCounts();
const accounts = (await db.query<AccountRow>("select id, name, aliases, domain, newsroom_rss, is_active from accounts order by is_active desc, name")).rows;
for (const a of accounts) {
  if (geminiCalls() >= 250) { console.log("Gemini cap reached"); break; }
  const q = queryNames(a).map((x) => `"${x}"`).join(" OR ");
  const items = (await fetchFeed(bingNewsUrl(q, { history: true })).catch(() => []))
    .filter((i) => i.published_at && now.getTime() - i.published_at.getTime() <= 90 * 86_400_000);
  let n = 0;
  for (const it of items) {
    if (n >= perAccount) break;
    try {
      const r = await processArticle(db, a, it, liveDeps, counts, now, false, 90);
      if (r === "stored") n++;
    } catch (e) {
      console.log(a.name, (e as Error).message.slice(0, 100));
    }
  }
}
console.log(JSON.stringify(counts));
console.log((await db.query("select a.name, count(*) n from signals s join accounts a on a.id = s.account_id where s.gate_result = 'history' group by 1 order by 2 desc")).rows);
await db.close();
