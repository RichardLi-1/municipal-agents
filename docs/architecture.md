# Municipal Agents: architecture and rationale

This is the shape of the system and, more importantly, why it has that shape. The
audience is a city IT team deciding whether they could run it, and judges asking
whether it would scale. Diagrams are in [design.md](design.md), especially the
component, platform and deployment diagrams. Live: https://municipal-agents.fly.dev.

## 1. The shape in one paragraph

A resident's browser loads a small web app (Preact, MapLibre, pdf.js). It talks to
**one Node 24 process** that serves the app, the landing site, the docs site, the embed
script, a JSON API and server-sent events. That process holds everything else: the
agents (a lead and seven specialists, a plain loop in `agents/`), the citation and
reading-grade checks (`shared/`), readers for precomputed lens results, the answer cache
and offline answerer, and the public record (an append-only, hash-chained SQLite table
via `node:sqlite`). Documents, decisions, briefs, lens results, recorded runs and
construction illustrations are plain files under `data/`. The only outside service at
run time is the **Gemini API**, called over HTTPS with plain JSON. Open data (GTFS,
OpenStreetMap, census, permits, elevation) is downloaded and processed **ahead of time**
by scripts, so a resident's page view never waits on a model or a third-party portal.
It runs on **one Fly.io machine in Toronto (`yyz`)** with a 1 GB volume for the record,
staff-edited briefs and recorded runs.

```
 browser (Preact, MapLibre, pdf.js)      city website (embed.js)      calendar apps (.ics feed)
    |  HTTPS: JSON, PDFs, server-sent events
    v
 one Node 24 process on Fly.io, Toronto (yyz): shared-cpu-1x, 1 GB
    server/    node:http router, routes, staff auth, limits, spend, security headers,
               answer cache (runfiles), staff insights, retention purge, OpenAPI
    agents/    lead + 7 specialists (SKILL.md), tools, plain-language pass,
               offline answerer, Gemini client
    shared/    citation check, reading grade, types
    sites      web/dist (app), landing/dist (/), docs-site/dist (/docs), embed/
    /data      log.db (SQLite, hash chain), briefs/, runs/, uploads/     <- volume
    /app/data  sources (PDF + page text), decisions, lenses, renders     <- in the image
    |  HTTPS (API key in a header)
    v
 Gemini API (Google, US)           map tiles: OpenFreeMap, straight from the browser

 ahead of time: scripts/sources.ts (pdftotext -layout); lenses/*/fetch + build
   (GTFS, OpenStreetMap, census, permits, NRCan elevation, cited budget figures);
   lenses/construction/render.ts (Gemini image model, once)  ->  files under data/
```

## 2. Decisions and the reasons for them

### D1. One process, no web framework, TypeScript run directly

The server is `node:http` with a small router and helpers (`server/http.ts`).
TypeScript runs directly with Node's type stripping, so there is no build step on the
server. The root `package.json` has **no runtime dependencies**, only three development
ones (TypeScript and two sets of type definitions).

Why: a municipal IT team inherits whatever we ship. Every dependency is something to
patch, audit and explain. Node's standard library now covers what we need (HTTP,
SQLite, crypto, test runner, `.env` loading). Fewer moving parts means fewer things to
fail and a code base one person can read in a few hours.

Cost of the choice: we wrote our own router, body limits, gzip, static files, SSE and
security headers, all tested. A larger team could move to Fastify; the route handlers
would carry over.

### D2. Agents as a small loop we can explain, not a framework

`agents/loop.ts` is the whole agent runtime: send the specialist's instructions and
task to the model, run any tools it asks for, send the results back, repeat until it
stops or the budget runs out. The lead (`agents/lead.ts`) plans, runs specialists in
parallel, and merges what they recorded. Each specialist's instructions are a Markdown
file (`agents/skills/<name>/SKILL.md`) plus shared rules (`agents/skills/RULES.md`), so a
communications officer can read, and propose changes to, exactly what the agents are
told. The Gemini client (`agents/gemini.ts`) is plain `fetch` with retries and cost
accounting, no SDK.

Why: the first question about AI in government is "what exactly does it do?". With a
framework, the honest answer includes hidden prompts, retries and memory nobody on the
team wrote. With a loop of about 300 lines, the answer is on one screen. It also makes
the budget enforceable: every model call passes through one function
(`budgetedCall`) that counts it, prices it and logs it.

### D3. Checks in code, not by a model

