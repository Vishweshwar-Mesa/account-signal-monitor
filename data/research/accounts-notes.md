# Accounts research notes

Researched 2026-10-12. 50 accounts (10 active, 40 watchlist). Counts are from FY26 BRSR or annual reports (as of 2026-03-31) unless noted. Pearl Global and Alldigi use FY25, and HGS uses FY24. No count is a third-party estimate.

## General caveats

- Count definitions differ by company (permanent employees only, employees plus workers, or total incl. non-permanent). Each employee_count_note states what was used.
- Many accounts are above the 5,000 band; their notes say "above 5,000 band". Largest kept: Sagility 46,860 (global consolidated), Krystal 42,151 (deployed workforce), Gokaldas 41,149, UDS 56,252, KIMS 18,491 (group).
- Facility/staffing is thin (3 kept: Krystal, UDS, TeamLease) after excluding SIS and Quess for size.
- newsroom_rss is null everywhere: no RSS feed was verified.
- Active accounts include an extra recent_news array (not in the original schema) with cited items.
- Some recent_news items come from secondary aggregators (scanx.trade, filingreader.com, multibagg.ai, askfuzz.ai, sahi.com, kalkine) summarising exchange filings, not the filings themselves.
- The TCI BRSR URL contained an en dash; it is percent-encoded (%E2%80%93) in the JSON.

## Considered but dropped

