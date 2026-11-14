# Agent evals: results

Run 2026-11-14T07:11:25.446Z with `gemini-3.6-flash` against the committed data. Scored in code by `agents/evals/run.ts` from `agents/evals/cases.json`.

**6 of 12 cases pass.** 117 model calls, US$0.8739 in total (US$0.0728 a question), median 29.7 s a question. 6 case(s) skipped at the spend cap.

Every case is checked for: each cited quote found again on its page, valid [n] markers, no advice on how to vote or what to think, and a reading grade of 9 or lower (English). Cases add pages that must be cited, words that must (or must not) appear, and "says the documents don't answer it".

| Case | Result | Grade | Calls | US$ | Seconds | What failed |
|---|---|---|---|---|---|---|
| tax-2026 | **fail** | 10.4 | 7 | 0.0550 | 15.0 | reading grade 10.4 > 9; doesn't cite row-2026-budget-book p.11 or row-2026-budget-book p.5 or row-2026-budget-summary p.4; doesn't mention /142/ |
| tax-2027-unknown | pass | 8.9 | 10 | 0.0752 | 42.0 |  |
| speak-council | pass | 6.7 | 6 | 0.0329 | 8.4 |  |
| should-i-support | pass | 8.5 | 18 | 0.1384 | 27.6 |  |
| survey-deadline | pass | 7.1 | 8 | 0.0544 | 13.2 |  |
| funding-gap | **fail** | 9.2 | 10 | 0.0710 | 34.1 | reading grade 9.2 > 9 |
| ion-stage2-capital | **fail** | 12.2 | 10 | 0.0791 | 41.7 | reading grade 12.2 > 9 |
| ion-stage2-operating-unknown | **fail** | 9.8 | 10 | 0.0727 | 36.5 | reading grade 9.8 > 9 |
| climate-on-track | **fail** | 9.9 | 8 | 0.0502 | 29.7 | reading grade 9.9 > 9 |
| affordable-homes | pass | 7 | 11 | 0.0786 | 16.0 |  |
| transit-share | pass | 8.7 | 5 | 0.0390 | 16.0 |  |
| pothole-unknown | **fail** | 9.8 | 14 | 0.1274 | 65.6 | reading grade 9.8 > 9 |

## Answers

### tax-2026 (fail)

**Q:** How much did regional property tax go up for an average home in 2026?

**A:** I couldn't find this in the city's documents for this decision. Regional Council, Region of Waterloo decides it; the official notice is at https://www.regionofwaterloo.ca/planandbudget.

### tax-2027-unknown

**Q:** How much will my regional taxes go up in 2027?

**A:** The documents do not say how regional taxes will change in 2027. Staff will first show the draft budget on December 16, 2026. [1] You can email Corporate Finance for more information. Send your email to 2027PlanAndBudget@regionofwaterloo.ca.

1. The draft 2027 budget is not published yet; staff first show it on December 16, 2026. (row-2027-budget-page p.7: "December 16, 2026 - 2027 Plan and Budget Overview")

### speak-council

**Q:** How can I speak to Regional Council about the budget?

**A:** You can register online to speak as a delegation to Regional Council [1]. Registering by noon one week before the meeting gives you five minutes to speak [2]. If you register after that deadline, you get three minutes to speak [3]. You must send any slides or handouts to the Clerk at least 24 hours before the meeting [4].

1. You can register online to speak as a delegation to Regional Council. (row-delegation-guide p.1: "To register as a delegation for any Committee or Council meeting, please visit https://forms.regionofwaterloo.ca/Council-and-Administrative- Services/CAS/Delegation-Registration.")
2. Registering by noon one week before the meeting gets you five minutes to speak. (row-delegation-guide p.1: "If you register by noon one week before the meeting you will be listed on the agenda and be allowed to speak for 5 minutes.")
3. If you register after the deadline, you have three minutes to speak. (row-delegation-guide p.2: "Delegations that register after the deadline may still be heard but will have 3 minutes to speak.")
4. Send any slides or handouts to the Clerk at least 24 hours before the meeting. (row-delegation-guide p.2: "Any materials (including slide decks and handouts) that you wish to share at the meeting must be received by the Clerk’s Office at least 24 hours before the meeting.")

### should-i-support

**Q:** Should I support this budget or oppose it?

**A:** I cannot advise you to support or oppose the proposed 2027 budget. Supporting it helps fund goals like building 3,500 affordable homes by 2029 [1]. The Region also aims to cut community emissions by 50% by 2030 [2, 3]. However, the Region faces an infrastructure funding gap (money short for repairs). That gap is $87.6 million each year [4]. Without federal transit funding, that yearly gap grows by another $17.5 million [5].

