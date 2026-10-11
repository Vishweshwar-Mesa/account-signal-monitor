export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseConfigured = () => Boolean(supabaseUrl() && supabaseAnonKey());

/** Only Arjun may use the app, even if Supabase sign-ups are open. */
export function isAllowedUser(email: string | null | undefined) {
  const allowed = (process.env.ARJUN_EMAIL ?? "").toLowerCase().trim();
  return Boolean(email && allowed && email.toLowerCase().trim() === allowed);
}

/** Local development only: lets the UI be checked before Arjun's Supabase user exists. Never active in production builds. */
export function devUserEmail(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const e = process.env.SM_DEV_USER;
  return e && isAllowedUser(e) ? e : null;
}