| Check | Where | What it does |
|---|---|---|
| Citation | `shared/verify.ts`, used by `agents/tools.ts`, `server/statements.ts`, `lenses/cost/build.ts`, `agents/evals/run.ts` | A quote must appear on the cited page after normalising case, spacing, quotes, dashes, ligatures and line-break hyphens. Tolerates two-column PDF layouts by matching words in order across column segments. Nothing fuzzy. |
| Support strength | `agents/tidy.ts` (`supportOf`), at record time | `weak` if the sentence shares fewer than 2 meaningful word stems and no non-date number with its quotes; labelled for residents and reviewers. |
| Statement rules | `agents/tools.ts` (`ruleProblems`) | Under 40 words; no advice on what to think or how to vote; impacts say "may", "might" or "could"; trade-offs show both sides. |
| Lens numbers | `agents/tools.ts` (`record_computed_figure`) | A computed figure must match a number in the lens result; the model cannot invent one. |
| Reading grade | `shared/readability.ts`, `agents/plain.ts` | Flesch-Kincaid grade, shown; rewrites kept only if they read easier and keep every number. |
| Answer grounding | `agents/lead.ts` (`groundAnswer`) | Drops answer sentences that give voting advice or contain a number not in a cited statement or the hand-checked timeline. |

Why: a model asked to check another model's work fails in the same ways. String
matching cannot be talked out of its answer, is cheap and has unit tests. When a check
fails, the agent is told why in words it can act on ("That quote is on page 14, not page
12"), so it fixes the citation instead of guessing. In the four recorded brief runs the
checker rejected 78 attempts and accepted 116.

### D4. Precomputed lenses and stored briefs

Lens results are computed by scripts before deployment and stored as JSON in
`data/lenses/`: transit (Connection Scan over GRT's bus and ION timetables), cost (from
cited budget figures, the build stops if a quote fails), commitments (straight-line
progress test), housing (permit stages), and the construction scout (site scoring,
tunnel layout rules, steps). Briefs are generated once per decision by the agents,
reviewed by staff, and stored as JSON in `data/briefs/`. A resident opening a decision
page triggers **no model call**.

Why: cost (a brief costs about US$0.24 to US$0.37 once, not per visitor), speed (static
JSON), and accountability (what staff reviewed is exactly what residents see). The lens
maths is deterministic and tested. The model's job is to explain the result in plain
words with citations, not to compute it.

### D5. A hash-chained record that can still honour retention rules

`server/log.ts` appends every brief, check, question, answer, review, publication, purge
and model call to SQLite. Each entry's hash is SHA-256 of the previous entry's hash plus
the canonical JSON (`server/canonical.ts`) of the entry's header: sequence, time,
actor, kind, decision and the **payload's own SHA-256**. The payload sits in a separate
table. Triggers refuse `UPDATE` and `DELETE` on headers, and allow exactly one change to
content: a purge. `verifyChain()` recomputes every hash; the web app does the same in
the browser (`web/src/lib/hash.ts`), and a test checks the two canonical-JSON
implementations agree.

Why: the product's promise is that the public record of what was said, and who
approved it, cannot be changed quietly. A hash chain is the simplest structure that
makes any edit to a past entry visible. But a municipality must also dispose of records
when its retention by-law says so, and an immutable log would make that impossible.
Hashing the payload's hash, not the payload, resolves this: staff can purge one entry's
content with a reason (`POST /api/staff/purge`), a `record.purged` entry says which,
why and who, and the chain still verifies. Content missing without that entry is
reported as tampering.

Limit, stated plainly: whoever controls the server could rewrite the whole chain from
the start. The fix is to publish the latest hash somewhere the city does not control
alone (council minutes, a public Git repository, a timestamping service) on a schedule.
That is a next step.

### D6. Keep answering when the model can't

Every agent run's events are saved to `data/runs/<runId>.jsonl` (`server/runfiles.ts`).
Those files are the record of what the agents actually said, and they double as an
**answer cache**: a question that a real run already answered with citations (same
decision, language and audiences, same numbers, at least 85% of the same words) is
replayed, labelled with its original date, at no model cost. When the model can't be
reached (no key, authentication, payment, rate limit, server error, no connection),
**`agents/offline.ts`** answers from material already checked: the brief's verified
statements staff did not reject, the hand-checked timeline, computed lens results, then
exact quotes from the documents, then the Clerk's contact. Nothing in an offline answer
is written by a model, so nothing new can be wrong.

Why: a city service cannot go blank because a vendor did. This was tested for real: the
team's prepaid Gemini credit ran out at about 02:20 ET on 14 November 2026, and the live
site kept answering from replays and the checked brief. The limit is that new questions
get no fresh research until billing is restored, so production needs billing and credit
alerts.

### D7. One machine on Fly.io in Toronto

Fly.io runs the Docker image on one always-on `shared-cpu-1x` machine with 1 GB of
memory in `yyz`, with a 1 GB volume at `/data` (`fly.toml`). Deploy is `fly deploy`;
the health check is `GET /api/health`; `npm run smoke` checks the deployment.

Why: the record, briefs and recorded runs stay in Canada, latency to Waterloo Region
residents is low, and the whole deployment is two files (`Dockerfile`, `fly.toml`). The
same image runs on a city's own server, any container host, or a laptop.

What it does not solve: model calls go to Google's Gemini API, a US service. See section 6.

### D8. Gemini 3.6 Flash as the default model

A small, fast model with function calling and good multilingual output, at US$0.75 per
million input tokens and US$3.75 per million output tokens on the paid tier until 31
December 2026, and US$1.50 and US$7.50 from 1 January 2027 (Google AI Studio pricing,
retrieved 14 November 2026). Paid-tier prompts are not used to improve Google's
products, per the same page. Models are set by `LEAD_MODEL` and `SPECIALIST_MODEL`; the
client is one file. The construction illustrations were made once, ahead of time, with
`gemini-3.1-flash-image` (about US$0.64 for 8 images, capped at US$1.50).

### D9. A platform a city can plug into, without new services

The same process also serves:
- **Several municipalities** (`server/routes/cities.ts`): each is `cities/<id>.json`, and
  each decision names its city. A second city is a file, not a deployment.
- **An embeddable card** (`embed/embed.js`, data from `/api/embed/:id`): one `<script>`
  tag on the city's own page shows the plain title, cited statements and the next date to
  take part. Under 15 KB gzipped, tested.
- **A calendar feed** (`/api/calendar.ics?decisions=…`) residents subscribe to once.
- **OpenAPI** (`/api/openapi.json`), checked by a test against the registered routes.
- **Staff insights** (`/api/staff/insights`): what residents ask, aggregated, with
  wording only for groups of at least 3 similar questions and personal details removed.
- **The landing site** (`/`) and **docs site** (`/docs`), built to static files.

Why: cities already have websites, calendars and analytics habits. Meeting them there
costs less than asking residents to find a new site, and keeping it in one process keeps
the operating burden the same.

### D10. Operator corrections as a public file, not hand edits

Before a city takes over review, the team running the site may need to fix what the
agents wrote. Instead of editing brief files by hand, corrections live in a committed
file per decision (`data/corrections/<decisionId>.json`), applied whenever a brief is
loaded (`shared/corrections.ts`, `server/corrections.ts`) or written in with
`node agents/cli.ts correct <id>`. Each corrected quote must pass the same citation
check or the correction is refused; residents see "Corrected by the Municipal Agents
team (not Region staff)"; withdrawn statements are hidden; each correction is a
`statement.reviewed` entry in the record by `operator:municipal-agents-team`; and the
brief stays a draft. Why: the operator's changes are as reviewable and as visible as
staff's, and they survive a redraft. The three demo briefs carry 27 corrections (24
edits, 3 withdrawals).

