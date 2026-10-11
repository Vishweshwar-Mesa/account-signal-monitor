# Two-minute demo script

1. **Sign in (10s).** Open https://account-signal-monitor.vercel.app. Signed out, it shows the sign-in card. Enter Arjun's email and passcode. Point out the theme toggle; switch to dark and back with no flash.
2. **Counts (10s).** The four cards: Hot, Warm, Cold, Customer health. Say: "These come from verified events only. Quiet accounts fall on their own."
3. **Open a Hot or top account (20s).** Click the first row. Read the about line: headcount with its source link and date, deal stage with the DEMO CRM badge, and "Open in HubSpot".
4. **Why this rating (20s).** Read the chips: top event, fit, relationship, activity. Show the threshold line and "points to next band". Open "Verify it yourself".
5. **Open a source (10s).** In Signals, click the publisher link. It opens the original article. The quote is copied word for word and is at most 25 words.
6. **Draft and tones (15s).** In Soft-touch draft, pick Curious and press Regenerate. Note: no pitch, cites the publication, no auto-send. Press Edit, change a word, Save my copy. Regenerate again and show that "Your edited copy" is still there.
7. **Run log (15s).** User menu, Run log. Show the last ingest: fetched, gated out by reason, rejected by validator, events written, Gemini calls. Press "Run ingest now" if time allows.
8. **Notes survive (10s).** Back on the account, show "Your notes". Say: "The system cannot write these. A database trigger blocks it, and tests/write-safety.test.ts proves it after a full run."
9. **HubSpot linked task (10s).** In Tasks and activity, tick a task. Open HubSpot: the same "[DEMO]" task is now completed. Show the deal in the Enterprise Leads pipeline.

Backup if the network is down: run `npm test` and show the write-safety test and the scoring scenarios passing.
