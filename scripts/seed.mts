// Loads data/seed/*.json into DATABASE_URL. Insert-only: existing rows (and anything Arjun wrote) are left alone.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/seed.mts
import { createPostgresDb } from "../src/lib/db";
import { seedAll } from "../src/lib/seed";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const db = await createPostgresDb(process.env.DATABASE_URL);
console.log(await seedAll(db));
await db.close();
