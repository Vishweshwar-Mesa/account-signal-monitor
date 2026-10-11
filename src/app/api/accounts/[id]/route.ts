import { z } from "zod";
import { json, requireUser, unauthorized } from "@/lib/api";
import { getDb } from "@/lib/db";
import { updateAccountUserColumns } from "@/lib/accounts-write";

const Patch = z.object({
  notes: z.string().max(5000).nullable().optional(),
  last_contacted_at: z.string().datetime().nullable().optional(),
  relationship_read: z.string().max(2000).nullable().optional(),
  my_draft: z.string().max(3000).nullable().optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
  draft_accepted_at: z.string().datetime().nullable().optional(),
}).strict();

// Arjun's own edits. Only Arjun-owned columns can pass (zod strict, then updateAccountUserColumns, then the DB trigger).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Only your own fields can be edited here." }, 400);
  const patch: Record<string, unknown> = { ...parsed.data };
  if ("notes" in patch || "last_contacted_at" in patch || "relationship_read" in patch) patch.notes_is_demo = false;
  try {
    await updateAccountUserColumns(await getDb(), id, patch);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
