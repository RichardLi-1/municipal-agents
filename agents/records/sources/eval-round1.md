# Agent evals: results

Run 2026-11-14T06:55:01.597Z with `gemini-3.6-flash` against the committed data. Scored in code by `agents/evals/run.ts` from `agents/evals/cases.json`.

**5 of 16 cases pass.** 128 model calls, US$0.8400 in total (US$0.0525 a question), median 15.3 s a question.

Every case is checked for: each cited quote found again on its page, valid [n] markers, no advice on how to vote or what to think, and a reading grade of 9 or lower (English). Cases add pages that must be cited, words that must (or must not) appear, and "says the documents don't answer it".

| Case | Result | Grade | Calls | US$ | Seconds | What failed |
|---|---|---|---|---|---|---|
| tax-2026 | pass | 7.2 | 7 | 0.0386 | 8.6 |  |
| tax-2027-unknown | **fail** | 10 | 14 | 0.1015 | 20.0 | reading grade 10 > 9 |
| speak-council | **fail** | 9.4 | 8 | 0.0500 | 16.9 | reading grade 9.4 > 9 |
| should-i-support | **fail** | 10.2 | 17 | 0.1263 | 41.1 | reading grade 10.2 > 9 |
| survey-deadline | pass | 4.5 | 7 | 0.0441 | 15.8 |  |
| funding-gap | **fail** | 12.5 | 8 | 0.0594 | 22.7 | reading grade 12.5 > 9 |
| ion-stage2-capital | **fail** | 12.1 | 5 | 0.0333 | 14.8 | reading grade 12.1 > 9 |
| ion-stage2-operating-unknown | **fail** | 10 | 8 | 0.0519 | 13.8 | reading grade 10 > 9 |
| climate-on-track | **fail** | 11 | 8 | 0.0493 | 22.6 | reading grade 11 > 9 |
| affordable-homes | pass | 7.2 | 8 | 0.0448 | 12.6 |  |
| transit-share | **fail** | 10.4 | 7 | 0.0580 | 16.4 | reading grade 10.4 > 9; doesn't cite row-2026-budget-book p.12; doesn't mention /516\|582/ |
| pothole-unknown | **fail** | 12 | 12 | 0.0852 | 15.3 | reading grade 12 > 9 |
| french-tax | **fail** | n/a | 7 | 0.0481 | 14.7 | doesn't cite row-2026-budget-book p.11 or row-2026-budget-book p.5 or row-2026-budget-summary p.4; doesn't mention /142/ |
| greeting | pass | 3.7 | 0 | 0.0000 | 0.0 |  |
| hub-meeting | pass | 8.2 | 6 | 0.0261 | 9.9 |  |
| water-meetings | **fail** | 10.7 | 6 | 0.0233 | 11.3 | reading grade 10.7 > 9 |

## Answers

### tax-2026

**Q:** How much did regional property tax go up for an average home in 2026?

**A:** In 2026, the regional property tax for an average home increased by $142.18 [1]. This was an increase of 5.10 percent [1].

1. In 2026, regional property tax for an average home increased by $142.18, or 5.10 percent. (row-2026-budget-book p.11: "2025 2026 $ Change % Change"; row-2026-budget-book p.11: "Property Tax 2,786.44 $2,928.62 142.18 5.10%")

### tax-2027-unknown (fail)

**Q:** How much will my regional taxes go up in 2027?

**A:** The official documents do not say how much your regional taxes will go up in 2027. The draft 2027 property tax increase is not published until December 16 [1]. Your regional tax may change; in 2026 it rose 5.10 percent, which added $142.18 [2]. The Region also faces an infrastructure renewal shortfall of $87.6 million each year [3]. You can contact the Region of Waterloo Finance Department at 2027PlanAndBudget@regionofwaterloo.ca or Regional Council for more information once the draft is released.

1. The draft 2027 property tax increase is not yet published until December 16. (row-2027-budget-page p.7: "December 16, 2026 - 2027 Plan and Budget Overview")
2. Your regional tax may change; in 2026 it rose 5.10 percent, adding $142.18. (row-2026-budget-book p.11: "2025 2026 $ Change % Change"; row-2026-budget-book p.11: "Property Tax 2,786.44 $2,928.62 142.18 5.10%")
3. The Region faces an infrastructure renewal shortfall of $87.6 million each year. (row-asset-management-review-2026 p.3: "This represents a renewal funding shortfall or infrastructure funding gap of $87.6 million per year.")

