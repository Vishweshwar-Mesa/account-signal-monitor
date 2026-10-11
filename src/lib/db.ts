import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// One small SQL interface for all server code (B04).
// Production: pg with DATABASE_URL. Tests and seed fallback: PGlite (in-process Postgres).
export type Row = Record<string, unknown>;
export interface Q {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Q {
  mode: "postgres" | "pglite";
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const ROOT = process.cwd();

export function migrationSql(): string[] {
  const dir = path.join(ROOT, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
}

export async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec(readFileSync(path.join(ROOT, "supabase", "local-shim.sql"), "utf8"));
  for (const sql of migrationSql()) await pg.exec(sql);
  const wrap = (x: { query: typeof pg.query }): Q => ({
    query: async (sql, params) => {
      const r = await x.query(sql, params as unknown[]);
      return { rows: r.rows as never[] };
    },
  });
  return {
    mode: "pglite",
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
  };
}

export async function createPostgresDb(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: 3,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  return {
    mode: "postgres",
    query: async (sql, params) => {
      const r = await pool.query(sql, params as unknown[]);
      return { rows: r.rows };
    },
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({
          query: async (sql, params) => ({ rows: (await c.query(sql, params as unknown[])).rows }),
        });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

const g = globalThis as unknown as { __smDb?: Promise<Db> };

/** Shared connection. Falls back to seeded PGlite when DATABASE_URL is missing (D08 spirit: always demoable). */
export function getDb(): Promise<Db> {
  if (!g.__smDb) {
    g.__smDb = (async () => {
      const url = process.env.DATABASE_URL;
      if (url) return createPostgresDb(url);
      const db = await createPgliteDb();
      const { seedAll } = await import("./seed");
      await seedAll(db);
      return db;
    })();
    g.__smDb.catch(() => (g.__smDb = undefined));
  }
  return g.__smDb;
}

export function setDbForTests(db: Db) {
  g.__smDb = Promise.resolve(db);
}