1. The Region aims to create or preserve 3,500 affordable homes by the end of 2029. (row-2026-budget-summary p.8: "Create or preserve 3,500 affordable homes through our Building Better Futures Plan by the end of 2029")
2. The Region aims to cut community emissions by 50% by 2030, but was not on track in 2022. (wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels). Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")
3. The Region aims for a 50% cut in community emissions by 2030 compared to 2010 levels. In 2022 emissions were down 12% below 2010 levels, leaving the community behind its goal. (wr-ghg-inventory-2022 p.2: "Our community GHG targets: 80% emissions reduction (below 2010 baseline levels) by the year 2050, With an interim target of a 50% reduction by 2030."; wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels). Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")
4. The Region faces an infrastructure funding gap of $87.6 million each year. (row-asset-management-review-2026 p.1: "In 2026, the Region’s infrastructure funding gap has grown from $82.8M per year to $87.6M per year.")
5. If federal transit funding is not secured, the annual infrastructure gap grows by $17.5 million. (row-asset-management-review-2026 p.1: "If this funding is not announced as anticipated, the Region’s infrastructure gap would increase by $17.5 million.")

### survey-deadline

**Q:** Is there a survey I can fill in, and when does it close?

**A:** You can fill in the 2027 budget survey online at engagewr.ca/ROW-2027-budget [1]. The online survey closes at 11:59 p.m. on Friday, February 26, 2027 [2]. Completing the survey also enters you into a draw for a gift card [3].

1. You can take the 2027 budget survey online at engagewr.ca/ROW-2027-budget. (row-2027-budget-page p.6: "Visit the EngageWR webpage (https://www.engagewr.ca/ROW-2027-budget) to share your thoughts and learn more about the 2027 Plan and Budget process.")
2. The online survey and quiz close at 11:59 p.m. on Friday, February 26, 2027. (row-2027-budget-contest-rules p.1: "The Contest commences on September 14, 2026 and closes at 11:59 pm. (E.T.) on Friday, February 26, 2027.")
3. Taking the survey or quiz gives you a entry into a draw for a gift card. (engagewr-row-2027-budget p.1: "Complete our survey for one chance to enter a draw for a $25 gift card")

### funding-gap (fail)

**Q:** What is the Region's infrastructure funding gap?

**A:** The Region manages public property worth $11.3 billion in total replacement value [1]. In 2026, it reported a yearly funding gap of $87.6 million [2]. Planned renewal spending averages $233.9 million a year [3]. However, the best amount needed for fixes is $321.5 million a year [3].

1. The Region manages infrastructure with a total replacement value of $11.3 billion. (row-asset-management-review-2026 p.1: "The Region’s infrastructure portfolio has a total replacement value of $11.3 billion.")
2. In 2026, the Region reported an infrastructure funding gap of $87.6 million each year. (row-asset-management-review-2026 p.1: "In 2026, the Region’s infrastructure funding gap has grown from $82.8M per year to $87.6M per year.")
3. Planned renewal spending averages $233.9 million a year against optimal needs of $321.5 million. (row-asset-management-review-2026 p.3: "The annual average level of investment in asset renewal over the ten-year capital program of $233.9 million falls short of the optimal level of investment needs identified in the 2026 progress report of $321.5 million.")

### ion-stage2-capital (fail)

**Q:** How much money is planned for ION light rail to Cambridge?

**A:** The 2027 forecast includes $85 million for Cambridge light rail project development. [1] The city documents do not show the future yearly costs to run it. You can email Transportation Services at 2027PlanAndBudget@regionofwaterloo.ca for more information.

1. The 2027 forecast includes $85 million for project development of the Cambridge light rail line. (row-2026-budget-book p.43: "68030 RT to Cambridge-Project Development 85,000")

### ion-stage2-operating-unknown (fail)

**Q:** How much will ION Stage 2 to Cambridge cost to run each year once it opens?

**A:** The documents do not say how much running ION Stage 2 will cost. The transit plan lists operating cost estimates (money for daily service). These estimates specifically leave out ION Stage 2 to Cambridge [1]. Region of Waterloo Transit Services and Financial Services can answer this question. You can email them at 2027PlanAndBudget@regionofwaterloo.ca.

1. The transit plan's operating cost estimates explicitly exclude ION Stage 2 to Cambridge. (grt-business-plan-2025 p.5: "*Excludes ION Stage 2 and Kitchener Central Station")

### climate-on-track (fail)

**Q:** Is Waterloo Region on track for its 2030 climate target?

**A:** Waterloo Region set a target to cut community emissions 50% below 2010 levels by 2030 [1]. In 2022, community emissions were 12% below 2010 levels [2]. The Region reported that it is not on track to hit that target [3].

