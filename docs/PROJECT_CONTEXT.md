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
9. Update the "Current status" block and append to the session log below before every commit.
10. No em dashes in product text or docs.

## What the project is
Arjun sells workforce management SaaS (reference product: Keka HRMS) to mid-market companies in India. This app watches about 50 accounts daily, finds verified trigger events in the news (new HR head, hiring drive, expansion and so on), scores each account from 1 to 10 with a full explanation, emails a Hot List every Monday and Thursday plus a daily morning brief, and never overwrites anything Arjun wrote.

## Current status (rewritten each session)
- Phase 0 done except deploy. CI added. Phase 1 core logic is written and tested (55 tests, write-safety included). Dashboard, auth, cron routes and API built and deployed to https://account-signal-monitor.vercel.app (CLI deploy; GitHub auto-deploy waits on the user connecting the repo in Vercel). Sign-in needs Arjun's user, which needs the Supabase secret key.
- Database: migration runs in PGlite (tests). Not yet applied to Supabase because DATABASE_URL and the Supabase secret key have not been provided.
- Research: the account and people research is running. The eval set (30 real articles) is done.
- HubSpot: Enterprise Leads pipeline live with 10 demo deals; daily sync built and run (partial only because email scope is missing).

## Architecture snapshot
- Next.js 16 App Router on Vercel. `proxy.ts` replaces middleware in Next 16. Cache Components is off (B02).
- Postgres on Supabase. Server code uses one SQL interface (src/lib/db.ts): `pg` with DATABASE_URL, or PGlite in tests and as a seed fallback (B04).
- Pipeline: src/lib/pipeline/news.ts (Google News RSS, URL decode, robots, throttle) to gates.ts (G1 to G6) to ai/gemini.ts (extract) to validators.ts (V1 to V7) to ingest.ts (store and cluster) to rescore.ts to scoring.ts.
- Morning job: src/lib/morning.ts (Hot List Mon and Thu, brief daily, send lock), email in src/lib/email/.
- Config: config/sources.json (tiers), config/scoring.json (weights), config/product-facts.json (only claims allowed in angles).

## Data ownership rules (D02)
- Arjun-owned: notes, last_contacted_at, relationship_read, my_draft, snoozed_until, draft_accepted_at, notes_is_demo.
- CRM-owned: is_active, hubspot_company_id, stage, is_customer, renewal_date, owner_email, crm_is_demo. Written only by the HubSpot sync or the demo seed.
- System-owned: profile fields and score, band, confidence, lane, flags, top_signal_*, last_signal_at, score_breakdown, system_draft, draft_tone, scored_at.
- Enforced three ways: src/lib/cols.ts plus src/lib/accounts-write.ts (throws), the Postgres trigger sm_guard_accounts (reads app.writer), and tests.

## Integrations (env var names only)
| Integration | Env vars | Connected |
|---|---|---|
| Gemini | GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.8-flash), GEMINI_DAILY_CALL_CAP | Yes, smoke tested |
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL | Partial: URL and publishable key only |
| Resend | RESEND_API_KEY, RESEND_FROM, ARJUN_EMAIL | Key present, not tested |
| HubSpot | HUBSPOT_PRIVATE_APP_TOKEN | Yes, owners API checked |
| Cron | CRON_SECRET | Generated locally, not deployed |
| Other | COMPANY_NAME, TEAM_NAME, USER_NAME, MAX_ARTICLES_PER_RUN, APP_URL | |

## How to run
- Install: `npm install`
- Test: `npm test` (Vitest, uses PGlite, no network)
- Typecheck: `npx tsc --noEmit`
- Dev: `npm run dev` (without DATABASE_URL it runs on an in-memory seeded PGlite)
- Migrate: `node scripts/migrate.mjs` (needs DATABASE_URL) (to be added)
- Seed: `npx tsx --env-file=.env.local scripts/seed.mts` (to be added)
- Map: `npm run map -- v1`
- Deploy: push to main; Vercel deploys from GitHub (to be linked)

## Real vs demo data
- Real: accounts, headcounts (with source URL and date), people (with source URL), signals and events (from fetched articles), eval set.
- Demo (flagged in DB and badged in UI): stages, notes, last-contact dates, tasks, activities, meetings, renewal dates, customer status, HubSpot deals.

## Open issues
- Need from the user: Supabase secret key (service role), DATABASE_URL, confirmation that ARJUN_EMAIL equals the Resend account email.
- Anthropic's crawler is blocked by several Indian outlets, so the research tools cannot read them. The app's own fetcher can, so seed signals will come from the app's pipeline.

## Next steps (ordered)
1. Write-safety test with PGlite; CI with Anthropic check and secret scan; .env.example.
2. Cron routes, auth (proxy.ts), dashboard, run log page, health endpoint.
3. Seed files from research; seed signals by running the live pipeline; demo CRM.
4. Vercel link and deploy; Supabase migrate once DATABASE_URL arrives.
5. HubSpot Enterprise Leads pipeline, properties, deals, sync, tests.
6. Docs: README, VIVA, DEMO, hubspot-workflow, map v2.

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

