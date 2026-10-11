import { z } from "zod";
import { json, requireUser, unauthorized } from "@/lib/api";
import { getDb } from "@/lib/db";
import { completeHubspotTask } from "@/lib/hubspot/sync";

const Body = z.object({ done: z.boolean() });

// Task checkbox. Writes tasks.done and pushes completion to HubSpot when the task is linked.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad request" }, 400);
  const db = await getDb();
  const r = await db.query<{ hubspot_id: string | null }>("update tasks set done = $2 where id = $1 returning hubspot_id", [id, parsed.data.done]);
  if (!r.rows.length) return json({ error: "not found" }, 404);
  let hubspot = "not_linked";
  if (r.rows[0].hubspot_id) {
    try {
      await completeHubspotTask(r.rows[0].hubspot_id, parsed.data.done);
      hubspot = "updated";
    } catch (e) {
      hubspot = `failed: ${(e as Error).message}`;
    }
  }
  return json({ ok: true, hubspot });
}
