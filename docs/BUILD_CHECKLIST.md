# Build checklist

Status against docs/BUILD_SPEC.md. DONE means it was run and checked, not just written. Update this file whenever an item changes.
Last verified: 2026-10-12 03:20 IST (72 of 72 Vitest tests passing, `tsc --noEmit` clean, `next build` clean).

## Phase 0
| Item | Status | Proof |
|---|---|---|
| DECISIONS.md D01 to D14 | DONE | docs/DECISIONS.md, commit a3474cb |
| Components Map v1 (SVG and PNG) committed before app code | DONE | commit a3474cb holds only docs and the map script; app scaffold came in da06859 |
| Scaffold (Next.js 16, TS, Tailwind) | DONE | da06859 |
| GitHub repo, public | DONE | github.com/Vishweshwar-Mesa/account-signal-monitor |
| CI (GitHub Actions) | PARTIAL | .github/workflows/ci.yml written and its checks pass locally; not pushed because the gh token lacks the workflow scope |
| Env template (.env.example) | DONE | .env.example |
| Deploy hello page to Vercel | DONE | https://account-signal-monitor.vercel.app |

## Phase 1
| Item | Status | Proof |
|---|---|---|
| Schema, RLS, column-guard trigger | PARTIAL | migrations 0001 and 0002 run in PGlite in every test; not applied to Supabase until DATABASE_URL is provided (scripts/migrate.mjs ready) |
| Guarded writes (three functions, audit) | DONE | src/lib/accounts-write.ts |
| Write-safety test (section 6) | DONE | tests/write-safety.test.ts, 7 tests passing |
| Seed data: accounts and people (research) | DONE | data/seed/accounts.json, 50 accounts with cited headcount; 10 active with people |
| Seed data: real signals via same gates | DONE | data/seed/signals.json from the live pipeline: 2 events (Travel Food Services CHRO, Thyrocare lab) |
| Seed data: demo CRM | DONE | data/seed/demo-crm.json |
| Ingest pipeline (discovery, gates, Gemini, validators, clustering) | DONE | src/lib/pipeline/*; fixture run in tests/pipeline-morning.test.ts; live run via the seed builder |
| Scoring with decay, hot gate, rumour cap, lanes | DONE | src/lib/scoring.ts, tests/scoring.test.ts |
| Hot List email with send lock | DONE | real Hot List and brief sent via Resend (send keys hotlist:2026-10-12, brief:2026-10-12); lock tested |
| Dashboard with detail panel | DONE | src/components/Dashboard.tsx, Detail.tsx; screenshot-checked locally |
| Sign in and sign out (Supabase Auth) | PARTIAL | proxy, login page and sign-out built and tested for blocking; real sign-in needs Arjun user (Supabase secret key missing) |
| Theme toggle, no flash | DONE | pre-paint script in src/app/layout.tsx; fixed-width toggle; checked in headless Chrome |
| Cron routes with bearer check, vercel.json | DONE | tests/auth-routes.test.ts; 401 checked on the live URL |
| Deploy | DONE | https://account-signal-monitor.vercel.app (CLI deploy, env vars set) |

## Phase 2
| Item | Status | Proof |
|---|---|---|
| HubSpot company properties (sm_) | DONE | created on the portal by scripts/hubspot-bootstrap.mts |
| HubSpot "Enterprise Leads" deal pipeline and demo deals | DONE | real pipeline created (path enterprise_pipeline); 10 demo deals |
| HubSpot sync (CRM_COLS only, push sm_) | DONE | src/lib/hubspot/sync.ts; tests/hubspot.test.ts; live sync partial only for the email scope |
| Demo tasks and activities linked both ways | DONE | bootstrap links hubspot_id; checkbox writes back (tested with the fake API) |
| Churn-risk task or workflow, docs/hubspot-workflow.md | DONE | in code (workflows API 403); docs/hubspot-workflow.md |
| Morning brief | DONE | src/lib/morning.ts; tests; real send pending |
| Why this rating panel | DONE | Detail.tsx |
| Run log page and Run now | DONE | src/app/runs |

## Phase 3
| Item | Status | Proof |
|---|---|---|
| People layer with Remove control | DONE | Detail.tsx, /api/people/[id] |
| Soft-touch drafts with tones | DONE | src/lib/drafts.ts, /api/accounts/[id]/draft, Detail.tsx; regeneration test |
| Activity-based scoring | DONE | activityPoints in src/lib/scoring.ts |
| Re-engagement flag | DONE | lane re_engage and flag no_contact_30d, tested |
| Competitor-mention boost | DONE | src/lib/scoring.ts |

## Guardrails
| Item | Status | Proof |
|---|---|---|
| R1 sources, verbatim quotes | DONE | gates and V1 tests; publisher shown on every signal |
| R2 AI rules (Gemini only, temp 0, schema, retry, prompts file) | DONE | src/lib/ai/gemini.ts, src/lib/ai/prompts.ts |
| R3 writes | DONE | tests/write-safety.test.ts |
| R4 security headers, auth, cron secret | DONE | proxy, bearer, headers, RLS migration, only ARJUN_EMAIL allowed; tests/auth-routes.test.ts |
| R5 reliability (send lock, partial runs, backoff, caps, alert) | DONE | tests: idempotent ingest, partial runs, caps, send lock, lock release; alert on 2 failures in morning.ts |
| R6 email only to ARJUN_EMAIL | DONE | src/lib/email/send.ts; R6 test |
| R7 people and privacy | DONE | README DPDP note; Remove control; no guessed contacts |
| R8 demo labelling | DONE | DEMO badges in Detail.tsx; crm_is_demo, notes_is_demo, source; [DEMO] in HubSpot |
| R9 robots, throttle, short quotes | DONE | src/lib/pipeline/news.ts, trimQuote |
| R10 explainability | DONE | score_breakdown and the Why panel |
| R11 no auto-send | DONE | no prospect-sending code exists |
| R12 estimates labelled | DONE | UI shows "about" and "estimate, source"; all 50 counts are from filings (no estimates used) |

## Tests and evals
| Item | Status | Proof |
|---|---|---|
| Gates, validators, clustering, decay, scenarios, bands, lanes | DONE | tests/*.test.ts |
| Hot List window, eligibility, no padding, empty note, send lock | DONE | tests/pipeline-morning.test.ts |
| Integration: pipeline on fixtures, HubSpot mocked, cron bearer, unauth blocked | DONE | tests/pipeline-morning.test.ts, tests/hubspot.test.ts, tests/auth-routes.test.ts |
| Anthropic-dependency CI check | PARTIAL | scripts/check-no-anthropic.mjs passes locally; CI file not pushed (workflow scope) |
| Eval set eval/articles.jsonl | DONE | 30 cases, eval/README.md |
| Eval runner in CI | PARTIAL | scripts/eval.mts run locally: 86.7% type accuracy, 100% verbatim, injection ignored; CI not pushed |

## Docs
| Item | Status | Proof |
|---|---|---|
| BUILD_SPEC, BUILD_CHECKLIST, PROJECT_CONTEXT, CLAUDE.md, AGENTS.md | DONE | this commit |
| README, VIVA, DEMO, hubspot-workflow, COMPONENTS-MAP, map v2 | DONE | README.md, docs/VIVA.md, docs/DEMO.md, docs/hubspot-workflow.md, docs/COMPONENTS-MAP.md, components-map-v2 |
