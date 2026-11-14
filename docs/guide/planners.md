---
title: Guide for planners
description: What each lens computes, from which open data, how to re-run it, how to read it, its limits, and how to correct it.
---

A brief explains a decision from its own documents. Some questions those documents
can't answer: who can reach a hospital by bus on a Sunday, what an asset costs over
its whole life, whether a target is on track, how many approved homes are being
built. The **lenses** answer them with ordinary code over public data. This guide is
for planners and subject-matter staff (transit, finance, housing, climate,
engineering) who need to recognise the method, check the inputs and fix what is
wrong.

Three rules hold for every lens:

- **Code computes, the model explains.** The numbers come from scripts in
  [`lenses/`](../../lenses/README.md), not from the AI. The agents read the result and
  write plain sentences about it.
- **Computed is labelled computed.** A lens number has no document page, so the
  agents record it with `record_computed_figure`, which only accepts a number that
  appears in the lens result they looked up in the same run. Residents see it marked
  as computed, with the method, not as a quote.
- **The method and limits travel with the result.** The transit and construction lens
  files carry their own `method` and `limits` text, the cost lens its `method` and
  `inputNotes`, and the housing lens its `hardToTrack` list; the brief shows them.

| Lens | Folder | Output in `data/lenses/` | Specialist |
|---|---|---|---|
| Transit access | `lenses/transit/` | `transit-region.json`, `transit-<decision>.json` | `transit-access` |
| Lifecycle cost | `lenses/cost/` | `cost-<decision>.json`, one per decision | `lifecycle-cost` |
| Commitments | `lenses/commitments/` | built during a brief | `commitments` |
| Housing pipeline | `lenses/housing/` | `housing-kitchener.json`, `-waterloo`, `-cambridge`, `-region` | `housing-pipeline` |
| Construction scout | `lenses/construction/` | `construction-row-2027-budget.json` | `construction-scout` |

> [!TIP]
> For what planners and staff in Ontario actually do step by step in eight scenarios
> (a budget, transit service planning, lifecycle costing, commitments, housing,
> construction scouting, a Committee of Adjustment hearing and explaining a decision),
> and which steps Municipal Agents helps with today, read
> [planner workflows](../planner-workflows.md).

## How a lens reaches a decision

A decision lists the lenses it uses in `data/decisions/<id>.json` (`"lenses":
["transit", "cost", ...]`). The service then picks files from `data/lenses/` by name
([`server/data.ts`](../../server/data.ts), `Store.lenses`):

- A file whose name has the lens and the decision id (`transit-kitchener-transit-hub-variances.json`)
  belongs to that decision.
- A file whose name has only the lens (`transit-region.json`, `housing-kitchener.json`)
  is city-wide. When there are several, the one whose words best match the decision's
  `decidedBy` and `title` wins. A Kitchener committee gets `housing-kitchener.json`;
  a Region of Waterloo decision gets `housing-region.json`.
- A file naming another decision is never used.

The agents match files the same way ([`agents/corpus.ts`](../../agents/corpus.ts)), so
what they explain is what residents see on the lens tab.

## Transit access

### What it computes

For a decision's area, the share of people who can reach each kind of essential place
within **45 minutes** by bus, ION light rail and walking:

- hospital (one with an emergency department), clinic or doctor, pharmacy, grocery
  store, school, college or university, library, community centre.

It checks three times: **weekday 8 am**, **weekday 10 pm** and **Sunday 8 am**. It then
finds the gaps, and ranks candidate fixes by the people they would help. When the area
is a single site, it also counts how many people in the whole region can reach that
site within 30, 45 and 60 minutes.

### Method

Earliest arrival uses the **Connection Scan Algorithm** (Dibbelt, Pajor, Strasser and
Wagner, "Intriguingly Simple and Fast Transit Routing", SEA 2013; journal version ACM
JEA 2018), in [`lenses/transit/csa.ts`](../../lenses/transit/csa.ts):

