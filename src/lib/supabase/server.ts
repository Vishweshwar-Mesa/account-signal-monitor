import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey, isAllowedUser } from "./config";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component; the proxy refreshes the session */
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user, or null. Only ARJUN_EMAIL counts as signed in. */
export async function getUser(): Promise<SessionUser | null> {
  try {
    const { data } = await (await supabaseServer()).auth.getUser();
    const u = data.user;
    if (!u || !isAllowedUser(u.email)) return null;
    return { id: u.id, email: u.email! };
  } catch {
    return null;
  }
}
