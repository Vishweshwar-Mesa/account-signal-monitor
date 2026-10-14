import "server-only";
import { getDb } from "./db";
import { ingestNote } from "./pipeline/runs";
import { supabaseConfigured } from "./supabase/config";
import { geminiConfigured } from "./ai/gemini";

export interface Health {
  database: "postgres" | "seed (in-memory)" | "error";
  supabaseAuth: boolean;
  gemini: boolean;
  resend: boolean;
  hubspot: "connected" | "not_configured" | "failed";
  cronSecret: boolean;
  lastIngest: { status: string; at: string; note: string | null } | null;
  lastMorning: { status: string; at: string } | null;
}

export async function health(): Promise<Health> {
  let database: Health["database"] = "error";
  let lastIngest = null, lastMorning = null, hubspot: Health["hubspot"] = process.env.HUBSPOT_PRIVATE_APP_TOKEN ? "connected" : "not_configured";
  try {
    const db = await getDb();
    database = db.mode === "postgres" ? "postgres" : "seed (in-memory)";
    const runs = await db.query<{ job: string; status: string; started_at: string; counts: { hubspot?: string; [k: string]: unknown } }>(
      "select distinct on (job) job, status, started_at, counts from runs where status <> 'running' order by job, started_at desc");
    for (const r of runs.rows) {
      const v = { status: r.status, at: new Date(r.started_at).toISOString() };
      if (r.job === "ingest") {
        lastIngest = { ...v, note: ingestNote({ status: r.status, started_at: r.started_at, counts: r.counts }, new Date())?.text ?? null };
        if (hubspot === "connected" && r.counts?.hubspot && !["ok", "synced", "partial"].includes(r.counts.hubspot)) hubspot = "failed";
      } else lastMorning = v;
    }
  } catch {
    database = "error";
  }
  return {
    database,
    supabaseAuth: supabaseConfigured(),
    gemini: geminiConfigured(),
    resend: Boolean(process.env.RESEND_API_KEY && process.env.ARJUN_EMAIL),
    hubspot,
    cronSecret: Boolean(process.env.CRON_SECRET),
    lastIngest,
    lastMorning,
  };
}
