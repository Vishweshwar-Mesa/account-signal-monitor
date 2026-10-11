// TEST FIXTURES ONLY. Synthetic articles used to exercise the pipeline in tests. Never loaded by the product.
import type { IngestDeps } from "@/lib/pipeline/ingest";
import type { Extraction } from "@/lib/pipeline/validators";

export const NOW = new Date("2026-10-12T03:00:00Z"); // Monday 08:30 IST

export const FIXTURE_TEXT =
  "Mumbai: Test Retail Co on Friday appointed Asha Rao as Chief Human Resources Officer, the company said in an exchange filing. " +
  "Rao will lead people functions for the company's 1,800 employees across 120 stores in India. ".repeat(3);

export const fixtureArticles = [
  { link: "https://hr.economictimes.indiatimes.com/news/test-retail-co-names-asha-rao-chro/1", title: "Test Retail Co names Asha Rao CHRO" },
  { link: "https://www.livemint.com/companies/test-retail-co-appoints-asha-rao-chro-2.html", title: "Test Retail Co appoints Asha Rao as CHRO" },
  { link: "https://www.naukri.com/job-listings-hr-manager-test-retail-co", title: "HR Manager job at Test Retail Co, apply now" },
  { link: "https://randomblog.example/test-retail-co-gossip", title: "Test Retail Co gossip roundup" },
];

export const goodExtraction: Extraction = {
  trigger_type: "LEADERSHIP_CHANGE",
  company_match: true,
  subject: "Asha Rao",
  subject_title: "Chief Human Resources Officer",
  magnitude: "medium",
  certainty: "confirmed",
  time_scope: "new",
  evidence_quote: "appointed Asha Rao as Chief Human Resources Officer",
  one_line_summary: "Test Retail Co appointed Asha Rao as its new CHRO.",
  competitor_hrms_mentioned: null,
};

export function fixtureDeps(overrides: Partial<IngestDeps> = {}): IngestDeps & { calls: number } {
  const state = { calls: 0 };
  const deps = {
    discover: async () => fixtureArticles.map((a) => ({ title: a.title, link: a.link, published_at: new Date("2026-10-10T05:00:00Z"), source_name: null, source_url: null })),
    resolve: async (l: string) => l,
    fetchArticle: async (url: string) => ({ url, title: fixtureArticles.find((a) => a.link === url)?.title ?? "", text: FIXTURE_TEXT, published_at: new Date("2026-10-10T05:00:00Z") }),
    extract: async () => {
      state.calls++;
      return goodExtraction;
    },
    geminiCalls: () => state.calls,
    ...overrides,
  };
  return Object.assign(deps, { get calls() { return state.calls; } });
}

export const fakeMailer = () => {
  const sent: { to: string; subject: string; html: string }[] = [];
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }); return { id: "test" }; } };
};

export const fakeText = async (p: string) =>
  p.includes("first-touch")
    ? "I read in ETHRWorld that Asha Rao has joined Test Retail Co as Chief Human Resources Officer. Leading people work across 120 stores is a broad remit, and the first months often shape how teams experience HR for years. I have been following how retail groups balance store autonomy with shared HR standards. What are you hoping to learn first as you meet store teams across the country?"
    : "Lead with the new CHRO's first 90 days.";
