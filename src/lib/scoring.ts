import scoring from "../../config/scoring.json";

// D01, D03, D14: code computes every score from events on each run. Gemini never decides a score or band.

export type TriggerType = keyof typeof scoring.events;
export const TRIGGER_TYPES = Object.keys(scoring.events) as TriggerType[];
export type Tier = "T1" | "T2" | "CONTEXT";
export type Band = "hot" | "warm" | "cold";
export type Lane = "outreach" | "churn_risk" | "expansion" | "re_engage";

export interface EventSource {
  url: string;
  publisher: string | null;
  published_at: string | null;
  quote: string | null;
}

export interface ScoringEvent {
  id?: string;
  type: TriggerType;
  event_date: string | Date;
  magnitude: "small" | "medium" | "large";
  certainty: "confirmed" | "rumour";
  time_scope: "new" | "retrospective";
  best_tier: Tier;
  source_domains: string[];
  competitor?: string | null;
  summary?: string | null;
  sources?: EventSource[];
}

export interface ScoringAccount {
  employee_count: number | null;
  sector: string | null;
  frontline_share: string | null;
  multi_site: boolean | null;
  india_footprint: boolean | null;
  is_customer: boolean;
  last_contacted_at: string | Date | null;
  renewal_date: string | Date | null;
}

export interface ScoringTask {
  kind: string;
  due_at: string | Date | null;
  done: boolean;
}
export interface ScoringActivity {
  kind: string;
  direction: string;
  occurred_at: string | Date;
}

export interface Contribution {
  label: string;
  points: number;
}

export interface EventBreakdown {
  type: TriggerType;
  label: string;
  summary: string | null;
  points: number;
  ageDays: number;
  tier: Tier;
  certainty: string;
  factors: Contribution[];
  sources: EventSource[];
}

export interface ScoreBreakdown {
  raw: number;
  score: number;
  band: Band;
  contributions: Contribution[];
  caps: string[];
  thresholds: string;
  toNextBand: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  events: EventBreakdown[];
  verify: string[];
  computedAt: string;
}

export interface ScoreResult {
  score: number;
  band: Band;
  confidence: "high" | "medium" | "low";
  lane: Lane | null;
  flags: string[];
  topEvent: EventBreakdown | null;
  breakdown: ScoreBreakdown;
}

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (d: string | Date) => (d instanceof Date ? d : new Date(d));
const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;

