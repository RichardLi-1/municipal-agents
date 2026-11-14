# Agent evals: results

Run 2026-11-14T07:01:28.117Z with `gemini-3.6-flash` against the committed data. Scored in code by `agents/evals/run.ts` from `agents/evals/cases.json`.

**1 of 3 cases pass.** 26 model calls, US$0.1693 in total (US$0.0564 a question), median 25.0 s a question.

Every case is checked for: each cited quote found again on its page, valid [n] markers, no advice on how to vote or what to think, and a reading grade of 9 or lower (English). Cases add pages that must be cited, words that must (or must not) appear, and "says the documents don't answer it".

| Case | Result | Grade | Calls | US$ | Seconds | What failed |
|---|---|---|---|---|---|---|
| speak-council | pass | 7.6 | 8 | 0.0493 | 14.3 |  |
| funding-gap | **fail** | 10.1 | 9 | 0.0574 | 25.0 | reading grade 10.1 > 9 |
| climate-on-track | **fail** | 10 | 9 | 0.0626 | 34.8 | reading grade 10 > 9 |

## Answers

### speak-council

**Q:** How can I speak to Regional Council about the budget?

**A:** You can register to speak to Regional Council online through the Region's delegation registration form [1]. If you register by noon one week before the meeting, you get five minutes to speak [2]. If you register after that deadline, you may get three minutes to speak [3]. Be sure to send any slides or handouts to the Clerk's Office at least 24 hours before the meeting [4].

1. You can register online through the Region's delegation registration form. (row-delegation-guide p.1: "To register as a delegation for any Committee or Council meeting, please visit https://forms.regionofwaterloo.ca/Council-and-Administrative- Services/CAS/Delegation-Registration.")
2. If you register by noon one week before the meeting, you get five minutes to speak. (row-delegation-guide p.1: "If you register by noon one week before the meeting you will be listed on the agenda and be allowed to speak for 5 minutes.")
3. If you register after that deadline, you may get three minutes to speak. (row-delegation-guide p.2: "Delegations that register after the deadline may still be heard but will have 3 minutes to speak.")
4. Send any slides or handouts to the Clerk's Office at least 24 hours before. (row-delegation-guide p.2: "Any materials (including slide decks and handouts) that you wish to share at the meeting must be received by the Clerk’s Office at least 24 hours before the meeting.")

### funding-gap (fail)

**Q:** What is the Region's infrastructure funding gap?

**A:** The Region's annual infrastructure funding gap has grown to $87.6 million per year [1]. The Region plans to spend $233.9 million yearly on asset renewal, which is below the $321.5 million needed [2]. Spending less on asset renewal keeps immediate budgets lower, but it creates this long-term infrastructure gap [3].

1. The Region's annual infrastructure funding gap has grown to $87.6 million per year. (row-asset-management-review-2026 p.1: "funding gap has grown from $82.8M per year to $87.6M per year.")
2. The Region plans to spend $233.9 million yearly on renewal, below the $321.5 million needed. (row-asset-management-review-2026 p.3: "The annual average level of investment in asset renewal over the ten-year capital program of $233.9 million falls short of the optimal level of investment needs identified in the 2026 progress report of $321.5 million.")
3. Spending less on asset renewal keeps immediate budgets lower, but it creates a long-term infrastructure funding gap. (row-asset-management-review-2026 p.3: "The annual average level of investment in asset renewal over the ten-year capital program of $233.9 million falls short of the optimal level of investment needs identified in the 2026 progress report of $321.5 million. This represents a renewal funding shortfall or infrastructure funding gap of $87.6 million per year.")

### climate-on-track (fail)

**Q:** Is Waterloo Region on track for its 2030 climate target?

**A:** Waterloo Region set a target to cut community greenhouse gas emissions 50 percent below 2010 levels by 2030 [1]. However, the region is currently not on track to meet this 2030 target [2, 3]. By 2022, community emissions were only 12 percent below 2010 levels [4, 3]. To hit its goal, the region needs to cut about 215,000 tonnes of emissions each year [5].

1. The Region set a target to cut community greenhouse gas emissions 50 percent below 2010 levels by 2030. (wr-ghg-inventory-2022 p.2: "Our community GHG targets: 80% emissions reduction (below 2010 baseline levels) by the year 2050, With an interim target of a 50% reduction by 2030.")
2. Waterloo Region is not on track to meet its target of cutting emissions 50 percent by 2030. (wr-ghg-inventory-2022 p.2: "Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")
3. By 2022 emissions were 12 percent below 2010 levels, leaving the region off track for its 2030 target. (wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels). Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")
4. In 2022 community greenhouse gas emissions were 12 percent below 2010 levels. (wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels).")
5. The region needs to cut about 215,000 tonnes of emissions each year. (wr-ghg-inventory-2022 p.2: "In order to reach the target, annual GHG emissions need to be reduced by approximately 1.72 million tonnes CO2e. This is a reduction of an additional 215,000 tonnes CO2e each year (approximate).")

