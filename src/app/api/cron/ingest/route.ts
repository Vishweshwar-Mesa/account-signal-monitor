import { bearerOk, json } from "@/lib/api";
import { ingestJob } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Cron: 30 0 * * * (06:00 IST). Requires Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  if (!bearerOk(req)) return json({ error: "unauthorized" }, 401);
  try {
    const r = await ingestJob();
    return json({ ok: true, status: r.status, counts: r.counts });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