### D11. The web app: Preact, Vite, MapLibre, pdf.js

Preact gives the React programming model in a small bundle, which matters on older
phones. MapLibre draws vector maps with OpenFreeMap tiles (no API key, no tracking).
pdf.js renders the exact cited page with the quote highlighted, so a resident sees the
evidence, not a paraphrase. axe-core reports 0 violations on the main pages and every
decision tab at desktop and phone widths, light and dark; on phones the map uses
cooperative gestures so the page still scrolls.

## 3. Alternatives we considered and rejected

| Alternative | Why we did not use it |
|---|---|
| An agent framework (LangChain, LangGraph, CrewAI and similar) | Hidden prompts and control flow; more dependencies; harder to enforce a per-run budget and to explain. Our loop is about 300 lines. |
| Embeddings and a vector database | For a few hundred pages per decision, BM25 over page passages (`agents/corpus.ts`) is fast, free, needs no extra service and returns exact page numbers. Citations need exact quotes anyway. Revisit for thousands of documents. |
| A model to verify citations ("LLM as judge") | Fails in the same way as the writer; costs money; not repeatable. |
| Generating the brief on every page view | Costs per visitor, slower, and the text could change between visits, so staff review would mean nothing. |
| A hosted chatbot over the PDFs | No citation guarantee, no staff review, no public record, and residents' questions go to a third party with unclear retention. |
| A semantic answer cache (embeddings) | Could replay an answer to a question that only looks similar. Word overlap plus identical numbers is stricter and explainable; misses fall through to a fresh run or an offline answer. |
| Postgres from day one | One more service to run and pay for. SQLite in WAL mode handles one writer; the move to Postgres is planned for multiple instances. |
| Serverless functions | Agent runs stream for up to 4 minutes and the record is a local file; both fit an always-on process better. |
| Next.js or another full-stack framework | More build machinery than a single-page app, two static sites and a small API need. |
| Resident accounts | Personal data for little gain. Preferences stay in the browser; calendar feeds cover reminders. |
| Blockchain for the record | Adds cost and operators. A hash chain with a published head hash gives the same tamper evidence for a single publisher. |
| Generating construction images on request | Cost and unpredictability per visitor. Eight images made once, reviewed, served as files. |