### speak-council (fail)

**Q:** How can I speak to Regional Council about the budget?

**A:** To speak to Regional Council about the budget, you must register first [1, 2]. You can call 519-575-4400 or email regionalclerk@regionofwaterloo.ca to sign up [2]. Make sure to register by noon one week before the meeting to get 5 minutes on the agenda [1].

1. Register by noon one week before the meeting to get 5 minutes on the agenda. (row-delegation-guide p.1: "If you register by noon one week before the meeting you will be listed on the agenda and be allowed to speak for 5 minutes.")
2. To register, call 519-575-4400 or email regionalclerk@regionofwaterloo.ca. (row-delegation-guide p.1: "You can call 519-575-4400 or email regionalclerk@regionofwaterloo.ca and staff can help you contact the proper person")

### should-i-support (fail)

**Q:** Should I support this budget or oppose it?

**A:** I cannot advise you on whether to support or oppose the budget. On one hand, focusing the budget on basic services and keeping up infrastructure helps keep regional services steady [1, 2]. This focus also supports plans to create or preserve 3,500 affordable homes by 2029 [3]. On the other hand, closing the Region's $87.6 million annual infrastructure gap could raise regional costs for property owners [4, 1]. Your regional property tax may change, building on an average increase of $142 in 2026 [5].

1. Protecting infrastructure keeps services steady, but funding it could raise regional costs for property owners. (row-2027-budget-page p.6: "Our focus for the 2027 plan and budget is clear in the face of these pressures: affordability for residents; maintaining critical services; and protecting essential infrastructure.")
2. Staff focus the 2027 budget on affordability, basic services, and keeping up infrastructure. (row-2027-budget-page p.6: "Our focus for the 2027 plan and budget is clear in the face of these pressures: affordability for residents; maintaining critical services; and protecting essential infrastructure.")
3. The Region plans to create or preserve 3,500 affordable homes by 2029. (row-affordable-housing-plan-page p.23: "Our new target is to create or preserve up to 3,500 affordable homes by the end of 2029")
4. The Region faces an annual infrastructure funding gap of $87.6 million to maintain its assets. (row-asset-management-review-2026 p.1: "In 2026, the Region’s infrastructure funding gap has grown from $82.8M per year to $87.6M per year.")
5. Your regional property tax may change; in 2026 it rose $142 for an average home. (row-2026-budget-book p.11: "Annual Cost of Regional Services Per Average Household* 2025 2026 $ Change % Change Property Tax 2,786.44 $2,928.62 142.18 5.10%")

### survey-deadline

**Q:** Is there a survey I can fill in, and when does it close?

**A:** You can fill out an online survey to share your feedback on the 2027 plan and budget [1]. The budget survey prize draw closes at 11:59 p.m. on Friday, February 26, 2027 [2].

1. You can complete an online survey to share feedback on the 2027 plan and budget. (engagewr-row-2027-budget p.1: "Complete our survey for one chance to enter a draw for a $25 gift card for your choice of either")
2. The budget survey prize draw closes at 11:59 p.m. on Friday, February 26, 2027. (row-2027-budget-contest-rules p.1: "The Contest commences on September 14, 2026 and closes at 11:59 pm. (E.T.) on Friday, February 26, 2027.")

### funding-gap (fail)

**Q:** What is the Region's infrastructure funding gap?

**A:** In 2026, the Region's infrastructure funding gap reached $87.6 million per year [1]. This gap exists because optimal yearly asset renewal costs $321.5 million, but planned spending averages only $233.9 million [2]. Without expected federal transit funding, the yearly infrastructure gap could rise by an additional $17.5 million [3].

