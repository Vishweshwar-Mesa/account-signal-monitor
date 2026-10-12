import type { ReactNode } from "react";

export type Band = "hot" | "warm" | "cold";
export const BAND_LABEL: Record<Band, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };
const BAND_BG: Record<Band, string> = { hot: "bg-hot", warm: "bg-warm", cold: "bg-cold" };
const BAND_TEXT: Record<Band, string> = { hot: "text-hot", warm: "text-warm", cold: "text-cold" };
export const bandText = (b: Band | null) => (b ? BAND_TEXT[b] : "text-muted");
export const LANE_LABEL: Record<string, string> = {
  outreach: "Outreach opportunity", churn_risk: "Churn risk, retention play", expansion: "Expansion opportunity", re_engage: "Re-engage, no contact for 30+ days",
};

export function ScoreBadge({ score, band, size = "sm" }: { score: number | null; band: Band | null; size?: "sm" | "lg" }) {
  const dims = size === "lg" ? "w-16 h-16 text-3xl rounded-[14px]" : "w-10 h-10 text-lg rounded-[8px]";
  return (
    <span className={`${dims} ${band ? BAND_BG[band] : "bg-cold"} text-on-band font-display font-bold inline-flex items-center justify-center shrink-0`}
      aria-label={`Score ${score ?? "not scored"} out of 10`}>
      {score ?? "-"}
    </span>
  );
}

export function Tag({ children, tone = "plain", title }: { children: ReactNode; tone?: "plain" | "demo" | "primary"; title?: string }) {
  const cls = tone === "demo" ? "bg-demo-bg text-demo-text" : tone === "primary" ? "bg-tint text-link" : "bg-surface2 text-muted border border-border";
  return <span title={title} className={`${cls} text-[11px] font-bold tracking-wide uppercase rounded-[6px] px-1.5 py-0.5 whitespace-nowrap`}>{children}</span>;
}

export function DemoBadge({ label = "DEMO" }: { label?: string }) {
  return <Tag tone="demo" title="Demo data for the exam build. Not real CRM data.">{label}</Tag>;
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-display font-semibold text-base">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted text-sm border border-dashed border-border rounded-[10px] p-3">{children}</p>;
}

/** Keka segment tag: SMB under 100 employees, MM 100 to 500, ENT 500+. Arjun's team owns ENT. */
export function SegmentTag({ employees }: { employees: number | null }) {
  if (employees == null) return <Tag title="Headcount not cited, segment unknown">Size ?</Tag>;
  if (employees < 100) return <Tag title="SMB (under 100 employees): route to the SMB team">SMB</Tag>;
  if (employees < 500) return <Tag title="Mid-market (100 to 500 employees): route to the mid-market team">MM</Tag>;
  return <Tag tone="primary" title="Enterprise (500+ employees): the enterprise team's segment">ENT</Tag>;
}
