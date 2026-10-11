import { describe, expect, it } from "vitest";
import { runGates, gateEntity, gateContentType, tierFor, gateCertainty, normalise } from "@/lib/pipeline/gates";
import { validateExtraction, isVerbatim, eventKey, subjectKey, isoWeek, trimQuote, hasScale } from "@/lib/pipeline/validators";

const NOW = new Date("2026-10-12T03:00:00Z");
const ACC = { name: "Travel Food Services", aliases: ["TFS", "Travel Food"], domain: "travelfoodservices.com" };
const TEXT = "Travel Food Services on Monday appointed Priya Sharma as Chief Human Resources Officer, the company said in a statement. "
  + "She will lead HR for over 4,000 employees across airport outlets. ".repeat(3);
const cand = (o: Partial<{ url: string; title: string; text: string; published_at: Date | null }> = {}) => ({
  url: "https://hr.economictimes.indiatimes.com/news/x/123", title: "Travel Food Services names new CHRO", text: TEXT,
  published_at: new Date("2026-10-10T05:00:00Z"), ...o,
});
const good = {
  trigger_type: "LEADERSHIP_CHANGE", company_match: true, subject: "Priya Sharma", subject_title: "Chief Human Resources Officer",
  magnitude: "medium", certainty: "confirmed", time_scope: "new",
  evidence_quote: "appointed Priya Sharma as Chief Human Resources Officer", one_line_summary: "Travel Food Services appointed a new CHRO.",
  competitor_hrms_mentioned: null,
};

describe("gates G1 to G6", () => {
  it("passes a fresh T2 article about the company", () => {
    const r = runGates(ACC, cand(), NOW);
    expect(r.result).toBe("pass");
    expect(r.tier).toBe("T2");
    expect(r.publisher).toBe("ETHRWorld");
  });
  it("G1 rejects a different company with a similar name and short aliases", () => {
    expect(gateEntity(ACC, cand({ title: "Travel Foods Ltd posts results", text: "x".repeat(300) }))).toBe(false);
    expect(gateEntity(ACC, cand({ title: "TFS wins award", text: "y".repeat(300) }))).toBe(false); // alias under 4 chars ignored
  });
  it("G2 rejects stale and undated items", () => {
    expect(runGates(ACC, cand({ published_at: new Date("2026-09-01") }), NOW).result).toBe("g2_stale");
    expect(runGates(ACC, cand({ published_at: null }), NOW).result).toBe("g2_stale");
  });
  it("G3 rejects job ads, listicles, stock tips, opinion and sponsored posts", () => {
    expect(gateContentType(cand({ url: "https://www.naukri.com/job-listings-x" }))).toBe(false);
    expect(gateContentType(cand({ title: "Top 10 stocks to buy this week" }))).toBe(false);
    expect(gateContentType(cand({ title: "Travel Food Services target price raised by analysts" }))).toBe(false);
    expect(gateContentType(cand({ url: "https://economictimes.indiatimes.com/opinion/x" }))).toBe(false);
    expect(gateContentType(cand({ url: "https://economictimes.indiatimes.com/brand-connect/x" }))).toBe(false);
    expect(gateContentType(cand({ title: "Travel Food Services shares surge 5%" }))).toBe(false);
    // real headlines from the seed run that reached Gemini needlessly
    expect(gateContentType(cand({ title: "Suzlon, NCC, Kaynes Technology: Price targets for multibaggers" }))).toBe(false);
    expect(gateContentType(cand({ title: "6 'Buy' recommendations by Nuvama, with 17% to 51% upside potential" }))).toBe(false);
    expect(gateContentType(cand({ title: "Top stocks in focus today: Investors must watch Trent" }))).toBe(false);
    expect(gateContentType(cand({ title: "Travel Food Services appoints new CHRO" }))).toBe(true);
  });
  it("G4 tiers: company site T1, exchange T1, press T2, other CONTEXT", () => {
    expect(tierFor("https://www.travelfoodservices.com/news/a", ACC.domain).tier).toBe("T1");
    expect(tierFor("https://www.bseindia.com/x.pdf", null).tier).toBe("T1");
    expect(tierFor("https://www.livemint.com/x", null)).toEqual({ tier: "T2", publisher: "Mint" });
    expect(tierFor("https://randomblog.example/x", null).tier).toBe("CONTEXT");
    expect(runGates(ACC, cand({ url: "https://randomblog.example/x" }), NOW).result).toBe("g4_context");
  });
  it("G5 drops speculation, marks rumour", () => {
    expect(gateCertainty(cand({ title: "Travel Food Services may consider HRMS switch" })).pass).toBe(false);
    const r = gateCertainty(cand({ text: "Travel Food Services is in talks to acquire a chain, sources said. " + TEXT }));
    expect(r).toEqual({ pass: true, rumour: true });
  });
  it("G6 needs article text", () => {
    expect(runGates(ACC, cand({ text: "Travel Food Services short" }), NOW).result).toBe("g6_no_text");
  });
});