- Global Health (Medanta): verified at 12,600 permanent employees (FY26 AR, https://nsearchives.nseindia.com/annual_reports/AR_30497_MEDANTA_2025_2026_A_17778854_21082026174714.pdf) but left out due to the per-batch cap; good swap-in candidate.
- Juniper Hotels: Not processed, target count already reached (NSE lists no separate FY26 BRSR filing; FY26 AR exists)
- Jubilant FoodWorks: Not needed, target reached; very large
- Coffee Day Enterprises: Not processed, target reached; no FY26 BRSR listed on NSE
- Allcargo Logistics / Allcargo Gati: Not researched; batch cap of 11 reached with better sourced candidates
- Western Carriers (India): Only third-party estimate found (EMIS 1,477); no annual report or BRSR employee figure located
- BVG India: Unlisted; not researched, cap reached
- Global Health Ltd (Medanta): Not dropped for lack of data. Verified at 12,600 permanent employees in the FY26 BRSR (consolidated, https://nsearchives.nseindia.com/annual_reports/AR_30497_MEDANTA_2025_2026_A_17778854_21082026174714.pdf). Left out only to stay within the 11-company cap.
- Dr Agarwal's Health Care: Not reached and no longer needed. The NSE annual-report API returned no records for symbol DRAGARWALS, and no FY26 BRSR was located.
- Artemis Medicare Services: FY26 BRSR PDF text extraction was garbled (font encoding). The only figures (399 employees, 1,677 workers) come from a secondary scanx summary, which is not acceptable as a source.
- Indraprastha Medical Corp: Not reached; no primary BRSR located before the batch target was met.
- Kitex Garments: Latest BRSR found is FY24 (614 permanent employees plus 4,337 permanent workers, 1 plant), filed on BSE, so the data is stale and the company is single site. Replaced by PG Electroplast, which has an FY26 BRSR.
- Amber Enterprises: No BRSR PDF located in search. Only results press releases.
- Firstsource Solutions: FY26 BRSR is reported as filed (14 Jul 2026), but the PDF URL could not be located. Not needed for the count.
- One Point One Solutions: No BRSR found.
- Quess Corp Ltd: Verified (Q4 FY26 investor presentation: 4,78,594 headcount, mostly associates) but excluded as far above the band, to keep the list at 50.
- SIS Ltd: Verified (BRSR FY26: 24,079 permanent employees plus 1,81,565 permanent workers) but excluded as far above the band, to keep the list at 50.
- Vishal Mega Mart Ltd: Verified (BRSR FY26: 21,913 permanent employees) but excluded as far above the band, to keep the list at 50.
- Not researched (lower priority, target reached): Arvind Fashions, Bata India, Thangamayil Jewellery, Kewal Kiran, Campus Activewear, Landmark Cars, Jubilant FoodWorks (large).

## Facts we were unsure about

- Barbeque-Nation Hospitality is now United Foodbrands Limited (NSE symbol UFBL from 2025-10-13). Domain set to unitedfoodbrands.in from the BRSR cover letter; consumer brand site is barbequenation.com.
- Travel Food Services CFO Vikas Kapoor resigned 2026-10-07, so he is excluded from people. Previous VP HR Conrad Alves left on 2026-03-13. Vikram Bhonsle's reported elevation to GM HR (hrtoday.in) could not be fetched (403), so he is not included.
- Aavinash Yogeshwar CHRO appointment is from trade press (cxodigitalpulse, 2026-10-05); no exchange filing for it seen yet.
- Ventive Hospitality reports only 38 permanent employees; 3,108 is total employees including non-permanent.
- Chalet Hotels count sums permanent employees and permanent workers (both on-roll), per its own category split.
- Devyani's standalone BRSR PDF on NSE is image-only. The figure was read from the BRSR section inside the FY26 annual report PDF instead.
- Westlife BRSR shows 478 restaurants; its BRSR boundary (standalone vs consolidated) was not confirmed.
- Cantabil reports only 890 'employees' and puts store staff under 'workers'. The 5,178 count adds both, so it is above 5,000 only on that basis.
- Vishal Mega Mart's BRSR counts all retail stores and distribution centres together as 813 'plants', so the exact store count is not separated.
- Senco's BRSR lists 102 Senco stores and 12 Sennes stores, which looks like company-operated stores only. Franchise showrooms may not be included.
- Ethos's registered office is in Parwanoo, Himachal Pradesh. hq_city uses its corporate office in Chandigarh.
- V-Mart's registered office is in New Delhi. hq_city uses its corporate office in Gurugram, per the FY25 BRSR and the FY26 annual report.
- V-Mart's Anand Agarwal took the COO role in addition to CFO. He is tagged ops_head, but that is an interim, dual role.
- A third-party profile (Simply Wall St) shows different titles for Go Colors' managers than the company's annual reports. I used the FY26 annual report list, which names R. Ramakrishnan as Head - Human Resources.
- Go Colors' 751 EBO figure comes from the 30 Jul 2026 Q1 FY27 presentation. The slide does not state an exact as-of date, but it is likely 30 Jun 2026.
- Krystal: no BRSR found. I used on-site plus back-office (42,151) from the FY26 AR. Permanent on rolls is 478 in the Directors' Report, and the AR also says 475 back-office staff, a minor mismatch inside the same report.
- UDS BRSR counts all 56,252 as permanent employees with 0 workers, so it likely includes deployed site staff; there is no separate associates split.
- UDS COO appointment is sourced from a Kalkine article summarising a Reg 30 filing; the filing PDF itself was not fetched.
- Krystal contract news items come from secondary aggregators (multibagg, askfuzz), not the exchange filings themselves.
- TeamLease and Quess counts come from Q4 FY26 investor presentations, not BRSR. TeamLease core count is group-wide and Quess headcount is consolidated, including about 6,000 overseas.
- Count definitions differ across companies (on-roll plus permanent workers for Blue Dart, SIS and Gateway; employees D+E for TCI, TCI Express and MLL). Each note states exactly what was used.
- HQ city uses the corporate office where it differs from the registered office: TCI and TCI Express (registered in Secunderabad), Gateway and Snowman (registered in Navi Mumbai), SIS (registered in Patna).
- Krsnaa: no HR head or senior management personnel are disclosed (AR states there were no SMPs as on 31 Mar 2026), so the people list has only Group CEO and MD. CFO Pawan Daga resigned 19 Jan 2026 and Chandra Prakash Singh was appointed 17 Apr 2026 per the AR. Whole-time Director Pallavi Bhatevara ceased 25 Apr 2026.
- Krsnaa: the 4,000 Rajasthan personnel onboarding figure comes from the filingreader.com summary of Q1 FY27 commentary, not a primary filing.
- Yatharth: no group HR head is found on the management page or in filings; a 'Unit Head - HR' job posting exists. Group CEO and Group COO are from the live management page, fetched 2026-10-12.
- Yatharth BRSR item 18 says 11 national locations, while the Sep 2026 news says 9 hospital locations. The difference likely comes from offices versus hospitals.
- Metropolis: 4,484 combines permanent employees and permanent workers. Use 3,279 if you want employees only.
- KIMS: 18,491 is a group-level figure from the AR workforce section (excluding contractual staff), not a BRSR table. Standalone permanent employees are 6,155.
- Suraksha headcount is from the Directors' Report (permanent employees on rolls), not a BRSR table.
- Sagility's listed name changed to Sagility Limited (per its FY26 BRSR). Headcount is consolidated global, not India only.
- Gokaldas CHRO Amit Sharma: appointed Jul 2024. The current gokaldasexports.com team page still shows his profile image, but the name came from the image filename, not a written title. No cessation filing found.
- Gokaldas HQ is Bengaluru as given in the task; the BRSR excerpt I read did not show the address line.
- Sagility CareSeed acquisition date (2026-06-11) and URL come from search results (Business Wire syndication). I did not open that page.
- Syrma HQ given as Chennai (corporate address per BRSR); the registered office is in Mumbai. Kaynes, Avalon and PGEL headcounts are standalone or exclude the JV.
- Pearl Global FY25 BRSR shows 8 international plants under the standalone entity, as reported.
