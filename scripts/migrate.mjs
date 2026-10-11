// Applies supabase/migrations/*.sql in order to DATABASE_URL. Tracks applied files in schema_migrations.
// Usage: node --env-file=.env.local scripts/migrate.mjs
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("create table if not exists schema_migrations (file text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select file from schema_migrations")).rows.map((r) => r.file));
for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
  if (done.has(f)) { console.log("skip", f); continue; }
  await client.query("begin");
  try {
    await client.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
    await client.query("insert into schema_migrations (file) values ($1)", [f]);
    await client.query("commit");
    console.log("applied", f);
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
await client.query("alter table schema_migrations enable row level security");
await client.end();
