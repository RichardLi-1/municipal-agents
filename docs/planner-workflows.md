# Planner workflows: what staff do, and what Municipal Agents can do today

This document follows eight scenarios. For each one it covers what municipal planners and staff in Ontario, and in Waterloo Region where we could find it, actually do step by step. It then maps each step to Municipal Agents.

How it was checked:
- **When:** 14 November 2026, 02:15 to 04:30 ET.
- **Live site:** https://municipal-agents.fly.dev, build `c46a78d-wt`, read through its API.
- **Code:** the repo's working tree, read directly.
- **Laws:** we read the e-Laws text where it is linked. Where we could only see a search result, the text says "(search snippet)".
- **Gaps:** "Not found" means we looked and could not confirm it.

What the statuses mean:
- **Works today:** we saw it working on the live site.
- **Partly:** it works only in part, or only in the repo, or the live data is thin.
- **Not yet:** the product does not do it.

---

## Read this first

1. **Ask doesn't work on the live site right now.**
   - At 02:27 ET we sent three test questions to `/api/decisions/:id/ask`. All three returned the event `error` with the text `Gemini 402: ... Your prepayment credits are depleted`, then `done`.
   - The browser receives the provider's raw JSON error, including its billing link. `docs/code-tour.md` section 3 promises a plain message instead.
   - The working tree already has an offline fallback: `isUnreachable` in `agents/loop.ts` and `offlineAnswer` in `agents/offline.ts`. It is not deployed.
   - We expect Translate (`POST /translate`) to be down too, because it also calls the model. We did not test it.
2. **The Region of Waterloo gets strong-mayor ("strong chair") budget powers on 15 November 2026.**
   - From that date, O. Reg. 530/22 lists the Regional Municipality of Waterloo in Schedule 1 (item 203.1, added by O. Reg. 189/26). We read the e-Laws text: https://www.ontario.ca/laws/regulation/220530
   - For 2027, the year after an election, the chair may propose the budget only in 2027 (s. 7(1.1)). The deadline is 1 February (s. 7(1)). If the chair doesn't propose one, council prepares and adopts it (s. 7(2)).
   - After the chair's proposal:
     - council has 30 days to amend (s. 7(3));
     - the chair has 10 days to veto (s. 7(6));
     - council has 15 days to override, by a two-thirds vote (s. 7(10)).
   - Our budget decision (`data/decisions/row-2027-budget.json`) and its brief say "Regional Council decides". They say nothing about the chair's proposal or these windows. No file in `data/` or `agents/skills/` mentions strong-mayor powers or vetoes (grep run).
3. **The Committee of Adjustment brief doesn't say who can appeal.**
   - Since Bill 23, only the applicant, the Minister, a "specified person" or a public body can appeal a minor variance (Planning Act s. 45(12)). Neighbours cannot.
   - So for a resident, the hearing and a written submission are the only say.
   - Page 3 of the notice we hold (`kitchener-cofa-2026-11-17`) says this. The live brief doesn't.
4. **"Verified" means the quote is on the page. It does not mean the quote supports the sentence.**
   - Live example: "Homeowners could pay for transit hub debt through future regional property tax bills" is marked verified.
   - Its only quote is "facilitate the development of a the Region of Waterloo's Transit Hub", which says nothing about debt or tax.
   - No staff member has reviewed any statement on the live site: 0 of 76 across the three briefs, counting lens statements.
5. **Two lenses can't be shown on the live site.**
   - The construction scout is committed in the repo (`76e7ca2`), but the live budget decision doesn't list it.
   - No live decision has a computed cost lens. The cost tabs hold only "partial" statements, so the lifecycle chart and its sliders can't be shown.

---

## How we checked: live API calls

All calls were plain `curl` to `https://municipal-agents.fly.dev/api`. We did not use the staff passcode.

| Call | Result |
|---|---|
| `GET /health` | 200. `version: c46a78d-wt`, 3 decisions, 19 sources, 14 log entries, `agents.available: true` |
| `GET /decisions` | 3 cards. Each has `reviewStatus: "draft"` and a correct next event with a date (17 Nov hearing, 17 Nov online meeting, 16 Dec council) |
| `GET /decisions/row-2027-budget` | 1.8 MB. Brief: reading grade 7.3, 20 of 20 statements verified, 0 reviewed, 11 figures, 5 unknowns. Computed lenses: `transit` (whole region, with map layers) and `housing`. Brief lenses: `commitments` (3), `transit` (partial). No `cost`, no `construction` |
| `GET /decisions/row-water-supply-2051` | Brief: grade 9.3, 11 of 11 verified, 0 reviewed. Computed lens: `housing`. Brief lenses: `cost` (partial), `commitments` |
| `GET /decisions/kitchener-transit-hub-variances` | Brief: grade 7.2, 19 of 19 verified, 0 reviewed. Computed lenses: `transit` (1.5 km around the site, with a `focus` reach), `housing` (Kitchener, with map layers). Brief lenses: `cost` (partial) |
| `GET /decisions/:id/calendar.ics` (all three) | 200, `text/calendar`. Events: budget 10, water 2, hub 1. Reminders one day before (`VALARM` set to `-P1D`). "Deadline to speak" events are computed from the Region's "noon one week before" rule. Every event carries "Not the official notice" and the official link |
| `GET /sources` | 19 documents, for example `row-delegation-guide`, `kitchener-cofa-2026-11-17`, `row-asset-management-review-2026`, `wr-ghg-inventory-2022` |
| `GET /sources/row-delegation-guide/pages/1` | 200, page text ("Speaking to Regional Council: What You Should Know as a Delegation") |
| `GET /sources/kitchener-cofa-2026-11-17/pdf` | 200, `application/pdf`, 221,996 bytes |
| `GET /log`, `GET /log/verify` | 14 entries, `intact: true`. After our three questions there were 17 entries (three `question.asked`, no `answer.given`) |
| `GET /usage` | 8 calls, US$0.0366 today, daily cap US$5 |
| `POST /decisions/kitchener-transit-hub-variances/ask` "Can neighbours appeal the Committee of Adjustment decision ... to the Ontario Land Tribunal, and what do I need to do before the hearing?" | **Failed**: `error` event with `Gemini 402`, raw JSON |
| `POST /decisions/row-2027-budget/ask` "Who proposes the 2027 regional budget, the regional chair or staff, and can council amend it? When is my last chance to speak?" | **Failed**: same 402 |
| `POST /decisions/row-2027-budget/ask` "Where are the biggest transit access gaps on Sunday mornings, how many people do they affect, and what would the top fix cost?" | **Failed**: same 402 |
| `GET /cities`, `/calendar.ics`, `/openapi.json`, `/embed/:id`, `/staff/insights` | 404 on the live site. These routes exist only in the working tree (`server/routes/cities.ts`, `platform.ts`, `insights.ts`, all untracked) |
| `GET /staff/check` | 401 (passcode not sent) |

**The offline fallback, run locally on the same three questions.** We ran `offlineAnswer` from `agents/offline.ts` against the working tree's `data/briefs`. It makes no model call and has no cost. The script is in the scratchpad, not the repo.
- **It works mechanically.** It returns checked statements with citations and a "draft" note.
- **Relevance is poor for planner questions:**
  - The appeal question got statements about leftover land and how to get the decision notice. It said nothing about appeal rights.
  - The budget question got "Register as a delegation" and "Staff first present the draft budget proposal on December 16, 2026". Nothing on the chair.
  - The transit question got budget trade-offs. None of the computed Sunday gaps came back (`figures` was empty).

