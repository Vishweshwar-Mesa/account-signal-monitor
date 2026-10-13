# Project context

## If you are a new AI, start here
1. This is the B2B Account Signal Monitor, an exam project. The full spec is docs/BUILD_SPEC.md.
2. Read this file, then docs/DECISIONS.md, then docs/BUILD_CHECKLIST.md (what is done, partial, missing).
3. Run `git pull --rebase origin main` first. Make small commits. Push after each one. Never force push.
4. Never invent data. Every company fact, person and signal needs a fetched source URL.
5. The product uses Gemini Flash only (src/lib/ai/gemini.ts). No Anthropic packages or imports in the product.
6. Never write Arjun-owned columns from system code. Use src/lib/accounts-write.ts. A Postgres trigger also blocks it.
7. Secrets live only in .env.local and in Vercel env. Never commit them. Only env var names appear in docs.
8. Run `npm test` and `npx tsc --noEmit` before every commit.
9. Before every commit: update the "Current status" block, append a session-log entry (date, time IST, WHO made the change, what and why), run `npm run changelog`, then commit and push.
10. No em dashes in product text or docs.

## What the project is
Arjun sells workforce management SaaS (reference product: Keka HRMS) to mid-market companies in India. This app watches about 50 accounts daily, finds verified trigger events in the news (new HR head, hiring drive, expansion and so on), scores each account from 1 to 10 with a full explanation, emails a Hot List and a morning brief every day, and never overwrites anything Arjun wrote.

## Current status (rewritten each session)
- Live: https://account-signal-monitor.vercel.app (deployed with the Vercel CLI from main). Repo: https://github.com/Vishweshwar-Mesa/account-signal-monitor
- Phases 0 to 3 are built. 83 tests pass. `tsc` and `next build` are clean.
- Production ingest was verified on Vercel (3 min 38 s, Bing discovery, Gemini, HubSpot sync). Real Hot List and brief emails were sent to ARJUN_EMAIL.
- Database: Supabase Postgres (ap-northeast-1) connected through the session pooler. Migrations 0001 and 0002 applied, seed loaded (50 accounts), HubSpot ids linked (22 tasks, 22 activities). Trigger and RLS checked on the real DB.
- Sign-in: TEST BUILD mode is on (SM_TEST_MODE=true): any email and passcode sign in as the demo user. Real login also works when the flag is off. Arjun's Supabase user was created with scripts/create-user.mts; the passcode is in .env.local only. Sign-in, dashboard and sign-out were verified in a headless browser.
- CI: .github/workflows/ci.yml is local only; the gh token needs the workflow scope.
- GitHub to Vercel: the original project account-signal-monitor is connected to the repo, so pushes to main deploy. The user also created a second project, keka-b2b-signal-monitor (URL account-signal-monitor-o97c.vercel.app), from the same repo. It should be deleted to avoid duplicate cron runs and emails.
- HubSpot: Enterprise Leads pipeline live with 10 demo deals; daily sync works; email and workflow scopes are missing.

## Architecture snapshot
- Next.js 16 App Router on Vercel. `proxy.ts` replaces middleware in Next 16. Cache Components is off (B02).
- Postgres on Supabase. Server code uses one SQL interface (src/lib/db.ts): `pg` with DATABASE_URL, or PGlite in tests and as a seed fallback (B04).
- Pipeline: src/lib/pipeline/news.ts (Bing News RSS primary, Google News RSS behind a circuit breaker, robots, throttle) to gates.ts (G1 to G6) to ai/gemini.ts (extract) to validators.ts (V1 to V7) to ingest.ts (store and cluster) to rescore.ts to scoring.ts.
- Morning job: src/lib/morning.ts (daily Hot List built in src/lib/hotlist.ts with new, updates, still-hot, why-now, articles and HubSpot brief; daily brief; send lock), email in src/lib/email/.
- Config: config/sources.json (tiers), config/scoring.json (weights), config/product-facts.json (only claims allowed in angles).

## Data ownership rules (D02)
- Arjun-owned: notes, last_contacted_at, relationship_read, my_draft, snoozed_until, draft_accepted_at, notes_is_demo.
- CRM-owned: is_active, hubspot_company_id, hubspot_deal_id, stage, is_customer, renewal_date, owner_email, crm_is_demo. Written only by the HubSpot sync or the demo seed.
- System-owned: profile fields and score, band, confidence, lane, flags, top_signal_*, last_signal_at, score_breakdown, system_draft, draft_tone, scored_at.
- Enforced three ways: src/lib/cols.ts plus src/lib/accounts-write.ts (throws), the Postgres trigger sm_guard_accounts (reads app.writer), and tests.