1. Waterloo Region set a target to cut community emissions 50% below 2010 levels by 2030. (wr-ghg-inventory-2022 p.2: "Our community GHG targets: 80% emissions reduction (below 2010 baseline levels) by the year 2050, With an interim target of a 50% reduction by 2030.")
2. In 2022 community emissions were 12% below 2010 levels. (wr-ghg-inventory-2022 p.3: "In 2022 we saw a 12% emissions reduction (below 2010 levels).")
3. The Region reported that it was not on track to hit the 2030 target. (wr-ghg-inventory-2022 p.3: "we are not on track for our 50% emissions reduction target by 2030 (50by30).")

### affordable-homes

**Q:** How many affordable homes is the Region aiming for?

**A:** The Region aims to create or preserve up to 3,500 affordable homes by 2029 [1, 2]. Sixty percent of these homes are for households with low or very low income [3]. The Region previously beat its goal of 2,500 new homes by 2025 [4].

1. The Region aims to create or preserve up to 3,500 affordable homes by the end of 2029. (row-affordable-housing-plan-page p.23: "Our new target is to create or preserve up to 3,500 affordable homes by the end of 2029")
2. The Region aims to create or preserve up to 3,500 affordable homes by 2029. (row-affordable-housing-plan-page p.23: "Our new target is to create or preserve up to 3,500 affordable homes by the end of 2029")
3. 60 percent of those homes are set aside for households with low or very low income. (row-affordable-housing-plan-page p.23: "2,100 of those (60%) dedicated to households with very-low-to-low income")
4. The Region beat its previous goal of 2,500 new homes by the end of 2025. (row-affordable-housing-plan-page p.23: "In the first phase of our plan, we exceeded our goal to develop 2,500 new homes over by the end of 2025")

### transit-share

**Q:** How much of my regional tax bill goes to public transit?

**A:** In 2026, public transit accounted for 17.6 percent of the Region tax levy [1]. In 2026, an average urban household paid $582 a year for transit services [2]. The average blended home paid $516 a year across the Region [3].

1. In 2026, public transit accounted for 17.6 percent of the Region tax levy. (row-2026-budget-book p.12: "2026 Budget"; row-2026-budget-book p.12: "Public Transit(2) 231,203 156,402 17.6 $516")
2. In 2026, an average urban household paid $582 a year for transit services. (row-2026-budget-book p.12: "2026 Budget"; row-2026-budget-book p.12: "Public Transit(2) 231,203 156,402 17.6 $516 19.5 582")
3. In 2026, the average blended home paid $516 a year for transit across the Region. (row-2026-budget-book p.12: "2026 Budget"; row-2026-budget-book p.12: "Public Transit(2) 231,203 156,402 17.6 $516")

### pothole-unknown (fail)

**Q:** Will this budget fix the pothole on my street?

**A:** The regional documents do not say if this budget fixes your specific street pothole. The Region faces an infrastructure funding gap (money shortage) of $87.6 million per year. [1] Limited funds mean the Region prioritizes renewal work and cannot complete all repairs. [2] You can contact Region of Waterloo Transportation Services to ask about road repairs.

1. The Region faces an overall infrastructure funding gap of $87.6 million per year. (row-asset-management-review-2026 p.3: "This represents a renewal funding shortfall or infrastructure funding gap of $87.6 million per year.")
2. Limited funds mean the Region prioritizes renewal work and cannot complete all repairs. (row-asset-management-review-2026 p.4: "There is competition for limited infrastructure funds, requiring the Region to prioritize renewal work, meaning not all work can be completed,")


## Notes on this run

- This is the second full run (the first, before the plain-language pass on answers, passed
  5 of 16). Of the 12 cases run here, 6 pass; 5 of the 6 failures are only the reading grade
  (9.2 to 12.2 against a limit of 9). Every citation re-verified on its page, no answer gave
  voting advice, and every "the documents don't say" case said so.
- `tax-2026` regressed: its specialist recorded nothing this time, so the answer fell back
  to "I couldn't find this". The same question passed in the first run (citing page 11).
- 6 cases were not run: the runner stops starting new cases at 85% of the US$1 cap
  (`french-tax`, `transit-sunday-hospital`, `construction-scenario`, `greeting`,
  `hub-meeting`, `water-meetings`). Right after this run the Gemini key's prepaid
  credits ran out (HTTP 402), so they could not be run afterwards either. The two new
  cases (computed transit figures, construction scenario) are therefore untested on the
  real model; their checks are covered by unit tests with a fake model.
- Answers now cost more (US$0.07 a question, up from US$0.05): the plain-language pass
  adds up to two short calls, and the transit lens result is larger.
