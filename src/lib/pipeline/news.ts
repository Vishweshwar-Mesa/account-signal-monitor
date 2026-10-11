import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { hostOf } from "./gates";

// Discovery (Google News RSS + newsroom RSS) and polite fetching (R9):
// clear User-Agent, robots.txt respected, per-host throttle, timeouts, no full text stored.

export const USER_AGENT = "AccountSignalMonitor/1.0 (+https://github.com/Vishweshwar-Mesa/account-signal-monitor; sales research, respects robots.txt)";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export interface FeedItem {
  title: string;
  link: string;
  published_at: Date | null;
  source_name: string | null;
  source_url: string | null;
}

export interface Article {
  url: string;
  title: string;
  text: string;
  published_at: Date | null;
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

const lastHit = new Map<string, number>();
async function throttle(host: string, gapMs = 1000) {
  const wait = (lastHit.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

const robotsCache = new Map<string, ReturnType<typeof robotsParser> | null>();
export async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    try {
      const res = await timedFetch(`${key}/robots.txt`, { headers: { "User-Agent": USER_AGENT } }, 5000);
      robotsCache.set(key, res.ok ? robotsParser(`${key}/robots.txt`, await res.text()) : null);
    } catch {
      robotsCache.set(key, null);
    }
  }
  const r = robotsCache.get(key);
  return r ? r.isAllowed(url, "AccountSignalMonitor") !== false : true;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function parseRss(body: string): FeedItem[] {
  const doc = xml.parse(body);
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((it: Record<string, unknown>) => {
    const src = it.source as { "#text"?: string; "@_url"?: string } | string | undefined;
    const link = typeof it.link === "string" ? it.link : (it.link as { "@_href"?: string })?.["@_href"] ?? "";
    const date = (it.pubDate ?? it.published ?? it.updated) as string | undefined;
    return {
      title: String(it.title ?? "").trim(),
      link,
      published_at: date ? new Date(date) : null,
      source_name: typeof src === "string" ? src : src?.["#text"] ?? (it["News:Source"] as string | undefined) ?? null,
      source_url: typeof src === "object" ? src?.["@_url"] ?? null : null,
    };
  });
}

/** Bing News RSS. Each link carries the original publisher URL in its url= parameter, so no extra request is needed. */
export function bingNewsUrl(query: string) {
  // qft: past month, newest first (the freshness gate then keeps 14 days).
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=en-IN&cc=IN&qft=${encodeURIComponent('interval="9" sortbydate="1"')}`;
}

export function resolveBingUrl(link: string): string | null {
  try {
    const u = new URL(link);
    if (!/bing\.com$/.test(u.hostname)) return null;
    const target = u.searchParams.get("url");
    return target && /^https?:\/\//.test(target) ? target : null;
  } catch {
    return null;
  }
}

export function googleNewsUrl(query: string, days = Number(process.env.SM_DISCOVERY_DAYS || 14)) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  await throttle(hostOf(url), 1200);
  // Bing returns an empty feed to non-browser agents, so feeds use a browser UA; publisher pages use our own UA.
  const res = await timedFetch(url, { headers: { "User-Agent": /bing\.com/.test(url) ? BROWSER_UA : USER_AGENT } });
  if (!res.ok) throw new Error(`feed ${res.status} ${url}`);
  return parseRss(await res.text());
}

/** Google News RSS links point at news.google.com. Resolve them to the original publisher URL. */
// Circuit breaker: Google throttles its decode endpoint. After 3 failures in a row, stop trying for this process.
let googleFailures = 0;
export const googleDecodeAvailable = () => googleFailures < 3;
export async function resolveGoogleNewsUrl(link: string): Promise<string | null> {
  if (!/news\.google\.com/.test(link)) return link;
  if (googleFailures >= 3) return null;
  const r = await decodeGoogle(link);
  googleFailures = r ? 0 : googleFailures + 1;
  return r;
}

async function decodeGoogle(link: string): Promise<string | null> {
  try {
    const id = new URL(link).pathname.split("/").pop();
    if (!id) return null;
    await throttle("news.google.com", 600);
    const page = await timedFetch(`https://news.google.com/articles/${id}`, { headers: { "User-Agent": BROWSER_UA } });
    const html = await page.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return null;
    const inner = JSON.stringify([
      "garturlreq",
      [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id, Number(ts), sg,
    ]);
    const body = "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]));
    const res = await timedFetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": BROWSER_UA },
      body,
    });
    const text = await res.text();
    const chunk = text.split("\n\n")[1];
    const outer = JSON.parse(chunk);
    const url = JSON.parse(outer[0][2])[1];
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

function pickDate($: cheerio.CheerioAPI): Date | null {
  const metas = [
    'meta[property="article:published_time"]',
    'meta[name="publish-date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    'meta[name="Last-Modified"]',
  ];
  for (const m of metas) {
    const v = $(m).attr("content");
    if (v && !isNaN(Date.parse(v))) return new Date(v);
  }
  let found: Date | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const m = $(el).text().match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (m && !isNaN(Date.parse(m[1]))) found = new Date(m[1]);
  });
  return found;
}

/** Fetch a publisher page and pull the title, paragraph text and date. Text stays in memory only. */
export async function fetchArticle(url: string): Promise<Article | { blocked: string }> {
  if (!(await allowedByRobots(url))) return { blocked: "robots" };
  await throttle(hostOf(url));
  const res = await timedFetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
  if (!res.ok) return { blocked: `http_${res.status}` };
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("html")) return { blocked: "not_html" };
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr("content") || $("h1").first().text() || $("title").text()).trim();
  $("script, style, nav, footer, header, aside, form, noscript, figure").remove();
  const paras = $("article p, main p, .article p, p")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((p) => p.length > 40);
  let text = [...new Set(paras)].join("\n");
  if (text.length < 400) {
    // Some publishers (for example ET) put the body in divs, not <p> tags.
    const body = $('[itemprop="articleBody"], .artText, .article-body, .story-content, .story_details, .content-area, article, main')
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (body.length > text.length) text = body;
  }
  text = text.slice(0, 20_000);
  return { url: res.url || url, title, text, published_at: pickDate($) };
}