1. In 2026, the Region's infrastructure funding gap reached $87.6 million per year. (row-asset-management-review-2026 p.1: "In 2026, the Region’s infrastructure funding gap has grown from $82.8M per year to $87.6M per year.")
2. Optimal yearly asset renewal costs $321.5 million, but planned funding averages $233.9 million. (row-asset-management-review-2026 p.3: "The annual average level of investment in asset renewal over the ten-year capital program of $233.9 million falls short of the optimal level of investment needs identified in the 2026 progress report of $321.5 million.")
3. Without expected federal transit funding, the yearly infrastructure gap would rise by $17.5 million. (row-asset-management-review-2026 p.1: "If this funding is not announced as anticipated, the Region’s infrastructure gap would increase by $17.5 million.")

### ion-stage2-capital (fail)

**Q:** How much money is planned for ION light rail to Cambridge?

**A:** The ten-year capital plan forecasts $2,045.6 million to develop the light rail project to Cambridge [1]. For 2027, the capital forecast sets aside $85 million for the Cambridge light rail project [2]. The official documents do not state what the annual operating and upkeep costs will be once it is built, but the Region of Waterloo Transportation Services department could answer.

1. The ten-year capital plan forecasts $2,045.6 million for light rail project development to Cambridge. (row-2026-budget-book p.43: "68030 RT to Cambridge-Project Development 85,000 72,000 78,000 78,000 313,000 1,732,600 2,045,600")
2. The 2027 capital forecast sets aside $85 million for the Cambridge light rail project. (row-2026-budget-book p.43: "68030 RT to Cambridge-Project Development 85,000 72,000 78,000 78,000 313,000 1,732,600 2,045,600")

### ion-stage2-operating-unknown (fail)

**Q:** How much will ION Stage 2 to Cambridge cost to run each year once it opens?

**A:** The Region's transit plan excludes yearly operating costs for ION Stage 2 light rail to Cambridge [1]. Because of this, the official documents do not say how much it will cost to run each year once it opens. You can contact the Region's Finance department at 2027PlanAndBudget@regionofwaterloo.ca to ask for more details.

1. The Region's transit plan excludes yearly operating costs for ION Stage 2 light rail to Cambridge. (grt-business-plan-2025 p.5: "*Excludes ION Stage 2 and Operating Business Plan Operating")

### climate-on-track (fail)

**Q:** Is Waterloo Region on track for its 2030 climate target?

**A:** Waterloo Region targets a 50% cut in greenhouse gas emissions below 2010 levels by 2030 [1]. In 2022, emissions were down 12% from 2010, meaning the region was not on track at that time [2, 3]. The documents do not say what community greenhouse gas emission levels were achieved after 2022. ClimateActionWR and the Region of Waterloo Sustainability Office could answer with more recent data.

1. Waterloo Region targets a 50% cut in greenhouse gas emissions below 2010 levels by 2030. (wr-ghg-inventory-2022 p.2: "Our community GHG targets: 80% emissions reduction (below 2010 baseline levels) by the year 2050, With an interim target of a 50% reduction by 2030.")
2. In 2022 emissions were down 12% from 2010, so the region was not on track. (wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels). Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")
3. In 2022 community emissions were 12% below 2010 levels. (wr-ghg-inventory-2022 p.2: "In 2022 we saw a 12% emissions reduction (below 2010 levels). Although we are seeing some progress and sustained emissions reductions, we are not on track for our 50% emissions reduction target by 2030")

### affordable-homes

**Q:** How many affordable homes is the Region aiming for?

**A:** The Region aims to create or preserve up to 3,500 affordable homes by late 2029 [1]. Of those homes, 2,100 are set aside for low-income households [2].

1. space The Region aims to create or preserve up to 3,500 affordable homes by late 2029. (row-affordable-housing-plan-page p.23: "Our new target is to create or preserve up to 3,500 affordable homes by the end of 2029")
2. space Of those homes, 2,100 are set aside for low-income households. (row-affordable-housing-plan-page p.23: "with 2,100 of those (60%) dedicated to households with very-low-to-low income")

### transit-share (fail)

**Q:** How much of my regional tax bill goes to public transit?

**A:** I couldn't find this in the city's documents for this decision. Regional Council, Region of Waterloo decides it; the official notice is at https://www.regionofwaterloo.ca/planandbudget.

### pothole-unknown (fail)

**Q:** Will this budget fix the pothole on my street?

