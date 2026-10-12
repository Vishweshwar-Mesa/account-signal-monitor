# Demo video script (about 2.5 minutes)

Record the screen at 1366 wide in Chrome. Have three tabs open: the app, your inbox (today's Hot List email), and HubSpot (Deals, Enterprise Leads board).

1. **The problem (10s).** "Arjun sells workforce management software. Reaching out with no reason is noise; two weeks late is too late. This app watches 64 Indian companies every day and tells him who to call and why."
2. **Sign in (10s).** Open https://account-signal-monitor.vercel.app. Point at the TEST BUILD note: any passcode works for evaluators. Sign in. Toggle dark mode and back to show there is no flash.
3. **Counts and list (15s).** The four cards: Hot, Warm, Cold, Customer health. "Only verified events can make an account Hot. Quiet accounts fall on their own through time decay."
4. **A Hot account (30s).** Click Zetwerk or BMW Industries. Read the about line (headcount with source and date). Read "Why this rating": top event points, fit, relationship, and the threshold line. Open "Verify it yourself".
5. **The source (10s).** In Signals, click the publisher link. The quote is word for word from the article, 25 words at most.
6. **Draft (15s).** Pick Curious, press Regenerate. "It cites the publication, asks one question, and never pitches. Nothing is auto-sent." Press Edit, change a word, save. Regenerate again: "Your edited copy" stays.
7. **Daily Hot List email (25s).** Switch to the inbox. Show one account: why now, supporting articles with quotes, who to approach, outreach angle, and the "From HubSpot" box (deal stage, last touch, open tasks). Mention updates: when a follow-up article appears, the account shows under "Updates".
8. **HubSpot (15s).** Show the Enterprise Leads pipeline with the demo deals, and a company's sm_ properties (score, band, top signal) pushed by the sync. Tick a task in the dashboard and show it completed in HubSpot.
9. **Run log (15s).** User menu, Run log. Show the last ingest: discovered, fetched, gated out by reason, rejected by validator, events written, Gemini calls, HubSpot sync.
10. **Safety (15s).** "Arjun's notes can never be overwritten by the system. Code throws, a Postgres trigger blocks it, and a test runs the full pipeline and checks the notes are byte-identical." Show "Your notes" with the "never changed by the system" tag.

Close (5s): "Gemini extracts facts, code decides scores, every claim has a source."

Backup if the network is down: run `npm test` (76 tests) and show tests/write-safety.test.ts and the scoring scenarios passing.
