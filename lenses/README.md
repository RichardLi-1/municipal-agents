# Lenses

Four lenses compute what a decision's documents can't say on their own. Each runs in Node 24
with no build step and no npm packages. Each one gives the agents a plain-text summary, which
they cite as **computed**, not as a quote. Sources and licences for every dataset are in
[`data/open/README.md`](../data/open/README.md).

Run the tests with `node --test "lenses/**/*.test.ts"` (`npm test` runs them too).

## Transit (challenge 2): `lenses/transit/`

**What it computes.** For an area, we ask how many people can reach a hospital, clinic,
pharmacy, grocery store, school, college, library and community centre within 45 minutes by
bus, ION and walking. We check three times: weekday 8 am, weekday 10 pm and Sunday 8 am. We
also find:

- stops whose first trip leaves after 6:30 am, or whose last trip leaves before 11 pm;
- stops with a bus or train less often than every 30 minutes;
- people living more than 800 m from a stop with service every 15 minutes at the weekday
  morning peak (we also count 10 minutes);
- people living more than 800 m from any stop.

It then ranks candidate fixes by the number of people they would help. The fixes are a route
every 15 minutes, an earlier start, later evenings, and an on-demand zone. Each fix states its
trade-off in plain words: trips and bus-hours (counted from the timetable), cost per rider,
which riders lose out, and coverage against frequency. When the area is a point (a site), it
also counts how many people in the whole region can reach that site within 30, 45 and 60
minutes.

**Algorithm.** Earliest arrival uses the Connection Scan Algorithm (Dibbelt, Pajor, Strasser
and Wagner, "Intriguingly Simple and Fast Transit Routing", SEA 2013, LNCS 7933; journal version
ACM JEA 23, 2018). It works like this:

1. Every scheduled hop between two consecutive stops of a trip is one "connection".
2. All connections are sorted by departure time and scanned once.
3. A connection can be used if you are already on its trip, or if you can be at its stop by
   then.
4. Each arrival improves the earliest time at the next stop, and at stops within 300 m on foot.

Other settings:

- **Walking:** 4.8 km/h, on 1.3 times the straight-line distance, to or from stops within
  800 m.
- **Changing vehicles at the same stop:** 60 s.
- **Origins:** a 400 m grid over the built-up area. Each grid square gets an equal share of
  its census area's 2021 population. Rural areas count from their centre.
- **Travel time:** the median over six departures, every 5 minutes for half an hour.
- **Speed:** one region-wide run takes about 6 s.

**Files.**

| File | What it does |
|---|---|
| `csv.ts` | CSV and GTFS-time parsing |
| `gtfs.ts` | feeds, calendars, one day's connections |
| `csa.ts` | the algorithm and footpaths |
| `service.ts` | first and last trip, headways |
| `lens.ts` | access, gaps, fixes, map layers |
| `summary.ts` | text for the agents |
| `fetch.ts` | downloads |
| `build.ts` | the command-line tool |
| `transit.test.ts` | tests on a hand-made GTFS: CSA arrivals, a missed tight transfer, a walking transfer, the scan limit, Sunday calendars, first and last trips after midnight, headways, area masks, and a full lens run |

**Run.**

```
node lenses/transit/fetch.ts            # GTFS, OSM destinations, census, into data/cache (once)
node lenses/transit/build.ts            # data/lenses/transit-region.json
node lenses/transit/build.ts --area data/decisions/kitchener-transit-hub-variances.json \
  --focus-label "the Kitchener Central Transit Hub site (King and Victoria)"   # 1.5 km around the point
```

**For the agents.** Call `transitSummary(lens, {scenario?, maxGaps?, maxFixes?, types?})` from
`lenses/transit/summary.ts`, or `index.ts`. It returns compact text with:

- the share of people reaching each destination type;
- the people within 800 m of frequent service;
- the gaps, largest first;
- the ranked fixes with their trade-offs;
- the method and limits.

