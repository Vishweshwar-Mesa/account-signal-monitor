"use client";
import { useRef, useState } from "react";
import { gsap, useGSAP, motionOK } from "@/lib/motion";

type Point = { day: string; score: number; projected: boolean };
const W = 560, H = 150, L = 28, R = 12, T = 10, B = 24;

/** Single-series line: computed score by day. Solid = past and today, dashed = projection. One y-axis (1 to 10). */
export default function ScoreTrend({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // The computed line draws left to right, then the projection fades in.
  useGSAP(() => {
    motionOK(() => {
      const line = svg.current?.querySelector<SVGPathElement>(".trend-past");
      if (!line) return;
      const len = line.getTotalLength();
      gsap.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" });
      gsap.from(".trend-future, .trend-today", { opacity: 0, duration: 0.4, delay: 0.75 });
    });
  }, { scope: svg, dependencies: [points] });
  if (!points.length) return null;
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (s: number) => T + ((10 - s) * (H - T - B)) / 9;
  const todayIdx = points.findIndex((p) => p.projected) - 1;
  const path = (pts: { p: Point; i: number }[]) => pts.map(({ p, i }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const indexed = points.map((p, i) => ({ p, i }));
  const past = indexed.filter(({ i }) => i <= todayIdx);
  const future = indexed.filter(({ i }) => i >= todayIdx);
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const h = hover != null ? points[hover] : null;
  return (
    <figure className="m-0">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Score by day, ${fmt(points[0].day)} to ${fmt(points[points.length - 1].day)}. Today ${points[todayIdx].score}.`}
        onMouseLeave={() => setHover(null)}>
        {[1, 5, 8, 10].map((s) => (
          <g key={s}>
            <line x1={L} x2={W - R} y1={y(s)} y2={y(s)} stroke="var(--border)" strokeWidth={1} strokeDasharray={s === 5 || s === 8 ? "3 3" : undefined} />
            <text x={L - 6} y={y(s) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{s}</text>
          </g>
        ))}
        <text x={W - R} y={y(8) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">Hot from 8</text>
        <text x={W - R} y={y(5) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">Warm from 5</text>
        <line x1={x(todayIdx)} x2={x(todayIdx)} y1={T} y2={H - B} stroke="var(--border)" />
        <text x={x(todayIdx)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">today</text>
        <text x={L} y={H - 8} fontSize="10" fill="var(--muted)">{fmt(points[0].day)}</text>
        <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(points[points.length - 1].day)}</text>
        <path className="trend-past" d={path(past)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path className="trend-future" d={path(future)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        <circle className="trend-today" cx={x(todayIdx)} cy={y(points[todayIdx].score)} r={5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(points[hover].score)} r={4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {points.map((p, i) => (
          <rect key={p.day} x={x(i) - (W - L - R) / (points.length - 1) / 2} y={T} width={(W - L - R) / (points.length - 1)} height={H - T - B}
            fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
            <title>{`${fmt(p.day)}: ${p.score}${p.projected ? " (projected)" : ""}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="text-xs text-muted mt-1" aria-live="polite">
        {h ? `${fmt(h.day)}: score ${h.score}${h.projected ? " (projected if nothing new happens)" : ""}` : "Solid: computed from verified events. Dashed: projection with no new events."}
      </figcaption>
    </figure>
  );
}
