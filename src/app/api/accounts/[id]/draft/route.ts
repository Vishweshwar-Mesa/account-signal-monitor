import { z } from "zod";
import { json, requireUser, unauthorized } from "@/lib/api";
import { getDb } from "@/lib/db";
import { generateSoftTouch } from "@/lib/drafts";

export const maxDuration = 60;
const Body = z.object({ tone: z.enum(["warm", "brief", "curious"]) });

// Generates or regenerates the system draft. Never touches my_draft.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad tone" }, 400);
  try {
    const draft = await generateSoftTouch(await getDb(), id, parsed.data.tone);
    return json({ ok: true, draft });
  } catch (e) {
    return json({ error: (e as Error).message }, 422);
  }
}
