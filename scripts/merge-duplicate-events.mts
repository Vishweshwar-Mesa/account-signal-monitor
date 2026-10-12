// One-off repair for the ISO-week boundary bug (fixed in upsertEvent): merges events of the same account, type and subject
// within 7 days, and removes retention tasks created for the merged-away event (in HubSpot and the DB).
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/merge-duplicate-events.mts
import { createPostgresDb } from "../src/lib/db";
import { hubspotClient } from "../src/lib/hubspot/client";
import { rescoreAll } from "../src/lib/pipeline/rescore";

const db = await createPostgresDb(process.env.DATABASE_URL!);
const hs = process.env.HUBSPOT_PRIVATE_APP_TOKEN ? hubspotClient(process.env.HUBSPOT_PRIVATE_APP_TOKEN) : null;
const pairs = (await db.query<{ keep: string; drop: string; drop_key: string; name: string }>(
  `select a.id keep, b.id drop, b.event_key drop_key, ac.name
   from events a join events b on a.account_id = b.account_id and a.type = b.type and a.subject_key = b.subject_key and a.id <> b.id
     and (a.event_date, a.id) < (b.event_date, b.id) and abs(extract(epoch from (b.event_date - a.event_date))) <= 7 * 86400
   join accounts ac on ac.id = a.account_id`)).rows;
const dropped = new Set<string>();
for (const p of pairs) {
  if (dropped.has(p.drop) || dropped.has(p.keep)) continue;
  await db.query(
    `update events k set evidence_signal_ids = (select array(select distinct unnest(k.evidence_signal_ids || d.evidence_signal_ids))),
       source_domains = (select array(select distinct unnest(k.source_domains || d.source_domains))),
       source_count = k.source_count + d.source_count,
       best_tier = case when k.best_tier = 'T1' or d.best_tier = 'T1' then 'T1' else 'T2' end,
       event_date = greatest(k.event_date, d.event_date)
     from events d where k.id = $1 and d.id = $2`, [p.keep, p.drop]);
  const tasks = (await db.query<{ id: string; hubspot_id: string | null }>("select id, hubspot_id from tasks where event_key = $1", [p.drop_key])).rows;
  for (const t of tasks) {
    if (t.hubspot_id && hs) await hs.req("DELETE", `/crm/v3/objects/tasks/${t.hubspot_id}`).catch((e) => console.log("hubspot delete failed", (e as Error).message));
    await db.query("delete from tasks where id = $1", [t.id]);
  }
  await db.query("delete from events where id = $1", [p.drop]);
  dropped.add(p.drop);
  console.log(`merged duplicate event at ${p.name}; removed ${tasks.length} duplicate retention task(s)`);
}
console.log("rescored", await rescoreAll(db));
await db.close();
