// Adds demo tasks and activities from data/seed/demo-crm.json that are missing for EXISTING accounts.
// Touches only the tasks and activities tables (never accounts, so Arjun-owned columns are untouched).
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/sync-demo-crm.mts
import { readFileSync } from "node:fs";
import { createPostgresDb } from "../src/lib/db";

const DAY = 86_400_000;
const now = new Date();
const crm = JSON.parse(readFileSync("data/seed/demo-crm.json", "utf8")).accounts as Record<string, {
  tasks?: { title: string; kind?: string; due_in_days: number; done?: boolean }[];
  activities?: { kind: string; direction?: string; days_ago: number; summary: string }[];
}>;
const db = await createPostgresDb(process.env.DATABASE_URL!);
let t = 0, a = 0;
for (const [name, c] of Object.entries(crm)) {
  const acc = (await db.query<{ id: string }>("select id from accounts where lower(name) = lower($1)", [name])).rows[0];
  if (!acc) continue;
  for (const x of c.activities ?? []) {
    const r = await db.query(
      `insert into activities (account_id, kind, direction, occurred_at, summary, source)
       select $1,$2,$3,$4,$5,'demo' where not exists (
         select 1 from activities where account_id = $1 and kind in ($2, 'note') and replace(replace(summary, '[DEMO] Email: ', ''), '[DEMO] ', '') = $5)
       returning id`,
      [acc.id, x.kind, x.direction ?? "outbound", new Date(now.getTime() - x.days_ago * DAY), x.summary]);
    a += r.rows.length;
  }
  for (const x of c.tasks ?? []) {
    const r = await db.query(
      `insert into tasks (account_id, title, kind, due_at, done, source)
       select $1,$2,$3,$4,$5,'demo' where not exists (select 1 from tasks where account_id = $1 and replace(title, '[DEMO] ', '') = $2) returning id`,
      [acc.id, x.title, x.kind ?? "task", new Date(now.getTime() + x.due_in_days * DAY), x.done ?? false]);
    t += r.rows.length;
  }
}
console.log({ activities_added: a, tasks_added: t });
await db.close();