---

## 1. Explaining a proposed decision to residents

**Who does it**
- **Planners and subject-matter staff:** write the staff report and recommendation.
- **The clerk:**
  - publishes agendas under the procedure by-law;
  - gives statutory notice;
  - registers delegations;
  - keeps minutes;
  - is Secretary-Treasurer for the Committee of Adjustment in some cities.
- **Communications and engagement staff:** plain-language pages and EngageWR surveys.
- **The accessibility coordinator:** accessible formats.
- **Councillors and their offices:** answer residents.

**Steps**
1. Staff write the report: background, options, financial implications, recommendation. It is reviewed up the chain and placed on a committee agenda.
2. The clerk publishes the agenda and gives public notice of the meeting as the procedure by-law requires.
   - Every municipality must have a procedure by-law, and it must provide for public notice of meetings: Municipal Act s. 238(2) and (2.1).
   - Meetings are open, except on listed grounds: s. 239.
   - Each municipality must also adopt a policy on how and when it gives notice: s. 270(1) para. 4.
   - https://www.ontario.ca/laws/statute/01m25
3. For Planning Act matters, statutory notice and a public meeting are required. All in the Planning Act, https://www.ontario.ca/laws/statute/90p13, and its notice regulations.
   - **Official plan amendment:**
     - at least one public meeting (s. 17(15)(d)), no earlier than 20 days after notice (s. 17(19));
     - materials available 20 days before (s. 17(19.1));
     - the notice rules are in O. Reg. 543/06 s. 3: https://www.ontario.ca/laws/regulation/060543
   - **Zoning by-law amendment:**
     - a public meeting (s. 34(12)), no earlier than 20 days after notice (s. 34(14.1));
     - notice by mail to owners within 120 m plus a sign on the site, or a newspaper notice, or a website if there's no newspaper (O. Reg. 545/06 s. 5(4), (7), (7.1));
     - prescribed content, including the warning that you must make a submission to keep appeal rights (s. 5(11)).
     - https://www.ontario.ca/laws/regulation/060545
   - **Committee of Adjustment:** notice at least 10 days before the hearing, by mail within 60 m plus a sign, or newspaper or website (O. Reg. 200/96 s. 3(1) to (4.1)). https://www.ontario.ca/laws/regulation/960200
4. Residents register as delegations under the local procedure by-law. The Municipal Act gives no general right to speak; each by-law sets the rules.
   - Region of Waterloo, from our source `row-delegation-guide` p. 1 to 2:
     - Register by noon one week before the meeting to be on the agenda with 5 minutes.
     - Register up to 24 hours before and you still get 5 minutes; later than that, 3 minutes.
     - Written submissions become public.
