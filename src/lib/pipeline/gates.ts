import sources from "../../../config/sources.json";
import scoring from "../../../config/scoring.json";
import type { Tier } from "../scoring";

// Gates G1 to G6 run in code BEFORE any Gemini call. A failure stops that item and is counted in the run log.

export type GateResult = "pass" | "g1_entity" | "g2_stale" | "g3_content_type" | "g4_context" | "g5_speculation" | "g6_no_text";

export interface GateAccount {
  name: string;
  aliases: string[];
  domain: string | null;
}

export interface Candidate {
  url: string;
  title: string;
  text: string;
  published_at: Date | null;
}

export function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Names used for matching: the account name plus aliases of 4+ characters. */
export function matchNames(a: GateAccount) {
  return [a.name, ...a.aliases].map(normalise).filter((n) => n.length >= 4);
}

/** G1: the account name or an alias appears as whole words in the title or first 600 chars. */
export function gateEntity(a: GateAccount, c: Candidate): boolean {
  const hay = normalise(`${c.title} ${c.text.slice(0, 600)}`);
  return matchNames(a).some((n) => new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`).test(hay));
}

/** G2: published within the freshness window (14 days), not in the future. */
export function gateFresh(c: Candidate, now: Date, days = scoring.freshnessDays): boolean {
  if (!c.published_at) return false;
  const age = (now.getTime() - c.published_at.getTime()) / 86_400_000;
  return age >= -1 && age <= days;
}

const BAD_URL = [/\/jobs?\//, /naukri\.com/, /indeed\./, /foundit\./, /shine\.com/, /\/opinion\//, /\/blogs?\//, /\/brand-?connect\//, /\/spotlight\//, /\/sponsored\//, /\/brandwire\//, /\/partner-content\//, /\/columns?\//, /\/web-stories\//, /\/photos?\//, /\/videos?\//];
const BAD_TITLE = [
  /\b(top|best) \d+\b/, /\bstocks? to (buy|watch|sell)\b/, /\btarget price\b/, /\bbuy or sell\b/, /\bshare price (live|today)\b/,
  /\bstock (tip|pick)s?\b/, /\bsponsored\b/, /\badvertorial\b/, /\bopinion\s*[:|]/, /\bjob (opening|vacanc)/, /\bwalk-?in\b/, /\bapply now\b/,
  /\bstocks? (rally|surge|jump|fall|slump|gain)s?\b/, /\bshares? (rally|surge|jump|fall|slump|gain|rise|zoom|tank)s?\b/,
];

/** G3: news or announcement, not a job listing, listicle, stock tip, opinion or sponsored post. */
export function gateContentType(c: Candidate): boolean {
  const url = c.url.toLowerCase();
  const title = normalise(c.title);
  return !BAD_URL.some((r) => r.test(url)) && !BAD_TITLE.some((r) => r.test(title));
}

/** G4: source tier from the allowlist. The account's own domain is T1. */
export function tierFor(url: string, accountDomain: string | null): { tier: Tier; publisher: string } {
  const host = hostOf(url);
  const dom = accountDomain?.replace(/^www\./, "").toLowerCase();
  if (dom && (host === dom || host.endsWith(`.${dom}`))) return { tier: "T1", publisher: `${dom} (company site)` };
  for (const d of sources.T1) if (host === d || host.endsWith(`.${d}`)) return { tier: "T1", publisher: d };
  const t2 = sources.T2 as Record<string, string>;
  const match = Object.keys(t2)
    .filter((d) => host === d || host.endsWith(`.${d}`))
    .sort((a, b) => b.length - a.length)[0];
  if (match) return { tier: "T2", publisher: t2[match] };
  return { tier: "CONTEXT", publisher: host || "unknown" };
}

const SPECULATION = [/\bcould\b.*\?$/, /\bwill .* (ever|really)\b/, /\bspeculat/, /\bwhat if\b/, /\bmay consider\b/];
const RUMOUR = [/\bsources? (said|say|told)\b/, /\bpeople (aware|familiar)\b/, /\bin talks\b/, /\brumou?r/, /\bunconfirmed\b/, /\breportedly\b/, /\bis likely to\b/];

/** G5: drop pure speculation. Rumour is allowed through but marked, so it gets x0.7 and can never be Hot. */
export function gateCertainty(c: Candidate): { pass: boolean; rumour: boolean } {
  const title = normalise(c.title);
  if (SPECULATION.some((r) => r.test(title))) return { pass: false, rumour: false };
  const head = normalise(`${c.title} ${c.text.slice(0, 1200)}`);
  return { pass: true, rumour: RUMOUR.some((r) => r.test(head)) };
}

/** G6: there is article text to quote from. The verbatim check itself is V1, after extraction. */
export function gateHasText(c: Candidate): boolean {
  return c.text.trim().length >= 200;
}

export function runGates(a: GateAccount, c: Candidate, now: Date): { result: GateResult; tier: Tier; publisher: string; rumour: boolean } {
  const { tier, publisher } = tierFor(c.url, a.domain);
  const base = { tier, publisher, rumour: false };
  if (!gateEntity(a, c)) return { ...base, result: "g1_entity" };
  if (!gateFresh(c, now)) return { ...base, result: "g2_stale" };
  if (!gateContentType(c)) return { ...base, result: "g3_content_type" };
  if (tier === "CONTEXT") return { ...base, result: "g4_context" };
  const cert = gateCertainty(c);
  if (!cert.pass) return { ...base, result: "g5_speculation" };
  if (!gateHasText(c)) return { ...base, result: "g6_no_text" };
  return { ...base, result: "pass", rumour: cert.rumour };
}
