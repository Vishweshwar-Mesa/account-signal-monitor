// Store UTC, show IST.
export const IST_TZ = "Asia/Kolkata";

export function istDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function istWeekday(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, weekday: "short" }).format(d);
}

export function fmtIst(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, ...opts }).format(new Date(d));
}

export function fmtIstTime(d: Date | string | null | undefined) {
  return fmtIst(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ageLabel(d: Date | string | null | undefined, now = new Date()) {
  if (!d) return "";
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** Postgres `date` columns arrive as local-midnight JS Dates (pg and PGlite). Return YYYY-MM-DD without a timezone shift. */
export function dateOnly(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}