5. Accessibility. Under O. Reg. 191/11 (https://www.ontario.ca/laws/regulation/110191):
   - accessible formats and communication supports must be provided on request, in a timely way, at no extra cost, and the public must be told they are available (s. 12);
   - feedback processes must be accessible (s. 11);
   - websites must meet WCAG 2.0 Level AA since 1 January 2021 (s. 14).
6. The meeting is held and representations are heard: s. 17(19.2) and s. 34(12) for OPAs and ZBAs; s. 45(6) for the Committee of Adjustment.
7. After the decision:
   - notice of the decision goes out within 15 days (s. 17(23), s. 34(18));
   - it must explain the effect of written and oral submissions on the decision (s. 17(23.1), s. 34(18.1));
   - there is a 20-day appeal period (s. 17(24), s. 34(19)), limited to certain parties (see scenarios 6 and 8).
8. Translation is voluntary here.
   - The French Language Services Act excludes municipalities unless they opt in by by-law (s. 1, s. 14): https://www.ontario.ca/laws/statute/90f32
   - The designated areas in O. Reg. 272/25 (https://www.ontario.ca/laws/regulation/250272) include Niagara, Peel and York, but not Waterloo Region, Kitchener, Waterloo or Cambridge.

**Documents and data:** staff reports, agendas, minutes, statutory notices, the procedure by-law, the delegation guide, EngageWR pages, the meeting video.

**Where residents take part:** they can speak as a delegation, send a written submission, fill in an EngageWR survey, attend or watch the meeting, or contact their councillor.

**What's hard today**
- A staff report is written for council, not residents.
- Notices are dense legal text.
- The point that "you must speak or write now or lose your appeal rights" is easy to miss.
- Delegation deadlines differ between municipalities.
- Accessible formats arrive only on request.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Turn the staff report into a plain-language summary | Brief: summary, why now, impacts, glossary; reading grade measured | Works today (all drafts) | `GET /decisions/:id`: grades 7.3, 9.3, 7.2. `agents/skills/explainer/SKILL.md`, `shared/readability.ts` |
| Every fact traceable to a page | `record_statement` checks each quote is on its page | Works today | All 76 live statements, including lens statements, are `verified: true`. Check code: `shared/verify.ts`, `agents/tools.ts`. Limit: the quote need not support the sentence (finding 4) |
| Staff check before publishing | Review and publish routes; publish needs every statement reviewed | Partly | Code: `server/routes/staff.ts` (`unreviewed`, `recheck`). Never used on the live site: 0 of 76 statements reviewed |
| Meeting dates and how to take part | Have-your-say timeline with methods, deadlines, contacts | Works today | `GET /decisions/row-2027-budget`: 8 timeline events, each with a citation. Dates are hand-checked by the team (`row-2027-budget.notes.md`), not found by the agents |
| Delegation deadlines | "Deadline to speak" events in the calendar file | Partly | `calendar.ics` has `Deadline to speak` events computed from the Region's rule. The notes say these are computed, not published for each meeting |
| Add to calendar | `.ics` with one-day reminders | Works today | `GET /decisions/:id/calendar.ics`: 10, 2 and 1 events |
| Check the statutory notice period (20 days for OPA/ZBA, 10 days for CofA) | None | Not yet | No code computes Planning Act notice minimums (grep for `notice` in `server/`, `agents/`, `shared/`) |
| Notice of decision and appeal window | None; the `Decision.status` type has `decided`, but no post-decision events | Not yet | `shared/types.ts`; no decision has events after the meeting |
| Accessible formats on request (s. 12) | Screen-reader and keyboard targets; no "request another format" contact; no print view | Partly | NFR-1 axe results still "TODO(verify)" (`docs/requirements.md`); no `@media print` or "Report an error" in `web/src` (grep) |
| "Not the official notice" | Shown on the page and in every `.ics` event | Works today | `web/src/screens/Decision.tsx:268`; `.ics` DESCRIPTION |
| Other languages | `POST /translate`; 11 languages in `cities/waterloo-region.json` | Partly | Needs the model, so likely down (finding 1). The UI says "Translated into {lang}", not "machine translation" (`web/src/lib/i18n.ts:243`) |
| Answer residents' own questions | Ask, with steps and citations | Not yet on live (outage) | Three live calls returned 402. The offline fallback exists in the working tree only |
| Public record of what was said | Hash-chained log | Works today | `GET /log/verify` returns `intact: true` |

---

## 2. Municipal budget process (Region of Waterloo, 2027)

**Who does it**
- **Finance:** builds the budget book and the tax impact.
- **The CAO and the corporate leadership team.**
- **The head of council:** under strong-mayor rules, proposes the budget.
- **Council:** amends and adopts.
- **The Police Services Board:** police budget.
- **The clerk:** delegations and notices.
- **Engagement staff:** surveys and pop-ups.

**Strong-mayor rules in 2026**
- **Who has them:**
  - Kitchener, Waterloo, Cambridge, Wilmot and Woolwich are already designated (O. Reg. 530/22 Schedule 1, items 28, 95, 203, 212 and 215). Wellesley and North Dumfries are not.
  - The Regional Municipality of Waterloo is added on 15 November 2026 (item 203.1, by O. Reg. 189/26).
  - The Better Regional Governance Act, 2026 (S.O. 2026, c. 3) lets the Minister appoint the Waterloo Region head of council after the 2026 election (new Municipal Act s. 218.1). https://www.ontario.ca/laws/statute/s26003
  - The Region's 2026 budget did not use the strong-mayor process: the Region's release of 16 Dec 2025 says "Regional Council has passed" it. https://www.regionofwaterloo.ca/news-public-notices-and-council-info/posts/region-of-waterloo-budget-delivers-affordability-and-service-investments/
- **What it looks like in practice:** Kitchener's 2026 budget used it.
  - The mayor proposed the budget on 1 Dec 2025.
  - Council could amend on 11 Dec 2025, and the mayor could veto amendments.
  - It was adopted on 26 Dec 2025.
  - https://www.engagewr.ca/kitchener-budget-2026

**Steps (Region, 2027)**
1. **Approach and timeline report:** to council on 2 Jun 2026 (source `engagewr-row-2027-budget` p. 5).
2. **Engagement:**
   - a random-sample resident survey (September 2026);
   - pop-up sessions (28 Aug to 12 Nov 2026);
   - an online survey and quiz open until 26 Feb 2027 (`row-2027-budget-contest-rules` p. 1).
   - https://www.engagewr.ca/ROW-2027-budget
3. **Published meetings** (https://www.regionofwaterloo.ca/planandbudget):

   | Date | Meeting |
   |---|---|
   | 16 Dec 2026 | Overview |
   | 19 Jan 2027 | Detailed review day 1 |
   | 27 Jan 2027 | Detailed review day 2 |
   | 2 Feb 2027 | Police budget |
   | 10 Feb 2027 | Responses to councillors |
   | 15 Feb 2027 | Deadline for councillor motions |
   | To be confirmed | Final budget day |

   EngageWR gives 26 Jan and 9 Feb for two of these dates; `row-2027-budget.notes.md` already flags the conflict.
4. **The strong-chair steps** (O. Reg. 530/22 s. 7):
   - the chair proposes the budget by 1 Feb 2027 and makes it public;
   - council may amend within 30 days, and can shorten that period;
   - the chair may veto within 10 days;
   - council may override within 15 days by two-thirds;
   - otherwise the budget is deemed adopted.
   - **Not found:** how the Region will fit these steps into the meetings above. No Region page we read mentions a chair's proposal.
5. **Excluded expenses report.** Before adopting a budget that leaves out amortization, post-employment benefits or landfill closure costs, council must prepare a report and adopt it by resolution (O. Reg. 284/09 s. 1 and s. 2). The report must estimate:
   - the change in accumulated surplus;
   - the impact on future funding needs for tangible capital assets (s. 3).
   - https://www.ontario.ca/laws/regulation/090284
6. **Tax impact for the average household.**
   - The Region uses "an average residential property valued at $354,500, based on a valuation date of January 1, 2016" and 182 m³ of water (`row-2026-budget-book` p. 11).
   - 2026: regional property tax $2,928.62, up $142.18 (+5.10%, including police). Same page.
7. **Tax rate by-laws and billing:** the Region sets the levy; the area municipalities bill it. We did not research the details in this pass.

**Documents and data:** the budget book, the budget summary, the 10-year capital forecast, council reports, the excluded expenses report, the police budget, survey results.

**Where residents take part:**
- the online survey (until 26 Feb 2027);
- delegations at the budget meetings;
- written submissions;
- asking their councillor to bring a motion (deadline 15 Feb).
- Under strong-mayor rules, the main window to influence a change is the council amendment period after the chair's proposal.

**What's hard today**
- The draft is not public until it is presented.
- Last year's forecast is easy to confuse with this year's proposal.
- The tax impact uses a 2016 assessed value that residents don't recognise.
- The new strong-chair steps change who proposes the budget and when amendments can happen.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Budget calendar and how to take part | Timeline with eight events, delegation deadlines, `.ics` | Works today | `GET /decisions/row-2027-budget`; `calendar.ics` has 10 events |
| Say what is and isn't published | Brief says "The proposed detailed budget numbers are not published yet"; RULES.md rule 9 labels years | Works today | Live brief summary |
| Average-household tax impact | Cited figures: "2026 regional tax for average home $2,928.62", "2026 total regional bill $3,473.86" | Works today (2026 only) | Live brief `figures` |
| Who proposes and who can amend (strong chair) | None | Not yet, and the brief is misleading | Decision says `decidedBy: "Regional Council, Region of Waterloo"`; no s. 7 windows (finding 2) |
| Excluded expenses report (O. Reg. 284/09) | None | Not yet | Not among the 19 sources |
| Per-service split of the tax (e.g. police $900, transit $516) | Data on `row-2026-budget-book` p. 12; agents could cite it | Partly | Not in the live brief. Ask is down |
| "What would X% mean for my bill?" | None (the cost lens works out lifecycle cost per household, not tax rates) | Not yet | `lenses/cost/lifecycle.ts` |
| Survey and engagement link | Timeline event "Online budget survey and quiz on EngageWR" | Works today | Live timeline |

---

## 3. Transit service planning and access gaps (Grand River Transit)

**Who does it**
- **GRT service planners and schedulers.**
- **Region transportation planning.**
- **Council:** approves the Business Plan and, each year, the funding for service growth.
- **The Accessibility Advisory Committee and MobilityPLUS staff.**
- **GRT customer service:** handles feedback.

**Steps**
1. **Long-range plan.** The GRT Business Plan went to committee on 8 Apr 2025 (report TSD-TRS-25-005).
   - It covers 10 years and has three parts: conventional bus and ION, MobilityPLUS, and township transit.
   - It says it will be carried out "subject to Regional Council's annual Plan and Budget process", with a midpoint review by 2030.
   - https://www.engagewr.ca/download_file/5472/1766 and https://www.grt.ca/about-grt/plans-and-projects/grt-business-plan/
2. **Service standards.**
   - Frequent Transit Network: every 10 minutes on weekdays from 7 am to 7 pm, every 15 minutes at other times, on 16 routes.
   - Coverage goal: 400,000 people and 200,000 jobs within 800 m of that network.
   - Overnight routes every 30 minutes; township routes every 90 minutes.
   - Productivity is measured as the share of costs paid by fares (revenue/cost):

     | Route type | Target |
     |---|---|
     | Frequent network | 30 to 40% |
     | Local | 25 to 35% |
     | Whole system | 35% |

     Source: `grt-business-plan-2025-appendix-a` p. 8.
   - **Not found:** a separate GRT stop-spacing or walking-distance standard.
3. **Data.**
   - Timetables: GTFS, including realtime, from https://grt.ca/about-grt/open-data/
   - Ridership and fares: internal.
   - Population: census.
4. **Equity check.** No Ontario law requires a transit equity analysis (not found).
   - **US reference: FTA Circular 4702.1B (Title VI).** Large agencies must set service standards and run a service or fare equity analysis before any major service change. That analysis tests "disparate impact" (race) and "disproportionate burden" (low income) against thresholds the agency sets itself.
   - We could not open the FTA page (403), so this summary comes from secondary sources: https://www.transit.dot.gov/regulations-and-guidance/fta-circulars/title-vi-requirements-and-guidelines-federal-transit-administration
   - TTC weights Neighbourhood Improvement Areas in its 2025 Annual Service Plan (search snippet): https://www.ttc.ca/about-the-ttc/projects-and-plans/2025-Annual-Service-Plan
5. **Accessibility duties** (O. Reg. 191/11, https://www.ontario.ca/laws/regulation/110191):
   - the accessibility plan must include at least one public meeting a year with people with disabilities (s. 41);
   - specialized transit: eligibility categories (s. 63), and an applicant counts as temporarily eligible after 14 days without a decision (s. 64);
   - fare parity between conventional and specialized service (s. 66);
   - consultation on bus stop and shelter design (s. 78).
6. **Consultation.** Business Plan engagement ran for 9 months. It drew more than 2,500 survey responses, 30 events and 12 workshops, and held sessions for MobilityPLUS users and township residents (TSD-TRS-25-005; https://engagewr.ca/grt-business-plan).
7. **First and last mile.**
   - The plan adds on-demand zones in each township "to support access to fixed-routes" (TSD-TRS-25-005).
   - The Regional Transportation Master Plan "Moving Forward" dates from 2018 (search snippet).
   - **Not found:** a Region first/last-mile policy.
8. **Yearly changes and monitoring.** Service expansion is proposed through each year's budget, and revenue/cost is monitored. **Not found:** which months the service changes take effect.

**Documents and data:** the GRT Business Plan and its Appendix A, GTFS, the census, budget pages on transit, the accessibility plan.

**Where residents take part:** EngageWR surveys and pop-ups, the yearly accessibility public meeting, budget delegations, GRT customer feedback.

**What's hard today**
- Access is felt by time of day; Sunday mornings and late evenings are the gaps.
- Ridership, crowding and on-time data are not public.
- Equity analysis isn't required, so it isn't routine.
- On-demand service and MobilityPLUS are not in the GTFS.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Access to essential places at set times | Connection Scan over the GRT and ION GTFS; weekday 8 am, weekday 10 pm, Sunday 8 am; 45 minutes | Works today | `GET /decisions/kitchener-transit-hub-variances`, `lenses.transit.scenarios` and `access`; feed retrieved 2026-11-14, service date 2026-11-17; `lenses/transit/csa.ts` with tests |
| Service gaps | Late start, early end, low frequency, first/last mile, long trip | Works today | Hub lens: "On Sundays, 22,661 people have no bus or train within 800 m before 6:30 am"; "Sunday 8 am: 1,615 people (6%) can't reach a hospital within 45 minutes" |
| Rank fixes with trade-offs | Candidate fixes with bus-hours and plain trade-offs; no dollar cost | Partly | Hub lens fixes: e.g. "Start route 6 Bridge-Courtland by 6:30 am on Sundays", about 5 bus-hours. `limits` says no cost per hour was cited |
| Test against GRT's own standards (10/15-minute frequent network, 800 m, revenue/cost) | Counts people beyond 800 m of 15-minute service (and 10-minute); no revenue/cost | Partly | `lenses/README.md` (Transit); the revenue/cost targets are only cited text in `grt-business-plan-2025-appendix-a` |
| Equity analysis (low income, seniors, disability, no car) | Population only, from the 2021 census | Not yet | grep for `income` or `equity` in `lenses/transit/*.ts` finds nothing |
| Ridership, crowding, on-time | None (GTFS-realtime exists but isn't used) | Not yet | `lenses/transit/fetch.ts` downloads static feeds only |
| On-demand and MobilityPLUS | None | Not yet | Hub lens `limits`: "MobilityPLUS ... and any on-demand ... are not in the GTFS" |
| Saturday service | None | Not yet | Hub lens `limits`: "Saturday is not computed" |
| What residents said in consultation | None | Not yet | No engagement summary among the sources |
| Ask "where are the Sunday gaps?" | Transit specialist reading `transit_gaps` | Not yet on live (outage) | Third live call returned 402. The offline fallback didn't return the lens gaps |

---

## 4. Infrastructure lifecycle costing

**Who does it**
- **Asset management staff:** at the Region, Strategic Asset Management in Engineering and Environmental Services.
- **Engineers:** condition assessments.
- **Finance:** long-range financial plan, tangible capital asset reporting, development charges background studies.
- **Council:** approves the plan by resolution and reviews progress every year.

**Steps** (O. Reg. 588/17, https://www.ontario.ca/laws/regulation/170588)
1. **Strategic asset management policy** by 1 Jul 2019, reviewed at least every 5 years (s. 3, s. 4).
   - It must link to the budget and long-term financial plans (s. 3(1) para 2).
   - It must address climate vulnerabilities and greenhouse gas targets (s. 3(1) para 5).
2. **Asset management plan with current levels of service:** core assets by 1 Jul 2022, all assets by 1 Jul 2024 (s. 5(1)). For each asset category it gives:
   - replacement cost, average age and condition (s. 5(2) para 3);
   - lifecycle activities and their costs for each of the next 10 years (s. 5(2) para 4).
3. **Proposed levels of service** by 1 Jul 2025, with a lifecycle management and financial strategy that says how any funding shortfall will be managed (s. 6(1)).
4. **Approval and publication:** council approves the plan by resolution (s. 8), and the policy and plan are posted publicly (s. 10).
5. **Annual review** of progress by 1 July each year (s. 9).
6. **Region figures**, from the 2026 annual review, report EES-SAM-26-001 (May 2026; our source `row-asset-management-review-2026`):
   - replacement value over $11.31 billion;
   - the funding gap grew from $82.8 million to $87.6 million a year;
   - optimal renewal is $321.5 million a year, against a 10-year average of $233.9 million.
   - https://www.regionofwaterloo.ca/government-and-council/plans-budget-and-performance/2026-annual-review-of-asset-management-planning-progress/
7. **Accounting.**
   - Tangible capital assets have been recorded and amortized under PSAB PS 3150 since 2009. Ontario's Financial Information Return reports them: https://efis.fma.csc.gov.on.ca/fir/index.php/en/multi-year-reports/
   - Asset retirement obligations (PS 3280) apply from fiscal year 2023 (secondary sources).
8. **Development charges** (Development Charges Act, 1997, https://www.ontario.ca/laws/statute/97d27):
   - the background study must include an asset management plan (s. 10(2)(c.2));
   - that plan must show that DC-funded assets are "financially sustainable over their full life cycle" (s. 10(3));
   - DCs cannot fund service levels above the 15-year historical average (s. 5(1) para 4).
9. **Carbon.**
   - The Region's Corporate Climate Action Plan (May 2025) includes a "climate accountability framework" to apply a climate lens to Regional decisions. https://www.regionofwaterloo.ca/news-public-notices-and-council-info/posts/region-of-waterloo-sets-path-to-net-zero-emissions-by-2050-with-new-corporate-climate-action-plan/
   - The federal social cost of carbon is $266 per tonne for 2024 and $294 for 2030, in 2021 dollars. https://www.canada.ca/en/environment-climate-change/services/climate-change/science-research-data/social-cost-ghg.html
   - **Not found:** whether the Region applies a carbon price in its capital budget.

**Documents and data:** the asset management plan, the annual review, the budget book's capital forecast, condition data, the DC background study, the financial statements.

**Where residents take part:** budget delegations and surveys. Asset management plans are approved at council and can be the subject of delegations. **Not found:** any separate public consultation on levels of service.

**What's hard today**
- The upfront price is what council votes on. Operating and renewal costs sit in other documents.
- The infrastructure gap is a single regional number that residents can't connect to a project.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Lifecycle cost: capital, operating, maintenance, renewal, carbon; discount 0% or 3%; per household | `lifecycleCost` and `buildCostLens`; the agents' `build_lifecycle_cost` tool | Partly (in code, not on the live site) | `lenses/cost/lifecycle.ts`, `lenses/cost/cost.test.ts`. Live: no decision has a computed cost lens; hub and water have `cost: {statements, partial}` only |
| Change assumptions with sliders | `web/src/lib/cost.ts`, `CostChart.tsx` | Partly | Can't be shown live without a cost lens |
| Show the infrastructure gap | Cited figures "Annual infrastructure funding gap $87.6 million" and "Total replacement value $11.3 billion"; commitment "Close the municipal infrastructure funding gap" with status `behind` | Works today | `GET /decisions/row-2027-budget`, brief `figures` and `lenses.commitments` |
| Carbon price in the lifecycle cost | `carbonPrice` input, one value or by year | Partly | `lenses/cost/lifecycle.ts` line 28; no cited carbon price in the sources (the federal social cost of carbon isn't in `data/`) |
| Check a plan against O. Reg. 588/17 content and deadlines | None | Not yet | No such tool |
| Per-asset levels of service and condition | None (the annual review PDF is cited text only) | Not yet | `row-asset-management-review-2026` (6 pages) |
| Development charges and growth costs | None | Not yet | No DC source |

---

## 5. Tracking public commitments

**Who does it**
- **The climate and sustainability office, and ClimateActionWR** (run jointly by Reep Green Solutions and Sustainable Waterloo Region, funded by the large municipalities). https://climateactionwr.ca/climate-action-plans/
- **Corporate strategy and performance staff:**
  - the Region's Strategic Plan 2023 to 2027 "Growing with Care", reported through yearly Yearbooks and Plan and Financial Updates to council;
  - Kitchener's 2023 to 2026 Strategic Plan, with indicators and progress updates each winter, spring and summer.
  - https://www.regionofwaterloo.ca/government-and-council/plans-budget-and-performance/our-progress-and-performance/ and https://www.kitchener.ca/en/council-and-city-administration/2023-2026-strategic-plan-progress.aspx
- **Housing staff:** provincial targets and federal Housing Accelerator Fund agreements.

**Steps**
1. **Adopt the commitment with a baseline and target.**
   - TransformWR: in 2021 all municipalities in the region raised the interim target to 50% below 2010 by 2030, and kept 80% by 2050. Its actions add up to a path to 30% by 2030.
   - Source: 2022 inventory, pp. 20 to 21 (our source `wr-ghg-inventory-2022`).
2. **Measure.**
   - The 2022 inventory, published June 2024, shows emissions 12% below 2010 and "not on track" (pp. 3 to 4).
   - **Not found:** a 2023 or 2024 inventory.
   - Dashboard: https://dashboard.climateactionwr.ca/
3. **Housing pledges.**
   - Ontario's 2031 targets: Kitchener 35,000 (confirmed on the City's release). Waterloo 16,000 and Cambridge 19,000 are confirmed only in news reports.
   - Progress is counted on the province's tracker: https://www.ontario.ca/page/tracking-housing-supply-progress
   - The Building Faster Fund paid municipalities that reached 80% of their yearly target. The June 2026 round was its last. For example, Kitchener got $8.0 million for reaching 85.8% of its 2025 target. https://www.kitchener.ca/news/posts/kitchener-earns-8-million-from-the-building-faster-fund-for-third-consecutive-year-of-housing-target-achievement/
   - Federal Housing Accelerator Fund agreements:
     - Kitchener: $42.4 million (https://cmhc-schl.gc.ca/media-newsroom/news-releases/2023/helping-build-more-homes-faster-kitchener);
     - Waterloo: over $22 million (https://www.waterloo.ca/news/posts/removing-barriers-to-build-more-homes-faster-in-waterloo-ontario/);
     - Cambridge: over $13.3 million (https://cmhc-schl.gc.ca/media-newsroom/news-releases/2024/helping-build-more-homes-faster-cambridge).
4. **Report to council and the public:** yearbooks, dashboards and progress updates.
5. **Correct course:** new actions, or budget asks.

**Where residents take part:** budget and strategic plan consultations, delegations on progress reports, ClimateActionWR programs.

**What's hard today**
- Progress data lag by 2 years or more.
- Commitments sit in plans that individual decisions don't cite.
- Each body reports in its own format.
- Interim targets are often missing.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| List the commitments a decision touches, with target, who made it, and what's unclear | Commitments lens, `record_commitment` | Works today | Live budget brief: three commitments (Building Better Futures 3,500 homes by 2029; community emissions 50% by 2030; close the infrastructure gap) |
| On track or behind, worked out in code | `commitmentStatus`, straight-line test with a ±5 point tolerance | Works today | "Cut community emissions 50% by 2030": status `behind` (12% achieved by 2022, against about 30% expected on a straight line). `lenses/commitments/status.ts` and its tests |
| Flag data gaps | `unclear` list | Works today | "Emissions figures after 2022 are not provided in the source documents" |
| Housing target progress | Housing lens target: 70,000 by 2031 for the three cities; 15,902 counted from 2022 to 2024 | Works today | `GET /decisions/row-2027-budget`, `lenses.housing.target` |
| Building Faster Fund results by year, Housing Accelerator Fund milestones | None | Not yet | Not in `data/`; grep for "Building Faster" finds nothing |
| Strategic plan indicators (Kitchener, Region Yearbook) | None | Not yet | Not among the sources |
| Follow a commitment across decisions and over time | None (each decision is separate) | Not yet | `CommitmentsLens` lives inside each `Brief` (`shared/types.ts`) |

---

## 6. Housing: from approval to construction

**Who does it**
- **The applicant.**
- **City planners:** pre-consultation, official plan and zoning amendments, subdivision, site plan.
- **The Region:** since 1 Jan 2025, an "upper-tier municipality without planning responsibilities". It comments on applications and still runs water and wastewater.
- **The Committee of Adjustment.**
- **The building division:** permits and inspections.
- **Finance:** collects development charges.
- **CMHC:** counts starts and completions.
- **The Province:** tracks the targets.

**Steps** (Planning Act, https://www.ontario.ca/laws/statute/90p13, unless noted)
1. **Region planning role.** The Region is now on the s. 1(1) list of "upper-tier municipality without planning responsibilities". Its Regional Official Plan is deemed an official plan of each area municipality (s. 70.13(2)). https://www.regionofwaterloo.ca/business-and-development/growth-and-development-services/regional-official-plan/
2. **Official plan and zoning amendments.**
   - The applicant can appeal if there is no decision after 120 days for an OPA (s. 22(7.0.2)) or 90 days for a ZBA (s. 34(11)), or 120 days if the two are filed together.
   - Since Bill 185 (6 Jun 2024), third-party appeals are limited to specified persons, public bodies and registered owners who made submissions (s. 17(24), s. 34(19)).
3. **Draft plan of subdivision.**
   - Conditions are set at draft approval.
   - Draft approval lapses after a set period, which can't be under 3 years (s. 51(32), (32.1)).
   - Non-decision appeal after 120 days (s. 51(34)).
4. **Site plan.**
   - Residential projects of 10 units or fewer are exempt (s. 41(1.2), Bill 23).
   - The owner can appeal after 60 days without approval (s. 41(12)).
   - Bill 185 removed the Bill 109 fee refunds.
5. **As-of-right flexibility.** Minimum setbacks are deemed to be 90% of the by-law figure, i.e. a 10% reduction (s. 34(1.4) to (1.7); O. Reg. 545/06 s. 1.1, Bill 17, 2025).
6. **Servicing allocation.**
   - Regional Council approved a Water Supply Capacity Allocation Policy in May 2026. https://www.regionofwaterloo.ca/news-public-notices-and-council-info/posts/regional-council-approves-water-supply-capacity-allocation-policy-to-support-future-growth/
   - Kitchener's Water Allocation Policy is By-law 2026-091. https://www.kitchener.ca/development-and-construction/kitchener-water-allocation-policy/
   - **Unverified (search snippet only):** the Cambridge and Waterloo policies.
7. **Building permit.**
   - Required by the Building Code Act s. 8 (https://www.ontario.ca/laws/statute/92b23). The Building Code is O. Reg. 163/24 (https://www.ontario.ca/laws/regulation/240163).
   - Decision periods after a complete application (Div. C 1.3.1.3): 10, 15, 20 or 30 days depending on the building class. https://www.ontario.ca/document/2024-building-code-compendium/part-1-general-0
8. **Development charges** (https://www.ontario.ca/laws/statute/97d27).
   - Normally payable when the building permit is issued (s. 26).
   - Since 3 Nov 2025 (Bill 17), residential development pays at occupancy; rental and institutional development pays in 6 yearly instalments (s. 26.1).
   - The rate is frozen at the date of the site plan or zoning application (s. 26.2).
9. **Construction, occupancy, completion.**
   - CMHC counts starts and completions: Statistics Canada table 34-10-0154.
   - The province counts starts and additional residential units, among others, against the 2031 targets.
   - The Building Faster Fund ended after its 2026 round. A federal-provincial Development Charge Reduction Program opened on 1 Jun 2026. https://www.canada.ca/en/housing-infrastructure-communities/news/2026/06/canada-and-ontario-open-applications-for-new-development-charge-reduction-program0.html

**Where residents take part:** statutory public meetings for OPAs and ZBAs, written submissions, the Committee of Adjustment, council delegations. Residents have no say in site plan or building permit decisions.

**What's hard today**
- Approvals and permits are published in separate lists with no shared file number.
- Permits show the date issued, not the date work started.
- Units approved but not permitted are invisible.
- Water capacity now gates permits.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Units at permit, under construction, completed | Housing lens from city permit data and CMHC | Works today | Live budget decision, `lenses.housing.stages`: permit issued 22,486 units, under construction 6,820, completed 20,646 |
| Approved and site plan stages | Marked untracked, with the reason | Works today (honestly marked as a data gap) | `stages[approved].tracked: false`: "only Kitchener publishes zoning and subdivision application" |
| Median time between stages | Kitchener and Cambridge, where the same permit can be followed; not for the region | Partly | `timeBetween` notes; `lenses/housing/README.md` |
| Provincial target progress | 70,000 by 2031; 15,902 counted from 2022 to 2024 | Works today | `lenses.housing.target` |
| Where progress gets hard to track | Eight plain "hard to track" notes | Works today | `lenses.housing.hardToTrack` |
| Statutory timelines (90/120 days, site plan 60 days, permits 10 to 30 days) | None | Not yet | Not checked: whether the city open data has application dates |
| Water allocation as a constraint | The water supply decision exists; the 2026 allocation policy isn't a source | Not yet | `data/decisions/row-water-supply-2051.json` sources list |
| Development charges, conditions, draft approval lapse | None | Not yet | No such data |

---

## 7. Construction scouting for a tunnel or LRT section

**Who does it**
- **The Region's ION Stage 2 project team, with consulting engineers:** tunnels and geotechnical work.
- **Agencies with permits or approvals:**
  - the Ministry of Transportation, for Highway 401;
  - the Grand River Conservation Authority, for the floodplain;
  - utility owners.
- **Property and legal staff:** acquisition and expropriation.
- **Traffic operations:** detours and truck routes.
- **By-law staff:** noise exemptions.
- **Community relations staff.**

**Steps**
1. **Environmental assessment: the Transit Project Assessment Process** (O. Reg. 231/08, https://www.ontario.ca/laws/regulation/080231).
   - The process: notice of commencement, consultation, Environmental Project Report, notice of completion (s. 6(1)).
   - The notice of completion is due within 120 days of commencement (s. 6(2)).
   - Objections must arrive within 30 days of completion (s. 11(3)).
   - The Minister may act from 30 to 65 days after the notice of completion (s. 12(1)).
   - Later changes go through an addendum (s. 15).
   - **ION Stage 2:** notice of commencement 10 Dec 2020; final report 6 Apr 2021; Minister's notice to proceed 10 Jun 2021. Council endorsed a new south terminal and route on 5 Dec 2023. The initial business case was approved in November 2025, and no construction start is set. https://regionofwaterloo.ca/programs-and-services/roads-and-transportation/transit-and-transportation/stage-2-ion/
   - **Not found:** whether the 2023 route change needs an addendum.
2. **Geotechnical investigation.** Boreholes, groundwater and contamination testing, then a geotechnical baseline report.
   - FHWA-NHI-10-034, chapter 3, is a common reference: https://www.fhwa.dot.gov/bridge/tunnel/pubs/nhi09010/tunnel_manual.pdf
   - We could not open the PDF to confirm its borehole spacing and depth guidance.
3. **Shaft and laydown siting.**
   - A launch site holds the muck pit, conveyors, grout plant, segment storage and gantry cranes (Metrolinx, Ontario Line; search snippet).
   - **Not found:** published Metrolinx siting criteria.
4. **Property acquisition** (Expropriations Act, https://www.ontario.ca/laws/statute/90e26).
   - Notice to owners, and an owner may ask for a hearing of necessity within 30 days (s. 6).
   - The hearing tests whether the taking is "fair, sound and reasonably necessary" (s. 7).
   - The Building Transit Faster Act removes these hearings, but only for provincial (Metrolinx) transit projects (s. 44; https://www.ontario.ca/laws/statute/20b12). It would not apply to a Region-delivered Stage 2 unless that changes. This is our reading.
5. **Utilities.**
   - Locate requests must be made before digging; standard locates are due within 5 business days (Ontario Underground Infrastructure Notification System Act, s. 10(1) and s. 6(3), https://www.ontario.ca/laws/statute/12o04).
   - When a road authority makes a utility relocate, labour costs are shared 50/50 unless agreed otherwise (Public Service Works on Highways Act s. 2, https://www.ontario.ca/laws/statute/90p49).
6. **Noise and hours.**
   - Kitchener: "Construction noise is allowed between 7 a.m. and 7 p.m. seven days a week". Exemptions take 7 to 10 days. https://www.kitchener.ca/bylaws-and-enforcement/noise-complaints-and-exemptions/
   - Cambridge By-law 32-04 s. 2(b): excavators, cranes, pile drivers and similar equipment are banned from 8 pm Saturday to 7 am Monday. It sets no weekday hours. https://www.cambridge.ca/media/1gvdnrdg/noise-by-law-032-04.pdf
   - We found no provincial override of local noise by-laws in the Building Transit Faster Act.
7. **Truck routes.** The Region's Traffic and Parking By-law 16-023 defines a heavy truck (search snippet). **Not found:** an official truck route map.
8. **Construction notices and liaison.**
   - Metrolinx uses Construction Liaison Committees, aims for about 2 weeks' notice of work, and runs a 24/7 line, e.g. Eglinton West, 416-202-8001. These are mostly search snippets. https://www.metrolinx.com/en/projects-and-programs/eglinton-crosstown-west-extension/contact-us
   - For ION Stage 1 we found only news coverage of business complaints about communication.

**Where residents take part:**
- comments and objections during the Transit Project Assessment Process;
- hearings of necessity, for owners;
- noise exemption requests at council;
- Construction Liaison Committees.

**What's hard today**
- Ground conditions are unknown until boreholes are drilled.
- Who owns which land is not public.
- Truck routes and work hours differ by city.
- Residents learn about the work from notices that arrive late.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Find candidate launch and extraction sites, scored by stated weights | Construction scout from OpenStreetMap: room, distance to the line, buffer from sensitive uses, truck access, land use | Partly (in the repo, not live) | `data/lenses/construction-row-2027-budget.json`: 8 ranked sites, top launch site score 74. Live `GET /decisions/row-2027-budget`: `lenses` has no `construction` |
| Lay out bores, cross-passages, boreholes | Twin 6.5 m bores of 2,828 m; 11 cross-passages (no more than 244 m apart, NFPA 130); 49 boreholes | Partly (repo only) | Same file; `lenses/construction/layout.ts` |
| Long-section and floodplain flag | Profile from the Canadian Digital Elevation Model; limit says the extraction shaft likely sits in the Speed River floodplain | Partly (repo only) | Same file, `limits` |
| Steps and what residents notice | 7 steps, about 100 trucks a day estimated | Partly (repo only), with an hours error | `lenses/construction/steps.ts:97` says "Work mostly on weekdays, 7 am to 7 pm". Kitchener allows 7 to 7 every day; Cambridge, where Preston is, bans heavy equipment Saturday night to Monday morning |
| Transit Project Assessment Process status and addendum | None | Not yet | The scenario doesn't mention the 2021 approval or that a change would need an addendum |
| Ground conditions | None (limit stated) | Not yet | `limits`: "No geotechnical data" |
| Utilities | None (limit stated) | Not yet | `limits`: "No utilities data" |
| Property and expropriation | None (limit stated) | Not yet | `limits`: "No property data" |
| Legal truck routes | Straight-line distance to the nearest main road | Not yet | `limits`: "Distances are straight lines, not truck routes" |
| Construction notices and liaison | None | Not yet | |

---

## 8. Development application review and Committee of Adjustment hearings

**Who does it**
- **The applicant or agent.**
- **The Secretary-Treasurer of the Committee.** In Kitchener this is Legislated Services, CofA@kitchener.ca, 519-741-2203.
- **City planning staff:** write a report on the four tests.
- **Circulated agencies:** the Region, the conservation authority, utilities.
- **The Committee:** appointed members.
- **Neighbours.**

**Steps** (Planning Act, https://www.ontario.ca/laws/statute/90p13)
1. **Application, fee, circulation to agencies.** The hearing is held within 30 days of the application (s. 45(4)).
2. **Notice** at least 10 days before the hearing (O. Reg. 200/96 s. 3(1)):
   - by mail to owners within 60 m, plus a sign on the property;
   - or a newspaper notice, or a website (s. 3(2), (4), (4.1));
   - the Committee may cut the radius to 30 m in detached, semi-detached or duplex zones (s. 3(6)).
3. **The staff report** assesses the four tests. Section 45(1) lets the Committee grant a "minor variance" that is "desirable for the appropriate development or use" of the land when "the general intent and purpose of the by-law and of the official plan" are maintained. The four tests come from this wording and from case law; we did not cite a case.
4. **Submissions.** Anyone may speak at the hearing (s. 45(6)).
   - In Kitchener, written submissions and agency comments are posted at kitchener.ca/meetings the Friday before.
   - Hearings are in person and livestreamed.
   - **Not found:** a written-comment deadline. Our own notice says "The notice gives no deadline".
   - https://kitchener.ca/news/posts/committee-of-adjustment-meeting-tuesday-march-17-2026/
5. **The decision** comes with written reasons, which must include the effect of submissions (s. 45(8.1)). It is sent within 10 days (s. 45(10)).
6. **Appeals.** Within 20 days, and only by the applicant, the Minister, a specified person or a public body (s. 45(12), Bill 23, in force 28 Nov 2022).
   - The "specified persons" are utilities, railways and similar bodies (s. 1(1)). Neighbours are not among them.
   - The Region, as an upper tier without planning responsibilities, has no appeal right (s. 1(4.3)).
7. **Fewer variances needed.** The as-of-right 10% setback reduction (s. 34(1.4) to (1.7); O. Reg. 545/06 s. 1.1) removes some small variances.

**Where residents take part:** speaking at the hearing, or a written submission before it. There is no appeal to the Ontario Land Tribunal for neighbours.

**What's hard today**
- Notices are short and legal.
- The four tests decide the outcome, but residents rarely know to address them.
- Staff reports appear only days before the hearing.
- Residents often assume they can appeal, and they can't.

| Step | Municipal Agents feature | Status | Evidence |
|---|---|---|---|
| Hearing date, time and how to take part | Timeline: the 17 Nov 2026, 10:00 hearing with speak, write and watch | Works today | `GET /decisions/kitchener-transit-hub-variances`; `calendar.ics`, 1 event |
| What is being varied, in plain words | Summary "decides on six zoning rule changes for the transit hub"; trade-off "larger hub ... but reduces outdoor green space" | Works today | Live brief |
| Check the notice period | None. Notice dated 30 Oct 2026, hearing 17 Nov 2026: 18 days, above the 10-day minimum. We worked this out; the product doesn't | Not yet | `data/sources/index.json` (`published: 2026-10-30`) |
| Map of the 60 m notice area | None | Not yet | |
| The four tests, in plain words, so comments can address them | Glossary only has "Minor Variance" | Not yet | Live brief `glossary` |
| Who can appeal (not neighbours) | The notice says it (`kitchener-cofa-2026-11-17` p. 3); the brief doesn't | Not yet | Live brief `haveYourSay` has 3 statements, none on appeals |
| Staff report and its recommendation | Not among the sources | Not yet | `data/decisions/kitchener-transit-hub-variances.json` sources (6 documents) |
| Transit access around the site | Point-area transit lens with region-wide reach | Works today | Live `lenses.transit.focus`: 45.3% of the region's people reach the site within 45 minutes at weekday 8 am |
| The decision and the appeal deadline after the hearing | None | Not yet | No post-hearing events |

---

## Wrong or misleading against real practice

1. **Budget: who decides.**
   - The decision says `decidedBy: "Regional Council, Region of Waterloo"`. The brief says "Regional Council decides the 2027 plan and budget" and "Staff first present the draft budget proposal on December 16, 2026".
   - From 15 Nov 2026 the head of council proposes the budget, by 1 Feb 2027, and the amendment, veto and override windows follow (O. Reg. 530/22 s. 7).
   - Fix: add those steps as timeline events, plus an unknown: how the 16 Dec overview relates to the chair's proposal.
2. **The live error message.** The raw Gemini 402 JSON reaches the browser. `docs/code-tour.md` says residents get a plain message. The fix is in the working tree, not deployed.
3. **The CofA brief's "Have your say".** It reads as if residents have the usual options. It leaves out that they cannot appeal to the Ontario Land Tribunal (s. 45(12)), and it doesn't explain the four tests their comments are judged against.
4. **A "verified" statement that isn't supported.**
   - The hub homeowner impact about "transit hub debt" through "regional property tax bills" cites a quote that doesn't mention debt or tax.
   - It is also labelled `kind: "fact"` although it is a "could" impact.
   - The hub brief repeats two items: the Victoria Street lane trade-off appears twice, and the operating-cost unknown appears twice.
5. **Construction scout.**
   - Hours: "Work mostly on weekdays, 7 am to 7 pm" doesn't match either by-law.
   - The scenario doesn't say that a tunnel would be a change to the 2021-approved Stage 2 project, which needs an addendum under O. Reg. 231/08 s. 15.
   - The skill's borehole depth rule ("at least 1.5 tunnel diameters below the tunnel bottom, FHWA-NHI-10-034 ch. 3") is unverified by us; we could not open the FHWA PDF.
6. **The spec and the live demo disagree on lenses.** The spec presents the cost lens (chart and sliders) and the construction scout as product features. The live site shows neither for any decision.
7. **Translation label.** `docs/requirements.md` (US-7, NFR-11) says translations are labelled as machine-made. The UI string is "Translated into {lang}", which doesn't say machine.
8. **Spend cap vs. account balance.** The US$5 daily cap (`server/limits.ts`) didn't prevent an outage. The provider account's prepaid credit ran out first; only US$0.04 had been spent today.

---

## Gaps worth closing

Ranked by value to the judges (Future Cities Institute planners and researchers), with effort. **★ = top 3, each doable in under 45 minutes.**

| Rank | Gap | Why judges care | Proposal | Est. min |
|---|---|---|---|---|
| 0 (outage, do first) | Ask is down (402) | Ask is the demo | The owner tops up Gemini prepaid credit, then deploys the working tree's offline fallback (`agents/offline.ts`, `isUnreachable` in `agents/loop.ts`) so an outage shows checked statements, not raw JSON. Re-run one question to confirm | 15 |
| 1 ★ | Strong-chair budget steps | Planners will know the Region's powers change on 15 Nov; getting "who decides" wrong costs credibility | **Source:** print O. Reg. 530/22 (e-Laws) to PDF in `data/sources/`, then run `npm run sources`. **`data/decisions/row-2027-budget.json`:** add a `deadline` event "Chair may propose the 2027 budget (by 1 Feb 2027)" citing s. 7(1) and (1.1), and an `other` event explaining the 30-day amend, 10-day veto and 15-day two-thirds override windows. Change `decidedBy` to "Regional Chair proposes; Regional Council may amend". **`row-2027-budget.notes.md`:** add the unknown "how the 16 Dec overview relates to the chair's proposal" | 35 |
| 2 ★ | CofA: who can appeal, the four tests, notice check | The CofA hearing is the most concrete "have your say" in the demo, and it is on 17 Nov | **`data/decisions/kitchener-transit-hub-variances.json`:** add a `deadline` event "Appeal period ends 20 days after the decision: applicant, Minister, specified persons and public bodies only", citing `kitchener-cofa-2026-11-17` p. 3. **`agents/skills/explainer/SKILL.md`:** for Committee of Adjustment decisions, record who may appeal and a plain glossary entry on the four tests. Regenerate the brief once credit is back. Optional: show "Notice given 18 days before; minimum 10 (O. Reg. 200/96 s. 3(1))" as a computed figure | 40 |
| 3 ★ | Construction scout: correct hours, mention the assessment process, deploy | The most visual feature; engineers on the panel will check the by-laws | **`lenses/construction/steps.ts`:** replace the fixed "7 am to 7 pm" with per-city text (Kitchener 7 to 7 daily; Cambridge no heavy equipment from 8 pm Saturday to 7 am Monday) and add both by-law URLs to `references`. **`limits`:** add "A tunnel would change the 2021-approved Stage 2 project and need an addendum under O. Reg. 231/08 s. 15". Rebuild and deploy so the live budget decision shows the lens | 40 |
| 4 | Ask an accessible format, report an error | AODA s. 12 and s. 11 are clerks' daily duties | `web/src/screens/common.tsx` footer: a "Need this in another format?" link to the city clerk contact from `cities/waterloo-region.json` (`clerkContact`), plus "Report an error" (mailto). A print stylesheet in `web/src` | 25 |
| 5 | Flag weak support | Researchers will test whether "verified" means "supported" | **`agents/tools.ts`, `ruleProblems`:** reject a statement when none of its content words (nouns and numbers, after stop-words) appear in any of its quotes. The check is deterministic and comes with a test | 45 to 60 |
| 6 | Statutory notice and appeal calculator | Planners think in statutory days | New `shared/notice.ts`: from the type (OPA, ZBA, minor variance, consent), the notice date and the meeting date, compute the minimum notice (20 or 10 days), the notice-of-decision deadline (15 or 10 days) and the appeal end (20 days); show them in the timeline. Tests in `shared/notice.test.ts` | 60 |
| 7 | A cost lens on the live site | Challenge 3 isn't visible live | Precompute one `CostLens` with `buildCostLens` (for example the Kitchener Central Transit Hub: phase budgets of $35 million and $129 million are cited on `row-kcth-update-2026` p. 5), with stated assumptions for operating costs and the federal social cost of carbon (cited URL) as the carbon price. Write it to `data/lenses/cost-kitchener-transit-hub-variances.json` | 60 to 90 |
| 8 | Transit equity overlay | FCI researchers expect equity analysis | **`lenses/transit/fetch.ts`, `lens.ts`:** add the 2021 census low-income (LIM-AT) share per dissemination area. Report each gap's share of low-income residents against the region's share, in the spirit of a Title VI "disproportionate burden" comparison, with the threshold stated | 90 to 120 |
| 9 | Budget excluded-expenses report and per-household calculator | Finance staff will ask | Add the Region's O. Reg. 284/09 report as a source when found. A small `lenses/cost/tax.ts`: levy change ÷ the assessment base × the average home's $354,500 assessment (2016 valuation) | 60 |
| 10 | Housing: water allocation and timelines | Allocation now gates permits | Add the Region's 2026 allocation news release and Kitchener By-law 2026-091 as sources. Add a `hardToTrack` line on allocation in `lenses/housing/build.ts` | 30 |
| 11 | Commitments across decisions | Challenge 4 is about tracking over time | `data/commitments.json` as a register keyed by commitment id; `record_commitment` links to it; a `/commitments` page | 120+ |
