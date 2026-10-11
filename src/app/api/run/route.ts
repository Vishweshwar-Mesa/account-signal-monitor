import { z } from "zod";
import { json, requireUser, unauthorized } from "@/lib/api";
import { ingestJob, morningJob } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({ job: z.enum(["ingest", "morning"]), forceHotList: z.boolean().optional() });

// "Run now" from the run log page. Signed-in Arjun only.
export async function POST(req: Request) {
  if (!(await requireUser())) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad request" }, 400);
  try {
    if (parsed.data.job === "ingest") {
      const r = await ingestJob({ timeBudgetMs: 240_000 });
      return json({ ok: true, status: r.status, counts: r.counts });
    }
    const r = await morningJob({ forceHotList: parsed.data.forceHotList });
    return json({ ok: true, counts: r.counts });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
