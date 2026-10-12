import { json } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase/server";
import { testMode } from "@/lib/supabase/config";

// Test build only: whatever is typed, sign in as the demo user with the stored credentials.
// The session is a normal Supabase session, so sign-out and route protection work as usual.
export async function POST() {
  if (!testMode()) return json({ error: "Test sign-in is off" }, 403);
  const email = process.env.ARJUN_EMAIL;
  const password = process.env.ARJUN_PASSWORD;
  if (!email || !password) return json({ error: "Demo user not configured" }, 500);
  const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (error) return json({ error: "Sign in failed" }, 500);
  return json({ ok: true });
}
