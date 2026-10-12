# Changelog

> **Read this first if you are changing this project (person or AI).** This repo carries its own build context: docs/PROJECT_CONTEXT.md (status, how to run, session log), docs/DECISIONS.md and docs/BUILD_CHECKLIST.md. Whatever you change, update docs/PROJECT_CONTEXT.md (status and a session-log entry with date, time IST, who, what and why) and regenerate this file with `npm run changelog` before committing. Push after every commit so GitHub always matches.

Every commit, oldest first. Times are IST. "Claude Code for X" means the commit was made by Claude Code (an AI coding agent, model claude-opus-5-5) working in a session run by X.

| When (IST) | By | Commit | What changed |
|---|---|---|---|
| 12 Oct 2026, 02:25 | Claude Code for Vishweshwar-Mesa | `a3474cb` | Phase 0: decisions D01-D14 and Components Map v1 (before any app code) |
| 12 Oct 2026, 02:32 | Claude Code for Vishweshwar-Mesa | `da06859` | Scaffold Next.js 16, config, schema with column-guard trigger, guarded writes, scorer with scenario tests |
| 12 Oct 2026, 02:36 | Claude Code for Vishweshwar-Mesa | `153e5c6` | Gates G1-G6, validators V1-V7, clustering keys, Gemini wrapper and prompts, news discovery with Google News URL decoding |
| 12 Oct 2026, 02:40 | Claude Code for Vishweshwar-Mesa | `d53b8c4` | Ingest pipeline, rescore, run log, seed loader, morning job (Hot List, brief, send lock), email templates, eval set (30 real articles) |
| 12 Oct 2026, 02:43 | Claude Code for Vishweshwar-Mesa | `503eee3` | Step 0 handoff docs: BUILD_SPEC (verbatim), BUILD_CHECKLIST, PROJECT_CONTEXT, CLAUDE.md, AGENTS.md |
| 12 Oct 2026, 02:49 | Claude Code for Vishweshwar-Mesa | `0d371cb` | Write-safety and pipeline/morning integration tests, CI (Anthropic check, secret scan, context check, eval), eval runner, .env.example |
| 12 Oct 2026, 02:55 | Claude Code for Vishweshwar-Mesa | `3d4049f` | Auth proxy, cron/run/health/edit API routes, dashboard UI with detail panel, run log, login, theme, migration 0002 for deal pipeline |
| 12 Oct 2026, 02:58 | Claude Code for Vishweshwar-Mesa | `a163bf2` | Deploy to Vercel; record deploy checks in context log |
| 12 Oct 2026, 03:04 | Claude Code for Vishweshwar-Mesa | `3a2a7dc` | HubSpot: Enterprise Leads pipeline with fallbacks, sm_ properties, CRM-only sync, tasks both ways, retention tasks; mocked-API tests; seed accounts and demo CRM |
| 12 Oct 2026, 03:11 | Claude Code for Vishweshwar-Mesa | `65e5d5f` | HubSpot bootstrap on real portal: Enterprise Leads pipeline, demo companies, deals, tasks, activities; scope-tolerant activity sync; portal links |
| 12 Oct 2026, 03:13 | Claude Code for Vishweshwar-Mesa | `7a2f9c6` | Docs: README, VIVA, DEMO, hubspot-workflow, components map v2; migrate, seed and create-user scripts |
| 12 Oct 2026, 03:13 | Claude Code for Vishweshwar-Mesa | `2da320d` | Use escapes for dash characters in dash-stripping regexes |
| 12 Oct 2026, 03:13 | Claude Code for Vishweshwar-Mesa | `0dbc9ba` | Correct session log times to match commit timestamps |
| 12 Oct 2026, 03:14 | Claude Code for Vishweshwar-Mesa | `8b4bd7a` | Auth and cron route tests; dev-only sign-in shortcut for local UI checks |
| 12 Oct 2026, 03:16 | Claude Code for Vishweshwar-Mesa | `b5e87bb` | Fix date-only columns rendering as 2001; verified 390px layout and no console errors |
| 12 Oct 2026, 03:17 | Claude Code for Vishweshwar-Mesa | `e2a94d4` | Update build checklist to verified state |
| 12 Oct 2026, 03:20 | Claude Code for Vishweshwar-Mesa | `7a3663a` | Discovery: Bing News RSS primary with direct publisher URLs, Google News behind a circuit breaker; newest-first processing |
| 12 Oct 2026, 03:29 | Claude Code for Vishweshwar-Mesa | `58df61c` | Real seed signals from live pipeline (Bing with date filter); BW People in T2; G3 catches stock-tip headlines |
| 12 Oct 2026, 03:31 | Claude Code for Vishweshwar-Mesa | `f112788` | Script to send test Hot List and brief; real sends verified |
| 12 Oct 2026, 03:38 | Claude Code for Vishweshwar-Mesa | `c77bb80` | Final status, handoff check with fixes, checklist update |
| 12 Oct 2026, 09:59 | Claude Code for Vishweshwar-Mesa | `1021b4d` | Supabase Auth live: Arjun user created, live sign-in and sign-out verified |
| 12 Oct 2026, 10:17 | Claude Code for Vishweshwar-Mesa | `2580898` | Connect Supabase Postgres, pin functions to Tokyo next to the DB, fix email-note activity matching |
| 12 Oct 2026, 10:22 | Claude Code for Vishweshwar-Mesa | `9234057` | Log auto-deploy and Tokyo-region ingest timing |
| 12 Oct 2026, 13:41 | Claude Code for Vishweshwar-Mesa | `23ef666` | Test build mode: any passcode signs in as the demo user, TEST BUILD badge; remove duplicate Vercel project |
| 12 Oct 2026, 13:46 | Claude Code for Vishweshwar-Mesa | `5067375` | Daily Hot List with updates, why-now, supporting articles and HubSpot brief per account (B08) |
| 12 Oct 2026, 13:58 | Claude Code for Vishweshwar-Mesa | `1b9163a` | All accounts in HubSpot, richer demo CRM history, 15 fresh-trigger companies verified through the pipeline, seed export |
| 12 Oct 2026, 14:24 | Claude Code for Vishweshwar-Mesa | `f2bc82d` | Keka brand colours from keka.com, demo video script, preview Hot List script |
| 12 Oct 2026, 14:36 | Claude Code for Vishweshwar-Mesa | `3bb8e4a` | Account list: internal scroll with visible scrollbar, sticky card, search, With signals filter |
| 12 Oct 2026, 14:43 | Claude Code for Vishweshwar-Mesa | `024396d` | Detail: show 'Lead, no deal yet' for HubSpot companies without a deal |
| 12 Oct 2026, 15:05 | Claude Code for Vishweshwar-Mesa | `9c85ba2` | CI workflow (Anthropic check, secret scan, context check, typecheck, tests, Gemini eval); churn and expansion demo customers via HubSpot |
| 12 Oct 2026, 15:15 | Claude Code for Vishweshwar-Mesa | `eaec639` | VENDOR_PARTNERSHIP trigger; 8 publicly named Keka customers as monitored accounts; churn and expansion examples via HubSpot; seed export |
| 12 Oct 2026, 15:22 | Claude Code for Vishweshwar-Mesa | `7c5521f` | Open-access login without badge, Above ICP size flag, Mesa customer via HubSpot, components map v2 refresh |
| 12 Oct 2026, 15:50 | Claude Code for Vishweshwar-Mesa | `1d3a1ab` | Keka segments (SMB, MM, ENT) in fit and tags; secrets audit and least privilege; dated changelog with authorship; handoff instructions |
| 12 Oct 2026, 19:02 | Claude Code for Vishweshwar-Mesa | `dcc3eb1` | Automation brief with nine checks and the cut (Mesa case format) |
| 12 Oct 2026, 20:06 | Claude Code for Vishweshwar-Mesa | `b381d54` | History mode: 90-day verified signal history stored as context, never scored |
| 12 Oct 2026, 20:08 | Claude Code for Vishweshwar-Mesa | `4cc78a1` | Score over time chart (computed from verified events), earlier-signals history section, HubSpot signal history property |
| 12 Oct 2026, 20:22 | Claude Code for Vishweshwar-Mesa | `d611daa` | History run results, HubSpot signal history pushed, seed export |
