# Automation Brief: B2B Account Signal Monitor (Arjun, Keka Enterprise Sales)

## Why

**Pain:** Arjun's problem is timing. Reaching out with no trigger is noise; reaching out two weeks after the trigger is too late. He has 10 active accounts (prospects, live pilots and signed customers he is expanding) and about 40 more he watches. Nobody can read the news on 50+ companies every day, so triggers like a new CHRO, a hiring drive or a new plant are found late or never.

**User:** Arjun, enterprise account executive at Keka (workforce management and HRMS: attendance, shifts, leave, overtime, payroll, HRIS). His segment is enterprise accounts of 500+ employees.

**Outcome:** Every morning Arjun gets a short Hot List: the accounts with a fresh, verified trigger, why they matter now, the article behind each one, who to approach, a one-line outreach angle and where the account stands in HubSpot. He spends minutes deciding whom to call, not hours searching. Nothing he wrote himself is ever overwritten.

## Journey Today

1. Arjun keeps notes, last-contact dates and his read on each account in his own table and in HubSpot.
2. Now and then he searches the news for a few accounts, usually the ones already top of mind.
3. Most of the 50+ accounts go unchecked for weeks.
4. A trigger (new HR head, expansion, funding) happens at an account he is not watching that week.
5. He hears about it late, from a colleague or a competitor's win, or not at all.
6. When he does reach out, it is either cold (no reason to talk) or after the window has closed.

## Nine Checks

### Kill switches (any No = do not build)

| # | Check | Evidence | Pass |
|---|---|---|---|
| 01 | **Problem Real**: is there documented, ongoing evidence of pain? | The brief states the pain directly: timing, with no trigger being noise and two weeks late being too late. 50+ accounts cannot be read by hand every day. Our first live run found real triggers Arjun would otherwise have missed, such as a new CHRO at Travel Food Services (HR Katha, 6 Oct 2026) and an IPO at Zetwerk (ETManufacturing, 12 Oct 2026). | YES |
| 02 | **Workflow Repeated**: does this task recur regularly? | Every account, every day. News keeps arriving, and the brief asks for a Hot List twice a week, which became daily at Arjun's request. It is a standing sales routine, not a one-off project. | YES |
| 03 | **Input Available**: do all inputs exist and are they accessible now? | Public news (Bing and Google News RSS, publisher pages), company filings for headcount (BRSR, annual reports), Arjun's HubSpot (companies, deals, tasks, activities through a private app token), Keka's public product facts. All exist and were connected before scoring was switched on. Gap noted: LinkedIn posts are not accessible lawfully, so they are excluded (D07). | YES |

### Sizing (any No = build something smaller)

| # | Check | Evidence | Pass |
|---|---|---|---|
| 04 | **Output Valuable**: would someone act on this output? | Each Hot List item is actionable as it stands: the verified trigger with its source link and quote, the person to approach (cited), an outreach angle tied to approved product facts, and the HubSpot status (deal stage, last touch, open tasks). Churn risks at customers come with a retention task already created in HubSpot. | YES |
| 05 | **Impact Measurable**: can you track improvement with a number? | Tracked from day one in the run log and the database: accounts covered per day (73), articles checked per run (for example 644 discovered and 120 fetched), verified events, days from trigger to Hot List (target: same or next morning), and the share of signals Arjun marks Useful or Wrong. Baseline: Arjun's current trigger-to-outreach time is not given in the brief, so it should be measured in the first two weeks rather than assumed. | YES |
| 08 | **ROI Worth It**: does the benefit clearly outweigh build and running cost? | Running cost is close to zero: Vercel Hobby, Supabase free tier, Resend free tier, the HubSpot free CRM, and a few Gemini Flash calls per day (gates run before any AI call, with a hard cap of 300 a day). One enterprise deal (500+ employees) won or saved because of a timely trigger outweighs the cost many times over. | YES |

### Boundary (any No = build the tool, the human stays here)

| # | Check | Evidence | Pass |
|---|---|---|---|
| 06 | **Failure Risk OK**: if the AI gets it wrong, what is the consequence? | Low, because every output is checked and nothing leaves without Arjun. Gemini only extracts facts; code validates them (the quote must be word for word in the article, the right company, fresh, an established source) and decides the score. A wrong signal shows its source, so Arjun can open it and mark it Wrong. The worst case is a wasted look at an article, not a wrong email to a buyer. | YES |
| 07 | **Judgment Protected**: does a human review before anything consequential happens? | Arjun wants outreach drafted for him, and the easy next step would be to send it automatically. Outreach to a buyer goes out under Arjun's name and cannot be taken back. So the system drafts (a soft-touch email that cites the fact and never pitches) and Arjun decides, edits and sends. Auto-sending removes his judgment at the most consequential step. **THE CUT** | NO |
| 09 | **Owner Clear**: is one person accountable for the output? | Arjun owns every outreach and his own fields (notes, last contact, his read, his draft). The system owns only its own columns (score, band, lane, drafts), and the HubSpot sync owns only CRM fields. This is enforced in code, by a database trigger and by a test. | YES |

## The Cut

**Check killed: 07, Judgment Protected.**

What is not built: **automatic sending of outreach to prospects or customers** (D12). The system finds the trigger, explains it, drafts a soft-touch email and puts the account on the Hot List. Arjun reads, edits and sends it himself. The only emails the system sends automatically go to Arjun.

The same boundary appears in three other places:
- The system never overwrites anything Arjun wrote (D02, enforced by a Postgres trigger and the write-safety test).
- The system never changes deal stages in HubSpot; it only reads them.
- Gemini never decides a score; code does (D01).

## Components map

See docs/COMPONENTS-MAP.md (v1 drawn before coding, v2 as built). The orange dashed line marks the cut between Arjun-owned data and system-written data.
