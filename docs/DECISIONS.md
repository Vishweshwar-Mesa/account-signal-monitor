# Decisions

Each decision is recorded as written in the build brief, with a one-line reason and the alternative we rejected.

| ID | Decision | Why | Alternative rejected |
|----|----------|-----|----------------------|
| D01 | Gemini extracts facts into a fixed JSON schema. Code validates and scores. Gemini never decides a score or a band. | Scores must be repeatable, testable and explainable line by line. | Asking Gemini to rate each account 1 to 10 directly. |
| D02 | One accounts table, three column-owner groups: Arjun-owned, CRM-owned, system-owned. The system can only write system-owned columns. Enforced in code, in the database, and by test. | Arjun's notes are his work; one guarded table keeps one source of truth without ever overwriting them. | Separate tables per writer joined at read time. |
| D03 | Scores are recomputed from events on every run, with time decay. Quiet accounts fall automatically. Nothing is stored as a permanent "hot" flag. | A trigger loses value with time; recomputing removes stale "hot" accounts without manual cleanup. | A sticky hot flag cleared by hand. |
| D04 | Fit layer: account size, sector, frontline and multi-site share, India footprint. Size band peaks at 50 to 5,000 employees with a quiet taper above. Never state any "product breaks" reasoning anywhere. | Fit is a mild tiebreaker, not a filter, and must stay neutral in tone. | Hard exclusion of accounts outside the size band. |
| D05 | Relationship-aware reading. Prospects get outreach opportunities. Signed customers get an account-health lane: a buying-type signal at a customer is a churn risk (retention play), growth signals are expansion, no contact for 30+ days is re-engagement. | The same news means different things for a prospect and a customer. | One lane for every account regardless of stage. |
| D06 | Hot List window is "since the last send, minimum 3 days". This covers the Thursday to Monday gap that a fixed 3-day window would lose. The brief says last three days; this is a deliberate superset. | Thursday to Monday is 4 days; a fixed 3-day window drops Thursday's signals. | A fixed 3-day window. |
| D07 | LinkedIn posts are not scraped. Coverage of LinkedIn-type information comes through news and company pages only. | LinkedIn terms forbid scraping and it carries personal data risk. | Scraping LinkedIn posts or using a grey-market API. |
| D08 | HubSpot is in the build. If the token is missing or the API fails, the app runs on seed data and shows a banner. | The CRM link is part of the brief, but the demo must never depend on a third party being up. | Making HubSpot a hard dependency. |
| D09 | People are shown only from cited public sources, each with role, source URL and as-of date. No guessed emails or phones. "No verified contact found" is a valid result. | Guessed contacts are wrong often and raise privacy concerns (DPDP Act). | Email pattern guessing or enrichment tools. |
| D10 | Scheduling uses Vercel Cron, one ingest job and one morning job, daily. The morning job also sends the Hot List on Monday and Thursday. | Vercel Hobby allows daily cron jobs; two jobs keep ingest and send apart. | An external scheduler or a cron job per weekday. |
| D11 | Two different outputs: the Hot List "outreach angle" (one line, uses approved product facts only, per the brief) and the dashboard "soft-touch draft" (engagement only, no pitch, no product claims, per Arjun's preference). | The brief asks for an angle; Arjun wants first touches without a pitch. | One combined pitch email. |
| D12 | No auto-sending of anything to prospects, ever. Only emails to Arjun are automated. | A wrong automated email to a prospect is costly and cannot be undone. | Auto-sending drafts on a schedule. |
| D13 | Source tiers: T1 company site, filings, regulator, exchange announcements. T2 established business press and HR trade press, publication name always shown. Everything else is stored as context only and is never scored. | Scores must rest on sources Arjun would trust in front of a buyer. | Scoring any site the news feed returns. |
| D14 | Score scale is 1 to 10 (Hot 8 to 10, Warm 5 to 7, Cold 1 to 4) with a full explanation panel, not a bare number. | A small scale is easy to read; the panel shows exactly how the number was built. | A 0 to 100 score with no breakdown. |

## Build-time decisions (added during the build)

| ID | Decision | Why | Alternative rejected |
|----|----------|-----|----------------------|
| B01 | The Components Map is generated from a small script (scripts/render-map.mjs) into SVG, then PNG. | Same source for v1 and v2, easy to diff. | Drawing by hand in a GUI tool. |
