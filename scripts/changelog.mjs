// Regenerates docs/CHANGELOG.md from git history: when (IST), who, what. Run before each commit: npm run changelog
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Every commit up to and including this one was made by Claude Code (claude-opus-5-5) in the build session run by Vishweshwar Gupta.
const SESSION_LAST = "7c5521f";
const raw = execSync("git log --reverse --format=%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e", { encoding: "utf8" });
const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
let inSession = true;
const rows = raw.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
  const [hash, author, date, subject, body] = r.split("\x1f");
  const ai = /Co-Authored-By:\s*Claude/i.test(body ?? "") || inSession;
  const by = ai ? `Claude Code for ${author}` : author;
  if (hash.startsWith(SESSION_LAST)) inSession = false;
  return `| ${fmt.format(new Date(date))} | ${by} | \`${hash.slice(0, 7)}\` | ${subject.replace(/\|/g, "/")} |`;
});
writeFileSync("docs/CHANGELOG.md", `# Changelog

> **Read this first if you are changing this project (person or AI).** This repo carries its own build context: docs/PROJECT_CONTEXT.md (status, how to run, session log), docs/DECISIONS.md and docs/BUILD_CHECKLIST.md. Whatever you change, update docs/PROJECT_CONTEXT.md (status and a session-log entry with date, time IST, who, what and why) and regenerate this file with \`npm run changelog\` before committing. Push after every commit so GitHub always matches.

Every commit, oldest first. Times are IST. "Claude Code for X" means the commit was made by Claude Code (an AI coding agent, model claude-opus-5-5) working in a session run by X.

| When (IST) | By | Commit | What changed |
|---|---|---|---|
${rows.join("\n")}
`);
console.log(`wrote docs/CHANGELOG.md (${rows.length} commits)`);
