# B2B Account Signal Monitor

> **For anyone (person or AI) continuing this build:** read docs/PROJECT_CONTEXT.md first (status, how to run, full session log), then docs/DECISIONS.md and docs/BUILD_CHECKLIST.md. Every change must update docs/PROJECT_CONTEXT.md (status plus a dated session-log entry saying who changed what and why) and docs/CHANGELOG.md (`npm run changelog`), then be committed and pushed so GitHub always matches. CI fails if code changes without the context file.

Live: https://account-signal-monitor.vercel.app (test build: any email and passcode sign in as the demo user)

Arjun sells workforce management software (time and attendance, shifts, leave, payroll, HRIS) to mid-market companies in India. Reaching out with no reason is noise; two weeks late is too late. This app watches 50 accounts every day, finds verified trigger events in the news, explains what changed and why it matters now, and ranks every account from 1 to 10. It emails Arjun a Hot List and a short brief every morning. It never overwrites anything Arjun wrote himself.

**Protected by design.** The accounts table has three column groups. Arjun-owned: notes, last contact, his read, his draft and snooze. CRM-owned: deal stage, customer flag and renewal, written only by the HubSpot sync. System-owned: score, band, lane and drafts. The system can only write its own group. This is enforced three ways: in code (src/lib/accounts-write.ts throws), in Postgres (trigger `sm_guard_accounts`), and by a test (tests/write-safety.test.ts runs a full ingest, scoring and morning job, then checks the notes are byte-identical).

## What it does
- **Daily ingest (06:00 IST):** news is discovered through Bing News RSS (Google News RSS as fallback), then fetched from the publisher (robots.txt respected, throttled). Six gates in code, then Gemini Flash extracts facts into a fixed JSON schema, then seven validators in code. Events are clustered so one story from several outlets counts once. Every account is then rescored with time decay.
- **Scoring in code, not AI:** score = best event + half of the second best + fit + relationship + activity + convergence + competitor mention. Bands: Hot 8 to 10, Warm 5 to 7, Cold 1 to 4. Hot needs a fresh confirmed T1 or T2 event. Every score has a stored breakdown shown in "Why this rating".
- **Relationship lanes:** prospects get outreach; customers get churn risk, expansion or re-engage.
- **Morning job (08:00 IST), every day:** the Hot List and a short brief. The Hot List has three parts: new accounts with fresh verified signals, updates on accounts already sent when a follow-up article appears, and a one-line "still on the list" for the rest. Each account carries why it matters now, the supporting articles with quotes and links, who to approach, the outreach angle, and a HubSpot brief (deal stage, won or not, last touch, open tasks). Top 10, never padded. Email goes to ARJUN_EMAIL only. A send lock prevents double sends.
- **Dashboard:** stat cards, filters, an account list and a detail panel (why this rating, signals with verbatim quotes and source links, who to approach, soft-touch draft with tones, tasks from HubSpot, your notes). Also a run log with Run now, light and dark themes, and phone-width layout.
- **HubSpot:** an "Enterprise Leads" deal pipeline. The deal stage maps to the account stage and Closed Won marks a customer. The sync pushes scores to sm_ properties, syncs tasks both ways, and creates a retention task for churn risks. See docs/hubspot-workflow.md.

## Architecture
Next.js 16 (App Router, TypeScript, Tailwind) on Vercel Hobby. Supabase Postgres and Auth. Gemini Flash (`gemini-3.8-flash`) through one wrapper, src/lib/ai/gemini.ts. Resend for email. HubSpot private app. Vercel Cron. Zod. Vitest. GitHub Actions.
Components map: docs/COMPONENTS-MAP.md (v1 drawn before coding, v2 as built).

```
src/lib/pipeline/  news.ts (discover, fetch) -> gates.ts (G1-G6) -> ai/gemini.ts -> validators.ts (V1-V7) -> ingest.ts -> rescore.ts
src/lib/scoring.ts  scores, bands, hot gate, lanes, breakdown
src/lib/morning.ts  Hot List, brief, send lock, failure alert
src/lib/accounts-write.ts + cols.ts   the only ways to update accounts
src/lib/hubspot/   client, sync, bootstrap
src/proxy.ts       auth gate (only ARJUN_EMAIL)
supabase/migrations/   schema, RLS, guard trigger
config/            sources.json (tiers), scoring.json (weights), product-facts.json (allowed claims)
```

