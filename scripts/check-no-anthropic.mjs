// Fails if any dependency or product import matches /anthropic/i (the product uses Gemini only).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const bad = [];
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const k of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) if (/anthropic/i.test(k)) bad.push(`package.json: ${k}`);
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const k of Object.keys(lock.packages ?? {})) if (/anthropic/i.test(k)) bad.push(`package-lock.json: ${k}`);

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|mts|cjs)$/.test(f)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)) if (/anthropic/i.test(m[1])) bad.push(`${p}: imports ${m[1]}`);
    }
  }
}
for (const d of ["src", "scripts", "config"]) walk(d);
if (bad.length) {
  console.error("Anthropic dependency check FAILED:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("Anthropic dependency check passed: no package or import matches /anthropic/i.");
