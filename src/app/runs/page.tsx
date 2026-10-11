import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { health } from "@/lib/health";
import Header from "@/components/Header";
import Banners from "@/components/Banners";
import { fmtIstTime } from "@/lib/time";
import RunNow from "./RunNow";

export const dynamic = "force-dynamic";

interface RunRow { id: string; job: string; started_at: string; finished_at: string | null; status: string; counts: Record<string, unknown>; error: string | null }
const kv = (o: unknown) => Object.entries((o as Record<string, number>) ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ") || "none";

export default async function Runs() {
  const user = await getUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const runs = (await db.query<RunRow>("select * from runs order by started_at desc limit 40")).rows;
  const sends = (await db.query<{ kind: string; send_key: string; sent_at: string; status: string; recipient: string }>(
    "select kind, send_key, sent_at, status, recipient from sends order by sent_at desc limit 10")).rows;
  const h = await health();
  const cfg = { company: process.env.COMPANY_NAME || "Keka", team: process.env.TEAM_NAME || "Enterprise Sales Team", user: process.env.USER_NAME || "Arjun" };
  const live = (ok: boolean | string) => (ok === true || ok === "connected" || ok === "postgres" ? "Live" : ok === false ? "Missing" : String(ok));
  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-10">
      <Header company={cfg.company} team={cfg.team} user={cfg.user} email={user.email} updatedAt={h.lastIngest?.at ?? null} />
      <Banners h={h} />
      <div className="card p-4">
        <h1 className="font-display font-bold text-xl mb-3">Run log</h1>
        <RunNow />
        <p className="text-sm text-muted mt-2">Ingest runs daily at 06:00 IST, the morning job at 08:00 IST (Vercel Cron, about plus or minus an hour on the Hobby plan). Hot List goes out on Monday and Thursday.</p>
        <h2 className="font-display font-semibold mt-4 mb-2">Integrations</h2>
        <ul className="text-sm grid sm:grid-cols-3 gap-1">
          <li>Database: {live(h.database)}</li><li>Supabase Auth: {live(h.supabaseAuth)}</li><li>Gemini: {live(h.gemini)}</li>
          <li>Resend: {live(h.resend)}</li><li>HubSpot: {live(h.hubspot)}</li><li>Cron secret: {live(h.cronSecret)}</li>
        </ul>
      </div>
      <div className="card p-4 mt-4 overflow-x-auto">
        <h2 className="font-display font-semibold mb-2">Runs</h2>
        {runs.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : (
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-left text-muted"><th className="py-2 pr-3">Started (IST)</th><th className="pr-3">Job</th><th className="pr-3">Status</th><th>Counts</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const c = r.counts ?? {};
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtIstTime(r.started_at)}</td>
                    <td className="pr-3">{r.job}</td>
                    <td className={`pr-3 font-semibold ${r.status === "ok" ? "" : "text-hot"}`}>{r.status}</td>
                    <td className="py-2">
                      {r.job === "ingest" ? (
                        <div className="space-y-0.5">
                          <div>Discovered {String(c.discovered ?? 0)}, fetched {String(c.fetched ?? 0)}, already seen {String(c.skipped_seen ?? 0)}, extracted {String(c.extracted ?? 0)}, events written {String(c.events_written ?? 0)}, accounts rescored {String(c.accounts_rescored ?? 0)}, Gemini calls {String(c.gemini_calls ?? 0)}{c.stopped ? `, stopped: ${String(c.stopped)}` : ""}, HubSpot {String(c.hubspot ?? "n/a")}</div>
                          <div className="text-muted">Gated out: {kv(c.gated_out)}</div>
                          <div className="text-muted">Rejected by validator: {kv(c.rejected_by_validator)}</div>
                        </div>
                      ) : <div>{Object.entries(c).map(([k, v]) => `${k} ${String(v)}`).join(", ")}</div>}
                      {r.error && <pre className="text-xs text-hot whitespace-pre-wrap mt-1">{r.error}</pre>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card p-4 mt-4">
        <h2 className="font-display font-semibold mb-2">Recent sends (to Arjun only)</h2>
        {sends.length === 0 ? <p className="text-sm text-muted">No emails sent yet.</p> : (
          <ul className="text-sm space-y-1">{sends.map((s) => <li key={s.send_key}>{fmtIstTime(s.sent_at)} · {s.kind} · {s.status} · {s.recipient}</li>)}</ul>
        )}
      </div>
    </main>
  );
}
