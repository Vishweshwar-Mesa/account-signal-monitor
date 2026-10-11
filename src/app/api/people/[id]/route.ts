import { json, requireUser, unauthorized } from "@/lib/api";
import { getDb } from "@/lib/db";

// R7: "Remove this person". Hides the person everywhere; the row keeps its citation for audit.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return unauthorized();
  const { id } = await ctx.params;
  await (await getDb()).query("update people set removed_at = now() where id = $1", [id]);
  return json({ ok: true });
}
