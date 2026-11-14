---
title: Adapt it to your city
description: What a municipality needs to run Municipal Agents for its own decisions - the city file, source documents, decision files, transit and housing open data, the agents' wording - with commands and an honest effort estimate.
---

Municipal Agents was built for Waterloo Region, but nothing about a brief is specific to
it. Everything a city would change is a plain file: one settings file for the city, the
PDFs residents should be able to check, one hand-checked file per decision, and the open
data the lenses compute from. This page walks through each, in the order we would do it.

If you only want to try it on one staff report, you don't need any of this: sign in to
the staff screen and upload the PDF (see the [staff guide](staff.md)). The steps below are
for a city that wants its own deployment, with its own decisions, map and lenses.

## What you will change

| Piece | Where | Needed for |
|---|---|---|
| City settings | `cities/<id>.json` | The city's name and councils, languages, official notice page and clerk's contact |
| Source documents | `data/sources/` and `scripts/sources.ts` | Everything: agents cite only these |
| Decisions | `data/decisions/<id>.json` and `<id>.notes.md` | Each decision residents can open |
| The agents' wording | `agents/skills/RULES.md`, some `SKILL.md` files, `agents/plain.ts` | Briefs that name your city, not Waterloo Region |
| Transit open data | `cities/<id>.json` (`gtfsUrls`, `censusDivision` or `bbox`) | The transit lens: no code change |
| Housing open data | `lenses/housing/sources.ts` and one field mapping per permit portal | The housing lens |
| Deployment | `fly.toml`, secrets | See [self-hosting](self-host.md) |

## Write the city file

