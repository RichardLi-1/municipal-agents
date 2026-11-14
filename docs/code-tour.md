# Code tour

A guided walk through the code for judges, and for the team to explain it. It follows
real requests from the browser to Gemini and back, and points at the lines that keep
the product honest: where citations are checked, where the record's hashes are made,
how a lens is computed, what happens when the model can't be reached. The last section
says how AI was used to write this code and how we checked it.

Diagrams for each path are in [design.md](design.md). Live site:
https://municipal-agents.fly.dev. Code: https://github.com/RichardLi-1/municipal-agents.

## 1. The folders

| Folder | What lives there | Read first |
|---|---|---|
| `shared/` | Types every part shares, and the checks that must behave the same everywhere | `types.ts`, `verify.ts`, `readability.ts` |
| `server/` | The web service: one Node 24 process, `node:http`, no framework | `main.ts`, `app.ts`, `http.ts`, `routes/*.ts`, `log.ts`, `runfiles.ts` |
| `agents/` | The lead and seven specialists: a plain loop around the Gemini API, plus the offline answerer | `index.ts`, `lead.ts`, `loop.ts`, `tools.ts`, `offline.ts`, `gemini.ts`, `skills/` |
| `lenses/` | Code that computes the five lenses from open data and cited figures, before deployment | `README.md`, then `transit/`, `cost/`, `commitments/`, `housing/`, `construction/` |
| `web/` | The resident and staff app (Preact, MapLibre, pdf.js) | `src/screens/Decision.tsx`, `src/components/Chat.tsx`, `src/components/Citations.tsx`, `src/lib/hash.ts` |
| `landing/` | The public website at `/` (Vite, static pages) | `index.html` |
| `docs-site/` | Builds `docs/` into the docs site at `/docs` (marked, highlight.js) | `build.ts` |
| `embed/` | A script a city drops on its own page to show a card about one decision | `embed.js`, `demo.html` |
| `data/` | Source PDFs and page text, hand-checked decisions, briefs, lens results, recorded runs, construction renders | `sources/index.json`, `decisions/row-2027-budget.json` and its `.notes.md`, `open/README.md` |
| `cities/` | One settings file per region | `waterloo-region.json` |
| `scripts/` | `sources.ts` (PDF to page text), `smoke.ts` (checks a deployment), OpenAPI schema generation | |
| `docs/`, `report/` | These documents and the one-page readiness report | |

Size, for a sense of scale (14 November 2026, 04:15 ET): 205 tests across `server/`,
`shared/`, `agents/` and `lenses/`, all passing (`npm test`).

## 2. The key files in one line each