1. Every scheduled hop between two consecutive stops of a trip is one connection.
2. All of one service day's connections are sorted by departure time and scanned once.
3. A connection can be used if the rider is already on that trip, or can be at its stop
   in time.
4. Each arrival improves the earliest time at the next stop, and at stops within walking
   distance.

The settings, from `DEFAULT_WALK` in `csa.ts` and from `lens.ts`:

| Setting | Value |
|---|---|
| Walking speed | 4.8 km/h |
| Walking distance | 1.3 times the straight line (no street network) |
| Walk to or from a stop | up to 800 m |
| Walking transfer between stops | up to 300 m |
| Changing vehicles at the same stop | 60 seconds |
| Origins | a 400 m grid over homes; each cell gets an equal share of its 2021 census dissemination area's people; rural areas (over 2 km² and under 150 people per km²) count from the area's centre |
| Departure times | six departures, every 5 minutes for half an hour from the scenario time |
| Travel time | the median of those six |
| Reached | the nearest place of that type is within 45 minutes |
| Longest trip searched | 90 minutes |

### Gaps it reports

From the timetable, for people within 800 m of a stop:

- **Late start:** the first departure is after 6:30 am (weekday or Sunday).
- **Early end:** the last departure is before 11 pm.
- **Low frequency:** fewer than two departures in the hour around the scenario time
  (a bus or train less often than every 30 minutes). All routes at a stop count
  together.
- **First and last mile:** people more than 800 m from a stop with service every 15
  minutes at the weekday 8 am peak (every 10 minutes is counted too).
- **No service:** people more than 800 m from any stop.
- **Long trip:** people who can't reach a destination type within 45 minutes.

Gaps are sorted by the people affected, largest first.

### Fixes and how they are ranked

The lens tries four kinds of fix on the routes that serve the area
(`lenses/transit/lens.ts`):

| Kind | What it tries |
|---|---|
| Frequency | Run a route every 15 minutes on weekdays, 6 am to 7 pm |
| Earlier start | Start a route by 6:30 am (weekdays, Sundays) |
| Later evening | Run a route until midnight (weekdays, Sundays) |
| On-demand zone | A book-a-ride zone where 300 or more people live beyond 800 m of any stop |

A fix is kept only if it helps at least 100 people. Fixes are ranked by **people
helped**: residents within 800 m of the changed stops who lack that service today. At
most three of each kind are kept, and twelve in all. Each fix states its trade-off in
plain words: extra trips and bus-hours counted from the timetable's own trip times,
the higher cost per rider at quiet hours, and coverage against frequency. No dollar
figure is given, because no cited cost per service hour was used.

### Data

All retrieved 2026-11-14. Details and licences: [`data/open/README.md`](../../data/open/README.md).

| Data | Publisher | Licence |
|---|---|---|
| GRT GTFS, buses (`staticfeeds/1`, service 2026-11-09 to 2026-12-20) | Region of Waterloo (Grand River Transit) | Region of Waterloo Open Data Licence v.2.0 |
| GRT GTFS, ION light rail (`staticfeeds/2`) | same | same |
| Essential destinations, 626 points, one Overpass query | OpenStreetMap contributors | ODbL 1.0 |
| 2021 Census population by dissemination area (766 areas in the region) | Statistics Canada | Statistics Canada Open Licence |
| 2021 dissemination area boundaries (Esri Canada mirror) | Statistics Canada | Statistics Canada Open Licence |

The service days modelled are **Tuesday 17 November 2026** and **Sunday 15 November
2026**.

### What the region-wide run shows

From `data/lenses/transit-region.json` (584,145 people counted, 2,201 origins):

- 64% of people can reach a hospital within 45 minutes at weekday 8 am; 48% on Sunday
  at 8 am.
- 362,544 people live within 800 m of a stop with service every 15 minutes at the
  weekday 8 am peak; 502,126 within 800 m of any stop.
