import type { Db } from "../db";
import scoring from "../../../config/scoring.json";
import { runGates, hostOf, type GateAccount } from "./gates";
import { validateExtraction, eventKey, subjectKey, urlHash, type Extraction, type ValidatedEvent } from "./validators";
import { fetchFeed, googleNewsUrl, bingNewsUrl, resolveBingUrl, resolveGoogleNewsUrl, googleDecodeAvailable, fetchArticle, type FeedItem, type Article } from "./news";
import { extractFacts, geminiCalls, resetGeminiCalls, GeminiCapError } from "../ai/gemini";
import { rescoreAll } from "./rescore";
import { startRun, finishRun, type RunCounts, newCounts } from "./runs";

// Ingest job (section 7). Discovery, gates, extraction, validators, clustering, then a full rescore.
// Fetcher and extractor are injectable so the same code runs on fixtures in tests.

export interface IngestDeps {
  discover: (a: AccountRow) => Promise<FeedItem[]>;
  resolve: (link: string) => Promise<string | null>;
  fetchArticle: (url: string) => Promise<Article | { blocked: string }>;
  extract: (company: string, aliases: string[], title: string, text: string) => Promise<Extraction | null>;
  geminiCalls: () => number;
}

export interface AccountRow extends GateAccount {
  id: string;
  newsroom_rss: string | null;
  is_active: boolean;
}

/** Search names: the legal name without trailing suffixes, plus up to two multi-word aliases (single words are too generic). */
export function queryNames(a: { name: string; aliases: string[] }) {
  const clean = (s: string) => {
    let x = s.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
    const suffix = /\s(limited|ltd\.?|pvt\.?|private|(?<!\bof\s)india)$/i; // keep "Corporation of India"
    while (suffix.test(x)) x = x.replace(suffix, "").trim();
    return x;
  };
  const names = [clean(a.name), ...a.aliases.filter((x) => /\s/.test(x.trim()) && x.length >= 6).map(clean)];
  return [...new Set(names.filter((n) => n.length >= 4))].slice(0, 3);
}

export const liveDeps: IngestDeps = {
  discover: async (a) => {
    const q = queryNames(a).map((x) => `"${x}"`).join(" OR ");
    // Bing first (direct publisher URLs). Google adds titles Bing missed; its links need decoding, which may be throttled.
    const bing = await fetchFeed(bingNewsUrl(q)).catch(() => [] as FeedItem[]);
    const google = googleDecodeAvailable() ? await fetchFeed(googleNewsUrl(q)).catch(() => [] as FeedItem[]) : [];
    const seen = new Set(bing.map((i) => i.title.toLowerCase().slice(0, 60)));
    const items = [...bing, ...google.filter((i) => !seen.has(i.title.toLowerCase().slice(0, 60)))];
    if (a.newsroom_rss) items.push(...(await fetchFeed(a.newsroom_rss).catch(() => [])));
    if (!bing.length && !google.length) throw new Error("no feed reachable");
    return items;
  },
  resolve: async (link) => resolveBingUrl(link) ?? (/bing\.com/.test(link) ? null : resolveGoogleNewsUrl(link)),
  fetchArticle,
  extract: extractFacts,
  geminiCalls,
};

export interface IngestOptions {
  now?: Date;
  deps?: IngestDeps;
  accountIds?: string[];
  maxArticles?: number;
  geminiCap?: number;
  timeBudgetMs?: number;
  perAccount?: number;
  isSeed?: boolean;
  hubspot?: import("../hubspot/client").Hs;
}

/** Upsert one validated event: same event_key from another outlet raises source_count and keeps the best tier. */
export async function upsertEvent(db: Db, accountId: string, ev: ValidatedEvent, signalId: string, eventDate: Date, tier: "T1" | "T2", domain: string) {
  const sk = subjectKey(ev.type, ev.subject);
  const key = eventKey(accountId, ev.type, sk, eventDate);
  // Same key, or the same story reported within 7 days (a story can straddle an ISO-week boundary, e.g. Sunday and Monday).
  const existing = await db.query<{ id: string; source_domains: string[]; best_tier: string; evidence_signal_ids: string[] }>(
    `select id, source_domains, best_tier, evidence_signal_ids from events
     where event_key = $1
        or (account_id = $2 and type = $3 and subject_key = $4 and abs(extract(epoch from (event_date - $5::timestamptz))) <= 7 * 86400)
     order by (event_key = $1) desc limit 1`,
    [key, accountId, ev.type, sk, eventDate],
  );
  if (existing.rows.length) {
    const e = existing.rows[0];
    if (e.evidence_signal_ids.includes(signalId)) return { key, merged: false };
    const domains = e.source_domains.includes(domain) ? e.source_domains : [...e.source_domains, domain];
    const best = e.best_tier === "T1" || tier === "T1" ? "T1" : "T2";
    // A confirmed report upgrades an earlier rumour; a later rumour never downgrades a confirmed event.
    await db.query(
      `update events set source_count = source_count + 1, source_domains = $2, best_tier = $3,
         evidence_signal_ids = array_append(evidence_signal_ids, $4::uuid),
         certainty = case when $5 = 'confirmed' then 'confirmed' else certainty end,
         competitor = coalesce(competitor, $6)
       where id = $1`,
      [e.id, domains, best, signalId, ev.certainty, ev.competitor],
    );
    return { key, merged: true };
  }
  await db.query(
    `insert into events (account_id, type, event_key, subject_key, summary, event_date, magnitude, certainty, time_scope,
       source_count, source_domains, best_tier, competitor, evidence_signal_ids)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,array[$13::uuid])`,
    [accountId, ev.type, key, sk, ev.summary, eventDate, ev.magnitude, ev.certainty, ev.time_scope, [domain], tier, ev.competitor, signalId],
  );
  return { key, merged: false };
}