## Integrations (env var names only)
| Integration | Env vars | Connected |
|---|---|---|
| Gemini | GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.8-flash), GEMINI_DAILY_CALL_CAP | Yes, smoke tested |
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL | Auth live (secret key set, server-only in Vercel). DATABASE_URL missing: the database password is needed |
| Resend | RESEND_API_KEY, RESEND_FROM, ARJUN_EMAIL | Yes, real sends verified |
| HubSpot | HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_PORTAL_ID | Yes; missing sales-email-read and automation scopes |
| Cron | CRON_SECRET | Yes, set in Vercel; bearer verified live |
| Other | COMPANY_NAME, TEAM_NAME, USER_NAME, MAX_ARTICLES_PER_RUN, APP_URL | |

## How to run
- Install: `npm install`
- Test: `npm test` (Vitest, uses PGlite, no network)
- Typecheck: `npx tsc --noEmit`
- Dev: `npm run dev` (without DATABASE_URL it runs on an in-memory seeded PGlite)
- Migrate: `node --env-file=.env.local scripts/migrate.mjs` (needs DATABASE_URL)
- Seed: `npx tsx --conditions=react-server --env-file=.env.local scripts/seed.mts` (needs DATABASE_URL; insert-only)
- Arjun's user: `npx tsx --env-file=.env.local scripts/create-user.mts` (needs SUPABASE_SERVICE_ROLE_KEY)
- Rebuild seed signals from the live pipeline: `SM_DISCOVERY_DAYS=30 npx tsx --conditions=react-server --env-file=.env.local scripts/build-seed-signals.mts`
- HubSpot demo setup: `npx tsx --conditions=react-server --env-file=.env.local scripts/hubspot-bootstrap.mts` (idempotent)
- Test emails: `npx tsx --conditions=react-server --env-file=.env.local scripts/send-test-emails.mts`
- Eval: `npx tsx --env-file=.env.local scripts/eval.mts`
- Local UI without Supabase: `SM_DEV_USER=<ARJUN_EMAIL> npm run dev` (dev only, ignored in production)
- Map: `npm run map -- v2`
- Deploy: `npx vercel deploy --prod` (until the GitHub repo is connected in Vercel; then pushes to main deploy)

## Real vs demo data
- Real: accounts, headcounts (with source URL and date), people (with source URL), signals and events (from fetched articles), eval set.
- Demo (flagged in DB and badged in UI): stages, notes, last-contact dates, tasks, activities, meetings, renewal dates, customer status, HubSpot deals.

## Open issues
- Needed from the user: delete the duplicate Vercel project keka-b2b-signal-monitor; `gh auth refresh -h github.com -s workflow`; connect the GitHub repo in Vercel; optionally the HubSpot scopes sales-email-read and automation.
- Eval accuracy is 86.7% against a 90% target. The labels need a human spot-check (eval/README.md).
- Two seed events only (Travel Food Services and Thyrocare). That is the honest output of the live pipeline for this window.

## Next steps (ordered)
1. When the database password arrives: build DATABASE_URL (session pooler) in .env.local and Vercel; run migrate, seed, hubspot-bootstrap (links hubspot ids), then redeploy.
2. Push .github/workflows/ci.yml after the gh workflow scope is granted; confirm CI is green.
3. Connect the repo in Vercel for auto-deploys.
4. Sign in on the live URL and run the DEMO.md script end to end.
5. Optional: add HubSpot scopes and rerun the bootstrap so demo emails are linked as emails.

## Session log (append only)

### 2026-10-12 02:20 to 02:43 IST, Claude Code (claude-opus-5-5)
- Asked the user for secrets once. Received Gemini, Supabase URL and publishable key, Resend, HubSpot. Still missing the Supabase secret key and DATABASE_URL.
- Phase 0: DECISIONS.md and Components Map v1 (scripts/render-map.mjs, docs/components-map-v1.svg and .png), committed before app code (a3474cb), tag phase-0-map.
- Scaffolded Next.js 16 and installed deps. Created the public GitHub repo. Commit da06859.
- Wrote the schema with the column-guard trigger and RLS, src/lib/cols.ts, src/lib/accounts-write.ts, src/lib/db.ts, and the scorer with tests. Tuned the LEADERSHIP_CHANGE half-life from 10 to 14 days so the brief's scenarios hold (B03).
- Gates, validators, clustering keys, Gemini wrapper and prompts, news discovery with Google News URL decoding. Commit 153e5c6. Gemini smoke test: correct extraction and the planted prompt injection was ignored.
- Ingest, rescore, run log, seed loader, morning job, email templates, eval set (30 cases from a research agent). Commit d53b8c4.
- Tests: 35 of 35 passing. tsc clean.
- Decisions: B02 Cache Components off, B03 half-life tuning, B04 PGlite for tests.
- Addendum received: added BUILD_SPEC, BUILD_CHECKLIST, this file, CLAUDE.md, AGENTS.md. HubSpot moves to an "Enterprise Leads" deal pipeline.
- Next: write-safety test and CI.

