# Housing lens (challenge 5: from approval to construction)

For Kitchener, Waterloo, Cambridge and the three together, it counts homes at each stage
from approval to completion, the median time between stages where the same permit can
be followed, the province's 2031 target with its progress count, and the stages that
public data can't show.

```
node lenses/housing/fetch.ts                     # downloads to data/cache/housing/ (gitignored)
node lenses/housing/build.ts [--city kitchener|waterloo|cambridge|region]
node --test "lenses/housing/*.test.ts"
```

Output: `data/lenses/housing-<city>.json`, a `HousingLens` (shared/types.ts).
`housingSummary(lens)` in `summary.ts` turns one into plain text for the agents.

## What it computes

All counts start on 2022-01-01, the first year of Ontario's 2022–2031 targets, and end
on the latest date in each dataset (written in each stage's `source`).

| Stage | Kitchener | Waterloo | Cambridge | Region |
|---|---|---|---|---|
| Approved | zoning amendments passed and subdivisions draft-approved, about homes (projects only, no units) | no data | no data | no data |
| Site plan | approved site plans about homes, received since 2022 (projects only) | no data | approved residential site plans received since 2022 (projects only) | no data |
| Permit issued | new units on residential permits issued | same | same | sum of the three cities |
| Under construction | permits issued since 2022 with no final inspection or occupancy | status "Issued" | not closed, not dormant | sum of the three cities |
| Completed | occupancy or final inspection date in the window | status "Complete", no date | closed (final date) or occupancy permitted | sum of the three cities |

Medians: permit application to issue (Kitchener), permit issue to final inspection or
occupancy (Kitchener, Cambridge), each also for permits with 10 or more new units.

## Data (details and licences in data/open/README.md)

- City of Kitchener: Building Permits; Planning Applications Active; Site Plan status CSV.
- City of Waterloo: Building Permits.
- City of Cambridge: Building Permits; Site Plans.
- Statistics Canada table 34-10-0154-01 (CMHC starts, under construction, completions, Kitchener-Cambridge-Waterloo CMA).
- Ontario's housing supply progress (data.ontario.ca): 2031 targets and progress by municipality.

## Limits

- No public list links a council approval to the building permits that follow, so the
  approval-to-permit time can't be measured, and approved units can't be counted (Kitchener's
  unit fields are empty; Waterloo publishes no planning applications).
- "Under construction" from permits means "issued, not finished": some never started.
- Unit counts are what the permit proposed; a permit's closing date can trail occupancy.
- Projects are permits, not buildings (townhouse blocks can have one permit per unit).
- CMHC numbers cover the CMA (adds Woolwich and North Dumfries), the permit numbers only the three cities.
  The region lens keeps CMHC starts, under construction and completions apart, in `context`, labelled with their area.
- Progress toward the 2031 target is `target.progress`: the province's own count from Ontario's housing supply
  progress data (per city; the three-city sum for the region, 15,902 through 2024). Compare the target with it,
  not with the completed stage, which is a different measure.
- Waterloo counts units only on permits whose work is "New" or an additional dwelling unit.
- Cambridge leaves out foundation-only permits, whose units repeat on the full permit.
