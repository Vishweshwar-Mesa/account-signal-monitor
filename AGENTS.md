# AGENTS.md

Instructions for any AI coding tool working on this repo. This file stands alone; you do not need any chat history.

## What this is
The B2B Account Signal Monitor, a university exam project. It watches about 50 Indian companies daily for verified trigger events in the news, scores each account from 1 to 10 with an explanation, emails a Hot List to one salesperson (Arjun) every Monday and Thursday plus a daily brief, and never overwrites anything Arjun wrote. Stack: Next.js 16 (App Router, TypeScript, Tailwind) on Vercel, Supabase Postgres and Auth, Gemini Flash via @google/genai, Resend, HubSpot, Vitest, GitHub Actions.

## Before you change anything
1. `git pull --rebase origin main`
2. Read docs/PROJECT_CONTEXT.md (current status, how to run, open issues, session log).
3. Read docs/DECISIONS.md and docs/BUILD_CHECKLIST.md.
4. Use docs/BUILD_SPEC.md for exact requirements.

## How to work
- Small commits with clear messages. After each: `git pull --rebase origin main && git push origin main`. Never force push or rewrite pushed history.
- Before each commit run `npm test` and `npx tsc --noEmit`. Do not commit a broken main branch.
- Before each commit, update "Current status" and append a session log entry in docs/PROJECT_CONTEXT.md (date and time IST, tool or model, what changed and why, files, tests and result, next step). CI fails when src/, supabase/, config/ or scripts/ change without it.
- Update docs/BUILD_CHECKLIST.md when an item changes state. Only mark DONE what you ran.
- Never commit secrets. Docs list env var names only.

## Rules that must not break
- Never invent data. No made-up companies, people, headcounts, signals or quotes. Each needs a fetched source URL and date. If you cannot verify it, leave it out.
- AI inside the product is Gemini Flash only, through src/lib/ai/gemini.ts, with prompts in src/lib/ai/prompts.ts. No Anthropic or Claude packages or imports anywhere in the product.
- Gemini extracts facts into a fixed schema and writes short text. Code validates (src/lib/pipeline/validators.ts) and scores (src/lib/scoring.ts). Gemini never decides a score or band.
- Column ownership on the accounts table (src/lib/cols.ts): Arjun-owned, CRM-owned, system-owned. System code must never write Arjun-owned columns. Use the three functions in src/lib/accounts-write.ts. A Postgres trigger (sm_guard_accounts in supabase/migrations/0001_schema.sql) enforces the same rule.
- Automated email goes only to ARJUN_EMAIL. Nothing is auto-sent to prospects.
- Demo data (stages, notes, tasks, activities, renewals, deals) is flagged in the DB and badged in the UI.
- No LinkedIn scraping. Respect robots.txt. Store quotes of 25 words max, never full article text.
- No em dashes in product text or docs.

## Commands
- Install `npm install`. Test `npm test`. Typecheck `npx tsc --noEmit`. Dev `npm run dev`.
- Scripts: `npx tsx --env-file=.env.local scripts/<name>.mts`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