### 2026-10-12 02:43 to 02:49 IST, Claude Code (claude-opus-5-5)
- Added src/lib/drafts.ts (soft-touch draft with checks: 45 to 110 words, cites the publication, no pitch, no urgency, no dashes).
- Tests: tests/write-safety.test.ts (section 6: notes byte-identical after full ingest, scoring and morning job; code throws; trigger blocks bypass and no-writer updates; draft regeneration never touches my_draft; audit; code and DB column lists match) and tests/pipeline-morning.test.ts (fixture pipeline, dedup, idempotency, partial runs, caps, Hot List window, eligibility, no padding, empty note, send lock, Mon and Thu only, stale note, lock release on failure, R6 recipient guard). 55 of 55 pass.
- CI: .github/workflows/ci.yml with the Anthropic check, secret scan, context-file check, typecheck, tests and the Gemini eval. GEMINI_API_KEY added as a GitHub Actions secret.
- Eval (scripts/eval.mts, gemini-3.8-flash): trigger accuracy 86.7% (26/30), raw quote verbatim 100% (23/23), injection ignored. Misses: e09, e13, e16, e25. Three were flagged as uncertain labels by the labeller.
- .env.example added.
- Next: cron routes, auth, dashboard.

### 2026-10-12 02:49 to 02:55 IST, Claude Code (claude-opus-5-5)
- Auth: src/proxy.ts (Next 16 proxy) gates pages and APIs; only ARJUN_EMAIL counts as signed in, because Supabase sign-ups are open on the project. Helpers in src/lib/supabase/.
- API: cron routes (bearer CRON_SECRET, constant-time compare), /api/run (Run now), /api/health, edit routes for Arjun-owned columns (zod strict), draft, tasks, people removal, feedback. vercel.json crons 30 0 and 30 2 UTC.
- UI: theme tokens and pre-paint theme script (layout.tsx, globals.css), Header, ThemeToggle (fixed width, no shift), UserMenu, Dashboard (stat cards, filters, list), Detail (why panel, signals with feedback, people with remove, soft-touch draft with tones, tasks with DEMO and HubSpot badges, Arjun notes), run log page with Run now, banners, loading skeleton, error page, login page.
- Migration 0002: accounts.hubspot_deal_id and the eight Enterprise Leads deal stages; CRM_COLS updated.
- CI file is local only: the gh token lacks the workflow scope. The user was asked to run gh auth refresh -h github.com -s workflow.
- Tests 55 of 55 pass; next build clean.
- Next: Vercel link and deploy, seed data, HubSpot.

### 2026-10-12 02:55 to 02:58 IST, Claude Code (claude-opus-5-5)
- Vercel project linked (vishu-mesa/account-signal-monitor). Production env vars set by name through the CLI. Deployed with `vercel deploy --prod`: https://account-signal-monitor.vercel.app
- Checked on the live URL: /login 200; / redirects to /login when signed out; cron routes return 401 with no bearer and with a wrong bearer; /api/run returns 401 unauthenticated; /api/health with the bearer shows database "seed (in-memory)", Gemini, Resend, HubSpot and the cron secret live.
- `vercel git connect` failed: the Vercel GitHub App needs access to the repo. The user was asked to connect it in the Vercel dashboard. Until then, deploys are made from the CLI.
- Next: seed data, HubSpot pipeline.

### 2026-10-12 02:58 to 03:04 IST, Claude Code (claude-opus-5-5)
- Research done: 50 accounts (10 active, 40 watchlist), all sized from BRSR or annual report PDFs (data/research/accounts.json, notes in accounts-notes.md). data/seed/accounts.json generated from it; removed the V-Mart alias "Unlimited" (common word).
- data/seed/demo-crm.json: DEMO stages across Identified to Pilot plus two Closed Won customers (Updater Services, Krsnaa Diagnostics), notes, tasks, activities, renewals. All relative to seed time.
- queryNames() in ingest.ts: legal suffixes stripped, multi-word aliases only.
- HubSpot module rewritten (src/lib/hubspot/client.ts, sync.ts): idempotent sm_ properties, Enterprise Leads pipeline with fallback to the default pipeline then the company property, owner lookup, sync of companies and deals into CRM_COLS only, pull of tasks and activities, push of sm_ properties, retention task per churn-risk event_key, task completion write-back. The workflows API returned a scope error, so the churn-risk workflow runs in code.
- tests/hubspot.test.ts with an in-memory fake HubSpot: 11 tests (idempotent pipeline, fallback deletes nothing, properties idempotent, stage mapping, Closed Won sets is_customer, only CRM columns, new companies picked up, deal stages never edited, tasks both ways, retention task idempotent, failure banner without crashing the run). Total 66 of 66 pass.
- scripts/build-seed-signals.mts started: runs the real pipeline over all 50 accounts to produce data/seed/signals.json.
- Next: HubSpot bootstrap on the real portal, finish the seed, docs.

