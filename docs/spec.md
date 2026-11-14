# Municipal Agents: product spec

Built for CIVIC Hack 2026 (Future Cities Institute, University of Waterloo), 12 to 14
November 2026. The winning challenge: **Making municipal decisions easier to
understand.** How might we help residents understand a proposed municipal decision,
how it could affect them, and when they can have a say?

Municipal Agents answers all three parts, and its specialists cover the other four
challenges as lenses on the same decision:

| # | Challenge | Where it lives |
|---|---|---|
| 1 | Making municipal decisions easier to understand | The decision brief: plain-language summary, "How it affects you", "Have your say" |
| 2 | Finding gaps in transit access | Transit lens: GTFS schedules vs essential destinations, first/last-mile gaps, ranked fixes and trade-offs |
| 3 | Making long-term infrastructure costs visible | Cost lens: upfront price vs maintenance, operating and environmental costs over the asset's life, per household |
| 4 | Tracking a city's commitments | Commitments lens: each public commitment the decision touches, progress, and what's still unclear |
| 5 | From housing approval to construction | Housing lens: approved units through permit to construction, and where progress gets hard to track |

## One sentence

AI agents read a city's own documents and turn a proposed decision into a brief a
resident can read in five minutes: what's proposed, how it affects you, when you can
have a say. Every figure links to the page it came from, and city staff approve every
statement before it's published.

## Who it's for

- **Primary: residents** who are affected by a decision but won't read a 300-page
  staff report: renters, homeowners, transit riders, drivers, people who walk or
  cycle, business owners, seniors, students, parents, people with a disability,
  newcomers who read better in another language.
- **Municipal staff** (clerks, communications, planners) who must explain decisions
  and run consultation. They upload a report; agents draft; staff review and publish.
- **Councillors** and their offices, answering constituents.
- **Community groups** who brief their members.

## Principles (these are product rules, enforced in code)

1. **Every figure cites a page.** A statement is accepted only if each citation's quote
   is found on that page of that source (normalised match). Unverified statements are
   shown as such, never silently.
2. **Plain words.** Briefs aim for a grade 8 reading level or lower, measured
   (Flesch-Kincaid) and shown.
3. **Agents never decide, and never say what residents should think.** They explain,
   lay out trade-offs on both sides, and say what's unknown.
4. **Staff publish.** Agent output is a draft until a named staff member approves it.
5. **The record can't be edited quietly.** Every brief, check, question, answer,
   approval and spend is appended to a hash-chained log anyone can verify.
6. **Not the official notice.** Every page says where the official notice is.
7. **Public data only.** No personal information. Questions asked are not tied to
   anyone; no accounts for residents.

## Where

Waterloo Region, Ontario (Kitchener, Waterloo, Cambridge and the Region of
Waterloo), the home of the University of Waterloo. City-specific settings live in
`cities/<id>.json`, so another municipality adapts it by adding a file and its
sources. Toronto is the fallback if Waterloo Region's sources can't support a demo.

## Screens (web/)

Light and dark, Inter, near-white ground, black ink, one accent (civic blue
`#1f5fd6`), large rounded panes (24px cards, 32px panes), frosted glass over the map,
lots of white space. Keyboard and screen-reader accessible, WCAG 2.2 AA. Every number
on screen is a link to its source page.

1. **Home `/`**: "What's being decided near you." A map of the region with each
   decision's area, and a list of decision cards: plain title, who decides, and the
   next chance to have a say with a countdown ("Speak at council: 9 days"). A box to
   type a neighbourhood or street. A language menu.
2. **Decision `/d/:id`**: the brief. Map in the middle; brief pane on the left with
   tabs; chat pane on the right.
   - **Overview**: what's proposed (3 to 6 cited statements), why now, the reading
     grade, "Not the official notice" link, review status ("Approved by <name>, <date>"
     or "Draft: not yet reviewed by staff").
   - **Affects you**: pick who you are (chips for the audiences above, more than one
     allowed); cited impacts for each, with "may" language and uncertainty.
   - **Have your say**: a timeline of the decision (report, committee, public input,
     council, implementation), the next opportunity highlighted, how to take part
     (speak, write, survey, attend) with the deadline, contact and link, and an
     "Add to calendar" (.ics) button.
   - **Transit**, **Costs**, **Commitments**, **Housing**: the four lenses (below).
   - **Unknowns & trade-offs**: what the documents don't answer and who can; the
     trade-offs both ways and possible harms.
   - **Sources**: every document, publisher, date, licence, link.
3. **Source viewer** (overlay): the cited PDF page rendered with pdf.js, the quote
   highlighted, page navigation, a link to the original.
4. **Ask** (chat pane): ask anything about the decision in plain words, in any
   language. The lead agent answers with citations; a steps panel shows the lead
   handing questions to specialists and each one working (like Claude Code's
   subagent panel). Suggested first questions while empty.
5. **Staff `/staff`**: upload a PDF (or pick a source) and start a brief; watch the
   agents work; review each statement (approve, edit, reject, with a note); publish.
   Needs the staff passcode in demo mode.
6. **Record `/log`**: the append-only log, newest first, with the hash chain checked
   in the browser ("Chain intact: 1,204 entries").
7. **Spend `/spend`**: model calls, tokens, US dollars and estimated energy/CO2e.

## Lenses

