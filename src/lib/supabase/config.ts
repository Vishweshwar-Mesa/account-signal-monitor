export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseConfigured = () => Boolean(supabaseUrl() && supabaseAnonKey());

/** Only Arjun may use the app, even if Supabase sign-ups are open. */
export function isAllowedUser(email: string | null | undefined) {
  const allowed = (process.env.ARJUN_EMAIL ?? "").toLowerCase().trim();
  return Boolean(email && allowed && email.toLowerCase().trim() === allowed);
}