**A:** The documents do not say whether the budget will fix the pothole on your specific street. [1] The regional budget pays for pothole repairs on regional roads, with $2.9 million forecast in 2027 for spot road resurfacing. [1, 2] The Region also planned $130.4 million for regional transportation capital projects in 2027. [3] To find out if your street is a regional road or scheduled for work, you can contact the Region of Waterloo Transportation and Environmental Services department.

1. The regional budget pays for pothole repairs on regional roads. (row-2026-budget-book p.36: "This department is also responsible for ensuring the safe design and operation of all Regional roads."; row-2026-budget-book p.36: "We keep local roads working safely through pothole repairs, grass cutting, flooding and erosion control, pavement markings, and more.")
2. The Region forecast $2.9 million in 2027 for various spot road resurfacing projects. (row-2026-budget-book p.45: "05174 Various Spot Resurfacings 1,929 2,900 4,829 2,900")
3. In last year's forecast, the Region planned $130.4 million for regional transportation capital projects in 2027. (row-2026-budget-book p.17: "45 Transportation 108,196 107,408 215,604 130,372")

### french-tax (fail)

**Q:** De combien la taxe foncière régionale a-t-elle augmenté en 2026 pour une maison moyenne? (lang fr)

**A:** I couldn't find this in the city's documents for this decision. Regional Council, Region of Waterloo decides it; the official notice is at https://www.regionofwaterloo.ca/planandbudget.

### greeting

**Q:** hello!

**A:** Hi! I can explain "The Region's 2027 budget: what your regional taxes and water bills will pay for next year": what's proposed, how it may affect you, and when you can have a say. Every answer links to the page in the city's documents it came from, and I'll tell you when the documents don't say. I won't tell you what to think or how to vote. Try asking: "What is being proposed, in plain words?", "How could this affect renters?", "When can I have my say?", "What will it cost over its whole life?".

### hub-meeting

**Q:** When does the committee hear the transit hub variances, and can I speak?

**A:** The Committee of Adjustment hears the transit hub minor variance application on Tuesday, November 17, 2026, at 10:00 a.m. [1] Yes, you can speak at the public meeting. [2] You may also submit written comments for the committee to consider. [2]

1. The Committee of Adjustment hears the minor variance application on Tuesday, November 17, 2026, at 10:00 a.m. (kitchener-cofa-2026-11-17 p.1: "Committee of Adjustment for the City of Kitchener will meet in Council Chambers, 2nd Floor, Kitchener City Hall, 200 King Street West, on TUESDAY, NOVEMBER 17, 2026, commencing at 10:00 a.m.")
2. Anyone interested may speak at the public meeting or submit comments in writing for the committee to consider. (kitchener-cofa-2026-11-17 p.1: "Anyone who has an interest in any of these applications may make oral submission at the meeting or provide a written submission for Committee consideration.")

### water-meetings (fail)

**Q:** When are the public meetings on the water supply strategy?

**A:** An online public meeting will take place on Tuesday, November 17, 2026, from 7 to 8 pm [1]. You must register online at engagewr.ca/watersupply to join this virtual meeting [2]. An in-person meeting will be held on Tuesday, November 24, 2026, in Kitchener [3].

1. An online meeting is on Tuesday, November 17, 2026, from 7 to 8 pm. (row-water-supply-notice-2 p.1: "Date: Tuesday, November 17, 2026 Date: Tuesday, November 24, 2026 Time: 7:00 pm – 8:00 pm Time: 6:30 pm – 8:30 pm"; row-water-supply-notice-2 p.1: "Location: Virtually; register for the meeting at Location: Main Lobby, 150 Frederick St, Kitchener, Ontario")
2. You must register online at engagewr.ca/watersupply to join the virtual meeting. (row-water-supply-notice-2 p.1: "register for the meeting at engagewr.ca/watersupply")
3. An in-person meeting is on Tuesday, November 24, 2026, in Kitchener. (row-water-supply-notice-2 p.1: "Location: Main Lobby, 150 Frederick St, Kitchener, Ontario"; row-water-supply-notice-2 p.1: "Date: Tuesday, November 24, 2026 Time: 6:30 pm – 8:30 pm")