## 4. Scalability: more readers, decisions, questions and cities

| Growth | What happens today | How it scales |
|---|---|---|
| **More readers** | Briefs, decisions, sources and lenses are JSON and PDF files served gzipped; hashed static assets cached for a year. | Briefs change only when staff publish, so they can sit behind a CDN. Readers then never touch the Node process. |
| **More decisions** | One brief per decision, about 40 model calls and US$0.24 to US$0.37 once. | Linear and cheap. Staff review time, not compute, is the limit, which is why statements arrive pre-checked with quote and page side by side. |
| **More questions** | Per-IP limit (30 model-backed questions per 10 minutes; replays and offline answers free), at most 4 runs at once, US$5 per day; repeats replayed at US$0. | Agent runs become queued jobs with worker processes; the browser already receives progress as events. The answer cache grows with use, so the cost per question falls as common questions repeat. |
| **More documents per decision** | The search index is built in memory per run. | Persist the index (SQLite FTS5 or a search service) when a decision has thousands of pages. |
| **More instances** | One machine, one SQLite file. | Move the record to Postgres with a single serialised append (the same `BEGIN IMMEDIATE` pattern). Briefs, runs and uploads move to object storage. The hash format does not change. |
| **More cities** | Several cities on one deployment (`/api/cities`), one file each. | Per-city staff passcodes or single sign-on, per-city spend caps and records retention; or one deployment per city where data ownership requires it. |
| **Different models or data residency** | Gemini API, US-hosted. | Swap `agents/gemini.ts`: Vertex AI in Google's Canadian region (Montréal, `northamerica-northeast1`; at the time of writing it lists Gemini 3.5 and 3.8 Flash but not 3.6 Flash), a Canadian-hosted provider, or an open-weight model on the city's own hardware. The checks do not depend on the model. |

We have not load-tested the deployment; that is a step before a pilot.

## 5. Reliability and failure modes

| Failure | What the system does |
|---|---|
| Gemini API slow, down, out of credit, or the key is missing | 90-second timeout per call, up to 4 retries with backoff for 408, 429 and 5xx (`agents/gemini.ts`). If it still fails: repeated questions are replayed, new ones answered offline from checked material (D6). Briefs, sources, lenses and the record never call the model. |
| A run goes on too long | Hard stop at 240 seconds, 40 model calls or US$0.50, whichever comes first. The lead keeps a reserve so it can still write the answer. |
| Daily budget used | New agent runs get a plain message; replays still work, and briefs are unaffected. |
| The model invents or misplaces a quote | The citation check rejects it, the rejection is logged, the agent is told where the quote really is. |
| Bad text extraction from a PDF | Quotes fail the check, so the failure is safe: fewer statements, not wrong ones. Scanned PDFs need OCR first. |
| Two writes to the record at once | Each append is one `BEGIN IMMEDIATE` transaction, so the chain stays linear. |
| Machine restarts or redeploys | The record, briefs and runs are on the volume. Committed data is mirrored into the volume at start (`server/data.ts`; a newer brief on the volume wins). Fly restarts the machine if the health check fails. |
| Volume lost | The record would be lost. Fly.io takes daily volume snapshots by default; publishing the head hash lets a restored copy be checked. |
| A site fails to build at deploy | The API still deploys; a site that isn't built falls back to the resident app (`server/site.ts`), and the smoke test reports it. |

## 6. Security and privacy

- **No personal data by design.** No resident accounts, no sign-in, no tracking
  scripts; browser storage only for preferences. Questions are logged with the actor
  `visitor` and no identifier. IP addresses are kept in memory only, for the rate-limit
  window, and never written (`server/limits.ts`).