- The largest gap: on Sundays, 462,606 people have no bus or train within 800 m before
  6:30 am.
- The top-ranked fix: start route 1 Queen-River by 6:30 am on Sundays (87,943 people
  helped; about 4 more trips and 3 bus-hours each Sunday).

For the Kitchener Central Transit Hub (a point area, 1,500 m around King and Victoria),
`transit-kitchener-transit-hub-variances.json` adds the site's reach: about 265,900
people in the region can get there within 45 minutes at weekday 8 am (45%), and about
218,300 on Sunday at 8 am (37%).

### Re-run it

```bash
node lenses/transit/fetch.ts      # GTFS, OSM destinations, census, into data/cache (once)
node lenses/transit/build.ts      # data/lenses/transit-region.json
node lenses/transit/build.ts --area data/decisions/kitchener-transit-hub-variances.json \
  --focus-label "the Kitchener Central Transit Hub site (King and Victoria)"
```

Options for `build.ts`: `--area <decision file>` (its area or point), `--radius <m>`
(circle around a point area, default 1500), `--focus-label "<place>"`, `--weekday
YYYY-MM-DD`, `--sunday YYYY-MM-DD`, `--cell <m>` (grid size, default 400). Tests:
`node --test "lenses/transit/*.test.ts"`.

### Limits

- Walking uses straight lines times 1.3, not streets. Rivers, highways, rail lines and
  missing sidewalks can make real walks much longer. No allowance for winter, slopes or
  mobility devices.
- Population is 2021 data, shared evenly within each census area. Newer housing is
  missing.
- One weekday and one Sunday are modelled. No Saturday, no delays, detours, crowding or
  missed connections.
- OpenStreetMap destinations may be incomplete or out of date.
- A stop's headway counts all its routes together, so two routes going different ways
  can look like one frequent service.
- Fixes are candidates computed from the timetable, not GRT proposals. "People helped"
  counts residents near the changed stops, not expected riders.
- MobilityPLUS, on-demand and school services are not in the GTFS and are not counted.

## Lifecycle cost

### What it computes

For one asset, the upfront capital cost next to what it costs to run, maintain, renew
and emit over its life, year by year, with a total and a figure per household. The
pure function is `lifecycleCost(inputs)` in
[`lenses/cost/lifecycle.ts`](../../lenses/cost/lifecycle.ts).

Inputs:

- `startYear` and `horizonYears` (25 for most assets, 40 for long-lived ones such as
  pipes and rail);
- `capital`: one total spread evenly over `buildYears`, or amounts by year;
- `operatingPerYear` and `maintenancePerYear`, counted while the asset is in service;
- `renewals` at a number of years after service starts, and/or `renewalEvery`;
- `emissionsTPerYear` times `carbonPrice` (one price, or a price by year);
- optional `escalation` (default 0: today's dollars);
- optional `discountRate` (default 0; 0.03 is the usual alternative);
- optional `households`, for the per-household figure.

### Where the inputs come from

Each decision has a cost lens built in code, with no model calls, by
[`lenses/cost/build.ts`](../../lenses/cost/build.ts):

```bash
node lenses/cost/build.ts row-2027-budget     # data/lenses/cost-row-2027-budget.json
node lenses/cost/build.ts --all
```

Every input in it is either a figure whose quote is checked on its page by the same
citation checker the agents use (the build stops if a quote fails), or an assumption
with a slider range and a plain reason. The committed files:

| Decision | Asset | Horizon | Lifecycle total | Per household |
|---|---|---|---|---|
| `row-2027-budget` | Grand River Transit's Business Plan: building and running the bus and ION network (GRT's estimates, 2025 dollars, without ION Stage 2 and Kitchener Central Station) | 25 years | about $7.7 billion | about $34,800 |
| `row-water-supply-2051` | The Region's water supply system: its 2026 to 2035 capital program, running costs and renewal | 25 years | about $3.1 billion | about $13,900 |
| `kitchener-transit-hub-variances` | Kitchener Central Transit Hub (Phases 1 and 2): capital from the Region's budget, upkeep and running costs as assumptions | 40 years | about $278 million | about $1,250 |