### 2026-10-12 03:04 to 03:11 IST, Claude Code (claude-opus-5-5)
- HubSpot bootstrap (src/lib/hubspot/bootstrap.ts, scripts/hubspot-bootstrap.mts) run on the real portal: sm_ properties and the Signal Monitor group created; "Enterprise Leads" deal pipeline created (path: enterprise_pipeline); 10 DEMO companies (sm_demo) and 10 deals "{Company} - Enterprise rollout" (Identified to Pilot, Updater Services and Krsnaa at Closed Won); demo tasks and activities created and associated, titled "[DEMO] ...".
- Scope gaps: email associations and email search are refused (needs sales-email-read), so demo emails are logged as notes; the automation API (workflows) is refused, so the churn-risk workflow runs in code.
- Lookups are scoped to the company (shared task titles had collided). Activity pulls are isolated per type. The third bootstrap run created nothing, so it is idempotent.
- HUBSPOT_PORTAL_ID added (env name only) for "Open in HubSpot" links.
- Next: finish the seed signals, docs, map v2.

### 2026-10-12 03:11 to 03:13 IST, Claude Code (claude-opus-5-5)
- Scripts: migrate.mjs (tracks schema_migrations), seed.mts (insert-only), create-user.mts (Arjun's Supabase user; prints a generated passcode once).
- Docs: README (with "Protected by design", DPDP note, limits), VIVA, DEMO, hubspot-workflow (paths used), COMPONENTS-MAP, Components Map v2 (SVG and PNG).
- Next: finish the seed signals, then the final checks.

### 2026-10-12 03:14 IST, Claude Code (claude-opus-5-5)
- Correction: the time ranges in the entries above were first written as estimates and ran ahead of the real clock (up to 04:15). They have been corrected to match the commit timestamps from `git log`. From now on, entries use `date` output.

### 2026-10-12 03:14 IST, Claude Code (claude-opus-5-5)
- Added a dev-only sign-in shortcut (SM_DEV_USER, ignored when NODE_ENV is production) so the UI can be checked before Arjun's Supabase user exists.
- tests/auth-routes.test.ts: cron routes reject a missing or wrong bearer; signed-out API calls get 401; proxy redirects pages to /login; only ARJUN_EMAIL is allowed; the dev shortcut is off in production. 72 tests in total.


### 2026-10-12 03:16 IST, Claude Code (claude-opus-5-5)
- UI checked locally with headless Chrome via puppeteer-core (scratchpad only): dark theme renders, at a 390px viewport scrollWidth is 390 (no horizontal scroll), no console errors or warnings.
- Fixed a bug found in the screenshot: Postgres date columns showed year 2001. Added dateOnly() in src/lib/time.ts, used for headcount as-of, people as-of and renewal date, and in the HubSpot sync comparison.


### 2026-10-12 03:20 IST, Claude Code (claude-opus-5-5)
- First live seed build: 1,650 items discovered, but 1,450 Google News links could not be decoded (Google throttles the decode endpoint). Only 7 articles were fetched and there were 0 events. Not usable.
- Fix: Bing News RSS is the primary discovery source (the publisher URL is in the link, so no decode request is needed). Google News is secondary behind a circuit breaker (it stops after 3 failed decodes). Items are processed newest first, and stale items rejected before fetch no longer use the per-account budget.
- Note: the Bing and Google RSS terms allow personal, non-commercial use. This is fine for the exam project; a commercial build needs a licensed news API (added to README limits).
- Re-running the seed build.


### 2026-10-12 03:29 IST, Claude Code (claude-opus-5-5)
- Bing now uses its date filter (past month, newest first). Added BW People and BW Businessworld to T2 (established HR and business trade press).
- Seed build 3 (live pipeline, all 50 accounts): 570 discovered, 286 fetched, 18 Gemini calls, 2 events written. Gated out: g1 196, g4 context 109, fetch 403 39, g2 stale 23, g3 12. The run is partial because one publisher timed out.
- Real events in data/seed/signals.json: Travel Food Services new CHRO (HR Katha, T2, 6 Oct 2026), scored 8 Hot; Thyrocare new lab in Madurai (ETHealthworld, T2, 9 Oct 2026), scored 4. Every other account is Cold, which is the honest result for the window.
- G3 now also catches price-target, buy-recommendation and stocks-in-focus headlines (real examples from this run, added to the tests).


### 2026-10-12 03:31 IST, Claude Code (claude-opus-5-5)
- Real emails sent through Resend to ARJUN_EMAIL with scripts/send-test-emails.mts: Hot List (1 account: Travel Food Services, Hot 8, HR Katha source, CHRO as contact, angle from product facts) and the morning brief (4 sections, demo items tagged). Send keys hotlist:2026-10-12 and brief:2026-10-12. Rendered copies checked: no em or en dashes.


### 2026-10-12 03:36 IST, Claude Code (claude-opus-5-5)
- Browser checks (puppeteer-core on local Chrome, dev server with seed): light theme full page; Regenerate (Curious) produced a Gemini draft citing HR Katha with one question and no pitch; theme toggle persisted to localStorage with no header height change; no console errors.
- Redeployed with seed signals. Called the production ingest cron with the bearer: status ok, 631 discovered, 174 fetched, 7 Gemini calls, 1 event, HubSpot sync partial (email scope) with 10 companies, 10 deals, 22 tasks and 22 activities synced, sm_ pushed. Took 3 min 38 s (under the 300 s limit).
- Did not trigger the production morning cron, to avoid a duplicate email (the in-memory send lock does not persist).
- Status and next steps rewritten above.

### 2026-10-12 03:38 IST, Claude Code (claude-opus-5-5): handoff check
Re-read only CLAUDE.md, AGENTS.md and this file, then answered:
- What is the project: an exam build of a B2B account signal monitor for Arjun (Keka-style HRMS sales). It watches 50 Indian companies, scores verified trigger events 1 to 10 in code, emails a Hot List on Mon and Thu and a daily brief, and never writes Arjun-owned columns.
- What is done: all phases built and tested (72 tests), deployed to the Vercel URL, real seed signals, real emails, HubSpot Enterprise Leads pipeline and sync, docs.
- What is next: the ordered list under "Next steps" (keys, migrate, seed, create user, CI push, Vercel git link, sign-in test).
- How to run: `npm install`, `.env.local` from `.env.example`, `npm test`, `npm run dev` (or with SM_DEV_USER locally), scripts listed under "How to run".
- Result: all four questions were answerable from the three files. Gaps found on re-reading and fixed: the architecture line still named Google News as primary (now Bing); the CRM-owned list lacked hubspot_deal_id; the script command in CLAUDE.md and AGENTS.md lacked --conditions=react-server (needed by scripts that import server-only modules); the "How to run" list gained the seed builder, bootstrap, test-email and dev sign-in commands.

### 2026-10-12 09:59 IST, Claude Code (claude-opus-5-5)
- Received the Supabase secret key: saved to .env.local and to Vercel as a sensitive, server-only variable.
- Ran scripts/create-user.mts: Arjun's user was created with a confirmed email and a generated passcode (kept only in .env.local; given to the user in chat).
- Live check with headless Chrome on the production URL: / redirects to /login; sign-in lands on the dashboard (Travel Food Services first); sign-out returns to /login, and revisiting / stays there. No console errors.
- Still missing: the database password for DATABASE_URL.

### 2026-10-12 10:16 IST, Claude Code (claude-opus-5-5)
- Database password received. Found the pooler region by probing (aws-0-ap-northeast-1, confirmed by the user's screenshot). DATABASE_URL set in .env.local and in Vercel (sensitive).
- scripts/migrate.mjs applied 0001 and 0002; scripts/seed.mts loaded 50 accounts with signals and demo CRM.
- Checked on Supabase: an update with no writer is rejected; a system write to notes is rejected; anonymous REST read of accounts gets permission denied.
- HubSpot sync on the real DB: 10 deals mapped (Updater and Krsnaa Closed Won, so customers). Found 8 duplicate activity rows: demo emails stored in HubSpot as "Email:" notes (email scope missing) did not match the seed emails. Fixed the sync matching rule, removed the 8 rows, re-synced: 22 of 22 activities linked, none duplicated.
- Redeployed: health shows database postgres. A live ingest wrote to Supabase but took 4 min 47 s and stopped at the time budget, because functions ran in iad1 and the DB is in Tokyo. Pinned functions to hnd1 (B06).
- `vercel git connect` now succeeds (the user installed the Vercel GitHub App). Pushes to main deploy the original project.

### 2026-10-12 10:22 IST, Claude Code (claude-opus-5-5)
- The push auto-deployed the original Vercel project from GitHub main (deploy Ready in 22 s).
- Live ingest from hnd1: status ok, 3 min 38 s (it was 4 min 47 s and partial from iad1). 644 discovered, 120 fetched, 3 Gemini calls, HubSpot sync partial (email scope only).


### 2026-10-12 13:41 IST, Claude Code (claude-opus-5-5)
- The user asked for: finishing the leftovers, an open test build, and at least 10 companies with current signals; brand file and rubric to follow.
- Deleted the duplicate Vercel project keka-b2b-signal-monitor (the user asked to complete what's left; the duplicate would have run the crons twice).
- No Hot lead on live: Travel Food Services decayed from 7.56 to 7.48 raw, which rounds to 7 (Warm), as designed by D03. Of 333 G1 rejections, sampled ones were genuinely off-topic (Bing noise), so the gates are correct; the account list simply has few fresh triggers.
- Started research on companies with verified triggers in the last 14 days (data/research/fresh-signals.json).
- Test build (B07): SM_TEST_MODE env, /api/test-login (server signs in as the demo user), login page note and prefilled email, TEST BUILD badge in the header and on login. SM_TEST_MODE and ARJUN_PASSWORD set in Vercel (password as sensitive). Tests: test-login refused when the flag is off. 74 tests pass.

### 2026-10-12 13:46 IST, Claude Code (claude-opus-5-5)
- The user asked for a daily Hot List with follow-ups, a why-now note, supporting articles, and a HubSpot brief per account (B08).
- New src/lib/hotlist.ts: daily window (since the last send, minimum 1 day, 3 days for the first send); sections new, updates (articles fetched after the previous send) and still on the list; crmBrief() (stage line including deal won or lost, last touch, days since, activities in 15 days, in contact since, open tasks, HubSpot link, DEMO flag); whyNowPrompt in prompts.ts (verified fields only); sends.account_ids now recorded.
- Fixed: ingest now stamps signals.fetched_at with the run time rather than the database clock (found by the new day-2 test).
- Templates: new item layout with articles and the HubSpot box, an Updates section and a still-on-the-list section.
- Tests: daily window, day-2 still-hot then update on a continuation article, CRM brief, daily send. 76 of 76 pass.
- BSE announcements API probed for T1 filings: Access Denied (Akamai), so it is not used.
- Docs: README, VIVA Q6, AGENTS, map v2, run log page text updated; B08 recorded.


### 2026-10-12 13:58 IST, Claude Code (claude-opus-5-5)
- The user asked for all companies to live in Arjun's HubSpot (the app pulls companies from HubSpot) and for richer CRM history.
- Demo history: 21 more [DEMO] activities in data/seed/demo-crm.json (last 15 days for the active accounts; Gokaldas first engaged about 185 days ago). scripts/sync-demo-crm.mts adds missing demo tasks and activities to existing accounts (tasks and activities tables only).
- Bootstrap now creates every account in HubSpot: active accounts with deals, watchlist accounts as leads with no deal. HubSpot has 63 companies owned by Arjun; sync linked 43 activities and 22 tasks.
- Fresh-trigger research (data/research/fresh-signals.json, 15 companies, events 29 Sep to 12 Oct, T2 sources). scripts/ingest-urls.mts added them insert-only and ran each article through the same fetch, gates, Gemini and validators: 15 events accepted; LaLiT rejected by V6, Kinder no_trigger, one fetch 403. Merged a duplicate Yatharth account created by a name spelling difference.
- Result on production: 16 accounts with verified events, 10 scoring 5 or more (Zetwerk and BMW Industries Hot 8; Carlsberg India, Travel Food Services, Himadri, SJS, Yatharth, Suzlon, PN Gadgil and Regency Warm). New companies created in HubSpot as leads.
- scripts/export-seed.mts wrote data/seed/accounts.json (64) and signals.json (45 signals, 17 events) from production, so the seed fallback matches.


### 2026-10-12 14:24 IST, Claude Code (claude-opus-5-5)
- Grading rubric received (build 60: components map 10, working Vercel link 10, design 10, backend and build quality 25, demo video 5; viva 40; due end of 12 Oct; Hard track fits).
- Brand (B09): Keka colours read from keka.com HTML and CSS; tokens updated in globals.css and in the email templates; contrast checked (lowest 5.25:1).
- docs/DEMO.md rewritten as a 2.5 minute video script for today's features.
- scripts/send-preview.mts: sends a [Preview] Hot List from the production DB without touching the send lock. Sent: 10 accounts (Zetwerk 8, BMW Industries 8, Carlsberg 7, Himadri 7, Travel Food Services 7, SJS 6, PN Gadgil, Suzlon, Regency, Yatharth 5). Today's real send was already made at 13:40 IST by a Run now.


### 2026-10-12 14:36 IST, Claude Code (claude-opus-5-5)
- The user said the left list was too long and asked for a scroll bar. The list card now scrolls internally (pinned beside the details on desktop, capped at 60% of the viewport height on phones). Added a search box, a 'With signals' default filter plus 'All', a 'Showing N of M' line, and an always-visible brand-coloured scrollbar (.sm-scroll).


### 2026-10-12 15:05 IST, Claude Code (claude-opus-5-5)
- Churn example: Carlsberg India (real Oct 12 OPERATIONAL_CHALLENGE, ETRetail: Alwar brewery shut order) and Himadri (real CAPACITY_EXPANSION) made DEMO customers by creating Closed Won deals in HubSpot (scripts/hubspot-demo-deals.mts) plus demo history (demo-crm.json, sync-demo-crm). The sync pulled them as customers; the scorer set Carlsberg to churn_risk and Himadri to expansion; the code workflow created the HubSpot task 'Retention check-in, signal detected' for Carlsberg (one per event_key).
- Research on publicly named Keka customers with risk signals is running in the background.
- gh workflow scope granted by the user; pushing .github/workflows/ci.yml.


### 2026-10-12 15:15 IST, Claude Code (claude-opus-5-5)
- CI green on GitHub (run 38230879125): Anthropic check, secret scan, context check, typecheck, tests, Gemini eval.
- B10: VENDOR_PARTNERSHIP trigger type (config, prompt enum, lane rules, Detail label, test). 77 tests pass.
- Research data/research/keka-customers.json: 8 companies named as Keka customers on keka.com customer stories; no public risk signal in the 14-day window (honest result). Added as active customer accounts with demo Closed Won deals, renewals and history in HubSpot (sm_demo). 12 customers in total: Carlsberg churn_risk (retention task in HubSpot), Himadri expansion, 4 re-engage, the rest healthy.
- HubSpot is the source of truth for renewal dates: hubspot-demo-deals.mts now fills a missing sm_renewal_date.
- Seed re-exported from production.


### 2026-10-12 15:22 IST, Claude Code (claude-opus-5-5)
- Login (B11): passcode field removed in open-access mode; TEST BUILD badge removed from the header and login page.
- ICP (B12): from Keka's 77 customer stories (keka.com sitemap) the ICP is Indian SMB and mid-market, about 50 to 3,000 employees, tech and services plus multi-location manufacturing, retail, D2C and healthcare. Our 73 accounts: 12 with 50 to 1,000 employees, 37 with 1,001 to 5,000, 23 above 5,000, 1 unknown. Added the above_icp_size flag and an 'Above ICP size' tag (list and detail) plus a test. 78 tests pass.
- Neos Kosmos Technologies (Mesa School of Business): the user stated it is a Keka customer (first-hand; not in Keka's public stories). Created in HubSpot as a customer with a demo Closed Won deal and a note; the sync picked it up automatically as a new account. Headcount left unknown (not cited).
- Components Map v2 refreshed (Bing, 9 trigger types, open login, daily Hot List with HubSpot brief, 73 HubSpot companies, churn task, CI).


### 2026-10-12 15:49 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Segments (B13), from the user's Keka definition: SMB under 100, MM 100 to 500, ENT 500+. Fit: ENT 500 to 5,000 scores 1.0, above 5,000 tapers to 0.7, MM 0.6, SMB 0.3. SegmentTag (SMB, MM, ENT) on every account in the list and detail; MM and SMB say to route to that team. Removed the earlier 'Above ICP size' flag (B12 replaced). Production rescored: 66 ENT, 6 MM; Zetwerk Hot 8, 9 Warm.
- Secrets: audited every value in .env.local against the full git history, all tracked files and the live site's JS: none found (only the publishable Supabase key is public by design). Removed SUPABASE_SERVICE_ROLE_KEY from Vercel (not used at runtime; local only). GitHub secrets hold only GEMINI_API_KEY for CI. README has a 'Secrets: where each key lives' section.
- Handoff: docs/CHANGELOG.md generated from git (when IST, who, what) by scripts/changelog.mjs (npm run changelog). The read-first and update instruction is in README, CHANGELOG, PROJECT_CONTEXT, CLAUDE.md and AGENTS.md. Session-log entries now name who made the change. Commits now carry a Co-Authored-By trailer.
- VIVA: added Q13 (ICP and segments) and Q14 (key protection). 78 tests pass.

### 2026-10-12 19:02 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Added docs/AUTOMATION_BRIEF.md in the Mesa case format the user shared (Case 01 answer key): Why (pain, user, outcome), Journey Today, Nine Checks (kill switches 01 to 03, sizing 04, 05, 08, boundary 06, 07, 09) with evidence from the brief and from measured system data, and The Cut: 07 Judgment Protected (no auto-send of outreach, D12). The baseline for trigger-to-outreach time is not in the brief, so the doc says to measure it rather than assuming it. Linked from the README.


### 2026-10-12 20:06 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- The user asked for account context and history, but only what holds up in the viva. Plan: verified 90-day signal history (context, not scored), a score trend from the audit log, a signal-history line in HubSpot. No more invented CRM history.
- History mode (processArticle historyDays): same gates and validators with a 90-day window; items older than 14 days are stored as gate_result 'history' with no event and no points. Stale-only rows get a proper look in this mode. bingNewsUrl({history}) drops the one-month interval. scripts/build-history.mts. Test: a 40-day-old verified article is g2_stale normally and 'history' in history mode, with no event. 79 tests pass.


### 2026-10-12 20:08 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Dashboard: 'Score over time' (ScoreTrend.tsx, single-series SVG line, thresholds as reference lines, hover tooltip, table view) computed in dashboard-data.ts from verified events with the real scorer, plus a projection note ('drops from Hot to Warm around ...'). 'Earlier signals (90 days)' section tagged 'Context, not scored'. B14.
- HubSpot: sm_signal_history (textarea) company property; the sync pushes each account's last 5 verified signals (date, summary, publisher, with ', context' for history items).
- 79 tests pass. The history build is running on production.


### 2026-10-12 20:22 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- History build finished: 250 fetched, 32 extracted, 6 new fresh events, 1 verified history item (Kaynes Technology PCB facility, ET, 21 Sep). History is sparse because Bing's undated feed mostly returns recent news; reported as is.
- New fresh events: Suzlon (3 blade plants, 550 crore), Himadri (2,000 crore plan), Carlsberg (second outlet on the Alwar shutdown), Varmora Granito (IPO; a Keka customer, so expansion lane).
- Bootstrap created sm_signal_history in HubSpot and pushed it for 73 companies. Rescore and sync: 4 Hot (Zetwerk 10, Himadri 9, Carlsberg 8, Suzlon 8), 6 Warm; one more retention task created.
- Seed re-exported (73 accounts, 76 signals, 21 events).


### 2026-10-12 20:30 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Live check of Carlsberg showed the score chart and churn lane working, but also a bug: the same story from two outlets on 11 Oct (Sunday, ISO week 41) and 12 Oct (Monday, week 42) became two events, which also created two retention tasks.
- Fix: upsertEvent now merges into an existing event of the same account, type and subject within 7 days, as well as an exact event_key match. Test: 'the same story on Sunday and Monday (two ISO weeks) is one event'. 80 tests pass.
- Repair: scripts/merge-duplicate-events.mts merged 3 duplicates in production (Himadri, Carlsberg, Suzlon), deleted the extra Carlsberg retention task in HubSpot and the DB, and rescored. Seed re-exported.


### 2026-10-12 20:52 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Removed docs/VIVA.md from the repo at the user's request, along with its references in the README and the checklist.


### 2026-10-12 21:04 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- The user asked for GSAP animations and suggested 21st.dev. Added gsap and @gsap/react; src/lib/motion.ts (reduced-motion guard, countUp). Animations in Dashboard (stat cards, count-up, list cascade on filter or search), Detail (sections, score pop, why-chips) and ScoreTrend (line draws, projection fades in). Spotlight hover card (21st.dev pattern) rebuilt in CSS on the stat cards. B15. Build clean, 80 tests pass.


### 2026-10-12 21:20 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- The Git-triggered Vercel deploy of the GSAP commit failed with 'Git information retrieval failed' (Vercel-side, git_info_fail); the previous version stayed live. Redeployed the same commit with the CLI: Ready.
- Live check, headless Chrome, with reduce-motion off and on: CLS 0, count-ups end on the right values (4 Hot, 6 Warm, 63 Cold, 3 customer health), no element left hidden, no console errors.
- If a Git deploy shows Error with git_info_fail, run 'npx vercel deploy --prod' from main.


### 2026-10-13 12:03 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- Status check (13 Oct). Healthy: git in sync, CI green, 80 tests, live site on Postgres, 06:42 ingest ran (142 fetched, 3 events), write guard clean.
- Found: the 08:33 morning run was stuck at 'running' and hotlist:2026-10-13 at 'pending', so no email went out. Cause: the function timed out (maxDuration 120 s) while Gemini wrote the why-now and angle notes one account at a time; the killed function left its send lock pending. Also, the 06:42 ingest was 'partial' only because one publisher timed out, which wrongly made the email say 'data may be stale'.
- Fixes: morning maxDuration 300; Hot List notes built in parallel with a 20 s timeout per Gemini call and a template fallback (withTimeout in hotlist.ts, also used for brief prep notes); acquireSendLock takes over a lock left 'pending' for 15+ minutes (never a 'sent' one); startRun marks runs stuck at 'running' for 15+ minutes as failed (feeds the failed-twice alert); a publisher fetch error or timeout is now gated_out fetch_timeout or fetch_error, not a partial run. Tests: stale lock takeover, stuck run marked failed, publisher timeout is not partial. 83 tests pass.

### 2026-10-13 13:20 IST, by Claude Code (claude-opus-5-5) for Vishweshwar Gupta
- The fix (cf9ba8f) is live (Vercel deployment from GitHub, READY). Re-ran the morning job on production at 13:13 IST: it took over the stale hotlist lock from 08:33 and sent today's Hot List (10 new accounts) and brief. The stuck 08:33 run is now recorded as failed ('function was stopped').
- Local network was flaky during this session (git could not resolve github.com at times); pushes were retried with timeouts. Production was not affected.