## Setup
1. `npm install`, then copy `.env.example` to `.env.local` and fill it in.
2. Database: `node --env-file=.env.local scripts/migrate.mjs`, then `npx tsx --conditions=react-server --env-file=.env.local scripts/seed.mts`.
3. Arjun's login: `npx tsx --env-file=.env.local scripts/create-user.mts`. It prints a generated passcode once if ARJUN_PASSWORD is empty. Also turn off public sign-ups in Supabase (Authentication, Sign In / Providers); the app already rejects any user other than ARJUN_EMAIL.
4. HubSpot demo records: `npx tsx --conditions=react-server --env-file=.env.local scripts/hubspot-bootstrap.mts`. It is idempotent.
5. Run: `npm run dev`. With no DATABASE_URL the app runs on an in-memory database loaded with the seed data, and shows a banner.
6. Test: `npm test` and `npx tsc --noEmit`. Eval: `npx tsx --env-file=.env.local scripts/eval.mts`.

## Test build
With `SM_TEST_MODE=true` the login page says it is a test build, and any email and passcode sign in as the demo user (ARJUN_EMAIL), using the stored ARJUN_PASSWORD on the server. A TEST BUILD badge shows on every page. Set it to `false` to require the real passcode. Emails still go only to ARJUN_EMAIL.

## Secrets: where each key lives
- **Never in git.** `.env*` and `.vercel` are git-ignored, and CI runs a secret scan on every push. A full scan of git history, the repo and the live site's JavaScript (12 Oct 2026) found no secret anywhere. The only key the browser sees is the Supabase publishable key, which is public by design; RLS blocks anonymous reads.
- **Production runtime:** Vercel environment variables (encrypted). Only the keys the app uses at runtime are there. The Supabase secret key was removed from Vercel because only the local `create-user` script needs it.
- **CI:** GitHub Actions secrets hold only what CI needs: `GEMINI_API_KEY`, for the eval.
- **Local:** `.env.local` on the developer machine (git-ignored).
- **Least privilege:** each place holds only the keys it needs.

## Environment variables
| Name | Purpose |
|---|---|
| GEMINI_API_KEY, GEMINI_MODEL | Gemini Flash (default gemini-3.8-flash) |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase Auth in the browser |
| SUPABASE_SERVICE_ROLE_KEY | Local only (not in Vercel); used by scripts/create-user.mts |
| DATABASE_URL | Supabase pooler connection string for all server queries |
| RESEND_API_KEY, RESEND_FROM | Email. Without a verified domain, Resend only delivers to the account owner |
| ARJUN_EMAIL, ARJUN_PASSWORD | The only recipient and the only allowed user |
| SM_TEST_MODE | `true` for the open test build |
| HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_PORTAL_ID | HubSpot sync and record links |
| CRON_SECRET | Cron routes require `Authorization: Bearer CRON_SECRET` |
| COMPANY_NAME, TEAM_NAME, USER_NAME | Header text (defaults Keka, Enterprise Sales Team, Arjun) |
| GEMINI_DAILY_CALL_CAP, MAX_ARTICLES_PER_RUN | Cost caps (300, 120) |
| APP_URL | Optional, links in emails |

## Cron schedule
vercel.json: ingest `30 0 * * *` (06:00 IST), morning `30 2 * * *` (08:00 IST). Vercel Hobby runs each job once a day, with timing that can drift by up to about an hour.

## Data: real vs demo
- **Real, with sources:** 50 companies; headcount from BRSR or annual reports, each with source URL and date; people from company pages, filings and trade press; signals and quotes from fetched articles; the eval set.
- **Demo, flagged in the DB and badged in the UI:** deal stages, customer status, notes, last-contact dates, tasks, activities, meetings, renewals, and the HubSpot companies and deals (sm_demo, "[DEMO]").

## People and privacy
People are shown only from public, cited, role-based sources, with a source link and date, for one purpose: knowing whom to approach about a business event. There is no LinkedIn scraping and no guessed emails or phone numbers. Any person can be removed with "Remove this person". This follows the purpose-limitation and data-minimisation ideas in India's DPDP Act, 2023.

## Limits and known gaps
- Accuracy: on 30 labelled articles, the extractor gets 86.7% of trigger types right (target 90%). Quotes were verbatim in 100% of cases. The labels need a human spot-check (eval/README.md).
- Discovery uses Bing News RSS, with Google News RSS as a fallback. Their terms allow personal, non-commercial use, which suits this single-user exam project; a commercial version should use a licensed news API. Feeds can miss articles, and some publishers block fetching. Both are logged in the run log, not hidden.
- Vercel Hobby limits a function to 300 seconds, so one ingest run handles up to 120 articles. More would need a queue.
- HubSpot: the token lacks the email scope (demo emails are logged as notes) and the workflows scope (the churn-risk workflow runs in code).
- Soft-touch drafts and outreach angles are Gemini text checked by code rules. Read them before use. Nothing is ever sent to a prospect automatically.

## Docs
docs/DECISIONS.md, docs/VIVA.md, docs/DEMO.md, docs/hubspot-workflow.md, docs/COMPONENTS-MAP.md, docs/PROJECT_CONTEXT.md (status and handoff), docs/BUILD_CHECKLIST.md, docs/BUILD_SPEC.md.
