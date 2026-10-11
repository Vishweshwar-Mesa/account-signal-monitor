import { describe, expect, it } from "vitest";
import { scoreAccount, decay, bandFor, eventPoints, type ScoringEvent, type ScoringAccount } from "@/lib/scoring";

const NOW = new Date("2026-10-12T03:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

// 1,800-person multi-site frontline account in a target sector, no CRM history.
const ACCOUNT: ScoringAccount = {
  employee_count: 1800, sector: "retail", frontline_share: "high", multi_site: true, india_footprint: true,
  is_customer: false, last_contacted_at: null, renewal_date: null,
};
const leadership = (age: number, extra: Partial<ScoringEvent> = {}): ScoringEvent => ({
  type: "LEADERSHIP_CHANGE", event_date: daysAgo(age), magnitude: "medium", certainty: "confirmed",
  time_scope: "new", best_tier: "T2", source_domains: ["economictimes.indiatimes.com"], ...extra,
});

describe("scoring scenarios (section 8)", () => {
  it("fresh confirmed T2 leadership change at a 1,800 person account scores 8 or 9", () => {
    const r = scoreAccount(ACCOUNT, [leadership(0.5)], [], [], NOW);
    expect([8, 9]).toContain(r.score);
    expect(r.band).toBe("hot");
  });

  it("the same event 14 days old falls to 5 or 6", () => {
    const r = scoreAccount(ACCOUNT, [leadership(14)], [], [], NOW);
    expect([5, 6]).toContain(r.score);
    expect(r.band).toBe("warm");
  });

  it("a rumour-only account never exceeds 4", () => {
    const evs = [
      leadership(0, { certainty: "rumour", magnitude: "large" }),
      { ...leadership(0, { certainty: "rumour" }), type: "HR_TECH_INTENT" as const },
    ];
    const r = scoreAccount({ ...ACCOUNT, last_contacted_at: daysAgo(120) }, evs, [], [], NOW);
    expect(r.score).toBeLessThanOrEqual(4);
    expect(r.breakdown.caps.join(" ")).toMatch(/Rumour-only/);
  });

  it("a retrospective hiring mention scores below a fresh one", () => {
    const hire = (scope: "new" | "retrospective"): ScoringEvent => ({
      type: "HEADCOUNT_HIRING", event_date: daysAgo(1), magnitude: "large", certainty: "confirmed",
      time_scope: scope, best_tier: "T2", source_domains: ["livemint.com"],
    });
    const fresh = scoreAccount(ACCOUNT, [hire("new")], [], [], NOW);
    const retro = scoreAccount(ACCOUNT, [hire("retrospective")], [], [], NOW);
    expect(retro.breakdown.raw).toBeLessThan(fresh.breakdown.raw);
    expect(retro.score).toBeLessThan(fresh.score);
  });

  it("hot gate caps at 7 without a fresh confirmed T1/T2 event worth 4+", () => {
    // Strong fit and relationship, but only a weak event: cannot be Hot.
    const weak: ScoringEvent = { type: "COMPLIANCE_PRESSURE", event_date: daysAgo(20), magnitude: "small", certainty: "confirmed", time_scope: "new", best_tier: "T2", source_domains: ["x.com"] };
    const acct = { ...ACCOUNT, is_customer: true, last_contacted_at: daysAgo(200), renewal_date: new Date(NOW.getTime() + 10 * 86_400_000) };
    const tasks = [{ kind: "pilot_checkpoint", due_at: new Date(NOW.getTime() + 3 * 86_400_000), done: false }];
    const acts = [
      { kind: "email", direction: "inbound", occurred_at: daysAgo(2) },
      { kind: "call", direction: "inbound", occurred_at: daysAgo(3) },
      { kind: "meeting", direction: "outbound", occurred_at: new Date(NOW.getTime() + 2 * 86_400_000) },
    ];
    const r = scoreAccount(acct, [weak, { ...weak, type: "DIGITALISATION_STATEMENT" }], tasks, acts, NOW);
    expect(r.score).toBeLessThanOrEqual(7);
  });

  it("CONTEXT-only events are never scored", () => {
    const r = scoreAccount(ACCOUNT, [leadership(0, { best_tier: "CONTEXT" })], [], [], NOW);
    expect(r.breakdown.events).toHaveLength(0);
    expect(r.band).toBe("cold");
  });

  it("corroboration adds 0.1 per extra independent domain, capped at 1.3", () => {
    const one = eventPoints(leadership(0), NOW).points;
    const two = eventPoints(leadership(0, { source_domains: ["a.com", "b.com"] }), NOW).points;
    const many = eventPoints(leadership(0, { source_domains: ["a", "b", "c", "d", "e", "f"] }), NOW).points;
    expect(two / one).toBeCloseTo(1.1);
    expect(many / one).toBeCloseTo(1.3);
  });

  it("an account with no events and no history is cold, gone quiet", () => {
    const r = scoreAccount(ACCOUNT, [], [], [], NOW);
    expect(r.band).toBe("cold");
    expect(r.flags).toContain("gone_quiet");
    expect(r.confidence).toBe("low");
  });
});

describe("decay and bands", () => {
  it("halves at one half-life", () => {
    expect(decay(10, 10)).toBeCloseTo(0.5);
    expect(decay(0, 10)).toBe(1);
  });
  it("band thresholds", () => {
    expect(bandFor(10)).toBe("hot");
    expect(bandFor(8)).toBe("hot");
    expect(bandFor(7)).toBe("warm");
    expect(bandFor(5)).toBe("warm");
    expect(bandFor(4)).toBe("cold");
    expect(bandFor(1)).toBe("cold");
  });
});

describe("lanes (D05)", () => {
  const cust = { ...ACCOUNT, is_customer: true, last_contacted_at: daysAgo(5) };
  it("customer + HR tech intent = churn risk", () => {
    const r = scoreAccount(cust, [{ ...leadership(1), type: "HR_TECH_INTENT" }], [], [], NOW);
    expect(r.lane).toBe("churn_risk");
  });
  it("customer + growth = expansion", () => {
    const r = scoreAccount(cust, [{ ...leadership(1), type: "CAPACITY_EXPANSION" }], [], [], NOW);
    expect(r.lane).toBe("expansion");
  });
  it("customer, no signal, no contact 30+ days = re-engage", () => {
    const r = scoreAccount({ ...cust, last_contacted_at: daysAgo(45) }, [], [], [], NOW);
    expect(r.lane).toBe("re_engage");
    expect(r.flags).toContain("no_contact_30d");
  });
  it("prospect = outreach", () => {
    expect(scoreAccount(ACCOUNT, [leadership(1)], [], [], NOW).lane).toBe("outreach");
  });
});
