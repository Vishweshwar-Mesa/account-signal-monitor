Labels need human spot-check.

# Extractor eval set (articles.jsonl)

30 cases built on 2026-10-12. Each line is one JSON object with the fields described in the task brief (id, url, publisher, published_at, target_company, target_aliases, title, text, expected_* labels, case_kind, synthetic_injection, label_confidence, label_note).

## How the set was built

1. Candidate articles were found with WebSearch, restricted to outlets the search tool could reach.
2. Each page was downloaded once and the article body was taken from the page's JSON-LD `articleBody` where present (Business Standard, People Matters), otherwise from the page's `<p>` text (HR Katha, the NS Hospital tender page). For the Lenskart job listing the rendered page text was used. No body text was written or paraphrased by hand.
3. `text` is the title, a blank line, then the first ~2,500 characters of the body (cut at a word boundary, trailing comment/footer boilerplate removed). The Yatharth analyst note uses ~2,700 characters so the Yatharth section is included. Every `text` is under 3,000 characters.
4. Labels were assigned by reading the trimmed text only, using the trigger definitions in the brief.
5. A check script (run with `python3 -I`) confirmed that every non-null `expected_evidence_phrase` is an exact substring of its `text`, that no `text` exceeds 3,000 characters, and that no label note contains an em dash.

### Source coverage caveat
The search tool refused allowed-domain searches for economictimes.indiatimes.com (main site), livemint.com, moneycontrol.com, financialexpress.com, thehindubusinessline.com, reuters.com and timesofindia.indiatimes.com because those sites block Anthropic's crawler. I did not work around that block. The set therefore draws on Business Standard (incl. Capital Market wire and newswire press releases), People Matters, HR Katha, and one company website (NS Hospital tender page). ETHRWorld and ETRetail subdomains were reachable but no suitable article turned up in the time available.

### Case mix
- LEADERSHIP_CHANGE: e01 Consolidated (CHRO), e02 Sparsh Hospitals (Group CHRO), e03 Schaeffler India (COO), e04 SUJÁN (COO, press release)
- FUNDING_EVENT: e05 SuperK, e06 Burger Singh
- HEADCOUNT_HIRING (new): e07 V-Bazaar, e08 Allcargo Logistics
- HEADCOUNT_HIRING (retrospective): e09 Quess Corp
- CAPACITY_EXPANSION: e10 V2 Retail, e11 PB Health, e12 Amazon India, e13 Medicover Hospitals
- OPERATIONAL_CHALLENGE: e14 MRF strike, e15 Motherson Haldwani protest
- COMPLIANCE_PRESSURE: e16 Bry-Air, e17 Zepto, e18 Swiggy
- HR_TECH_INTENT: e19 ICSIL / Delhi govt HRMS tender, e20 NS Hospital HRMS RFQ
- DIGITALISATION_STATEMENT: e21 Manipal Hospitals (only one; see below)
- null, normal article: e22 Allcargo CHRO opinion piece
- Rumour: e23 Manipal Health IPO ("sources said"), e24 Medicover / KKR talks, e25 Burger Singh denied funding report
- Analyst note: e26 Yatharth Hospital trading idea
- Job ad: e27 Lenskart HRBP listing (HR Katha jobs)
- Wrong company: e28 target Krystal Integrated Services, article about Crystal Crop Protection
- Sponsored: e29 247HRM partner post
- Prompt injection: e30 is e14 (MRF) with a synthetic instruction appended; `synthetic_injection: true`

### Gaps
- DIGITALISATION_STATEMENT has one clean case (e21, from 2022). No 2025-26 company-level example was found in the reachable outlets. e16 (Bry-Air) and e02 (Sparsh) contain secondary digitalisation language.
- Some articles are older than 2025: e21 (2022), e27 (2023 job ad). All others are 2025 or 2026.
- e23 and e24 are short because only the free portion of the Business Standard article is in the JSON-LD body.

## Labels I am least sure about

- e18 Swiggy (low): the labour codes are tied to Swiggy through its own filing, but Swiggy says it expects no material impact. A strict reading of COMPLIANCE_PRESSURE could return null.
- e09 Quess Corp (medium): retrospective headcount growth in an earnings/stock article. No hiring is announced, so null is defensible; I labelled HEADCOUNT_HIRING with time_scope retrospective as the brief asks for past-hiring mentions.
- e25 Burger Singh denial (medium): a reported fundraise the company denies. Labelled null with certainty rumour. Some graders may prefer FUNDING_EVENT with certainty rumour, or certainty null.
- e13 Medicover (medium): headline is an IPO plan for 2026 (future intention), body announces two new hospitals. I chose CAPACITY_EXPANSION; FUNDING_EVENT is arguable.
- e10 V2 Retail and e11 PB Health (medium): multi-signal articles. V2 also gives a job estimate (~960 jobs); PB Health also discusses capital raised. Primary label chosen is CAPACITY_EXPANSION.
- e19 ICSIL (medium): the HRMS buyer is the Delhi government and ICSIL is the implementing agency running the bid, so the right target entity is debatable.
- e16 Bry-Air (medium): the MD talks about Labour Codes for MSMEs and factories broadly, not only Bry-Air. DIGITALISATION_STATEMENT is a plausible alternative.
- e22 Allcargo CHRO piece (medium): labelled null, but its remarks on AI adoption in logistics could be read as a DIGITALISATION_STATEMENT.
- e24 Medicover / KKR (medium): rumour of a possible PE-led sale; whether a sale of the business counts as FUNDING_EVENT (PE investment) is a judgement call.
- e04 SUJÁN (medium): a company press release on a newswire page; some pipelines treat newswire pages as sponsored.
- e15 Motherson (high on trigger, but entity inferred): the article says "the Motherson factory" making wiring harnesses; mapping it to Motherson Sumi Wiring India is my inference.
- e20 NS Hospital: published_at (2025-11-23) is approximate. The page is undated and the tender PDF sits under uploads/2025/11; I could not read the PDF text to confirm the exact date.
