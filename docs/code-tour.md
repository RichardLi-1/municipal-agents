# Code tour

A guided walk through the code for judges, and for the team to explain it. It follows
real requests from the browser to Gemini and back, and points at the lines that keep
the product honest: where citations are checked, where the record's hashes are made,
how a lens is computed. The last section says how AI was used to write this code and
how we checked it.

Items marked `TODO(verify)` were still being written when this tour was drafted.
Diagrams for each path are in [design.md](design.md).

## 1. The folders

| Folder | What lives there | Read first |
|---|---|---|
| `shared/` | Types every part shares, and the two checks that must behave the same everywhere | `types.ts`, `verify.ts`, `readability.ts` |
| `server/` | The web service: one Node process, `node:http`, no framework | `main.ts`, `app.ts`, `http.ts`, `routes/*.ts`, `log.ts` |
| `agents/` | The lead and the specialists: a plain loop around the Gemini API | `index.ts`, `lead.ts`, `loop.ts`, `tools.ts`, `gemini.ts`, `skills/` |
| `lenses/` | Scripts that compute the four lenses from open data, ahead of time | `housing/README.md`, then `transit/`, `cost/`, `commitments/` `TODO(verify)` |
| `web/` | The resident and staff screens (Preact, MapLibre, pdf.js) | `src/screens/Decision.tsx`, `src/components/Chat.tsx`, `src/lib/sse.ts`, `src/lib/hash.ts` |
| `data/` | Source PDFs and their page text, hand-checked decisions, briefs, lens results | `sources/index.json`, `decisions/row-2027-budget.json` and its `.notes.md` |
| `cities/` | One settings file per region | `waterloo-region.json` |
| `scripts/` | `sources.ts` (PDF to page text), `smoke.ts` (checks a deployment) | |
| `docs/`, `report/` | These documents and the one-page readiness report | |

Size, for a sense of scale (14 November, 02:15 ET): the server is about 2,800 lines of
TypeScript including tests, the agents about 2,700 including tests plus six skill files,
the shared checks about 250.

## 2. The key files in one line each

