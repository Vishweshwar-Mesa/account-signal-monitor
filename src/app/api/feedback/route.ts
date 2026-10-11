import { z } from "zod";
import { json, requireUser, unauthorized } from "@/lib/api";
import { getDb } from "@/lib/db";

const Body = z.object({ signal_id: z.string().uuid(), verdict: z.enum(["useful", "wrong"]) });

export async function POST(req: Request) {
  if (!(await requireUser())) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad request" }, 400);
  await (await getDb()).query("insert into feedback (signal_id, verdict) values ($1, $2)", [parsed.data.signal_id, parsed.data.verdict]);
  return json({ ok: true });
}