async function storeSignal(db: Db, row: Record<string, unknown>) {
  const r = await db.query<{ id: string }>(
    `insert into signals (account_id, url, url_hash, publisher, tier, published_at, title, evidence_quote, extraction, gate_result, rejected_reason, is_seed, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,coalesce($13, now()))
     on conflict (url) do nothing returning id`,
    [row.account_id, row.url, urlHash(String(row.url)), row.publisher, row.tier, row.published_at, row.title, row.evidence_quote ?? null,
      row.extraction ? JSON.stringify(row.extraction) : null, row.gate_result, row.rejected_reason ?? null, row.is_seed ?? false, row.fetched_at ?? null],
  );
  return r.rows[0]?.id ?? null;
}

export async function processArticle(
  db: Db, account: AccountRow, item: FeedItem, deps: IngestDeps, counts: RunCounts, now: Date, isSeed = false,
  historyDays?: number, // history mode: same gates and validators over a longer window; older items are context only, never scored
): Promise<"stored" | "pregated" | "skipped"> {
  const window = historyDays ?? scoring.freshnessDays;
  const resolved = await deps.resolve(item.link);
  if (!resolved) { bump(counts.gated_out, "unresolved_link"); return "skipped"; }
  const h = urlHash(resolved);
  const seen = await db.query("select 1 from signals where url_hash = $1 union all select 1 from fetch_cache where url_hash = $1", [h]);
  if (seen.rows.length) {
    // In history mode, items earlier dropped only for being older than 14 days get a proper look.
    const stale = historyDays ? await db.query("delete from signals where url_hash = $1 and gate_result = 'g2_stale' returning id", [h]) : { rows: [] };
    if (!stale.rows.length) { counts.skipped_seen++; return "skipped"; }
  }

  // Cheap gates on feed metadata first, so we do not fetch pages we would reject anyway.
  const pre = runGates(account, { url: resolved, title: item.title, text: "x".repeat(300) + item.title, published_at: item.published_at }, now, window);
  if (pre.result === "g2_stale" || pre.result === "g3_content_type" || pre.result === "g4_context" || pre.result === "g5_speculation") {
    bump(counts.gated_out, pre.result);
    await storeSignal(db, { account_id: account.id, url: resolved, publisher: item.source_name ?? pre.publisher, tier: pre.tier, published_at: item.published_at, title: item.title, gate_result: pre.result, is_seed: isSeed, fetched_at: now });
    return "pregated";
  }

  // A slow or failing publisher is a skipped article, not a failed run.
  const art = await deps.fetchArticle(resolved).catch((e: Error) => ({ blocked: /abort|timeout/i.test(String(e?.message)) ? "timeout" : "error" }));
  counts.fetched++;
  if ("blocked" in art) {
    bump(counts.gated_out, `fetch_${art.blocked}`);
    await db.query("insert into fetch_cache (url_hash, url, status) values ($1,$2,$3) on conflict do nothing", [h, resolved, art.blocked]);
    return "skipped";
  }
  const published = art.published_at ?? item.published_at;
  const cand = { url: art.url, title: art.title || item.title, text: art.text, published_at: published };
  const g = runGates(account, cand, now, window);
  const publisher = g.tier === "T2" || g.tier === "T1" ? g.publisher : item.source_name ?? g.publisher;
  const base = { account_id: account.id, url: resolved, publisher, tier: g.tier, published_at: published, title: cand.title, is_seed: isSeed, fetched_at: now };
  if (g.result !== "pass") {
    bump(counts.gated_out, g.result);
    await storeSignal(db, { ...base, gate_result: g.result });
    return "stored";
  }

  const x = await deps.extract(account.name, account.aliases, cand.title, cand.text);
  counts.extracted++;
  if (!x) {
    bump(counts.rejected_by_validator, "invalid_json");
    await storeSignal(db, { ...base, gate_result: "rejected", rejected_reason: "invalid_json" });
    return "stored";
  }
  const v = validateExtraction(x, cand.text, published, now, g.rumour, window);
  if (!v.ok) {
    bump(counts.rejected_by_validator, v.reason);
    await storeSignal(db, { ...base, extraction: x, gate_result: v.reason === "no_trigger" ? "no_trigger" : "rejected", rejected_reason: v.reason });
    return "stored";
  }
  const ageDays = published ? (now.getTime() - published.getTime()) / 86_400_000 : 0;
  if (historyDays && ageDays > scoring.freshnessDays) {
    // Verified, but older than the scoring window: kept as account history, no event, no points.
    await storeSignal(db, { ...base, extraction: { ...x, notes: v.event.notes }, evidence_quote: v.event.quote, gate_result: "history" });
    counts.history = Number(counts.history ?? 0) + 1;
    return "stored";
  }
  const signalId = await storeSignal(db, { ...base, extraction: { ...x, notes: v.event.notes }, evidence_quote: v.event.quote, gate_result: "accepted" });
  if (signalId) {
    await upsertEvent(db, account.id, v.event, signalId, published ?? now, g.tier as "T1" | "T2", hostOf(resolved));
    counts.events_written++;
  }
  return "stored";
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export async function runIngest(db: Db, opts: IngestOptions = {}) {
  const now = opts.now ?? new Date();
  const deps = opts.deps ?? liveDeps;
  const maxArticles = opts.maxArticles ?? Number(process.env.MAX_ARTICLES_PER_RUN || 120);
  const cap = opts.geminiCap ?? Number(process.env.GEMINI_DAILY_CALL_CAP || 300);
  const deadline = Date.now() + (opts.timeBudgetMs ?? 240_000);
  const perAccount = opts.perAccount ?? 6;
  if (deps === liveDeps) resetGeminiCalls();
  const runId = await startRun(db, "ingest", now);
  const counts = newCounts();
  const errors: string[] = [];
  let partial = false;

  try {
    // HubSpot sync runs first inside the ingest job (section 10). Failure never stops ingest (D08).
    try {
      const { syncHubspot } = await import("../hubspot/sync");
      const r = await syncHubspot(db, { hs: opts.hubspot, now });
      counts.hubspot = r.status;
      if (r.path) counts.hubspot_path = r.path;
      if (r.counts) counts.hubspot_counts = r.counts;
      if (r.error) errors.push(`hubspot: ${r.error}${r.scopesHint ? ` (${r.scopesHint})` : ""}`);
    } catch (e) {
      counts.hubspot = "failed";
      errors.push(`hubspot: ${(e as Error).message}`);
    }

    const acc = await db.query<AccountRow>(
      `select id, name, aliases, domain, newsroom_rss, is_active from accounts
       ${opts.accountIds ? "where id = any($1)" : ""} order by is_active desc, name`,
      opts.accountIds ? [opts.accountIds] : [],
    );
    let processed = 0;
    outer: for (const a of acc.rows) {
      let items: FeedItem[] = [];
      try {
        items = await deps.discover(a);
      } catch (e) {
        partial = true;
        errors.push(`feed ${a.name}: ${(e as Error).message}`);
        continue;
      }
      counts.discovered += items.length;
      items.sort((x, y) => (y.published_at?.getTime() ?? 0) - (x.published_at?.getTime() ?? 0)); // newest first
      let n = 0;
      for (const it of items) {
        if (n >= perAccount) break;
        if (processed >= maxArticles) { counts.stopped = "max_articles"; partial = true; break outer; }
        if (deps.geminiCalls() >= cap) { counts.stopped = "gemini_cap"; partial = true; break outer; }
        if (Date.now() > deadline) { counts.stopped = "time_budget"; partial = true; break outer; }
        try {
          const r = await processArticle(db, a, it, deps, counts, now, opts.isSeed);
          if (r === "stored") { n++; processed++; } // only fetched articles use the per-account and per-run budget
        } catch (e) {
          if (e instanceof GeminiCapError) { counts.stopped = "gemini_cap"; partial = true; break outer; }
          partial = true;
          errors.push(`${a.name}: ${(e as Error).message}`.slice(0, 300));
        }
      }
    }
    counts.accounts_rescored = await rescoreAll(db, now);
    counts.gemini_calls = deps.geminiCalls();
    const status = partial ? "partial" : "ok";
    await finishRun(db, runId, status, counts, errors.length ? errors.slice(0, 20).join("\n") : null);
    return { runId, status, counts, errors };
  } catch (e) {
    counts.gemini_calls = deps.geminiCalls();
    await finishRun(db, runId, "failed", counts, String((e as Error).stack ?? e).slice(0, 2000));
    throw e;
  }
}