**shared/**
- `types.ts`: every shape: `SourceDoc`, `Citation`, `Statement`, `Figure`, `Decision`,
  `Brief`, the four lens types, `LogEntry`, `AgentEvent`. Changes are additive only.
- `verify.ts`: the citation check. `quoteOnPage`, `verifyCitation`, `verifyStatement`.
- `readability.ts`: Flesch-Kincaid grade, `readingGrade(texts)`.

**server/**
- `main.ts`: start-up. Loads settings, copies committed data to the volume, opens the
  record, checks the chain, loads the agents, listens.
- `config.ts`: every setting from the environment with a default (port, data folder,
  staff passcode, daily limit, rate limits, run timeout).
- `app.ts`: the shared state handed to every route; `briefHash()` ties log entries to
  the exact brief text.
- `http.ts`: the router, JSON and gzip, body size limits, server-sent events.
- `routes/public.ts`: read-only API: health, city, decisions, calendar, sources, pages,
  log, chain check, usage.
- `routes/agents.ts`: `/ask` and `/translate`, the two routes that spend money.
- `routes/staff.ts`: start a brief, review a statement, publish. Passcode check.
- `log.ts`: the append-only, hash-chained record in SQLite.
- `canonical.ts`: the canonical JSON that gets hashed.
- `limits.ts`: per-IP rate limit, run slots, daily spend cap.
- `usage.ts`: spend, tokens, energy and CO2e, all computed from the record.
- `ics.ts`: the `.ics` calendar (RFC 5545).
- `agents-loader.ts`: imports `agents/` lazily, so the site works even if the agents
  fail to load.
- `runs.ts`: what every agent run shares (log, abort signal, usage tally).
- `data.ts`: reads decisions, briefs, sources and lenses from files; writes briefs.

**agents/**
- `index.ts`: the three functions the server calls: `ask`, `generateBrief`, `translateBrief`.
- `lead.ts`: plans, runs specialists in parallel, writes and grounds the answer;
  assembles and translates briefs.
- `loop.ts`: `runStep`, the loop one specialist runs; `Budget`; `budgetedCall`.
- `tools.ts`: the tools the model may call, and the checks they run.
- `corpus.ts`: loads a decision's sources and searches their pages (BM25).
- `gemini.ts`: one REST call to Gemini with retries, timeout and cost.
- `skills.ts` and `skills/`: each specialist's instructions as Markdown, plus `RULES.md`
  shared by all.
- `cli.ts`: run the agents from the terminal for testing.

## 3. Path of a question: from the browser to Gemini and back

A resident on the Region's 2027 budget page types "Will my water bill go up?".

1. **Browser.** `web/src/components/Chat.tsx` calls `postEvents()` in
   `web/src/lib/sse.ts`, which POSTs `{question, audiences, lang}` to
   `/api/decisions/row-2027-budget/ask` and reads the reply as a stream of
   server-sent events.
2. **Route.** `server/routes/agents.ts`, the `r.post("/api/decisions/:id/ask")`
   handler, validates the input (non-empty, under 1,000 characters, known audiences,
   a safe language code). Then the cheap checks, in order, so a refused request costs
   nothing: the agents are loaded; today's spend is under the cap (`checkDailyCap`,
   `server/limits.ts`); this IP has not asked 10 questions in 10 minutes
   (`RateLimiter.take`; the IP is held in memory only); one of 4 run slots is free
   (`RunSlots.acquire`).
3. **Record the question.** `app.log.append({actor: "visitor", kind: "question.asked", ...})`
   with the question text, audiences and language. No identity.
4. **Open the stream.** `openSse()` in `server/http.ts`. `startRun()` in
   `server/runs.ts` gives the agents a context whose `log()` writes to the record and
   whose abort signal fires if the resident leaves or the run passes 240 seconds.
5. **Lead plans.** `askWith()` in `agents/lead.ts`. Greetings and "what can you do?"
   are answered without a model call. Otherwise it loads the corpus
   (`loadCorpus`, `agents/corpus.ts`), creates a `Budget` of 40 calls and US$0.50 with
   one call held back for the answer, and calls `plan()`: one Gemini call that picks
   which specialists to ask and what to ask each. The browser receives a `plan` event
   and the steps panel shows them.
6. **Specialists work in parallel.** `runStep()` in `agents/loop.ts`, once per step.
   Each builds its system prompt from `RULES.md`, its own `SKILL.md` and the decision's
   metadata (`systemPrompt`, `decisionBrief`), then loops:
   - `budgetedCall()` reserves a call from the shared budget, calls Gemini
     (`callGemini` in `agents/gemini.ts`, a `fetch` to `generateContent` with the
     tools declared), records a `usage` entry in the log with tokens and cost, and
     emits a `usage` event.
   - If the model asks for tools, the loop runs them: `search_pages` (BM25 over page
     passages), `read_page`, and `record_statement`. Each tool's one-line summary is
     emitted as a `tool` event, which is what the steps panel shows.
   - It stops when the model stops calling tools, or at its own call limit, or when
     the budget is spent.
7. **Each statement is checked on the spot.** `record_statement` in `agents/tools.ts`
   (see section 4). Accepted statements are emitted as `statement` events and logged
   as `statement.recorded`; rejected ones are logged as `statement.rejected` with the
   reasons, and the reasons go back to the model.
8. **Lead writes the answer.** `writeAnswer()` makes one more Gemini call with only the
   verified statements, numbered, and asks for a plain answer with `[n]` markers.
9. **Answer is grounded in code.** `groundAnswer()` in `agents/lead.ts` drops any
   sentence that gives voting advice, or that has a number not found in a cited
   statement or the decision's hand-checked timeline; renumbers the markers; and keeps
   only the statements actually cited.
10. **Back to the browser.** The `answer` event carries the text and its statements.
    The server logs `answer.given`, adds a `usage` entry if the agents did not, sends
    `done` and closes the stream (`server/routes/agents.ts`). `Chat.tsx` shows the
    answer with numbered citation links; clicking one opens `SourceViewer.tsx` on the
    cited PDF page with the quote highlighted.

If anything fails, the resident gets a plain message (`failureMessage` in
`server/runs.ts`) and the run slot is released in a `finally` block.

## 4. Where citations are verified

There is one rule: a statement is verified only if every quote it cites is found on
the page it names. The code is `shared/verify.ts`; the tool that applies it is
`record_statement` in `agents/tools.ts`.

1. `checkCitations()` refuses a statement with no citations.
2. For each citation, `checkCitation()`:
   - refuses a source that is not one of this decision's sources, a page that does not
     exist, a quote with an ellipsis, or a quote shorter than 8 characters;
   - calls `verifyCitation()` → `quoteOnPage()`, which normalises both texts (case,
     spacing, curly quotes, dashes, ligatures, soft hyphens, words split by a hyphen
     at a line end) and looks for the quote: first as a plain substring, then with
     all spaces removed, then word by word in order across the columns of a two-column
     page (`matchAcrossColumns`). Nothing is fuzzy: every word must be present in order.
   - On failure it tells the model something it can act on: the page the quote is
     really on (`findQuotePages`), or another source that has it, or the closest line
     on the cited page.
3. `ruleProblems()` checks the wording: under 40 words, no advocacy, "may" for
   impacts, both sides for trade-offs.
4. Only if all of that passes is the statement stored with `verified: true`.

The sequence diagram "staff drafts, reviews and publishes" in [design.md](design.md)
shows a quote rejected because it was on page 14, not page 12, and the agent's
corrected second try.

Tests: `shared/verify.test.ts` (normalising, two-column pages, hyphenated line breaks,
quotes on the wrong page, statements with no citations) and `agents/tools.test.ts`.

## 5. Where the record's hash is computed

`server/log.ts`, method `Log.append()`:

1. The payload is round-tripped through JSON so what is hashed is exactly what is
   stored and later read back.
2. Inside one `BEGIN IMMEDIATE` transaction, it reads the last entry's `seq` and
   `hash`.
3. The new entry's hash is `entryHash(body)` = SHA-256 of `hashInput(e)` from
   `server/canonical.ts`: the previous hash followed by the canonical JSON (keys
   sorted, no whitespace) of `{seq, at, actor, kind, decisionId, payload}`. The first
   entry's previous hash is 64 zeros.
4. It inserts the row and commits. SQLite triggers refuse any `UPDATE` or `DELETE` on
   the table.

`Log.verifyChain()` recomputes every hash from the start; `main.ts` runs it at start-up
and `GET /api/log/verify` runs it on request. The browser re-checks the chain itself
with the Web Crypto API in `web/src/lib/hash.ts` (`verifyChain`), so a visitor does not
have to trust the server's word. Tests: `server/log.test.ts`, including a tamper test.

## 6. How a lens is computed

Lenses are computed **before** deployment by scripts, stored as JSON in `data/lenses/`,
and read by the agents' lens tools (`transit_gaps`, `lifecycle_cost`,
`housing_stages`, `commitment_progress` in `agents/tools.ts`). The model never does the
arithmetic; it explains the result and cites the documents.

**Worked example: housing (challenge 5).** `lenses/housing/`:
1. `sources.ts` lists each dataset with its URL, publisher and licence.
2. `fetch.ts` downloads them to `data/cache/housing/` (not committed).
3. `build.ts` counts, for Kitchener, Waterloo, Cambridge and the region, new homes at
   each stage since 1 January 2022 (approved, site plan, permit issued, under
   construction, completed), works out median days between stages where the same
   permit can be followed, attaches Ontario's 2031 target and progress, and lists the
   stages with no public data. `lib.ts` holds the pure functions the tests cover.
4. Output: `data/lenses/housing-<city>.json`, a `HousingLens`. `summary.ts` turns it
   into plain text for the agents.

**Transit (challenge 2).** `lenses/transit/` `TODO(verify)`: reads the Grand River
Transit GTFS (bus and ION), builds one service day's connections sorted by departure
time, and runs the Connection Scan Algorithm from origins in the decision's area to
essential destinations at weekday 8 am, weekday 10 pm and Sunday 8 am; then finds
service gaps and first/last-mile gaps, and ranks candidate fixes by people affected.

**Cost (challenge 3).** `lenses/cost/` `TODO(verify)`: for an asset, sums capital,
operating, maintenance, renewal and environmental cost year by year over the stated
horizon, with a 0% or 3% discount rate, divides by households, and marks each input as
cited or assumption. The web app recomputes when a resident moves an assumption
slider (`web/src/lib/cost.ts`).

**Commitments (challenge 4).** Recorded by the `commitments` specialist with
`record_commitment`, each progress figure a verified statement `TODO(verify)`.

## 7. Path of a brief: draft, review, publish

1. Staff open `/staff` and enter the passcode. `POST /api/staff/briefs` with
   `{decisionId}` (or a PDF upload, `server/upload.ts`). `requireStaff()` compares the
   passcode's SHA-256 digest in constant time.
2. The server logs `brief.started` and calls `generateBrief()`. In `agents/lead.ts`,
   `generateBriefWith()` runs the explainer and one specialist per lens, then
   `assembleBrief()` builds the `Brief` from the verified findings; the reading grade
   of the summary and impacts is computed with `readingGrade()`, and the status is
   `draft`. Progress streams to the staff
   screen as events.
3. The draft is written to `data/briefs/<id>.json` (on the volume in production) and
   `brief.generated` is logged with counts of verified statements, its cost and its
   hash.
4. For each statement, `POST /api/staff/review` with `approve`, `edit` (the original
   text is kept) or `reject`, and an optional note. The brief moves to `in-review`.
   `statement.reviewed` is logged with the reviewer's name and the new brief hash.
5. `POST /api/staff/publish` needs the reviewer's name. The brief becomes `published`
   with `by` and `at`, and `brief.published` is logged with the counts approved,
   edited, rejected and left unreviewed.

## 8. Tests and how to run them

```
npm test                                       # server, agents, lenses: 68 tests passing on 14 Nov 2026, 02:10 ET
node --test "shared/**/*.test.ts"              # citation check and reading grade: 12 tests passing
npm run typecheck
npm run smoke                                  # checks a running deployment end to end
node agents/cli.ts                             # run the agents from the terminal TODO(verify) flags
```

`npm test` does not yet include `shared/` (`TODO(verify)`: add it to the script).

## How AI was used and how we checked it

**What AI drafted.** Code, data pipelines and documents were drafted with Claude Code
(Anthropic, model Claude Opus 5.5), directed and reviewed by the team. In practice that
covers most of the TypeScript in `server/`, `agents/`, `lenses/`, `shared/` and `web/`,
the scripts that turn PDFs into page text and fetch open data, the skill files, these
documents and the readiness report. At run time, the product's agents use Google's
Gemini API (`gemini-3.6-flash`).

**What the team decided and did by hand.**
- The product rules (spec, "Principles") and the decision to enforce them in code.
- The choice of decisions and source documents, and the hand-checked timeline of each
  decision: dates, deadlines and ways to take part, checked against the official
  pages. `data/decisions/row-2027-budget.notes.md` records what was checked and where
  two official pages disagreed.
- The architecture choices in [architecture.md](architecture.md).
- Review of every change before it was committed, and of the agents' drafts.

**How we checked the AI-written code.**
- **Tests on the parts that carry trust.** The citation checker, reading grade, hash
  chain (including a tamper test), calendar, limits, spend summary, routes, the agent
  loop and tools, and the housing lens maths have unit tests: 80 in total, all passing
  at the time of writing.
- **Type checking** of all shared shapes with `tsc --strict`.
- **Fixtures.** `agents/fixtures/` holds a small made-up decision so the agent loop can
  be tested without spending money, and a cached run for repeatable checks.
- **Real runs on real documents.** The first full brief for the 2027 budget used
  `gemini-3.6-flash`, cost US$0.24, and produced 17 statements, every quote found on
  its page. `TODO(verify)`: how many the checker rejected on the way, from the record.
- **Smoke test** of the deployed site (`scripts/smoke.ts`).

**How we check the AI at run time.** The model's output is never trusted on its own:
quotes are checked on the page, wording rules are applied, numbers in answers must be
in a cited statement, spend is capped per run and per day, and staff approve before
anything is published. Every model call is in the public record with its cost.

**Known weak spots (honest list).**
1. **A quote on the page does not prove the sentence is fair.** The checker proves the
   words exist on that page, not that the statement reads them correctly or keeps their
   context. Staff review is the control for that.
2. **Staff edits are not re-checked.** An edited statement keeps its citations; the new
   text is not compared with the quote.
3. **Publishing does not require every statement to be reviewed.** It records how many
   were left unreviewed. `TODO(verify)`: whether the public page hides unreviewed or
   rejected statements.
4. **The first brief reads at grade 11.8**, above the grade-8 target. The grade is
   shown honestly; a rewrite pass is `TODO(verify)`. The syllable counter is a
   heuristic (about ±0.5 grade).
5. **The answer's number check is loose.** It looks for each number as text in the
   cited statements and the timeline, so a short number such as "5" can pass by
   coincidence.
6. **Two copies of canonical JSON.** The browser (`web/src/lib/hash.ts`) and the server
   (`server/canonical.ts`) each implement it. They agree today; if one changes, the
   browser would report a broken chain. A shared test would catch it.
7. **The record can be rewritten wholesale** by whoever controls the server.
   Publishing the head hash elsewhere is a next step.
8. **One shared staff passcode**, not individual accounts.
9. **Questions are public in the record.** No automatic removal of personal details yet.
10. **Energy and CO2e are estimates** from tokens, not measurements.
