import "server-only";
import { getDb } from "./db";
import { runIngest } from "./pipeline/ingest";
import { runMorning, maybeAlert } from "./morning";

export async function ingestJob(opts: { timeBudgetMs?: number } = {}) {
  const db = await getDb();
  try {
    return await runIngest(db, { timeBudgetMs: opts.timeBudgetMs ?? 240_000 });
  } catch (e) {
    await maybeAlert(db, "ingest", (e as Error).message);
    throw e;
  }
}

export async function morningJob(opts: { forceHotList?: boolean } = {}) {
  const db = await getDb();
  return runMorning(db, { forceHotList: opts.forceHotList });
}
