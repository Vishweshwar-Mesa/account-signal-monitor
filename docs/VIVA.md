# Viva preparation

Short answers to the questions most likely to come up. Each one points to the file or test that proves it.

**1. Why does code decide the score and not the AI?**
Scores must be repeatable and explainable line by line (D01). Gemini reads one article and fills a fixed JSON schema: trigger type, quote, magnitude, certainty. Code then checks it (validators V1 to V7) and computes the score from config/scoring.json. Same events in, same score out. The "Why this rating" panel shows every contribution. See src/lib/scoring.ts and tests/scoring.test.ts.

**2. How can Arjun's notes never be overwritten?**
Three layers (D02).
- Code: the system can only call `updateAccountSystemColumns`, which throws for any column outside SYSTEM_COLS (src/lib/accounts-write.ts).
- Database: a BEFORE UPDATE trigger, `sm_guard_accounts`, reads `app.writer` and rejects any change to a column that writer does not own. An update with no writer set is rejected too (supabase/migrations/0001_schema.sql).
- Test: tests/write-safety.test.ts, "full ingest + scoring + morning job leave Arjun's four columns byte-identical". It also checks that a system write to notes throws in code, that the trigger blocks it when code is bypassed, and that regenerating a draft never changes my_draft.

**3. What happens when a source is wrong?**
- Only T1 and T2 sources are scored (D13). Everything else is stored as context.
- The quote must appear word for word in the article (V1), and Arjun can open the link himself.
- He can mark a signal "Wrong" (stored in feedback).
- A rumour scores x0.7 and can never make an account Hot. A wrong-company match fails G1 or V3.

**4. What happens when Gemini fails?**
- Retries with backoff on 429 and 5xx, and one retry on invalid JSON.
- If it still fails, the item is counted in the run log, the run is marked "partial" and the morning email says "Data may be stale". The other accounts carry on.
- A daily call cap (GEMINI_DAILY_CALL_CAP) stops runaway cost.
- See tests/pipeline-morning.test.ts, "a failing feed or Gemini marks the run partial".

**5. Why a 1 to 10 scale, and why the Hot gate?**
- A small scale is easy to read at a glance. Bands are Hot 8 to 10, Warm 5 to 7, Cold 1 to 4 (D14).
- The Hot gate stops fit, relationship and activity points from making an account Hot on their own. Hot needs a confirmed T1 or T2 event within 14 days worth 4 or more points; otherwise the score is capped at 7. Rumour-only accounts cap at 4.

**6. Why is the Hot List daily, and how does its window work?**
The brief asked for Monday and Thursday with a 3-day window (D06, D10). Arjun then asked for a daily list with follow-ups, so it changed (B08). Every morning the list has: new accounts (fresh T1 or T2 event, not on a list in the last 14 days), updates (accounts already sent that have an article found after the previous send) and a one-line "still on the list". The window runs from the previous send with a 1-day minimum (3 days for the first send), so a missed day is never lost. The send lock still allows one list per IST day. Tested in "Hot List window (B08, daily)" and "next day: an account already sent shows as an update only when a new article arrives".

**7. Why no LinkedIn scraping?**
LinkedIn's terms forbid it and posts carry personal data (D07). We use news and company pages. People come only from cited public sources such as annual reports, company leadership pages and trade press, each with a role, source link and date. "No verified contact found" is a valid answer (D09). This also fits the DPDP Act idea of purpose limitation.

**8. Why one accounts table?**
The brief calls it "his Supabase table". One row per company keeps one source of truth, and each column has exactly one owner: Arjun, the CRM sync, or the system. That makes the safety rule easy to state and enforce in a trigger.

**9. What does it cost, and what are the rate limits?**
- Vercel Hobby (free) runs one cron per job per day, with about an hour of timing jitter.
- Gemini Flash costs a fraction of a cent per article. Gates run before any Gemini call, so most articles never reach it; the run is capped at 300 calls and 120 articles.
- Resend's free tier and HubSpot's free CRM cover this use.
- Publishers are throttled to about one request per second per host, and robots.txt is respected.

**10. What would change at 1,000 accounts?**
- Move ingest to a queue (for example Vercel Queues or a worker), process accounts in batches across many invocations, and store a per-account cursor.
- Use a news API with proper licensing instead of RSS scraping.
- Raise the Gemini caps and batch extraction.
- Rescore incrementally (only accounts with new events, plus a daily decay pass).
- Add indexes on events and signals by account and date.
- The Hot List stays top 10, but per-segment lists may be needed.

**11. How is the eval measured?**
eval/articles.jsonl has 30 real articles with hand labels, including bad cases: rumour, analyst note, job ad, retrospective hiring, wrong company, sponsored post and prompt injection. scripts/eval.mts reports trigger accuracy (last run 86.7%, target 90%, fail below 80%), quote verbatim rate (100% raw, and 100% after V1 by construction) and whether the injection was ignored (yes). The labels need a human spot-check.

**12. Why two kinds of text output?**
The Hot List angle (one line) links the trigger to approved product facts only (config/product-facts.json). The soft-touch draft is engagement only: it cites the fact, makes one observation and asks one question, with no pitch. Code checks the draft for pitch words, urgency words, dashes and length, and it is never sent automatically (D11, D12).

**13. Who is the right customer (ICP), and how does the app use it?**
Keka segments by headcount: SMB under 100, mid-market 100 to 500, enterprise 500+. Arjun sells on the enterprise team, so 500 to 5,000 employees scores full fit and very large companies still count as enterprise. Every account carries an SMB, MM or ENT tag; MM and SMB accounts say to route to that team (B13). Keka's own 77 customer stories show mostly Indian mid-market and enterprise firms (tech and services, multi-site manufacturing, retail, healthcare), and our 8 real Keka customers come from those stories.

**14. How are API keys protected?**
No key is in git: env files are ignored, CI runs a secret scan on every push, and a full history scan found nothing. Runtime keys live encrypted in Vercel, CI holds only the Gemini key as a GitHub secret, and each place holds only what it needs (the Supabase secret key is not in production). The only browser-visible key is the publishable one, and RLS blocks anonymous reads with it.
