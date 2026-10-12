import { z } from "zod";
import { createHash } from "node:crypto";
import { TRIGGER_TYPES, type TriggerType } from "../scoring";
import { normalise, gateFresh } from "./gates";

// The fixed schema Gemini must return (D01). Code validates it with V1 to V7 before anything is stored as an event.
export const ExtractionSchema = z.object({
  trigger_type: z.string().nullable(),
  company_match: z.boolean(),
  subject: z.string().nullable(),
  subject_title: z.string().nullable(),
  magnitude: z.enum(["small", "medium", "large"]),
  certainty: z.enum(["confirmed", "rumour"]),
  time_scope: z.enum(["new", "retrospective"]),
  evidence_quote: z.string().nullable(),
  one_line_summary: z.string().nullable(),
  competitor_hrms_mentioned: z.string().nullable(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export type ValidatorFailure = "v1_quote_not_verbatim" | "v2_bad_type" | "v3_company_mismatch" | "v4_summary" | "v5_date" | "v6_leader_not_in_quote" | "no_trigger";

export interface ValidatedEvent {
  type: TriggerType;
  subject: string | null;
  subject_title: string | null;
  magnitude: "small" | "medium" | "large";
  certainty: "confirmed" | "rumour";
  time_scope: "new" | "retrospective";
  quote: string;
  summary: string;
  competitor: string | null;
  notes: string[];
}

const BANNED = [/\u2014/, /\u2013/, /!/, /\bgame[- ]chang/i, /\brevolution/i, /\bsynerg/i, /\bguarantee/i, /\bunprecedented\b/i, /\bmassive\b/i];
const MAX_QUOTE_WORDS = 25;

export function trimQuote(q: string, maxWords = MAX_QUOTE_WORDS) {
  const words = q.trim().split(/\s+/);
  return words.length <= maxWords ? q.trim() : words.slice(0, maxWords).join(" ");
}

/** V1: quote is a verbatim substring of the article text, case and whitespace normalised. */
export function isVerbatim(quote: string, text: string) {
  const q = normalise(quote).replace(/^["']|["']$/g, "");
  return q.length >= 8 && normalise(text).includes(q);
}

const tokens = (s: string) => normalise(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
const TITLE_WORDS = /\b(chro|cpo|coo|ceo|cfo|head|chief|officer|president|director|vp|vice|operations|hr|human|people|plant|hub|manager)\b/;

/** V6: for leadership changes, the person's surname and a role word appear in the quote. */
export function leaderInQuote(subject: string | null, title: string | null, quote: string) {
  if (!subject || !title) return false;
  const q = normalise(quote);
  const nameToks = tokens(subject);
  const surname = nameToks[nameToks.length - 1];
  if (!surname || !q.includes(surname)) return false;
  const roleToks = tokens(title).filter((t) => TITLE_WORDS.test(t) || t.length >= 5);
  return roleToks.some((t) => q.includes(t)) || TITLE_WORDS.test(q);
}

/** V7: hiring numbers or scale words in the quote; otherwise magnitude is forced to small. */
export function hasScale(quote: string) {
  return /\d/.test(quote) || /\b(hundreds?|thousands?|lakh|lakhs|crore|dozens?)\b/i.test(quote);
}

export function validateExtraction(
  raw: unknown,
  articleText: string,
  publishedAt: Date | null,
  now: Date,
  gateRumour = false,
  freshnessDays?: number,
): { ok: true; event: ValidatedEvent } | { ok: false; reason: ValidatorFailure | "schema" } {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "schema" };
  const x = parsed.data;
  if (x.trigger_type == null) return { ok: false, reason: "no_trigger" };
  if (!TRIGGER_TYPES.includes(x.trigger_type as TriggerType)) return { ok: false, reason: "v2_bad_type" };
  if (!x.company_match) return { ok: false, reason: "v3_company_mismatch" };
  if (!x.evidence_quote || !isVerbatim(x.evidence_quote, articleText)) return { ok: false, reason: "v1_quote_not_verbatim" };
  const summary = (x.one_line_summary ?? "").trim();
  if (!summary || summary.split(/\s+/).length > 20 || BANNED.some((r) => r.test(summary))) return { ok: false, reason: "v4_summary" };
  if (!gateFresh({ url: "", title: "", text: "", published_at: publishedAt }, now, freshnessDays)) return { ok: false, reason: "v5_date" };
  const type = x.trigger_type as TriggerType;
  const quote = trimQuote(x.evidence_quote.replace(/^["'\s]+|["'\s]+$/g, ""));
  if (type === "LEADERSHIP_CHANGE" && !leaderInQuote(x.subject, x.subject_title, x.evidence_quote)) {
    return { ok: false, reason: "v6_leader_not_in_quote" };
  }
  const notes: string[] = [];
  let magnitude = x.magnitude;
  if (type === "HEADCOUNT_HIRING" && !hasScale(x.evidence_quote) && magnitude !== "small") {
    magnitude = "small";
    notes.push("v7: no number in quote, magnitude forced to small");
  }
  const certainty = gateRumour || x.certainty === "rumour" ? "rumour" : "confirmed";
  if (gateRumour && x.certainty !== "rumour") notes.push("g5: rumour language found, certainty set to rumour");
  return {
    ok: true,
    event: {
      type,
      subject: x.subject,
      subject_title: x.subject_title,
      magnitude,
      certainty,
      time_scope: x.time_scope,
      quote,
      summary,
      competitor: x.competitor_hrms_mentioned || null,
      notes,
    },
  };
}

/** ISO week label like 2026-W41. */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}

/** Subject key: the person's surname for leadership changes; otherwise empty, so one event per type per account per week. */
export function subjectKey(type: TriggerType, subject: string | null) {
  if (type !== "LEADERSHIP_CHANGE" || !subject) return "";
  const t = tokens(subject);
  return t[t.length - 1] ?? "";
}

export function eventKey(accountId: string, type: TriggerType, subjectK: string, date: Date) {
  return createHash("sha1").update(`${accountId}|${type}|${subjectK}|${isoWeek(date)}`).digest("hex");
}

export function urlHash(url: string) {
  return createHash("sha1").update(url.trim()).digest("hex");
}
