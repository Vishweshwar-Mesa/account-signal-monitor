// Simple secret scan over tracked files. Fails on anything that looks like a real key.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/\bAQ\.[A-Za-z0-9_-]{30,}/, "Google API key (AQ.)"],
  [/\bsb_secret_[A-Za-z0-9_-]{20,}/, "Supabase secret key"],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (Supabase legacy key)"],
  [/\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}/, "Resend API key"],
  [/\bpat-(na|eu)\d-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, "HubSpot private app token"],
  [/postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/, "Postgres URL with password"],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, "private key"],
];
const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean)
  .filter((f) => !/\.(png|jpg|ico|woff2?)$/.test(f) && f !== "package-lock.json");
const hits = [];
for (const f of files) {
  if (/(^|\/)\.env(\.|$)/.test(f) && f !== ".env.example") hits.push(`${f}: env file is tracked`);
  let text = "";
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  for (const [re, name] of PATTERNS) if (re.test(text)) hits.push(`${f}: ${name}`);
}
if (hits.length) {
  console.error("Secret scan FAILED:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} files).`);
