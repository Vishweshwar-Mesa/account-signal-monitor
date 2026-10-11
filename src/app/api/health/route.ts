import { bearerOk, json, requireUser, unauthorized } from "@/lib/api";
import { health } from "@/lib/health";

export const dynamic = "force-dynamic";

// Which integrations are live. Needs a session or the cron bearer token.
export async function GET(req: Request) {
  if (!bearerOk(req) && !(await requireUser())) return unauthorized();
  return json(await health());
}
