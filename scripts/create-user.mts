// Creates Arjun's Supabase Auth user (email confirmed). Prints a generated passcode once if ARJUN_PASSWORD is empty.
// Usage: npx tsx --env-file=.env.local scripts/create-user.mts
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ARJUN_EMAIL;
if (!key || !email) throw new Error("SUPABASE_SERVICE_ROLE_KEY and ARJUN_EMAIL are required");
const password = process.env.ARJUN_PASSWORD || randomBytes(12).toString("base64url");
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: list } = await admin.auth.admin.listUsers();
const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  console.log(`Updated passcode for ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  console.log(`Created ${email}`);
}
if (!process.env.ARJUN_PASSWORD) console.log(`Generated passcode (shown once, store it safely): ${password}`);