- **Questions are public, so treat them with care.** They appear in the record. Staff
  insights show wording only for groups of 3 or more similar questions, with emails,
  phone numbers, web addresses, postal codes and long numbers removed. Staff can purge an
  entry's content under the retention by-law. The chat box asks people not to include
  personal details; automatic redaction in the log is a next step.
- **Only public documents.** The agents read the decision's own published documents and
  nothing else. Their tools are read-only over that set, plus "record" tools that write
  into the draft. They cannot browse, send email or reach other files.
- **Staff access.** Staff routes need a bearer passcode, compared in constant time. The
  reviewer's name goes on every action in the record. Production should use the city's
  single sign-on with individual accounts and roles.
- **Headers.** A Content-Security-Policy on every page that allows only this origin's
  scripts and the exact inline scripts each page carries (hashes computed when served),
  a stricter policy on the API, HSTS, `nosniff`, and `/.well-known/security.txt`
  (`server/security.ts`).
- **Secrets.** `GEMINI_API_KEY` and `STAFF_TOKEN` are Fly secrets, never committed; the
  API key is only sent in a request header.
- **Abuse.** Request bodies are size-capped, questions limited to 1,000 characters,
  per-IP and daily caps apply, and at most 4 runs execute at once.
- **Prompt injection.** Text inside a source PDF could try to instruct the agent. The
  damage is limited: the agent cannot act outside the draft, every statement must quote
  the page, advocacy wording is refused, and staff review everything before publication.
- **Data residency.** The record, briefs and runs are stored in Toronto. Prompts (public
  document text and residents' questions) go to the Gemini API in the US. For
  production, a city should use a Canadian-region or on-premises model and complete a
  privacy impact assessment under MFIPPA. The [readiness report](../report/municipal-readiness-report.pdf)
  covers the Ontario context, including Bill 194.

## 7. Cost model

| Item | Cost | Basis |
|---|---|---|
| Hosting | about US$7 to 10 a month | Fly.io shared-cpu-1x with 1 GB lists at US$6.70 a month in its lowest-price regions; Toronto may differ. Volume US$0.15 per GB-month. (Fly.io pricing, retrieved 14 November 2026.) |
| One brief, all lenses | US$0.24 to US$0.37, about 40 model calls (the cap) | First run US$0.236; `costUsd` in `data/briefs/*.json`: transit hub 0.257, water supply 0.274, budget 0.368. |
| One question | about US$0.05–0.07, median 15 to 30 s | Eval averages: US$0.053 over 16 questions before the plain-language pass, US$0.073 over 12 after (`agents/records/sources/eval-round1.md`, `agents/evals/results.md`). |
| A repeated question | US$0 | Replayed from the record. |
| An offline answer | US$0 | No model call. |
| A translation | about US$0.009 per language | 2 calls each; French US$0.0088 and Spanish US$0.0081 in the live record. Cached once per language per brief version. |
| Construction illustrations | about US$0.64 once (cap US$1.50) | `lenses/construction/README.md`. |
| Daily ceiling on model spend | US$5 (configurable) | `DAILY_LIMIT_USD`. |
| Staff time | our estimate: 30 to 60 minutes to review a brief | Not yet measured with real staff. |
| **A year for one city** | **about US$360–500** at 2026 model prices; **about US$630–870** from 2027 | Assumes 50 briefs, 5,000 questions and 10 translations per brief: hosting US$85–120 + briefs about US$19 + questions US$250–350 (less with replays) + translations about US$5. Model prices double on 1 January 2027. Staff time not included. |

Model prices double on 1 January 2027 under Google's published schedule, so per-brief
and per-question costs should be re-checked then. Energy and CO2e are estimated from
tokens and published on the spend page with the method (`server/usage.ts`): about
0.0003 Wh per output token and 0.00003 Wh per input token (anchored on Google's
published 0.24 Wh median Gemini text prompt, 2025), and Ontario's grid at about 30 g
CO2e per kWh. These are estimates, not measurements.

## 8. What would change for production

1. Canadian-region or on-premises model, and a privacy impact assessment.
2. City single sign-on for staff, with individual accounts and roles (drafter, reviewer,
   publisher), and a screen for staff insights.
3. Billing and credit alerts for the model provider; monitoring of offline-answer rates.
4. Publish the record's head hash on a schedule outside the city's sole control.
5. Agent runs as queued jobs; briefs served from a CDN; a load test.
6. Automatic redaction of personal details in the public log.
7. Testing with residents who use assistive technology (automated axe checks already
   pass), and community review of translations for the top languages.
