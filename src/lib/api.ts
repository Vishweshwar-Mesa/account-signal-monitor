import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getUser } from "./supabase/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const unauthorized = () => json({ error: "Sign in required" }, 401);

export function bearerOk(req: Request) {
  const secret = process.env.CRON_SECRET;
  const h = req.headers.get("authorization") ?? "";
  if (!secret || !h.startsWith("Bearer ")) return false;
  const a = Buffer.from(h.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Route guard: a signed-in Arjun session. */
export async function requireUser() {
  return getUser();
}