describe("validators V1 to V7", () => {
  const pub = new Date("2026-10-10T05:00:00Z");
  it("accepts a valid extraction", () => {
    const r = validateExtraction(good, TEXT, pub, NOW);
    expect(r.ok).toBe(true);
  });
  it("V1 rejects a quote that is not verbatim, tolerates case and whitespace", () => {
    expect(isVerbatim("APPOINTED   priya sharma", TEXT)).toBe(true);
    expect(isVerbatim("“appointed Priya Sharma”", TEXT)).toBe(true);
    const r = validateExtraction({ ...good, evidence_quote: "appointed Priya Sharma as CEO" }, TEXT, pub, NOW);
    expect(r).toEqual({ ok: false, reason: "v1_quote_not_verbatim" });
  });
  it("V2 rejects types outside the enum; null is 'no trigger'", () => {
    expect(validateExtraction({ ...good, trigger_type: "MERGER" }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "v2_bad_type" });
    expect(validateExtraction({ ...good, trigger_type: null }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "no_trigger" });
  });
  it("V3 rejects company mismatch", () => {
    expect(validateExtraction({ ...good, company_match: false }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "v3_company_mismatch" });
  });
  it("V4 rejects long summaries and banned words such as em dashes", () => {
    expect(validateExtraction({ ...good, one_line_summary: "New CHRO — big news" }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "v4_summary" });
    expect(validateExtraction({ ...good, one_line_summary: "word ".repeat(21) }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "v4_summary" });
  });
  it("V5 rejects dates outside the window", () => {
    expect(validateExtraction(good, TEXT, new Date("2026-08-01"), NOW)).toEqual({ ok: false, reason: "v5_date" });
  });
  it("V6 leadership: person and title must be in the quote", () => {
    const r = validateExtraction({ ...good, evidence_quote: "the company said in a statement" }, TEXT, pub, NOW);
    expect(r).toEqual({ ok: false, reason: "v6_leader_not_in_quote" });
  });
  it("V7 hiring without a number is forced to small", () => {
    const text = "Travel Food Services said it will expand hiring at new airport outlets this festive season. " + TEXT;
    const r = validateExtraction({ ...good, trigger_type: "HEADCOUNT_HIRING", magnitude: "large", evidence_quote: "will expand hiring at new airport outlets" }, text, pub, NOW);
    expect(r.ok && r.event.magnitude).toBe("small");
    expect(hasScale("hire 2,000 people")).toBe(true);
  });
  it("gate rumour forces certainty rumour", () => {
    const r = validateExtraction(good, TEXT, pub, NOW, true);
    expect(r.ok && r.event.certainty).toBe("rumour");
  });
  it("rejects malformed JSON shape", () => {
    expect(validateExtraction({ foo: 1 }, TEXT, pub, NOW)).toEqual({ ok: false, reason: "schema" });
  });
  it("trims quotes to 25 words", () => {
    expect(trimQuote("a ".repeat(40)).split(" ").length).toBe(25);
  });
});

describe("clustering keys", () => {
  it("same event from two outlets in the same week gets one key", () => {
    const k1 = eventKey("acc1", "LEADERSHIP_CHANGE", subjectKey("LEADERSHIP_CHANGE", "Priya Sharma"), new Date("2026-10-06"));
    const k2 = eventKey("acc1", "LEADERSHIP_CHANGE", subjectKey("LEADERSHIP_CHANGE", "Ms. Priya Sharma"), new Date("2026-10-09"));
    expect(k1).toBe(k2);
  });
  it("different person or week gives a new key", () => {
    const base = eventKey("acc1", "LEADERSHIP_CHANGE", "sharma", new Date("2026-10-06"));
    expect(eventKey("acc1", "LEADERSHIP_CHANGE", "rao", new Date("2026-10-06"))).not.toBe(base);
    expect(eventKey("acc1", "LEADERSHIP_CHANGE", "sharma", new Date("2026-10-13"))).not.toBe(base);
  });
  it("iso week", () => {
    expect(isoWeek(new Date("2026-10-12"))).toBe("2026-W42");
    expect(normalise("A  B")).toBe("a b");
  });
});
