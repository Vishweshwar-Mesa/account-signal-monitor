"use client";
import { useMemo, useState } from "react";
import type { DashboardData, DAccount } from "@/lib/dashboard-data";
import { ScoreBadge, Tag, BAND_LABEL, bandText, type Band } from "./ui";
import Detail from "./Detail";

type Filter = "signals" | "all" | "hot" | "warm" | "customers";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "signals", label: "With signals" }, { key: "hot", label: "Hot" }, { key: "warm", label: "Warm" }, { key: "customers", label: "Customers" }, { key: "all", label: "All" },
];

function StatCard({ label, range, count, sub, color }: { label: string; range: string; count: number; sub: string; color: string }) {
  return (
    <div className="card p-4 border-t-4" style={{ borderTopColor: `var(${color})` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-muted">{range}</span>
      </div>
      <div className="font-display font-bold text-3xl mt-1">{count}</div>
      <div className="text-sm text-muted mt-1">{sub}</div>
    </div>
  );
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const { accounts } = data;
  const [filter, setFilter] = useState<Filter>("signals");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(accounts[0]?.id ?? null);

  const counts = useMemo(() => {
    const c = { hot: 0, warm: 0, cold: 0, churn: 0, expansion: 0, customers: 0, reengage: 0 };
    for (const a of accounts) {
      if (a.band) c[a.band]++;
      if (a.is_customer) c.customers++;
      if (a.lane === "churn_risk") c.churn++;
      if (a.lane === "expansion") c.expansion++;
      if (a.lane === "re_engage") c.reengage++;
    }
    return c;
  }, [accounts]);

  const q = query.trim().toLowerCase();
  const list = accounts.filter((a) =>
    (q ? a.name.toLowerCase().includes(q) : true) &&
    (filter === "all" ? true
      : filter === "signals" ? a.signals.length > 0 || a.band === "hot" || a.band === "warm"
      : filter === "customers" ? a.is_customer : a.band === filter),
  );
  const selected = accounts.find((a) => a.id === selectedId) ?? list[0] ?? null;

  function select(a: DAccount) {
    setSelectedId(a.id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Hot" range="8 to 10" count={counts.hot} color="--hot" sub={counts.hot ? "Fresh verified trigger, reach out" : "No account is hot right now"} />
        <StatCard label="Warm" range="5 to 7" count={counts.warm} color="--warm" sub="Worth a light touch this week" />
        <StatCard label="Cold" range="1 to 4" count={counts.cold} color="--cold" sub="Quiet or no verified trigger" />
        <StatCard label="Customer health" range={`${counts.customers} customers`} count={counts.churn + counts.expansion} color="--primary"
          sub={`${counts.churn} churn risk · ${counts.expansion} expansion${counts.reengage ? ` · ${counts.reengage} re-engage` : ""}`} />
      </div>

      <div className="mt-4 flex flex-col lg:flex-row gap-4 items-start">
        <div className="card w-full lg:max-w-[480px] lg:w-[38%] shrink-0 overflow-hidden flex flex-col max-h-[60dvh] lg:max-h-[calc(100dvh-2rem)] lg:sticky lg:top-4">
          <div className="p-3 pb-0">
            <label htmlFor="account-search" className="sr-only">Search accounts</label>
            <input id="account-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts"
              className="w-full min-h-[44px] px-3 rounded-[8px] border border-border bg-surface text-text" />
          </div>
          <div className="p-3 flex gap-2 flex-wrap border-b border-border" role="group" aria-label="Filter accounts">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border ${filter === f.key ? "bg-primary text-on-primary border-primary" : "bg-surface border-border text-text hover:bg-surface2"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="px-3 py-1.5 text-xs text-muted border-b border-border">Showing {list.length} of {accounts.length} accounts</p>
          {list.length === 0 ? (
            <p className="p-4 text-muted text-sm">No accounts in this view.</p>
          ) : (
            <ul className="sm-scroll divide-y divide-border overflow-y-scroll overscroll-contain flex-1 min-h-0" aria-label="Accounts">
              {list.map((a) => {
                const sel = selected?.id === a.id;
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => select(a)} aria-current={sel ? "true" : undefined}
                      className={`w-full text-left flex items-center gap-3 p-3 min-h-[64px] border-l-[3px] ${sel ? "bg-tint border-primary" : "border-transparent hover:bg-surface2"}`}>
                      <ScoreBadge score={a.score} band={a.band} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{a.name}</span>
                          {a.is_customer && <Tag tone="primary">Customer</Tag>}
                          {a.flags.includes("gone_quiet") && <Tag>Gone quiet</Tag>}
                          {a.flags.includes("above_icp_size") && <Tag title="Over 5,000 employees: outside Keka's core mid-market ICP">Above ICP size</Tag>}
                        </span>
                        <span className="block text-sm text-muted truncate">{a.top_signal_summary ?? "No verified signal in the window"}</span>
                      </span>
                      <span className={`text-sm font-semibold ${bandText(a.band)}`}>{a.band ? BAND_LABEL[a.band as Band] : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div id="detail" className="w-full min-w-0 flex-1 scroll-mt-4">
          {selected ? <Detail key={selected.id} a={selected} data={data} /> : <div className="card p-6 text-muted">Select an account.</div>}
        </div>
      </div>
    </>
  );
}
