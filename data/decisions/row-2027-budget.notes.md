# Region of Waterloo 2027 Plan and Budget: where the facts are

Page numbers are 1-based pages of `data/sources/<id>.pages.json`. Dollar tables in the
budget book are in **$ thousands** unless marked.

## What is being decided, and the state of play (14 Nov 2026)

- Regional Council sets the 2027 operating budget, the 2027 capital budget and the
  2027-2036 capital forecast, which fix regional property tax and water/wastewater rates.
- **The draft 2027 budget is not published yet.** Staff first show it to Council at the
  "2027 Plan and Budget Overview" on 16 Dec 2026 (`row-2027-budget-page` p7). Until then
  the best public numbers for 2027 are (a) the **2027 column of the 10-year capital
  forecast** in the 2026 budget book and (b) the 2026 approved budget as the base.
  Say so plainly: 2027 figures below are last year's forecast, not the proposal.
- Staff framing for 2027: "affordability for residents; maintaining critical services;
  and protecting essential infrastructure" and "a stability-focused budget"
  (`row-2027-budget-page` p6, `engagewr-row-2027-budget` p2).
- The new Council (elected 26 Oct 2026) makes this decision, **but from 15 Nov 2026 the
  Regional Chair proposes it** (strong-chair powers, next section).

## Strong-chair budget powers from 15 Nov 2026 (checked on e-Laws, 14 Nov 2026)

- `oreg-530-22` p17-18: "On November 15, 2026, Schedule 1 to the Regulation is amended by
  adding" items incl. **203.1 Regional Municipality of Waterloo** (p18), added by O. Reg.
  189/26, s. 3 (1). Schedule 1 = municipalities designated for Part VI.1 of the Municipal
  Act (strong-mayor powers) (s. 1, p2). The same note adds Durham, Halton, Muskoka,
  Niagara, Peel, Simcoe, York.