**shared/**
- `types.ts`: every shape: `SourceDoc`, `Citation`, `Statement`, `Figure`, `Decision`,
  `Brief`, the five lens types, `LogEntry`, `AgentEvent`. Changes are additive only.
- `verify.ts`: the citation check. `quoteOnPage`, `verifyCitation`, `verifyStatement`.
- `readability.ts`: Flesch-Kincaid grade, `readingGrade(texts)`.

**server/**
- `main.ts`: start-up. Loads settings, mirrors committed data into the volume, opens the
  record, checks the chain, loads the agents, listens.
- `config.ts`: every setting from the environment with a default.
- `app.ts`: the shared state handed to every route; `briefHash()` ties log entries to
  the exact brief text.
- `http.ts`: router, JSON and gzip, body size limits, server-sent events.
- `security.ts`: security headers on every response; a Content-Security-Policy whose
  inline-script hashes are computed as each page is served.
- `site.ts`: which built site answers which path (`/` landing, `/docs`, `/decisions` and
  `/d/:id` app, `/embed.js`).
- `routes/public.ts`: health, city, decisions, calendar, sources, pages, log, chain check,
  usage, construction renders.
- `routes/agents.ts`: `/ask` and `/translate`, the routes that can spend money; the
  answer cache and offline fallback are wired in here.
- `routes/staff.ts`: start or replay a brief, review a statement, publish. Passcode check.
- `routes/records.ts`: the records-retention purge.
- `routes/insights.ts`: "what residents are asking", aggregated with k = 3.
- `routes/cities.ts`: several municipalities on one deployment.
- `routes/platform.ts`: calendar subscription feed, embed card data, OpenAPI.
- `log.ts` and `canonical.ts`: the append-only, hash-chained record.
- `runfiles.ts`: every agent run's events saved to `data/runs/<runId>.jsonl`; doubles as
  the answer cache.
- `statements.ts`: review rules: every statement reviewed before publishing, rejected
  ones left out of the public brief, edits re-checked.
- `limits.ts`, `usage.ts`: rate limit, run slots, daily cap; spend and energy from the record.
- `ics.ts`: calendars (RFC 5545). `openapi.ts`: the API description.

**agents/**
- `index.ts`: the functions the server calls: `ask`, `generateBrief`, `translateBrief`.
- `lead.ts`: plans, runs specialists in parallel, writes and grounds the answer;
  assembles and translates briefs.
- `loop.ts`: `runStep`, the loop one specialist runs; `Budget`; `budgetedCall`.
- `tools.ts`: the tools the model may call, and the checks they run.
- `plain.ts`: the plain-language pass: rewrites statements above grade 8, kept only if
  code confirms they read easier and keep every number.
- `tidy.ts`: last pass in code: drops near-duplicates, marks hedged statements as estimates.
- `offline.ts`: answers without a model from already-checked material.
- `corpus.ts`: loads a decision's sources and searches their pages (BM25).
- `gemini.ts`: one REST call to Gemini with retries, timeout and cost.
- `skills/`: each specialist's instructions as Markdown (`explainer`, `transit-access`,
  `lifecycle-cost`, `commitments`, `housing-pipeline`, `construction-scout`,
  `translator`), plus `RULES.md` shared by all.
- `evals/`: 18 question cases scored in code (`run.ts`, `cases.json`, `results.md`).
- `cli.ts`: run the agents from the terminal; `testing.ts`: a fake model for tests.

## 3. Path of a question: from the browser to Gemini and back

A resident on the Region's 2027 budget page types "How can I speak to Regional Council
about the budget?".

1. **Browser.** `web/src/components/Chat.tsx` calls `postEvents()` in
   `web/src/lib/sse.ts`, which POSTs `{question, audiences, lang}` to
   `/api/decisions/row-2027-budget/ask` and reads the reply as server-sent events.
2. **Route.** `server/routes/agents.ts` validates the input (non-empty, under 1,000
   characters, known audiences, a safe language code).
3. **Answer cache first.** `server/runfiles.ts` looks for a recorded run of the same
   decision, language and audiences whose question has the same numbers and at least
   85% of the same words. Only runs that produced a real, cited answer qualify. If one
   matches, its events are replayed (labelled with when it was first answered), at
   US$0. Replays skip the daily spend cap but not the per-visitor limit.
4. **Cheap checks.** Otherwise, in order, so a refused request costs nothing: today's
   spend is under the cap (`checkDailyCap`, `server/limits.ts`); this IP has not started 30
   model-backed runs in 10 minutes (`RateLimiter.take`; the IP is held in memory only;
   replays and offline answers don't count); one of 4
   run slots is free.
5. **Record the question.** `question.asked` with the question text, audiences and
   language. No identity.
6. **Open the stream.** `openSse()`; `startRun()` in `server/runs.ts` gives the agents a
   context whose `log()` writes to the record and whose abort signal fires if the
   resident leaves or the run passes 240 seconds. Every event is also written to
   `data/runs/<runId>.jsonl`.
7. **Lead plans.** `askWith()` in `agents/lead.ts`. Greetings are answered without a
   model call. Otherwise it loads the corpus, creates a `Budget` of 40 calls and US$0.50
   with a reserve for the answer, and calls `plan()`: one Gemini call that picks which
   specialists to ask and what to ask each. The steps panel shows the plan.
8. **Specialists work in parallel.** `runStep()` in `agents/loop.ts`. Each builds its
   system prompt from `RULES.md`, its `SKILL.md` and the decision's metadata, then loops:
   `budgetedCall()` reserves a call from the shared budget, calls Gemini
   (`callGemini` in `agents/gemini.ts`), logs a `usage` entry with tokens and cost; any
   tools the model asks for are run (`search_pages`, `read_page`, `record_statement`,
   the lens tools) and each tool's one-line summary is streamed as a `tool` event.
9. **Each statement is checked on the spot** by `record_statement` (section 4).
10. **Lead writes the answer** from the verified statements only, with `[n]` markers.
11. **Answer is grounded in code.** `groundAnswer()` in `agents/lead.ts` drops any
    sentence that gives voting advice or has a number not found in a cited statement
    or the hand-checked timeline; renumbers the markers; keeps only cited statements.
12. **Back to the browser.** The `answer` event carries text and statements; the server
    logs `answer.given`, sends `done` and closes the stream. `Citations.tsx` shows each
    citation; clicking one opens `SourceViewer.tsx` on the PDF page with the quote
    highlighted.

**When the model can't be reached** (no key, 401 or 403, 402, 429, 5xx, no connection),
the route falls back to `agents/offline.ts`. It ranks, with BM25, the brief's verified
statements that staff did not reject, the decision's hand-checked timeline events, and
computed lens results (transit gaps and fixes, the construction scenario, cost
figures); then exact quotes from the documents; and as a last resort it gives the
Clerk's contact. It starts "The agents can't be reached right now. Here is what the checked brief says about that:". This is not
hypothetical: the team's prepaid Gemini credit ran out at about 02:20 ET during the
hackathon, and since then the live site has answered from replays and the offline
answerer.

## 4. Where citations are verified

One rule: a statement is verified only if every quote it cites is found on the page it
names. The code is `shared/verify.ts`; the tool that applies it is `record_statement` in
`agents/tools.ts`.

1. `checkCitations()` refuses a statement with no citations.
2. For each citation, `checkCitation()`:
   - refuses a source that is not one of this decision's sources, a page that does not
     exist, a quote with an ellipsis, or a quote shorter than 8 characters;
   - calls `verifyCitation()` → `quoteOnPage()`, which normalises both texts (case,
     spacing, curly quotes, dashes, ligatures, soft hyphens, words split by a hyphen at a
     line end) and looks for the quote: as a substring, then with all spaces removed,
     then word by word in order across the columns of a two-column page
     (`matchAcrossColumns`). Nothing is fuzzy: every word must be present, in order;
   - on failure tells the model something it can act on: the page the quote is really
     on (`findQuotePages`), another source that has it, or the closest line on the page.
3. `ruleProblems()` checks the wording: under 40 words, no advocacy, "may" for impacts,
   both sides for trade-offs.
4. Only then is the statement stored with `verified: true`. Rejections are logged as
   `statement.rejected` with their reasons.
5. A statement also carries a support strength (`supportOf()` in `agents/tidy.ts`, set
   at record time): `weak` if the sentence shares fewer than 2 meaningful word stems and
   no non-date number with its quotes. Residents and reviewers see "Check: the quote may
   not fully support this". The three briefs show 0 weak statements.

**Operator corrections.** The team running the site can fix or withdraw an agent-written
statement in a committed file, `data/corrections/<decisionId>.json`.
`shared/corrections.ts` applies it whenever the server loads a brief
(`server/corrections.ts`) or when `node agents/cli.ts correct <id>` writes it in. Each
corrected citation goes through `verifyCitation()` again, or the correction is refused.
Residents see "Corrected by the Municipal Agents team (not Region staff)"; withdrawn
statements are hidden; each correction appends one `statement.reviewed` entry by
`operator:municipal-agents-team`; the brief stays a draft. The three demo briefs carry
27 corrections (24 edits, 3 withdrawals). Tests: `agents/corrections.test.ts`.

How often it bites: in the four recorded brief runs (`data/runs/*-brief-*.jsonl`) the
checker rejected 78 statement attempts and accepted 116. The agents fixed most by
quoting the right page.

The same check runs again in three places: when a staff edit is saved
(`recheck()` in `server/statements.ts`), when cost lenses are built
(`lenses/cost/build.ts` stops if a quote fails), and in the evals (`agents/evals/run.ts`
finds each cited quote again on its page).

## 5. Where the record's hash is computed

`server/log.ts`, method `Log.append()`:

1. The payload is round-tripped through JSON so what is hashed is exactly what is stored.
2. `payloadHash` = SHA-256 of the canonical JSON of the payload (`server/canonical.ts`:
   keys sorted, no whitespace).
3. Inside one `BEGIN IMMEDIATE` transaction it reads the last entry's `seq` and `hash`.
4. `hash` = SHA-256 of the previous hash followed by the canonical JSON of
   `{seq, at, actor, kind, decisionId, payloadHash}`. The first entry's previous hash is
   64 zeros.
5. It inserts the header (table `log`) and the content (table `log_content`) and
   commits. Triggers refuse any `UPDATE` or `DELETE` on the headers, and allow only one
   kind of change to content: a purge.

**Retention purge.** A municipality must be able to dispose of records when its
retention by-law says so. `POST /api/staff/purge` (`server/routes/records.ts`) takes an
entry number and a reason; `Log.purge()` removes that entry's content, keeps its header
and `payloadHash`, and appends a `record.purged` entry saying which entry, why and who.
Because the chain covers the payload's hash rather than the payload, every hash still
verifies. Content missing without a matching `record.purged` entry, or content that
doesn't match its hash, is reported as tampering. Purges are manual, one entry at a
time; nothing is purged on a schedule.

`Log.verifyChain()` recomputes every hash; `main.ts` runs it at start-up and
`GET /api/log/verify` on request. The browser re-checks the chain itself with the Web
Crypto API (`web/src/lib/hash.ts`), so a visitor need not trust the server. The browser
and server each implement canonical JSON; `server/canonical.test.ts` checks the two agree
on tricky payloads. Tests: `server/log.test.ts`, including tamper and purge tests.

## 6. How a lens is computed

Lenses are computed **before** deployment by code, stored as JSON in `data/lenses/`,
and read by the agents' lens tools in `agents/tools.ts` (`transit_gaps`,
`lifecycle_cost`, `housing_stages`, `commitment_progress`, `construction_sites`). The
model never does the arithmetic; it explains the result and cites the documents.
Overview: [lenses/README.md](../lenses/README.md).

**Transit (challenge 2), `lenses/transit/`.** `fetch.ts` downloads GRT's bus and ION
GTFS, OpenStreetMap essential destinations (626 points) and 2021 census population by
dissemination area (766 areas, 587,165 people). `gtfs.ts` turns one service day into
connections sorted by departure; `csa.ts` runs the Connection Scan Algorithm (Dibbelt
et al.) with walking transfers; `lens.ts` computes, at weekday 8 am, weekday 10 pm and
Sunday 8 am, the share of people who can reach each kind of destination within 45
minutes, service gaps at stops, first/last-mile gaps, and ranked fixes with trade-offs.
Output: `transit-region.json` and `transit-<decision>.json`.

**Cost (challenge 3), `lenses/cost/build.ts`.** Built in code from cited figures, one
lens per decision, no model calls. Every input is either a figure whose quote is checked
on its page by `shared/verify.ts` (the build stops if one fails) or an assumption with a
slider range and a reason. It sums capital, operating, maintenance, renewal and
environmental cost year by year over the stated horizon, at 0% or 3% discount, and
divides by the region's 222,426 households (2021 census). The web app recomputes when a
resident moves a slider (`web/src/lib/cost.ts`).

**Commitments (challenge 4), `lenses/commitments/status.ts`.** Compares the latest cited
figure with a straight line from the baseline to the target, and says on track, behind,
done or unclear. Pure function; the agents supply cited numbers.

**Housing (challenge 5), `lenses/housing/`.** Counts new homes at each stage from
approval to completion since 2022 for Kitchener, Waterloo, Cambridge and the region,
median days between stages where one permit can be followed, Ontario's 2031 target, and
the stages with no public data.

**Construction scout, `lenses/construction/`.** An illustrative what-if, not a Region
plan: ION Stage 2 between Sportsworld and Preston built as twin tunnels under Highway
401 and the Speed River.
1. `build.ts` reads the ION Stage 2 alignment and stations (Region of Waterloo Open
   Data), crossings and candidate land (OpenStreetMap via Overpass) and ground levels
   (NRCan's CDEM).
2. `scout.ts` scores candidate launch, extraction and laydown sites 0 to 100 on stated
   weights (area 25, distance to the line 25, buffer from homes, schools and parks 20,
   road access 15, ease of taking the land 15). It ranks; people choose.
3. `layout.ts` lays out the bores with stated rules: 6.5 m machines, crown cover of at
   least 2 diameters, cross-passages no more than 244 m apart (NFPA 130), boreholes
   about every 75 m (an assumption) and at least 1.5 tunnel diameters below the invert
   (FHWA-NHI-10-034).
4. `steps.ts` writes seven steps with typical durations, spoil and truck arithmetic, and
   work hours from each city's noise rule (Kitchener; Cambridge By-law 32-04).
5. `render.ts` asked Gemini's image model (`gemini-3.1-flash-image`) for one
   illustration per step, ahead of time, capped at US$1.50 (about US$0.64 spent). The
   images are files in `data/renders/`, served by `/api/renders/:file`; no image is
   generated at run time.
At run time the `construction-scout` specialist reads the lens through
`construction_sites` and may record its numbers only as computed figures; code rejects
any number that is not in the lens result.

## 7. Path of a brief: draft, review, publish

1. Staff open `/staff` and enter the passcode. `POST /api/staff/briefs` with
   `{decisionId}` or a PDF upload (`server/upload.ts`). `requireStaff()` compares the
   passcode's SHA-256 digest in constant time. Staff can also replay the agents' last
   real run instead of paying for a new one.
2. `generateBriefWith()` in `agents/lead.ts` runs the explainer and one specialist per
   lens; `plain.ts` rewrites statements above grade 8 (kept only if they read easier and
   keep every number); `tidy.ts` removes near-duplicates; `assembleBrief()` builds the
   `Brief` with its reading grade and status `draft`.
3. The draft is written to `data/briefs/<id>.json` (on the volume) and `brief.generated`
   is logged with counts, cost and the brief's hash. A previous draft goes to history.
4. For each statement, `POST /api/staff/review` with `approve`, `edit` (original text
   kept; citations re-checked; residents see "Edited by staff") or `reject`, with an
   optional note. The brief moves to `in-review`.
5. `POST /api/staff/publish` needs the reviewer's name and answers 409 until every
   statement has been reviewed. The public brief leaves out rejected statements
   (`publicBrief()` in `server/statements.ts`). `brief.published` is logged with counts.

Real numbers: a full brief with all lenses is about 40 model calls (the cap) and cost
US$0.24 to US$0.37 in our runs (`data/briefs/*.json`, `costUsd`; the live budget brief
logged US$0.368). A translation of a brief costs about US$0.009 per language (2 calls;
French and Spanish in the live record). Reading grades after
the plain-language pass: budget 7.4, water supply 6.7, transit hub 6.9.

## 8. The platform around the app

- **Several cities, one deployment** (`server/routes/cities.ts`): each city is
  `cities/<id>.json` and each decision names its city.
- **Embed** (`embed/embed.js`): a city adds one `<script>` tag to its own page and gets a
  card with the plain title, three cited statements and the next date to take part,
  from `/api/embed/:id`. Demo: `/embed/demo`.
- **Calendar feed** (`/api/calendar.ics?decisions=a,b`): one subscription for many
  decisions' dates.
- **OpenAPI** (`/api/openapi.json`): `server/openapi.test.ts` fails if a route is missing
  or the generated schemas are stale.
- **Staff insights** (`/api/staff/insights`): what residents ask, aggregated. Question
  wording appears only for groups of at least 3 similar questions, with emails, phone
  numbers, addresses and long numbers removed; smaller groups are only counted.
- **Security headers** (`server/security.ts`): CSP with per-page script hashes, HSTS,
  `nosniff`, a strict policy on the API.

## 9. Tests, evals and how to run them

```
npm test                       # 205 tests: server, shared, agents, lenses (14 Nov 2026, all passing)
npm run typecheck
npm run smoke                  # checks a running deployment end to end
node agents/evals/run.ts       # scores the agents on question cases (spends model credit)
node agents/cli.ts             # run the agents from the terminal
```

**Evals** (`agents/evals/results.md`): each case checks every cited quote is found
again on its page, valid citation markers, no advice on how to vote or what to think,
and a reading grade of 9 or lower, plus case-specific pages and words. Latest full run:
6 of 12 passed, at US$0.073 a question and a median of 30 seconds (the first run, before
the plain-language pass, averaged US$0.053 over 16 questions, so we quote about
US$0.05–0.07 a question). All 6 failures were
over the answer reading-grade limit (one also found nothing to cite); there were no
citation failures and no voting advice. Six more cases were skipped at the spend cap,
and a re-run stopped when the credit ran out.

## How AI was used and how we checked it

**What AI drafted.** Code, data pipelines and documents were drafted with Claude Code
(Anthropic, model Claude Opus 5.5), directed and reviewed by the team. That covers most
of the TypeScript in `server/`, `agents/`, `lenses/`, `shared/`, `web/`, `landing/`,
`docs-site/` and `embed/`, the scripts that turn PDFs into page text and fetch open data,
the skill files, these documents and the readiness report. At run time, the product's
agents use Google's Gemini API (`gemini-3.6-flash`); the construction illustrations were
made once with `gemini-3.1-flash-image`.

**What the team decided and did by hand.**
- The product rules (spec, "Principles") and the decision to enforce them in code.
- The choice of decisions and source documents, and each decision's hand-checked
  timeline, checked against the official pages. `data/decisions/*.notes.md` records what
  was checked and where official pages disagreed (two gave different dates for a budget
  review day).
- The architecture choices in [architecture.md](architecture.md).
- Review of every change before it was committed, and of the agents' drafts.

**How we checked the AI-written code.**
- **Tests on the parts that carry trust**: citation checker, reading grade, canonical
  JSON (browser and server agree), hash chain (tamper and purge), review rules, answer
  cache, offline answers, calendar, limits, spend, routes, OpenAPI coverage, the agent
  loop and tools with a fake model, and each lens's maths. 205 tests, all passing.
- **Type checking** with `tsc --strict` over the shared shapes.
- **Evals on real documents** with real model calls, scored in code (section 9).
- **Recorded runs**: every agent run's events are kept in `data/runs/`, so what the
  agents actually said can be inspected and replayed.
- **Smoke test** of the deployed site (`scripts/smoke.ts`).

**How we check the AI at run time.** The model's output is never trusted on its own:
quotes are checked on the page, wording rules applied, numbers in answers must be in a
cited statement, lens numbers must come from code, spend is capped per run and per day,
and staff review every statement before anything is published. Every model call is in
the public record with its cost.

**Known weak spots (honest list).**
1. **A quote on the page does not prove the sentence is fair.** The checker proves the
   words exist on that page, not that the statement reads them correctly or keeps their
   context. The `weak` support flag points reviewers at the likeliest cases, but it
   counts shared words; it doesn't understand meaning. Staff review is the control.
2. **An edit is re-checked, but only its quotes.** Re-checking confirms the quotes are
   still on their pages; it doesn't compare the new wording with them. The original
   text is kept and residents see "Edited by staff".
3. **Answers are not always plain enough.** Briefs read at grade 6.7 to 7.4 after the
   plain-language pass, but 6 of 12 eval answers were above grade 9. The syllable counter
   is a heuristic (about ±0.5 grade).
4. **The answer's number check is loose.** It looks for each number as text in the cited
   statements and the timeline, so a short number such as "5" can pass by coincidence.
5. **The answer cache matches by words, not meaning.** A differently worded question
   gets a new run (or an offline answer); a near-identical question with a different
   intent could, rarely, get a replay. Replays are labelled with their original date.
6. **The record can be rewritten wholesale** by whoever controls the server. Publishing
   the head hash elsewhere is a next step.
7. **One shared staff passcode**, not individual accounts.
8. **Questions are public in the record.** The chat box asks people not to include
   personal details, and staff insights remove them from what they show, but the raw log
   is not redacted; purging is manual.
9. **Provider credit is a single point of failure for new answers.** When ours ran out,
   replays and offline answers kept the site useful, but new questions can't get fresh
   agent research until billing is restored. Production needs billing alerts.
10. **Energy and CO2e are estimates** from tokens, not measurements.