- **Transit (challenge 2)**: from the region's public GTFS (Grand River Transit, ION)
  and essential destinations (hospitals, grocery stores, pharmacies, schools, libraries,
  community centres, from OpenStreetMap), compute for the decision's area: travel time
  by transit at a few times of day (weekday 8 am, weekday 10 pm, Sunday 8 am),
  destinations that can't be reached within 45 minutes, stops with service gaps
  (first trip too late, last trip too early, headway over 30 min), and
  first/last-mile gaps (homes farther than 800 m walk from frequent service). Rank
  candidate fixes (more frequency on route X, later service, a new stop, on-demand
  zone) by people affected, with the trade-off for each. Algorithm: Connection Scan
  (Dibbelt et al., 2013) over one service day.
- **Costs (challenge 3)**: upfront capital vs operating, maintenance, renewal and
  environmental costs over the asset's life (default 25 or 40 years, stated), as a
  stacked chart and a per-household figure. Every input cited or marked as an
  assumption the resident can change (a slider) with the result recomputed.
  Discounting stated (default 0%, toggle to 3%, per Treasury Board guidance or the
  city's own rate if published).
- **Commitments (challenge 4)**: the public commitments the decision touches (climate
  targets, housing pledge, transit plans, Vision Zero), each with who made it, when,
  the target, the latest progress figure with its source, a status (on track, behind,
  done, unclear) and what's still unclear.
- **Housing (challenge 5)**: for the city, units by stage from approval to completion
  (approved, site plan, permit issued, under construction, completed), from open data
  on building permits and development applications, with the median time between
  stages where the data allow, and where progress gets hard to track (stages with no
  public data).

## Agents (agents/)

TypeScript, in the same Node process as the service, calling the Gemini API over
HTTPS with function calling. No agent framework: a small loop we can explain.

- **Lead**: reads the question or brief request, plans, hands sub-questions to
  specialists, merges their verified statements into one answer, keeps it plain.
- **Specialists**, one per skill (`agents/skills/<name>/SKILL.md`): `explainer`
  (summary, audiences, have-your-say, glossary), `transit-access`, `lifecycle-cost`,
  `commitments`, `housing-pipeline`, `translator`.
- **Tools** the specialists call: `search_pages` (keyword search over the sources' page
  text), `read_page`, `record_statement` (verified on the spot: rejected if a quote
  isn't on the page), plus each lens's compute tool (`transit_gaps`,
  `lifecycle_cost`, `housing_stages`, `commitment_progress`).
- **Checks in code, not by a model**: citation verification, reading grade, the cost
  maths, the transit algorithm, dates.
- **Limits**: each run stops at 40 model calls or US$0.50; the public site at US$5 a
  day. Cost and tokens are logged.
- **Models**: `gemini-3.6-flash` by default (`LEAD_MODEL`, `SPECIALIST_MODEL`);
  `GEMINI_API_KEY` from the environment, never committed.

## Service (server/)

Node 24, TypeScript run directly (type stripping), `node:http`, `node:sqlite`. No
framework. Serves the API and the built web app. See `shared/types.ts` for the shapes.

| Method | Path | What |
|---|---|---|
| GET | /api/health | ok |
| GET | /api/city | the city config |
| GET | /api/decisions | decision cards |
| GET | /api/decisions/:id | decision + its brief + lenses |
| GET | /api/decisions/:id/calendar.ics | the have-your-say dates as a calendar |
| GET | /api/sources | source documents |
| GET | /api/sources/:id/pdf | the PDF |
| GET | /api/sources/:id/pages/:n | one page's text |
| POST | /api/decisions/:id/ask | `{question, audiences?, lang?}` → SSE: steps, then the answer |
| POST | /api/decisions/:id/translate | `{lang}` → the brief in that language (cached) |
| POST | /api/staff/briefs | staff: `{decisionId}` or a PDF upload → SSE progress, a draft brief |
| POST | /api/staff/review | staff: `{decisionId, statementId, action, text?, note?}` |
| POST | /api/staff/publish | staff: `{decisionId, reviewer}` |
| GET | /api/log | log entries (`?decision=`, `?after=`) |
| GET | /api/usage | spend summary |

Staff calls need `Authorization: Bearer <STAFF_TOKEN>`.

## Data (data/)

- `data/sources/<id>.pdf`: the documents, as published. `<id>.pages.json`: an array of
  page texts (index 0 is page 1), from `pdftotext -layout`, built by
  `npm run sources`. `data/sources/index.json`: `SourceDoc[]`.
- `data/decisions/<id>.json`: `Decision` (hand-checked metadata, timeline, area).
- `data/briefs/<id>.json`: `Brief`, written by the agents, reviewed by staff.
- `data/open/`: open data the lenses compute from (GTFS, destinations, permits),
  with `data/open/README.md` saying where each came from, when and under what licence.
- `data/log.db`: the log (not committed; on Fly it's on a volume).

## Deploy

Fly.io, one machine in `yyz`, a 1 GB volume at `/data` for the log, the built web app
served by the service. `fly.toml` and `Dockerfile` at the root. Secrets:
`GEMINI_API_KEY`, `STAFF_TOKEN`.

## Ownership while building

Each builder owns its folders and commits only those (`git add <your folders>`).
`shared/types.ts` changes are additive; tell the lead.

| Folder | Owner |
|---|---|
| `data/sources`, `data/decisions`, `cities/` | research |
| `data/open`, `lenses/` | open-data lenses |
| `server/`, `agents/`, `Dockerfile`, `fly.toml` | service and agents |
| `web/` | display |
| `video/` | video |
| `docs/` (except this file), `report/` | docs |
