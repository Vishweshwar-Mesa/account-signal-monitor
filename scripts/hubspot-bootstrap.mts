// One-time HubSpot DEMO setup. Idempotent. Uses DATABASE_URL when set, else a seeded scratch PGlite DB.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/hubspot-bootstrap.mts
import { createPgliteDb, createPostgresDb } from "../src/lib/db";
import { seedAll } from "../src/lib/seed";
import { hubspotClient } from "../src/lib/hubspot/client";
import { bootstrapHubspot } from "../src/lib/hubspot/bootstrap";

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN missing");
const db = process.env.DATABASE_URL ? await createPostgresDb(process.env.DATABASE_URL) : await createPgliteDb();
if (db.mode === "pglite") await seedAll(db);
const r = await bootstrapHubspot(db, hubspotClient(token));
console.log(JSON.stringify(r, null, 1));
await db.close();
