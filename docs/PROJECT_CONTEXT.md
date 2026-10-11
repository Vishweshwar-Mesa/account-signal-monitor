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
- Phase 0 done except CI and deploy. Phase 1 core logic is written and unit tested. Dashboard, auth, cron routes and deploy are not built yet.
- Database: migration runs in PGlite (tests). Not yet applied to Supabase because DATABASE_URL and the Supabase secret key have not been provided.
- Research: the account and people research is running. The eval set (30 real articles) is done.
- HubSpot: token works. Pipeline "Enterprise Leads" and sync are not built yet.

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

### 2026-10-12 02:20 to 02:45 IST, Claude Code (claude-opus-5-5)
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