These are undiscounted, in today's dollars, over 222,426 households (2021 census), from the lens files
as committed; the Costs tab shows the exact figures, which change when a resident moves
a slider. No document gives the emissions for these assets, so no carbon cost is
counted.

The `lifecycle-cost` specialist can also build a lens during a brief. It finds each input in
the documents and records it with `record_figure` (the quote must contain the number).
Then it calls `build_lifecycle_cost`. Every input must be either:

- the id of a cited figure it recorded, with the same value (within 1%), or
- an **assumption** with its reason in plain words.

Anything else is refused with the reason. Assumptions become sliders on the Costs tab:
a resident can move them, and the browser recomputes the totals
([`web/src/lib/cost.ts`](../../web/src/lib/cost.ts)). The page says which numbers are
assumptions, and shows the formula.

### Limits

- Only as good as the cited inputs. Operating and renewal costs are often not in the
  decision's documents; then they are assumptions, and labelled as such.
- Discounting is a single rate (0% or 3%), stated on screen.
- Environmental cost needs an emissions figure and a carbon price, which most staff
  reports don't give.

Tests: `node --test lenses/cost/cost.test.ts`.

## Commitments status

### What it computes

Whether a public target (a climate goal, a housing pledge, a transit plan) is on
track. `commitmentStatus()` in
[`lenses/commitments/status.ts`](../../lenses/commitments/status.ts) draws a straight
line from the baseline to the target and compares the latest figure with where the
line would be that year.

| Status | Rule |
|---|---|
| Done | the latest figure has reached the target |
| On track | the share of progress made is no more than 5 percentage points behind the share of time gone (ahead counts as on track) |
| Behind | further back than that, or the target year has passed without reaching it |
| Unclear | a number is missing, the target year is not after the baseline, the latest figure is older than the baseline, or the target equals the baseline |

It returns a plain explanation, for example: "By 2020, a straight line from start to
goal would be at 75. The latest figure is 90: 20% of the way there with 50% of the time
gone." When it judges on track or behind by the straight line, the explanation also
says that a straight line is a simple yardstick and real progress often comes in steps.

### How it is filled in

The `commitments` specialist calls `record_commitment` with cited progress statements
(the commitment and its latest figure). If it also passes the six numbers (baseline
year and value, target year and value, latest year and value), **code sets the
status**, not the model. Each of those numbers must appear in the progress quotes (0
and 100 excepted, for a percentage cut). Without numbers, a status other than
"unclear" needs at least two cited progress statements.

For example, the Region's 2022 greenhouse gas inventory says community emissions were
12% below 2010 levels in 2022, against a 50% cut by 2030, and that the Region is not on
track. That is the kind of commitment this lens records.

Tests: `node --test lenses/commitments/commitments.test.ts`.

## Housing pipeline

### What it computes

For Kitchener, Waterloo, Cambridge and the three together, homes at each stage from
approval to completion, counted from **1 January 2022** (the first year of Ontario's
2022 to 2031 targets) to each dataset's latest date:

- **Approved**: zoning amendments passed and subdivisions draft-approved (Kitchener
  only, projects only, no unit counts).
