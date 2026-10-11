# CLAUDE.md

B2B Account Signal Monitor. Next.js 16 on Vercel, Supabase Postgres, Gemini Flash, Resend, HubSpot.

## Read first, every session
1. docs/PROJECT_CONTEXT.md (status, how to run, session log)
2. docs/DECISIONS.md (why things are the way they are)
3. docs/BUILD_CHECKLIST.md (done, partial, missing)
4. docs/BUILD_SPEC.md only when you need the exact requirement

## Workflow
- Start with `git pull --rebase origin main`.
- Small commits. After each one: `git pull --rebase origin main && git push origin main`. Never force push.
- Before every commit: `npm test` and `npx tsc --noEmit` must pass.
- Before every commit: update "Current status" and append to the session log in docs/PROJECT_CONTEXT.md. CI fails if src/, supabase/, config/ or scripts/ changed without it.
- Tag phase ends (phase-0-map, phase-1, phase-2, phase-3).
- Never commit secrets. .env* and .vercel are ignored. Docs name env vars, never values.

## Hard rules
- Never invent data. Every company fact, person, signal and quote needs a fetched source URL. Unverified means excluded.
- Product AI is Gemini Flash only, through src/lib/ai/gemini.ts. No Anthropic packages or imports in the product (CI checks /anthropic/i).
- Gemini extracts and writes text. Code validates and scores (D01).
- Never write Arjun-owned columns from system code. Use updateAccountSystemColumns, updateAccountCrmColumns or updateAccountUserColumns in src/lib/accounts-write.ts. The Postgres trigger sm_guard_accounts also blocks bad writes.
- Emails go only to ARJUN_EMAIL. Nothing is ever sent to prospects.
- No em dashes in product text or docs.
- Next.js 16 differs from older versions: read node_modules/next/dist/docs before using an unfamiliar API. Middleware is now proxy.ts.

## Commands
- `npm test`, `npx tsc --noEmit`, `npm run dev`, `npm run map -- v2`
- `npx tsx --conditions=react-server --env-file=.env.local scripts/<name>.mts` for scripts (the flag lets scripts import server-only modules)