export function decay(ageDays: number, halfLifeDays: number) {
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

export function eventPoints(ev: ScoringEvent, now: Date) {
  const cfg = scoring.events[ev.type];
  const ageDays = Math.max(0, daysBetween(now, toDate(ev.event_date)));
  if (ev.best_tier === "CONTEXT") return { points: 0, ageDays, factors: [{ label: "Context-only source, not scored", points: 0 }] };
  const mag = scoring.magnitude[ev.magnitude];
  const tier = scoring.tier[ev.best_tier];
  const cert = scoring.certainty[ev.certainty];
  const domains = new Set(ev.source_domains).size;
  const corr = Math.min(scoring.corroborationCap, 1 + scoring.corroborationPerExtraDomain * Math.max(0, domains - 1));
  const scope = ev.type === "HEADCOUNT_HIRING" && ev.time_scope === "retrospective" ? scoring.retrospectiveHiringMultiplier : 1;
  const dec = decay(ageDays, cfg.halfLifeDays);
  const points = cfg.base * mag * tier * cert * corr * scope * dec;
  const factors: Contribution[] = [
    { label: `Base weight (${cfg.label})`, points: cfg.base },
    { label: `Magnitude ${ev.magnitude} x${mag}`, points: mag },
    { label: `Source ${ev.best_tier} x${tier}`, points: tier },
    { label: `Certainty ${ev.certainty} x${cert}`, points: cert },
    { label: `Corroboration ${domains} domain(s) x${r2(corr)}`, points: r2(corr) },
    ...(scope !== 1 ? [{ label: `Retrospective hiring x${scope}`, points: scope }] : []),
    { label: `Decay ${Math.round(ageDays)}d old, half-life ${cfg.halfLifeDays}d x${r2(dec)}`, points: r2(dec) },
  ];
  return { points, ageDays, factors };
}

export function fitPoints(a: ScoringAccount): { points: number; parts: Contribution[] } {
  const f = scoring.fit;
  const parts: Contribution[] = [];
  let size = 0;
  const n = a.employee_count;
  if (n == null) parts.push({ label: "Size unknown", points: 0 });
  else {
    if (n < f.sizeBandMin) size = f.belowBand;
    else if (n <= f.sizeBandMax) size = f.inBand;
    else {
      const t = Math.min(1, (n - f.sizeBandMax) / (f.taperToEmployees - f.sizeBandMax));
      size = f.inBand - t * (f.inBand - f.aboveBandFloor);
    }
    parts.push({ label: `Size ${n.toLocaleString("en-IN")} employees`, points: r2(size) });
  }
  let attrs = 0;
  if (a.frontline_share === "high") { attrs += f.perAttribute; parts.push({ label: "High frontline share", points: f.perAttribute }); }
  if (a.multi_site) { attrs += f.perAttribute; parts.push({ label: "Multi-site", points: f.perAttribute }); }
  if (a.india_footprint) { attrs += f.perAttribute; parts.push({ label: "India footprint", points: f.perAttribute }); }
  if (a.sector && f.targetSectors.includes(a.sector)) { attrs += f.perAttribute; parts.push({ label: "Target sector", points: f.perAttribute }); }
  return { points: Math.min(f.cap, size + attrs), parts };
}

export function relationshipPoints(a: ScoringAccount, now: Date): { points: number; label: string } {
  const c = scoring.relationship;
  let pts = 0;
  const labels: string[] = [];
  if (a.last_contacted_at) {
    const gap = daysBetween(now, toDate(a.last_contacted_at));
    if (gap <= c.recentContactDays) { pts += c.recentContactPoints; labels.push(`contacted ${Math.round(gap)}d ago, do not pile on`); }
    else if (gap >= c.longGapDays) { pts += c.longGapPoints; labels.push(`no contact for ${Math.round(gap)}d`); }
    else if (gap >= c.midGapDays) { pts += c.midGapPoints; labels.push(`no contact for ${Math.round(gap)}d`); }
  } else labels.push("no contact logged");
  if (a.renewal_date) {
    const until = daysBetween(toDate(a.renewal_date), now);
    if (until >= 0 && until <= c.renewalWithinDays) { pts += c.renewalPoints; labels.push(`renewal in ${Math.round(until)}d`); }
  }
  return { points: Math.max(c.min, Math.min(c.max, pts)), label: `Relationship: ${labels.join(", ") || "neutral"}` };
}

export function activityPoints(tasks: ScoringTask[], acts: ScoringActivity[], now: Date) {
  const c = scoring.activity;
  let pts = 0;
  const labels: string[] = [];
  const overdue = tasks.filter((t) => !t.done && t.due_at && toDate(t.due_at) < now).length;
  if (tasks.some((t) => !t.done && t.kind === "pilot_checkpoint" && t.due_at && daysBetween(toDate(t.due_at), now) >= 0 && daysBetween(toDate(t.due_at), now) <= c.pilotCheckpointDays)) {
    pts += c.pilotCheckpointPoints; labels.push("pilot checkpoint within 14d");
  }
  if (acts.some((a) => a.kind === "meeting" && daysBetween(toDate(a.occurred_at), now) >= 0 && daysBetween(toDate(a.occurred_at), now) <= c.meetingWithinDays)) {
    pts += c.meetingPoints; labels.push("meeting within 7d");
  }
  const inbound = acts.filter((a) => a.direction === "inbound" && daysBetween(now, toDate(a.occurred_at)) >= 0 && daysBetween(now, toDate(a.occurred_at)) <= c.inboundWindowDays).length;
  if (inbound) { pts += inbound * c.inboundPoints; labels.push(`${inbound} inbound in 14d`); }
  if (overdue) labels.push(`${overdue} overdue task(s), display only`);
  return { points: Math.min(c.cap, pts), label: `Activity: ${labels.join(", ") || "none"}`, overdue };
}

const GROWTH: TriggerType[] = ["HEADCOUNT_HIRING", "CAPACITY_EXPANSION", "FUNDING_EVENT", "DIGITALISATION_STATEMENT", "COMPLIANCE_PRESSURE"];
const RISK: TriggerType[] = ["HR_TECH_INTENT", "OPERATIONAL_CHALLENGE", "LEADERSHIP_CHANGE"];
// A new vendor partner is growth for a prospect, but a churn risk at a customer when the vendor is an HR or payroll provider.

export function bandFor(score: number): Band {
  if (score >= scoring.bands.hot) return "hot";
  if (score >= scoring.bands.warm) return "warm";
  return "cold";
}

export function scoreAccount(
  account: ScoringAccount,
  events: ScoringEvent[],
  tasks: ScoringTask[],
  activities: ScoringActivity[],
  now: Date = new Date(),
): ScoreResult {
  const scored: EventBreakdown[] = events
    .filter((e) => e.best_tier !== "CONTEXT")
    .map((e) => {
      const { points, ageDays, factors } = eventPoints(e, now);
      return {
        type: e.type,
        label: scoring.events[e.type].label,
        summary: e.summary ?? null,
        points,
        ageDays,
        tier: e.best_tier,
        certainty: e.certainty,
        factors,
        sources: e.sources ?? [],
        _ev: e,
      } as EventBreakdown & { _ev: ScoringEvent };
    })
    .sort((a, b) => b.points - a.points);

  const contributions: Contribution[] = [];
  const best = scored[0];
  const second = best ? scored.find((e) => e.type !== best.type) : undefined;
  let raw = 0;
  if (best) { raw += best.points; contributions.push({ label: `Top event: ${best.label}`, points: r2(best.points) }); }
  if (second) {
    const p = scoring.secondEventWeight * second.points;
    raw += p; contributions.push({ label: `Second event: ${second.label} x0.5`, points: r2(p) });
  }
  const fit = fitPoints(account);
  raw += fit.points;
  contributions.push({ label: `Fit (${fit.parts.map((p) => p.label).join(", ")})`, points: r2(fit.points) });
  const rel = relationshipPoints(account, now);
  raw += rel.points;
  contributions.push({ label: rel.label, points: r2(rel.points) });
  const act = activityPoints(tasks, activities, now);
  raw += act.points;
  contributions.push({ label: act.label, points: r2(act.points) });

  const strongTypes = new Set(scored.filter((e) => e.points >= scoring.convergence.minPointsEach).map((e) => e.type));
  if (strongTypes.size >= 2) { raw += scoring.convergence.bonus; contributions.push({ label: `Convergence: ${strongTypes.size} trigger types`, points: scoring.convergence.bonus }); }
  const competitor = scored.find((e) => (e as unknown as { _ev: ScoringEvent })._ev.competitor && e.points > 0);
  if (competitor) {
    raw += scoring.competitorBoost;
    contributions.push({ label: `Competitor HRMS mentioned (${(competitor as unknown as { _ev: ScoringEvent })._ev.competitor})`, points: scoring.competitorBoost });
  }

  let score = Math.max(1, Math.min(10, Math.round(raw)));
  const caps: string[] = [];
  const gate = scored.some(
    (e) => e.certainty === "confirmed" && (e.tier === "T1" || e.tier === "T2") && e.ageDays <= scoring.hotGate.maxAgeDays && e.points >= scoring.hotGate.minPoints,
  );
  if (!gate && score > scoring.warmCapWithoutGate) {
    score = scoring.warmCapWithoutGate;
    caps.push("Hot gate not met: needs a confirmed T1 or T2 event within 14 days worth 4+ points. Capped at 7.");
  }
  const rumourOnly = scored.length > 0 && scored.every((e) => e.certainty === "rumour");
  if (rumourOnly && score > scoring.rumourOnlyCap) {
    score = scoring.rumourOnlyCap;
    caps.push("Rumour-only evidence. Capped at 4.");
  }
  const band = bandFor(score);

  // Confidence comes from the top event's sourcing.
  let confidence: "high" | "medium" | "low" = "low";
  let confidenceReason = "No scored events.";
  if (best) {
    const ev = (best as unknown as { _ev: ScoringEvent })._ev;
    const domains = new Set(ev.source_domains).size;
    if (ev.certainty === "rumour") { confidence = "low"; confidenceReason = "Top event is reported as rumour."; }
    else if (ev.best_tier === "T1" || domains >= 2) { confidence = "high"; confidenceReason = ev.best_tier === "T1" ? "Primary source (company, filing or exchange)." : `${domains} independent outlets.`; }
    else { confidence = "medium"; confidenceReason = "Single established outlet, confirmed."; }
  }

  // Lane (D05)
  const lastContactGap = account.last_contacted_at ? daysBetween(now, toDate(account.last_contacted_at)) : Infinity;
  const live = scored.filter((e) => e.points >= 1);
  let lane: Lane | null = "outreach";
  if (account.is_customer) {
    const vendorRisk = live.some((e) => e.type === "VENDOR_PARTNERSHIP" && (e as unknown as { _ev: ScoringEvent })._ev.competitor);
    if (vendorRisk || live.some((e) => RISK.includes(e.type))) lane = "churn_risk";
    else if (live.some((e) => e.type === "VENDOR_PARTNERSHIP")) lane = "expansion";
    else if (live.some((e) => GROWTH.includes(e.type))) lane = "expansion";
    else if (lastContactGap >= scoring.reEngageDays) lane = "re_engage";
    else lane = null;
  }

  const flags: string[] = [];
  const lastEventAge = scored.length ? Math.min(...scored.map((e) => e.ageDays)) : Infinity;
  if (lastEventAge > scoring.goneQuietDays) flags.push("gone_quiet");
  if (lastContactGap >= scoring.reEngageDays && lastContactGap !== Infinity) flags.push("no_contact_30d");

  const nextAt = band === "cold" ? 4.5 : band === "warm" ? 7.5 : null;
  let toNextBand = "Already Hot.";
  if (nextAt != null) {
    const gap = Math.max(0, nextAt - raw);
    toNextBand = `${r2(gap)} points to ${band === "cold" ? "Warm" : "Hot"}.`;
    if (band === "warm" && !gate) toNextBand += " Hot also needs a fresh confirmed T1 or T2 event worth 4+ points.";
  }

  const verify = [
    "Open each source link and check the quote appears on the publisher page.",
    "Check the article date is within the last 14 days.",
    "Check the article is about this company, not a similar name.",
    ...(account.employee_count != null ? ["Headcount comes from the cited source and date shown in the header."] : []),
  ];

  const cleanEvents = scored.map(({ ...e }) => {
    delete (e as { _ev?: unknown })._ev;
    return { ...e, points: r2(e.points), ageDays: r2(e.ageDays) };
  });

  return {
    score,
    band,
    confidence,
    lane,
    flags,
    topEvent: cleanEvents[0] ?? null,
    breakdown: {
      raw: r2(raw),
      score,
      band,
      contributions,
      caps,
      thresholds: "Hot 8 to 10, Warm 5 to 7, Cold 1 to 4. Final score is the rounded raw total, clamped to 1 to 10.",
      toNextBand,
      confidence,
      confidenceReason,
      events: cleanEvents,
      verify,
      computedAt: now.toISOString(),
    },
  };
}