- **Site plan**: approved residential site plans (Kitchener and Cambridge, projects only).
- **Permit issued**: new units on residential building permits.
- **Under construction**: permits issued since 2022 with no final inspection or
  occupancy yet (for the region: CMHC's units under construction, latest month).
- **Completed**: units on permits finished in the window (for the region: CMHC
  completions summed by month).

It also gives the median days between stages where the same permit can be followed,
the province's 2031 target with its progress count, and a plain list of what public
data can't show.

### Latest numbers

From `data/lenses/housing-*.json`, built from data retrieved 2026-11-14:

| | Kitchener | Waterloo | Cambridge | Region |
|---|---|---|---|---|
| Permit issued (units) | 14,312 | 4,986 | 3,188 | 22,486 (sum of the three) |
| Under construction (units) | 6,120 | 2,849 | 495 | 6,820 (CMHC) |
| Completed (units) | 15,891 | 2,137 | 3,388 | 20,646 (CMHC) |
| Median days, permit applied to issued | 35 | no application date | no application date | not computed |
| Median days, permit issued to finished | 467 | no finish date | 567 | not computed |
| Ontario target by 2031 | 35,000 | 16,000 | 19,000 | 70,000 |

"Completed" counts homes finished in the window, including some on permits issued
before 2022, so it can be larger than the permit count.

### Data

City building permits (Kitchener, Waterloo, Cambridge), Kitchener's planning
applications and site plan status list, Cambridge's site plans, Statistics Canada table
34-10-0154-01 (CMHC starts, under construction and completions for the
Kitchener-Cambridge-Waterloo CMA) and Ontario's housing supply progress data. Each
stage in the lens file names its dataset, window and licence in its `source` field.

### Where progress gets hard to track

The lens says this plainly, in each file's `hardToTrack` list:

- No city publishes a list that links a council approval to the building permits that
  follow, so nobody outside city hall can count homes waiting between approval and
  permit.
- Permits show the day a permit was issued, not the day work began. Some "under
  construction" permits may not have started, or may have lapsed.
- A permit's unit count is what was proposed, not what was built.
- One building can have several permits, so "projects" counts permits, not buildings.
- Permits don't say whether homes are rentals, condos or affordable.
- CMHC counts the whole metropolitan area (adding Woolwich and North Dumfries), not each
  city.

### Re-run it

```bash
node lenses/housing/fetch.ts                    # downloads to data/cache/housing/
node lenses/housing/build.ts                    # all four files
node lenses/housing/build.ts --city kitchener   # or waterloo, cambridge, region
node --test "lenses/housing/*.test.ts"
```

More detail: [`lenses/housing/README.md`](../../lenses/housing/README.md).

## Construction scout

> [!IMPORTANT]
> Every construction result is labelled **Illustrative scenario: not a Region plan**.
> The scout ranks candidate sites by a stated rule. It never picks one. Engineers and
> staff evaluate, and people decide.

### The scenario

The Region's 10-year capital forecast includes project 68030 "RT to Cambridge" (ION
Stage 2): $85.0 million in 2027 and $2.05 billion over 10 years (2026 Budget Book,
p. 43). The approved Stage 2 route runs mostly at street level. The scenario asks what
it would take to put the 2.9 km stretch between Sportsworld and Preston stations, under
Highway 401 and the Speed River, into twin tunnels. Nobody has proposed this.

### What it computes

From [`lenses/construction/`](../../lenses/construction/README.md):

1. **The line**, from the Region's *ION Routes* and *ION Stops* open data.
2. **Candidate sites** for a launch shaft, an extraction shaft and laydown areas, from
   OpenStreetMap: surface parking and land tagged brownfield, industrial, commercial,
   retail, railway, greenfield or grass. Sites in parks, wetlands, water, woods,
   cemeteries, residential areas, schools, hospitals or care homes are left out.
3. **A score from 0 to 100**, with the weights shown on screen:

   | Factor | Weight |
   |---|---|
   | Open area fits the role (launch about 1 to 2 ha, extraction about 0.4 ha, laydown about 0.3 ha) | 25 |
   | Close to the line (full marks within 30 m, none beyond 400 m) | 25 |
   | Buffer from homes, schools, care homes, hospitals, parks and the river (none within 30 m, full marks beyond 250 m) | 20 |
   | Truck access to a highway or main road (full marks within 100 m, none beyond 1 km) | 15 |
   | How hard it is to take over the land (paved parking or vacant land easiest, active businesses hardest) | 15 |