One JSON file per city in `cities/`, matching `CityConfig` in
[`shared/types.ts`](../../shared/types.ts). One deployment can serve several
municipalities: each decision names its city in its `city` field, and the API filters by
`?city=<id>` (see [API reference](api.md#decisions)). The `CITY` environment variable sets
the default city; without it, the first file in the folder is the default.

```json
{
  "id": "your-city",
  "name": "Your City",
  "municipalities": ["City of Your City"],
  "center": [-79.3832, 43.6532],
  "zoom": 11,
  "languages": ["en", "fr", "es"],
  "officialNoticeUrl": "https://www.your-city.ca/public-notices",
  "clerkContact": "City Clerk's Office, 100 Main Street; clerk@your-city.ca; 555-555-0100",
  "gtfsUrl": "https://example.ca/gtfs.zip",
  "gtfsUrls": ["https://example.ca/gtfs.zip"],
  "censusDivision": "3520",
  "openData": [
    { "name": "Your City Open Data", "url": "https://opendata.your-city.ca/", "licence": "Open Government Licence - Your City" }
  ]
}
```

| Field | What it's for |
|---|---|
| `id` | Lower case, letters, digits and dashes. Decisions point to it in their `city` field. |
| `name`, `municipalities` | Shown to residents. List every council whose decisions you will cover. |
| `center`, `zoom` | The city's centre, `[longitude, latitude]`, and a map zoom. New uploaded decisions start here. |
| `languages` | The language menu, as codes. English first. Translations are made on request by the translator agent for any code. |
| `officialNoticeUrl` | Where the city's official notices are. Shown by `GET /api/city`; the server's upload code also names it as a fallback link, but an upload without `url` or `officialUrl` currently ends up with an empty link, so send one. |
| `clerkContact` | The clerk's public office contact, never a person's own details. |
| `gtfsUrl` | Your transit feed. The transit lens reads it when there is no `gtfsUrls`. |
| `gtfsUrls` | Every GTFS feed of your region, if your agency publishes more than one (Waterloo Region: buses and ION light rail). |
| `censusDivision` | Statistics Canada's census division code (Waterloo Region `3530`, Toronto `3520`). The transit lens takes 2021 population from its dissemination areas. |
| `bbox` | `[west, south, east, north]`: where to take census areas from when you give no `censusDivision`. Without either, a box around `center` is used. |
| `openData` | The portals your lenses use, with their licences. |

The Waterloo file also has a `sourcesNote` object saying where the language list and the
GTFS link came from. It isn't part of `CityConfig`; it is there for the next person who
checks the file. We recommend you keep one.

```bash
CITY=your-city npm start
curl http://localhost:4100/api/city
curl http://localhost:4100/api/cities
```

## Add the source documents

The agents read only the documents listed for a decision, and every statement must quote
one of them. Pick the official versions: staff reports, agendas, budget books, notices,
progress reports. A web page with no PDF can be printed to PDF in a browser.

Each document needs:

- the PDF at `data/sources/<id>.pdf`;
- its page text at `data/sources/<id>.pages.json` (an array of strings; item 0 is page 1);
- an entry in `data/sources/index.json` (a `SourceDoc`).

`npm run sources` makes the last two from the PDFs with `pdftotext -layout`. The list of
documents it knows is the `MANIFEST` array in [`scripts/sources.ts`](../../scripts/sources.ts):
replace the Waterloo entries with yours, and update its `RETRIEVED` date.

```ts
{
  id: "yourcity-2027-budget-book",          // becomes the file name and the citation id
  title: "2027 Draft Budget Book",
  publisher: "City of Your City",
  url: "https://www.your-city.ca/budget/2027-draft-budget.pdf",
  published: "2026-11-02",
  licence: "Public record",
  kind: "budget",                            // staff-report | agenda | budget | plan | progress-report | dataset | notice | other
},
```

```bash
npm run sources                           # page text and index.json for every PDF present
node scripts/sources.ts --download        # first download any PDF that is missing
```

`--download` fetches each missing PDF from its `url`. Entries marked `printed: true` are
web pages: the script tells you to print them to PDF yourself.

> [!WARNING]
> A scanned PDF with no text layer can't be cited: every quote would fail the check. Run
> OCR first, then check a few pages of the text by eye. Two-column layouts are fine; the
> checker reads across columns.

Ids must be lower case letters, digits, `-` and `_`, starting with a letter or digit.

## Write a decision file

One file per decision at `data/decisions/<id>.json`, matching `Decision`. The agents
write the brief; this file is the part a person checks by hand, because dates and ways to
take part must be right.

```json
{
  "id": "yourcity-2027-budget",
  "city": "your-city",
  "title": "2027 Budget",
  "plainTitle": "The City's 2027 budget: what your property tax will pay for",
  "decidedBy": "City Council",
  "status": "in-consultation",
  "officialUrl": "https://www.your-city.ca/budget",
  "sources": ["yourcity-2027-budget-book", "yourcity-budget-page"],
  "center": [-79.3832, 43.6532],
  "zoom": 11,
  "lenses": ["cost", "commitments"],
  "tags": ["budget"],
  "timeline": [
    {
      "id": "council-vote",
      "date": "2026-12-10T19:00:00-05:00",
      "kind": "council",
      "title": "City Council: budget vote",
      "plain": "Council votes on the 2027 budget. You can ask to speak or write to Council.",
      "location": "Council Chambers, City Hall, 100 Main Street",
      "participation": [
        {
          "method": "speak",
          "instructions": "Register with the Clerk's Office by noon the day before to speak for 5 minutes.",
          "deadline": "2026-12-09T12:00:00-05:00",
          "url": "https://www.your-city.ca/delegations",
          "contact": "clerk@your-city.ca, 555-555-0100"
        }
      ],
      "citation": { "sourceId": "yourcity-budget-page", "page": 2, "quote": "Council will consider the 2027 budget on December 10" }
    }
  ]
}
```

| Field | Notes |
|---|---|
| `plainTitle` | What a resident would call it, with the stake in it. |
| `status` | `proposed`, `in-consultation` or `decided`. |
| `officialUrl` | The official notice or agenda page. Shown as "Not the official notice". |
| `sources` | `SourceDoc` ids. The agents read these and nothing else. |
| `timeline` | Events of kind `report`, `committee`, `public-input`, `council`, `deadline`, `implementation`, `budget-vote` or `other`. A date with no time is a whole day, Toronto time. Give `end` for something open for a while, like a survey. |
| `participation` | Ways to take part: `speak`, `write`, `survey`, `attend`, `watch` or `contact-councillor`, each with plain `instructions` and, where known, `deadline`, `url` and a public office `contact`. These drive the countdown on the home page and the calendar file. |
| `citation` | Optional, but we recommend one for every date: a quote from a source page that shows it. |
| `area` | Optional GeoJSON (WGS84) of the area the decision touches, drawn on the map. A whole-region decision can use the boundary; a site can be a point. |
| `lenses` | Which lenses to show and run: `transit`, `cost`, `commitments`, `housing`, `construction`. |

**Keep a notes file.** Next to each decision, `data/decisions/<id>.notes.md` says where
the key facts are (document and page), what you checked against which official page, and
where two official pages disagree. The specialists read it as research notes, then check
each fact on its page before citing it. See
[`row-2027-budget.notes.md`](../../data/decisions/row-2027-budget.notes.md) for the habit.

The server re-reads decision files when they change, so a running site picks up a new or
corrected decision without a restart.

## Change the agents' wording

The agents' instructions are Markdown a communications officer can read. A few name
Waterloo Region and its transit system and must be edited for another city:

| File | What to change |
|---|---|
| [`agents/skills/RULES.md`](../../agents/skills/RULES.md) | The first line ("You help residents of Waterloo Region...") and the examples. These rules go to every specialist. |
| [`agents/plain.ts`](../../agents/plain.ts) | The rewrite and glossary prompts name Waterloo Region and explain "the Region" vs "Waterloo Region". Use your own government's names. |
| [`agents/skills/transit-access/SKILL.md`](../../agents/skills/transit-access/SKILL.md) | Names Grand River Transit and ION. Use your transit agency and lines. |
| [`agents/skills/translator/SKILL.md`](../../agents/skills/translator/SKILL.md) | Names Waterloo Region. |
| [`agents/skills/construction-scout/SKILL.md`](../../agents/skills/construction-scout/SKILL.md) | Written for one what-if scenario on ION Stage 2. Leave `construction` out of your decisions' `lenses`, or rewrite it for your scenario. |

Taking the city's name from `cities/<id>.json` instead of the text is **Planned**. The
product rules themselves (cite every fact, plain words, never persuade, say what is
unknown) don't change from city to city, and the checks in code enforce them whatever the
wording says.

## Transit schedules

The transit lens computes who can reach essential places by transit from the public GTFS
schedule, OpenStreetMap destinations and 2021 census population. See the
[planners' guide](planners.md) for the method.

**A new city needs no code change.** Everything city-specific comes from the city file:

- `gtfsUrls` (or `gtfsUrl`): one or more feeds, loaded together. The licence comes from the
  `openData` entry whose name mentions GTFS or transit.
- `censusDivision` (or `bbox`): which census areas to use. Population, the 400 m grid, the
  region's outline and the box for the one OpenStreetMap query all follow from it.
- The agency's name in the lens's text comes from the feed's own `agency.txt`.

```bash
node lenses/transit/fetch.ts --city your-city   # GTFS, destinations, census into data/cache/transit/your-city/ (once; --force to refresh)
node lenses/transit/build.ts --city your-city   # the whole area
node lenses/transit/build.ts --city your-city --area data/decisions/<id>.json --focus-label "the new library site"
node --test "lenses/transit/**/*.test.ts"
```

`--city` defaults to the first city file (alphabetical). That city's whole-area lens is
`data/lenses/transit-region.json`, and its derived files are `data/open/destinations.geojson`
and `population-da-2021.geojson`. Any other city writes `transit-<city id>.json`,
`destinations-<city id>.geojson` and `population-da-2021-<city id>.geojson`, so several cities
can share one deployment.

| Option | Default | Meaning |
|---|---|---|
| `--city <id>` | the first city file | Which `cities/<id>.json` to use. |
| `--area <decision file>` | whole area | Compute for that decision's `area`; writes `data/lenses/transit-<id>.json`. |
| `--radius <m>` | 1500 | For a point area: the circle around it. |
| `--focus-label "<place>"` | | For a point area: how to name the site. |
| `--weekday YYYY-MM-DD`, `--sunday YYYY-MM-DD` | the next days every feed runs | The service days modelled. |
| `--from YYYY-MM-DD` | today | Look for those days after this date. |
| `--cell <m>` | 400 | Size of the population grid. |
| `--out-dir <dir>` | `data/lenses` | Where to write. |

Record what you downloaded, when and under which licence in `data/open/README.md`.

> [!NOTE]
> Population comes from Statistics Canada's 2021 Census, so the population step works for
> Canadian cities only. Elsewhere, `fetchCensus` and `loadDAs` in
> [`lenses/transit/fetch.ts`](../../lenses/transit/fetch.ts) need a replacement source of
> small areas with population. The GTFS, OpenStreetMap and routing steps work anywhere.

## Housing data

The housing lens counts homes at each stage from approval to completion. Its datasets are
Waterloo Region's: listed in [`lenses/housing/sources.ts`](../../lenses/housing/sources.ts)
(Kitchener, Waterloo and Cambridge building permits; Kitchener's planning applications and
site plans; Cambridge's site plans; CMHC starts and completions through Statistics Canada
table 34-10-0154; Ontario's housing targets and progress).

```bash
node lenses/housing/fetch.ts                    # into data/cache/housing/
node lenses/housing/build.ts --city kitchener   # or waterloo, cambridge, region
```

Unlike transit, the housing lens is not config-only. Every permit portal names its fields
differently, so a new city needs a small field mapping:

- add your datasets to `sources.ts`;
- write one short function per permit dataset in `build.ts` that maps its fields (permit
  number, issue and final dates, status, new units, location) to a permit, as
  `kitchenerPermit` does (about 25 lines);
- add your city's name to the `--city` list. The provincial target data applies to Ontario cities
only. Stages your data doesn't show are listed as "hard to track", which is an honest
result in itself. Details: [`lenses/housing/README.md`](../../lenses/housing/README.md).

## Cost and commitments

These two need no data pipeline.

- **Cost.** The `lifecycle-cost` specialist finds the asset's capital, operating,
  maintenance and renewal costs in your documents, cites each one, and calls
  `build_lifecycle_cost`. The maths is code (`lenses/cost/`): a stated horizon (25 or 40
  years), a 0% or 3% discount rate, and a per-household figure if the documents give the
  number of households. Inputs the documents don't give are marked as assumptions
  residents can change.
- **Commitments.** The `commitments` specialist finds the public commitments the decision
  touches (climate targets, housing pledges, transit plans) and their latest progress in
  your documents. Status (on track, behind, done, unclear) is computed by
  `commitmentStatus` in `lenses/commitments/`. Add your progress reports (for example a
  greenhouse gas inventory) to the decision's sources so there is something to cite.

A precomputed lens file also works. Files in `data/lenses/` are matched by name:
`<lens>-<decision id>.json` belongs to that decision; a `<lens>-<name>.json` that names no
decision is city-wide and is used for decisions that list that lens (when there are
several, the one whose name matches the decider's words wins, as `housing-kitchener.json`
does for a Kitchener committee).

## Make the first brief

With the city file, sources and a decision in place, draft the brief. The staff screen is
the better way, because the run is written to the public record:

1. Deploy (see [self-hosting](self-host.md)) or run `npm start` locally with
   `GEMINI_API_KEY` and `STAFF_TOKEN` in `.env`.
2. Open `/staff`, enter the passcode, pick the decision and start a brief. Watch the
   agents work.
3. Review every statement: approve, edit or reject, with a note. Then publish under your
   name. See the [staff guide](staff.md).

From a terminal, for testing (its log goes to `data/cache/agents-cli.jsonl`, not the
public record):

```bash
node --env-file=.env agents/cli.ts brief <decisionId>                    # writes data/briefs/<id>.json
node --env-file=.env agents/cli.ts ask <decisionId> "When can I speak to Council?"
node --env-file=.env agents/cli.ts translate <decisionId> fr
```

A full brief runs for several minutes and stops at 40 model calls or US$0.50, whichever
comes first.

Then test the answers the way we do: write a few questions residents would ask, with
what a good answer must cite, in `agents/evals/cases.json`, and run
`node --env-file=.env agents/evals/run.ts`. See [evals](evals.md).

## How long it takes

Our estimate, for a city with its documents online and a GTFS feed, done by one developer
and one staff member who knows the decisions. We haven't yet timed it with a second city.

| Step | Effort |
|---|---|
| City file and deployment | 2 to 4 hours |
| Choose the first decisions and gather their documents | Half a day |
| Sources: manifest, page text, spot-check the text | 1 to 2 hours |
| Decision files and notes, every date checked against the official pages | 3 to 6 hours per decision |
| The agents' wording for your city | 1 to 2 hours |
| Transit lens: `gtfsUrls` and `censusDivision` in the city file, first run, check the results make sense (no code) | 2 hours to 1 day |
| Housing lens: new datasets and one field mapping per permit portal (code) | 2 to 5 days, depending on the portals |
| Cost and commitments | Nothing extra; add progress reports as sources |
| First brief: run, then staff review | Several minutes to run (stopped at 15); our guess is 30 to 60 minutes to review |
| Evals for your decisions | Half a day |

A city can start with the brief and the commitments and cost lenses in about two days,
and add transit and housing after.

## Checklist

- [ ] `cities/<id>.json` with your name, map centre, languages, notice page and clerk contact.
- [ ] `CITY` set to your id (or yours is the only city file).
- [ ] Every source PDF has page text, an `index.json` entry and a licence.
- [ ] Each decision file: plain title, who decides, official link, sources, lenses.
- [ ] Every date and way to take part checked against the official page, with a citation.
- [ ] A `.notes.md` file per decision.
- [ ] `RULES.md`, `plain.ts` and the transit and translator skills name your city.
- [ ] Transit and housing lenses built, or left out of `lenses`.
- [ ] `npm test` passes.
- [ ] The first brief reviewed and published by a named staff member.
- [ ] The question limits and daily cap set for your budget ([self-hosting](self-host.md#environment-variables)).
