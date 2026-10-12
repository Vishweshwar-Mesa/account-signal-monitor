import { bearerOk, json } from "@/lib/api";
import { morningJob } from "@/lib/jobs";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Vercel Cron: 30 2 * * * (08:00 IST). Hot List and brief every day. Requires Bearer CRON_SECRET.
export async function GET(req: Request) {
  if (!bearerOk(req)) return json({ error: "unauthorized" }, 401);
  try {
    const r = await morningJob();
    return json({ ok: true, counts: r.counts });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