4. **A layout** ([`layout.ts`](../../lenses/construction/layout.ts)): two 6.5 m bores
   15 m apart, 2,828 m each, with at least two diameters of cover (2.5 under Highway
   401, and two below the riverbed under the Speed River), grades no steeper than 4% (an assumption). **Cross-passages no
   more than 244 m (800 ft) apart**, per NFPA 130 (11 in this scenario).
   **Geotechnical boreholes** about every 75 m, 3 at each shaft and 2 on each side of
   each crossing, each at least 1.5 tunnel diameters below the tunnel floor, per
   FHWA-NHI-10-034 chapter 3 (49 in this scenario).
5. **Seven steps**, each with plain words, an assumed duration, what residents would
   notice, and a map view: drill boreholes, fence the sites and move utilities, dig the
   launch shaft, launch the machines, bore, break through at Preston, fit out and give
   the land back.
6. **One illustrative render per step**, made once by an image model and saved in
   `data/renders/` with its prompt and model in `construction-renders.json`. Each
   render is captioned "Illustrative render · not a design".

### Data

Region of Waterloo Open Data (*ION Routes*, *ION Stops*; Open Data Licence v.2.0),
OpenStreetMap via Overpass (ODbL 1.0), and Natural Resources Canada's Canadian Digital
Elevation Model altitude service (Open Government Licence – Canada), all retrieved
2026-11-14.

### What the agents never do

The `construction-scout` skill
([`agents/skills/construction-scout/SKILL.md`](../../agents/skills/construction-scout/SKILL.md))
tells the agent to:

- say "This is an illustrative scenario, not a Region plan" first;
- never write that a site "is chosen", "will be used" or "has been picked";
- never cite a document page for a number that comes from the scenario;
- never say which option is better; lay out trade-offs both ways;
- record what nobody can know without more work (soil, groundwater, utilities,
  floodplain permits, ownership, cost) and who could answer.

### Re-run it

```bash
node --env-file=.env lenses/construction/render.ts            # renders (image model), once
node --env-file=.env lenses/construction/build.ts row-2027-budget
node --test lenses/construction/construction.test.ts
```

Render spend is capped at US$1.50 and logged in `data/cache/construction/render-spend.json`.

### Limits

No geotechnical, utilities or property ownership data. Distances are straight lines.
Ground levels come from a national model of about 20 m cells. Durations, the advance
rate (12 m a day per machine), bulking (1.3) and truck size (10 m³) are typical
assumptions, not a schedule. Cost is not estimated. The extraction shaft as placed
would likely sit in the Speed River's regulated floodplain. Renders show the kind of
work, not a design.

## How to correct a lens

Lens results are files under version control, so a correction is a change anyone can
review.

| What is wrong | What to do |
|---|---|
| A dataset is out of date | Re-run that lens's `fetch.ts` and `build.ts`, check the diff of the JSON file, commit it, and redeploy. |
| A setting is wrong for your city (scenario day, grid size, area) | Re-run `build.ts` with the options above, or change the setting in the lens code (each lens has unit tests to run after). |
| A destination or site is missing or mis-tagged | Fix it in OpenStreetMap (it benefits everyone), then re-fetch. |
| A cost or commitment input is wrong | It came from a cited page or a stated assumption; fix the source figure and run the brief again, or reject or edit the statement in review. |
| A sentence about a lens misreads it | Edit or reject that statement in the staff review screen. See the [staff guide](staff.md). |

> [!PLANNED]
> A screen where planners correct lens inputs directly, with each change logged, is
> **Planned**. Today a correction is a data or code change plus a new brief run.

For how the agents use these results, see [How it works](how-it-works.md). To set the
lenses up for another city, see [Adapt it to your city](adapt-your-city.md).