**Output.** The `TransitLens` has these extra fields:

- `area`;
- `population`;
- `frequentService`;
- `focus` (only for a point area);
- `legend`, which explains the property keys of the map layers;
- `sources`.

It has four map layers:

- `stops`: headway at each scenario time, plus first and last trip on a weekday and a Sunday;
- `destinations`: the people reaching each one;
- `gaps`: the largest affected groups;
- `access`: 400 m squares coloured by minutes to a hospital, a grocery store, or all
  essentials.

**Limits** (also in each lens file):

- Walking uses straight lines, not streets.
- Population is shared evenly within each census area, and is 2021 data.
- Only one weekday and one Sunday are modelled; there are no delays.
- OpenStreetMap destinations may be incomplete.
- A stop's headway counts all its routes together.
- Bus-hours count trip time only. No dollar figure is given, because no cited cost per hour
  was used.
- MobilityPLUS and on-demand services are not in the GTFS.

## Housing (challenge 5): `lenses/housing/`

**Fetching.** `fetch.ts` downloads into `data/cache/housing/`:

- the city building permits for Kitchener, Waterloo and Cambridge;
- Kitchener's planning and site plan lists;
- Cambridge's site plans;
- CMHC starts and completions (Statistics Canada table 34-10-0154);
- Ontario's 2031 housing targets and the province's progress figures.

**Building.** `build.ts [--city kitchener|waterloo|cambridge|region]` writes
`data/lenses/housing-<city>.json`. Each file gives units and projects at five stages:
approved, site plan, permit issued, under construction and completed. Counts start on
2022-01-01. Each file also gives:

- the median days between stages, where the same permit can be followed (Kitchener and
  Cambridge);
- the provincial target, with the province's progress;
- a plain list of the stages no public data shows, for example homes approved but not yet
  permitted.

**For the agents.** `housingSummary(lens)` in `summary.ts` returns compact text for the
`housing-pipeline` agent. Details and limits: [`housing/README.md`](housing/README.md).

## Cost (challenge 3): `lenses/cost/`

`lifecycleCost(inputs)` returns `{series, totals, undiscounted, serviceStartYear}`. It is a pure
function and makes no guesses.

**Inputs:**

- `startYear` and `horizonYears` (for example 25 or 40);
- `capital`: either one total spread evenly over `buildYears`, or amounts by year;
- `operatingPerYear` and `maintenancePerYear`, counted while the asset is in service;
- `renewals` at a stated number of years after service starts, and/or `renewalEvery`;
- `emissionsTPerYear` × `carbonPrice`: one price, or a price for each year;
- optional `escalation`;
- optional `discountRate` (default 0; 0.03 is the usual alternative);
- optional `households`, for a per-household figure.

**Related functions:**

- `buildCostLens({asset, inputs, figures, statements, assumptions})` returns a `CostLens`. It
  keeps its `inputs`, so `lifecycleCost(lens, {horizonYears, discountRate})` in `index.ts` can
  recompute it.
- `costSummary(inputs)` returns text for the agents.

Every input must come from a cited page or be marked as an assumption that the resident can
change. Tests: `cost.test.ts`.

## Commitments (challenge 4): `lenses/commitments/`

`commitmentStatus({baselineYear, baselineValue, targetYear, targetValue, latestYear,
latestValue, unit?, tolerance?})` returns:

- `status`: on-track, behind, done or unclear;
- `expected`: the straight-line value for the latest year;
- `progressShare` and `timeShare`;
- `neededPerYear`;
- a plain `explanation`, for example: "By 2020, a straight line from start to goal would be
  at 75. The latest figure is 90: 20% of the way there with 50% of the time gone."

It is on track when its progress is within 5 percentage points of the time gone. If the target
year has passed and the target was not met, it is behind. If a number is missing or
inconsistent, it is unclear. A straight line is a simple yardstick; the explanation says so.
Tests: `commitments.test.ts`.
