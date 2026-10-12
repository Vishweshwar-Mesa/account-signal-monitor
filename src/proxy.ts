import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Auth gate (R4). Pages redirect to /login, APIs return 401. Cron routes check their own bearer token.
const PUBLIC = [/^\/login$/, /^\/api\/cron\//, /^\/api\/health$/, /^\/api\/test-login$/];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });
  if (PUBLIC.some((r) => r.test(path))) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let email: string | undefined;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? undefined;
    } catch {
      email = undefined;
    }
  }
  // Local development shortcut, never active in production (see devUserEmail in src/lib/supabase/config.ts).
  if (process.env.NODE_ENV !== "production" && process.env.SM_DEV_USER) email = process.env.SM_DEV_USER;
  const allowed = (process.env.ARJUN_EMAIL ?? "").toLowerCase();
  const ok = Boolean(email && allowed && email.toLowerCase() === allowed);
  if (ok) return response;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
