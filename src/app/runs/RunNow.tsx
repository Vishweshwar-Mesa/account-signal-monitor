"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunNow() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(job: "ingest" | "morning", forceHotList = false) {
    setBusy(job);
    setMsg(null);
    try {
      const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, forceHotList }) });
      const j = await r.json();
      setMsg(r.ok ? `${job} finished: ${j.status ?? "ok"}` : `${job} failed: ${j.error}`);
    } catch (e) {
      setMsg(`${job} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => go("ingest")}>{busy === "ingest" ? "Running ingest" : "Run ingest now"}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => go("morning", true)}>{busy === "morning" ? "Sending" : "Run morning job now (sends Hot List and brief)"}</button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </div>
  );
}
