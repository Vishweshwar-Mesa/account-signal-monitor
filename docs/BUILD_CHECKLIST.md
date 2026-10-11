# Build checklist

Status against docs/BUILD_SPEC.md. DONE means it was run and checked, not just written. Update this file whenever an item changes.
Last verified: 2026-10-12 02:45 IST (35 of 35 Vitest tests passing, `tsc --noEmit` clean).

## Phase 0
| Item | Status | Proof |
|---|---|---|
| DECISIONS.md D01 to D14 | DONE | docs/DECISIONS.md, commit a3474cb |
| Components Map v1 (SVG and PNG) committed before app code | DONE | commit a3474cb holds only docs and the map script; app scaffold came in da06859 |
| Scaffold (Next.js 16, TS, Tailwind) | DONE | da06859 |
| GitHub repo, public | DONE | github.com/Vishweshwar-Mesa/account-signal-monitor |
| CI (GitHub Actions) | MISSING | |
| Env template (.env.example) | MISSING | |
| Deploy hello page to Vercel | MISSING | |

## Phase 1
| Item | Status | Proof |
|---|---|---|
| Schema, RLS, column-guard trigger | PARTIAL | supabase/migrations/0001_schema.sql; runs in PGlite; not yet applied to Supabase (DATABASE_URL missing) |
| Guarded writes (three functions, audit) | DONE | src/lib/accounts-write.ts |
| Write-safety test (section 6) | MISSING | |
| Seed data: accounts and people (research) | PARTIAL | research agent running; data/seed/accounts.json not yet written |
| Seed data: real signals via same gates | MISSING | |
| Seed data: demo CRM | MISSING | |
| Ingest pipeline (discovery, gates, Gemini, validators, clustering) | PARTIAL | src/lib/pipeline/*; smoke tested Gemini and Google News decode; no fixture run yet |
| Scoring with decay, hot gate, rumour cap, lanes | DONE | src/lib/scoring.ts, tests/scoring.test.ts |
| Hot List email with send lock | PARTIAL | src/lib/morning.ts, src/lib/email/*; not tested, not sent |
| Dashboard with detail panel | MISSING | |
| Sign in and sign out (Supabase Auth) | MISSING | needs Supabase secret key to create Arjun's user |
| Theme toggle, no flash | MISSING | |
| Cron routes with bearer check, vercel.json | MISSING | |
| Deploy | MISSING | |

## Phase 2
| Item | Status | Proof |
|---|---|---|
| HubSpot company properties (sm_) | MISSING | |
| HubSpot "Enterprise Leads" deal pipeline and demo deals | MISSING | token works (owners API checked) |
| HubSpot sync (CRM_COLS only, push sm_) | MISSING | src/lib/hubspot/sync.ts is a stub |
| Demo tasks and activities linked both ways | MISSING | |
| Churn-risk task or workflow, docs/hubspot-workflow.md | MISSING | |
| Morning brief | PARTIAL | src/lib/morning.ts |
| Why this rating panel | PARTIAL | breakdown data done in scoring.ts; UI missing |
| Run log page and Run now | MISSING | |

## Phase 3
| Item | Status | Proof |
|---|---|---|
| People layer with Remove control | PARTIAL | schema and seed loader; UI missing |
| Soft-touch drafts with tones | PARTIAL | prompt in src/lib/ai/prompts.ts; route and UI missing |
| Activity-based scoring | DONE | activityPoints in src/lib/scoring.ts |
| Re-engagement flag | DONE | lane re_engage and flag no_contact_30d, tested |
| Competitor-mention boost | DONE | src/lib/scoring.ts |

## Guardrails
| Item | Status | Proof |
|---|---|---|
| R1 sources, verbatim quotes | PARTIAL | gates and V1 tested; UI not built |
| R2 AI rules (Gemini only, temp 0, schema, retry, prompts file) | DONE | src/lib/ai/gemini.ts, src/lib/ai/prompts.ts |
| R3 writes | PARTIAL | code and trigger done; test missing |
| R4 security headers, auth, cron secret | PARTIAL | headers in next.config.ts; auth and cron missing |
| R5 reliability (send lock, partial runs, backoff, caps, alert) | PARTIAL | code written; untested |
| R6 email only to ARJUN_EMAIL | PARTIAL | enforced in src/lib/email/send.ts; untested |
| R7 people and privacy | PARTIAL | no README note yet |
| R8 demo labelling | PARTIAL | DB flags present; UI missing |
| R9 robots, throttle, short quotes | DONE | src/lib/pipeline/news.ts, trimQuote |
| R10 explainability | PARTIAL | breakdown stored; UI missing |
| R11 no auto-send | DONE | no prospect-sending code exists |
| R12 estimates labelled | PARTIAL | schema flag; UI missing |

## Tests and evals
| Item | Status | Proof |
|---|---|---|
| Gates, validators, clustering, decay, scenarios, bands, lanes | DONE | tests/*.test.ts |
| Hot List window, eligibility, no padding, empty note, send lock | MISSING | |
| Integration: pipeline on fixtures, HubSpot mocked, cron bearer, unauth blocked | MISSING | |
| Anthropic-dependency CI check | MISSING | |
| Eval set eval/articles.jsonl | DONE | 30 cases, eval/README.md |
| Eval runner in CI | MISSING | |

## Docs
| Item | Status | Proof |
|---|---|---|
| BUILD_SPEC, BUILD_CHECKLIST, PROJECT_CONTEXT, CLAUDE.md, AGENTS.md | DONE | this commit |
| README, VIVA, DEMO, hubspot-workflow, COMPONENTS-MAP, map v2 | MISSING | |