- Who holds the power: the head of council. For the Region that is the Regional Chair,
  now appointed by the province under the Better Regional Governance Act, 2026
  (`ontario-regional-head-of-council` p1; `row-2026-election-page` p5: "on May 7, 2026 the
  Regional Chair is now" a provincially appointed position; that line is cut off by the
  page's chat button in the printed copy). News reports (not in sources) name Scott Davey
  as the appointee, announced 10 Nov 2026; not confirmed on a Region page, do not state.
- Budget steps, `oreg-530-22` s. 7 (p3-4) and Municipal Act s. 284.16 (`municipal-act-part-vi1` p8):
  - s. 7(1): the Chair prepares the proposed budget, gives it to each councillor and the
    clerk, and makes it public, on or before 1 Feb.
  - s. 7(1.1) (added by O. Reg. 189/26): after an election year the Chair may propose
    "only in the year to which the budget applies", so **between 1 Jan and 1 Feb 2027**.
  - s. 7(2): if the Chair does not propose by 1 Feb, Council prepares and adopts the budget.
  - s. 7(3)-(5): Council has **30 days** after receiving it to pass amendments (Council can
    shorten this); no amendments = budget deemed adopted.
  - s. 7(6)-(9): Chair has **10 days** after that to veto amendments, in writing with
    reasons (Chair can shorten); no veto = adopted.
  - s. 7(10)-(14): Council has **15 days** to override a veto with **two-thirds** of members
    (Chair may vote); then the budget is deemed adopted. Act s. 284.16(3)-(5) sets the same
    amend / veto / two-thirds override structure.
  - The JSON's 3 Mar, 13 Mar and 28 Mar 2027 dates are **computed latest dates** assuming
    the Chair proposes on 1 Feb and nobody shortens a period. Earlier proposal = earlier dates.
  - Council has 16 members including the Chair (`engagewr-row-2027-budget` p3, "There are 16
    members of Regional Council"). Do not compute the exact two-thirds vote count; the
    rounding rule is not in our sources.

### What this means for residents' say
- The person who writes the budget is now the **Regional Chair**: residents should write to
  the Chair (through the Regional Clerk, regionalclerk@regionofwaterloo.ca, 519-575-4400)
  before the budget is proposed (by 1 Feb 2027), as well as to their regional councillors.
- After the proposal, change happens only through Council amendments in the 30-day window,
  so speaking to Council (delegation) and contacting councillors matter most then. A Chair
  veto can be overturned only with two-thirds of Council.
- **Uncertain:** the Region's published schedule (16 Dec overview, 19/27 Jan review days,
  15 Feb councillor-motion deadline, final budget day "to be confirmed") was set before the
  designation and reads like the old staff-led process. The Chair cannot propose before
  1 Jan 2027, so the 16 Dec meeting cannot be the formal proposal, and the 15 Feb motion
  deadline may become the 30-day amendment window. No Region page explains how they fit
  as of 14 Nov 2026. Tell residents to check the Region's budget page and Council calendar.

## Timeline and ways to take part (all checked; see the decision JSON)

- 2 Jun 2026: Council report "Plan and Budget Approach and Timeline" (`engagewr-row-2027-budget` p5).
  The report itself is on eSCRIBE (DocumentId=17628), which blocks scripted downloads, so it is NOT in sources.
- 14 Sep 2026 to 26 Feb 2027 11:59 pm: the **prize draw** for the online survey/quiz runs (`row-2027-budget-contest-rules` p1).
  The survey's own closing date is not published; do not call 26 Feb the survey deadline.
  Draws on 27 Nov 2026 and 26 Feb 2027 (same page).
- 16 Dec 2026: Council, 2027 Plan and Budget Overview (`row-2027-budget-page` p7; also `engagewr-row-2027-budget` p5).
- 19 Jan 2027: Detailed Budget Review Day #1 (`row-2027-budget-page` p7; `engagewr-row-2027-budget` p5).
- 27 Jan 2027: Detailed Budget Review Day #2 (`row-2027-budget-page` p7).
- 2 Feb 2027: Police Service Budget Presentation; 10 Feb 2027: responses to councillor requests;
  15 Feb 2027: deadline for councillor motions (`row-2027-budget-page` p7-8).
- Final Budget Day: "Date to be confirmed" (`row-2027-budget-page` p8). Not in the timeline.
- Delegation rules (`row-delegation-guide` p1-2): register by noon one week before = on the
  agenda + 5 minutes; at least 24 hours before = still 5 minutes; later = 3 minutes;
  slides/handouts 24 hours before; written submissions are public and attached to the
  agenda or minutes; one delegation per subject per 6 months. Register online at
  forms.regionofwaterloo.ca (Delegation-Registration), or the Clerk, 519-575-4400,
  regionalclerk@regionofwaterloo.ca.

### Uncertain, do not state as fact
- The speak-deadlines in the JSON (9 Dec, 12 Jan, 20 Jan at noon) are **computed** from the
  "noon one week before" rule, not published per meeting.
- Review Day #2: the Region page says 27 Jan 2027 (a Wednesday); a read of the EngageWR page's
  full date list (not captured in the printed copy) showed Tue 26 Jan and Tue 9 Feb instead
  of 27 Jan and 10 Feb. The JSON follows the Region's page. Tell residents to check the
  Council calendar.
- Meeting start times are not on the budget pages. A separate Region notice (not in sources)
  mentions a Regional Council meeting on 16 Dec 2026 at 7:00 p.m.
- Past budgets had evening **public input sessions** (2026 budget: 18 Nov and 3 Dec 2025).
  None is announced for the 2027 budget as of 14 Nov 2026. Unknown, not "none".

## Headline numbers (2026 approved budget = the base for 2027)

`row-2026-budget-book`:
- p5: average property tax impact 5.1%; operating spending $1,801 million; 2026 capital
  budget $772 million; 10-year capital program $8.1 billion; 10-year debenture need $0.9 billion.
  Water supply +5.9%, wastewater treatment +5.9% (user rates).
- p11: **annual cost of regional services per average household** 2026: property tax
  $2,928.62 (+$142.18, +5.10%), water $243.63, wastewater $301.61, total $3,473.86
  (+$172.56). Average home = assessed $354,500 (2016 valuation), 182 m3 water.
- p12: per-household split of the regional tax by service, e.g. Police $900, **Public Transit
  $516 blended ($582 urban: Kitchener/Waterloo/Cambridge; $63-$136 in townships)**,
  Housing Services $429, Roads $240, Waste $213, Paramedics $134. Household cost for
  regional services in Kitchener/Waterloo/Cambridge $3,499.
- p16: whole-Region operating table; property tax levy $887,329K (+6.7%).
- p17: consolidated 10-year capital program by program, with the **2027 forecast column**:
  GRT bus $66,082K (10-yr $571,713K); Light Rail Transit $98,465K (10-yr $2,138,926K);
  Transportation (roads) $130,372K; Water Supply $73,470K (10-yr $847,572K);
  Wastewater Treatment $93,678K; Waterloo Region Housing $80,483K (10-yr $743,884K);
  Housing Services $9,655K; total 2027 forecast $796,003K (10-yr $8,087,700K).

`row-2026-budget-summary` (plain-language booklet): p4: 5.1% = $142 a year for an average
property, or $12 a month; operating and capital budgets $2.6 billion. p6: where the
money goes and how it is funded (property taxes $887M, other governments $524M, user fees $339M).

## Transit (GRT bus, ION light rail)

- `row-2026-budget-book` p39: Transit Services 2026 operating: gross $232,251K, fares and
  other user fees $52,237K (down 15.3%), **tax levy $156,278K (+5.9%)**. p38: Transportation
  Services total incl. roads.
- p40-42: GRT bus 10-year capital by project, e.g. 66025 conventional bus replacements
  2027 $47,850K; 66008 conventional bus additions; 66145 bus electrification infrastructure;
  66095 Conestoga College terminal.
- p43: LRT capital: **68030 "RT to Cambridge" (ION Stage 2) $85,000K in 2027, $2,045,600K
  over 10 years**; 68025 future LRT vehicles.
- `grt-business-plan-2025` (Apr 2025, the Region's transit plan and commitment):
  p2: frequent network of 10-minute weekday service on 16 routes; 400,000 people and 200,000
  jobs within 800 m; 24/7 service on key routes; new coverage areas (SE Cambridge, SW
  Kitchener, North Waterloo). p3: kids 12 and under ride free; township on-demand zones.
  p1/p3: "Implementation of plan priorities will be subject to Regional Council's annual
  Plan and Budget process" (so each budget decides how much of the plan happens).
  p5-6 Table 1: to deliver the whole plan by 2034, operating cost $234M -> $314M (+$80M),
  net $149M -> $199M (2025 dollars); service hours 1,000,000 -> 1,625,000; ridership
  25.7M -> 32.5M; operators 593 -> 974. p6-7 Table 2: $798M major transit capital
  2025-2035, of which $544M already in the capital plan; new garage $250M.
- `grt-business-plan-2025-appendix-a`: route-level plan and fares strategy (for the transit lens).

## Long-term infrastructure costs (cost lens)

- `row-asset-management-review-2026` (May 2026): p1: assets worth $11.3 billion to replace;
  84% in fair or better condition; **infrastructure funding gap $87.6M a year** (was $82.8M).
  p3: renewal investment averages $233.9M a year vs optimal need $321.5M; 2025 capital
  spending was $378M, only 51% of the approved capital program. p1/p4: assumes from 2027
  that 60% of GRT replacement bus costs come from the federal Canada Public Transit Fund;
  if not, the gap grows by $17.5M a year.
- `row-infrastructure-gap-2026` p1-3: gap by program: Water $23.2M/yr, Wastewater $21.2M,
  Transportation (roads) $20.4M, Transit -$0.4M (fully funded), Waste $3.7M, Airport
  $4.5M, Facilities $15.0M, Fleet $0.
- Capital vs operating for transit expansion: `grt-business-plan-2025` p5-7 (above).
- ION Stage 2 capital (above) has no published operating cost in these sources: an unknown.

## Commitments touched (commitments lens)

1. **Climate: 50% cut in community emissions by 2030, 80% by 2050 (below 2010)**, the
   community targets of ClimateActionWR/TransformWR, endorsed by the Region and cities.
   Latest progress: `wr-ghg-inventory-2022` p2-3: 2022 emissions 12% below 2010; "not on
   track" for 50by30; need about 215,000 t CO2e less every year. p4: total 3,961,008 t;
   transportation 47.2% (1.87 Mt), buildings 45.4%. p5: passenger vehicles 65% of
   transport emissions. Newer inventories (2023+) are not in sources.
2. **Affordable housing: Building Better Futures**: `row-affordable-housing-plan-page`
   p22-23 (printed web page; search "3,500"): first phase beat its goal of 2,500 new homes
   by end of 2025; new target up to 3,500 affordable homes created or preserved by end
   of 2029, 2,100 (60%) for very-low-to-low income. Budget: `row-2026-budget-book` p21
   (services), p24-25 (WRH and Housing Services capital), p12 ($429 per household).
3. **GRT Business Plan service growth** (above): delivery depends on each year's budget.
4. **Asset management (Ontario Regulation 588/17)**: required reporting; the funding gap is
   the measure (above).

## Housing (housing lens)

- Regional role is affordable and community housing, not building permits (those are the
  cities'). Region figures: targets above; capital `row-2026-budget-book` p17, p24-26.
- Per-city permit/stage data must come from open data (housing lens), not these PDFs.

## Water and wastewater (often missed by residents)

- Rates are set with the budget: 2026 +5.9% water supply and wastewater treatment
  (`row-2026-budget-book` p5, p11). Water Supply 10-year capital $847.6M (p17). Linked to
  the separate Water Supply Strategy Update decision (`row-water-supply-2051`).

## Renters: how a regional tax increase can reach rent

- Ontario's rent increase guideline for 2027 is 1.9% (`ontario-rent-increase-guideline` p1;
  2026 was 2.1%, table on p4). It does not apply to new buildings, additions and most new
  basement apartments first occupied after 15 Nov 2018: "exempt from rent control" (p2-3).
- A landlord can apply to the Landlord and Tenant Board to raise rent above the guideline
  for "An extraordinary increase in the cost for municipal taxes and charges for the
  residential complex" (`rta-s126` p1, Residential Tenancies Act s. 126(1) para 1).
  "Extraordinary" is defined by regulation (s. 126(2)); that regulation is not in our sources.
- For renters in post-2018 units there is no guideline cap, so cost increases can pass
  through at the next lawful increase. Say "may", never "will".

## Accessible formats

- `row-2026-budget-book` p3: "Alternate formats of information are available upon request
  through: Budgets@regionofwaterloo.ca".
