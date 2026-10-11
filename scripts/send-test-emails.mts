// Sends one real Hot List and one morning brief to ARJUN_EMAIL from the seed data (or DATABASE_URL when set).
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/send-test-emails.mts
import { createPgliteDb, createPostgresDb } from "../src/lib/db";
import { seedAll } from "../src/lib/seed";
import { runMorning } from "../src/lib/morning";

const db = process.env.DATABASE_URL ? await createPostgresDb(process.env.DATABASE_URL) : await createPgliteDb();
if (db.mode === "pglite") await seedAll(db);
const r = await runMorning(db, { forceHotList: true });
console.log(JSON.stringify(r.counts));
const sends = await db.query("select kind, send_key, status, recipient from sends");
console.log(sends.rows);
await db.close();
