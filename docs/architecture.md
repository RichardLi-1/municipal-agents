# Municipal Agents: architecture and rationale

This is the shape of the system and, more importantly, why it has that shape. The
audience is a city IT team deciding whether they could run it, and judges asking
whether it would scale. Diagrams are in [design.md](design.md) (component and
deployment diagrams especially). Items marked `TODO(verify)` were still being built
when this was written.

## 1. The shape in one paragraph

A resident's browser loads a small web app (Preact, MapLibre, pdf.js). It talks to
**one Node 24 process** that serves the app, a JSON API and server-sent events. That
process holds everything else: the agents (a lead and six specialists, a plain loop
in `agents/`), the citation and reading-grade checks (`shared/`), readers for
precomputed lens results, and the public record (an append-only, hash-chained SQLite
table via `node:sqlite`). Documents, decisions, briefs and lens results are plain files
under `data/`. The only outside service at run time is the **Gemini API**, called over
HTTPS with plain JSON. Open data (GTFS, permits, OpenStreetMap destinations) is
downloaded and processed **ahead of time** by scripts, so a resident's page view never
waits on a model or a third-party portal. It runs on **one Fly.io machine in Toronto
(`yyz`)** with a 1 GB volume for the record and staff-edited briefs.

```
 browser (Preact, MapLibre, pdf.js)
    |  HTTPS: JSON, PDFs, server-sent events
    v
 one Node 24 process on Fly.io, Toronto (yyz)
    server/   node:http router, routes, staff auth, limits, spend
    agents/   lead + specialists (SKILL.md), tools, Gemini client
    shared/   citation check, reading grade, types
    lenses/   readers for precomputed results
    /data     log.db (SQLite, hash chain), briefs/, uploads/   <- volume
    /app/data sources (PDF + page text), decisions, lenses     <- in the image
    |  HTTPS (API key in a header)
    v
 Gemini API (Google)            map tiles: OpenFreeMap, straight from the browser

 ahead of time: scripts/sources.ts (pdftotext -layout), lenses/*/fetch + build
                (GTFS, permits, OSM)  ->  files committed under data/
```

## 2. Decisions and the reasons for them

### D1. One process, no web framework, TypeScript run directly

The server is `node:http` with a 200-line router and helpers (`server/http.ts`).
TypeScript files run directly with Node's type stripping, so there is no build step on
the server. The root `package.json` has **no runtime dependencies**, only three
development ones (TypeScript, Node and GeoJSON type definitions).

Why: a municipal IT team inherits whatever we ship. Every dependency is something to
patch, audit and explain. Node's standard library now covers what we need (HTTP,
SQLite, crypto, test runner, `.env` loading). Fewer moving parts means fewer things to
fail and a code base one person can read in an afternoon.

Cost of the choice: we wrote our own router, body limits, gzip and SSE helpers (about
200 lines, tested). For a larger team a framework such as Fastify would be a reasonable
swap; the route handlers would move over unchanged.

### D2. Agents as a small loop we can explain, not a framework

`agents/loop.ts` is the whole agent runtime: send the specialist's instructions and
task to the model, run any tools it asks for, send the results back, repeat until it
stops or the budget runs out. The lead (`agents/lead.ts`) plans, runs specialists in
parallel, and merges what they recorded. Each specialist's instructions are a
Markdown file (`agents/skills/<name>/SKILL.md`) plus shared rules
(`agents/skills/RULES.md`), so a communications officer can read, and propose changes
to, exactly what the agents are told. The Gemini client (`agents/gemini.ts`) is plain
`fetch` with retries and cost accounting, no SDK.

Why: the judges' and a city's first question about AI is "what exactly does it do?".
With a framework, the honest answer includes hidden prompts, retries and memory that
nobody on the team wrote. With 300 lines of loop, the answer is on one screen. It also
makes the budget enforceable: every model call passes through one function
(`budgetedCall`) that counts it, prices it and logs it.

### D3. Checks in code, not by a model

Four checks decide what a resident sees, and none of them is a model:

| Check | Where | What it does |
|---|---|---|
| Citation | `shared/verify.ts`, used by `agents/tools.ts` | A quote must appear on the cited page after normalising case, spacing, quotes, dashes, ligatures and line-break hyphens. Tolerates two-column PDF layouts by matching words in order across column segments. Nothing fuzzy: every word must be there, in order. |
| Statement rules | `agents/tools.ts` (`ruleProblems`) | Under 40 words; no advice on what to think or how to vote; impacts must say "may", "might" or "could"; trade-offs must show both sides. |
| Reading grade | `shared/readability.ts` | Flesch-Kincaid grade (Kincaid et al., 1975), shown on the brief. |
| Answer grounding | `agents/lead.ts` (`groundAnswer`) | Drops any answer sentence that gives voting advice, or that contains a number not found in a cited statement or the hand-checked timeline. |

Why: a model asked to check another model's work fails in the same ways (it can
"confirm" a quote that is not there). String matching cannot be talked out of its
answer, is cheap, and has unit tests (`shared/verify.test.ts`). When a check fails,
the agent is told why in words it can act on ("That quote is on page 14, not page 12"),
so it fixes the citation instead of guessing.

### D4. Precomputed lenses and stored briefs

Lens results (transit access, lifecycle cost, housing stages, commitments) are
computed by scripts before deployment and stored as JSON in `data/lenses/`. Briefs are
generated once per decision by the agents, reviewed by staff, and stored as JSON in
`data/briefs/`. A resident opening a decision page triggers **no model call**.

Why: cost (a brief costs cents once, not cents per visitor), speed (static JSON), and
accountability (what staff approved is exactly what residents see; it does not change
between page loads). The lens maths (Connection Scan for transit, discounted sums for
cost, stage counts for housing) is deterministic and testable. The model's job is to
explain those results in plain words with citations, not to compute them.

### D5. A hash-chained record instead of a plain database table

`server/log.ts` appends every brief, check, question, answer, review, publication and
model call to one SQLite table. Each entry's hash is SHA-256 of the previous entry's
hash plus a canonical JSON of the entry (`server/canonical.ts`). Triggers refuse
`UPDATE` and `DELETE`; `verifyChain()` recomputes every hash, and the web app can do the
same in the browser (`web/src/lib/hash.ts`).

Why: the product's promise is that the public record of what was said, and who
approved it, cannot be changed quietly. A hash chain is the simplest structure that
makes any edit to a past entry visible. A blockchain would add cost and operators
without adding trust for a single publisher.

Limit, stated plainly: whoever controls the server could rewrite the whole chain from
the start. The fix is to publish the latest hash somewhere the city does not control
alone (for example in council minutes, a public Git repository, or a timestamping
service) on a schedule. That is a next step, not built.

### D6. One machine on Fly.io in Toronto

Fly.io runs the Docker image on one always-on machine in `yyz` with a 1 GB volume
(`fly.toml`). Deploy is `fly deploy`; the health check is `GET /api/health`.

Why: the record and the staff-edited briefs stay in Canada, the latency to Waterloo
Region residents is low, and the whole deployment is two files (`Dockerfile`,
`fly.toml`). The same image runs on a city's own server, any container host, or a
laptop.

What it does not solve: model calls go to Google's Gemini API, which is a US service.
See section 6.

### D7. Gemini 3.6 Flash as the default model

A small, fast model with function calling and good multilingual output, at US$0.75 per
million input tokens and US$3.75 per million output tokens on the paid tier until 31
December 2026 (US$1.50 and US$7.50 from 1 January 2027) (Google AI Studio pricing,
retrieved 14 November 2026). Paid-tier prompts are not used to improve Google's
products, per the same page. The models are set by `LEAD_MODEL` and
`SPECIALIST_MODEL`; the client is one file, so a different provider means rewriting
one function.

### D8. The web app: Preact, Vite, MapLibre, pdf.js

Preact gives the React programming model in a small bundle, which matters on older
phones. MapLibre draws vector maps with tiles from OpenFreeMap (no API key, no
tracking). pdf.js renders the exact cited page with the quote highlighted, so a
resident sees the evidence, not a paraphrase.

## 3. Alternatives we considered and rejected

| Alternative | Why we did not use it |
|---|---|
| An agent framework (LangChain, LangGraph, CrewAI and similar) | Hidden prompts and control flow; more dependencies; harder to enforce a per-run budget and to explain to judges and staff. Our loop is about 300 lines. |
| Embeddings and a vector database for retrieval | For a few hundred pages per decision, BM25 keyword search over page passages (`agents/corpus.ts`) is fast, free, needs no extra service, and returns exact page numbers. Citations need exact quotes anyway, so the agent reads the page before quoting. Revisit for thousands of documents (see scalability). |
| A model to verify citations ("LLM as judge") | Fails in the same way as the writer; costs money; not repeatable. String matching in code is exact and testable. |
| Generating the brief on every page view | Costs per visitor, slower, and the text could change between visits, so staff approval would mean nothing. |
| A hosted chatbot over the PDFs | No citation guarantee, no staff approval, no public record, and residents' questions go to a third party with unclear retention. |
| Postgres from day one | One more service to run and pay for. SQLite in WAL mode handles one writer easily; the move to Postgres is planned for multiple instances (section 4). |
| Serverless functions | Agent runs stream for up to 4 minutes and the record is a local file; both fit an always-on process better. |
| Next.js or another full-stack framework | More build machinery than a single-page app plus a small API needs. |
| Resident accounts (to save preferences or follow decisions) | Personal data for little gain. Preferences stay in the browser; calendar files cover reminders. |
| Blockchain for the record | Adds cost and operators. A hash chain with a published head hash gives the same tamper evidence for a single publisher. |

## 4. Scalability: more readers, decisions, questions and cities

| Growth | What happens today | How it scales |
|---|---|---|
| **More readers** | Briefs, decisions, sources and lenses are JSON and PDF files served by the process, gzipped. | Briefs change only when staff publish, so they can be cached at a CDN or written out as static files. Readers then never touch the Node process. |
| **More decisions** | One brief per decision, a one-off model cost (first full run: US$0.24, `TODO(verify)` final figure), stored as a file. | Linear and cheap. Staff review time, not compute, is the limit, which is why statements arrive pre-checked with quote and page side by side. |
| **More questions** | Per-IP limit (10 per 10 minutes), at most 4 runs at once (`server/limits.ts`), US$5 per day cap. | Agent runs become queued jobs with worker processes; the browser already receives progress as events, so a queue changes nothing for the resident. Pre-answer the most common questions and publish them in the brief after staff review. |
| **More documents per decision** | The search index is built in memory per run. | Persist the index (SQLite FTS5 or a search service) when a decision has thousands of pages. |
| **More instances** | One machine, one SQLite file. | Move the record to Postgres with a single serialised append (one transaction takes the previous hash, as `BEGIN IMMEDIATE` does now). Briefs and uploads move to object storage. The hash format does not change. |
| **More cities** | One city per deployment: `cities/<id>.json` plus its documents and open data. | Either one deployment per city (simplest, clear data ownership), or one shared service with the city id in the path and per-city spend caps, staff tokens and logs. |
| **Different models or data residency** | Gemini API, US-hosted. | Swap `agents/gemini.ts`: Vertex AI in Google's Canadian region (Montréal, `northamerica-northeast1`; at the time of writing it lists Gemini 3.5 and 3.8 Flash but not 3.6 Flash), a Canadian-hosted provider, or an open-weight model on the city's own hardware. The checks in code do not depend on the model. |

We have not load-tested the deployment. `TODO(verify)`: a simple load test of
`GET /api/decisions/:id` on the Fly machine, to replace "should" with a number.

## 5. Reliability and failure modes

| Failure | What the system does |
|---|---|
| Gemini API slow or down | Each call has a 90-second timeout and up to 4 retries with backoff for 408, 429 and 5xx (`agents/gemini.ts`). If it still fails, the question gets a plain error; briefs, sources, lenses and the record keep working because none of them call the model. |
| A run goes on too long | Hard stop at 240 seconds (`RUN_TIMEOUT_SEC`), 40 model calls or US$0.50, whichever comes first. The lead keeps a reserve so it can still write the answer. |
| Daily budget used | New questions get a plain message ("Today's budget ... has been used. The briefs are still here to read"). |
| The model invents or misplaces a quote | The citation check rejects it, the rejection is logged, and the agent is told where the quote really is. Unverified statements are never shown as verified. |
| Bad text extraction from a PDF | Quotes fail the check, so the failure is safe: fewer statements, not wrong ones. Scanned PDFs without text need OCR first. |
| Two writes to the record at once | Each append is one `BEGIN IMMEDIATE` transaction, so entries are serialised and the chain stays linear. |
| Machine restarts or redeploys | The record and briefs are on the volume. Committed data is mirrored into the volume at start (`server/data.ts`). Fly restarts the machine if the health check fails. |
| Volume lost | The record would be lost. Mitigation: Fly volume snapshots (daily by default) and publishing the head hash so a restored copy can be checked. `TODO(verify)`: snapshot retention setting. |
| The web build fails at deploy | The API still deploys and the smoke test reports it (`Dockerfile`, `scripts/smoke.ts`). |

## 6. Security and privacy

- **No personal data by design.** No resident accounts, no sign-in, no tracking
  scripts. Questions are logged with the actor `visitor` and no identifier. IP
  addresses are kept in memory only, for the rate limit window, and never written
  (`server/limits.ts`). Because questions appear in the public record, the page asks
  people not to type personal details (`TODO(verify)` on screen); automatic redaction
  is a next step.
- **Only public documents.** The agents read the decision's own published documents
  and nothing else. Their tools are read-only over that set, plus "record" tools that
  write into the draft. They cannot browse, send email or reach other files.
- **Staff access.** Staff routes need a bearer passcode, compared in constant time
  (`requireStaff` in `server/routes/staff.ts`). The reviewer's name goes on every action
  in the record. For production this should be the city's single sign-on with
  individual accounts; one shared passcode is a prototype shortcut.
- **Secrets.** `GEMINI_API_KEY` and `STAFF_TOKEN` are environment variables (Fly
  secrets), never committed. The API key is only ever sent in a request header.
- **Abuse.** Request bodies are size-capped, questions limited to 1,000 characters,
  per-IP and daily caps apply, and at most 4 runs execute at once.
- **Prompt injection.** Text inside a source PDF could try to instruct the agent. The
  damage is limited because the agent cannot act outside the draft, every statement
  must quote the page, advocacy wording is refused, and staff review everything
  before publication.
- **Data residency.** The record and briefs are stored in Toronto. Prompts (public
  document text and residents' questions) go to the Gemini API in the US. For
  production, a city should use a Canadian-region or on-premises model (section 4),
  and review the arrangement under MFIPPA and its own privacy impact assessment
  process. See the [readiness report](../report/municipal-readiness-report.pdf) for
  the Ontario context, including Bill 194.

## 7. Cost model

| Item | Cost | Basis |
|---|---|---|
| Hosting | about US$7 to 10 a month | Fly.io shared-cpu-1x with 1 GB memory lists at US$6.70 a month in its lowest-price regions; Toronto may differ. Volume: US$0.15 per GB-month. (Fly.io pricing page, retrieved 14 November 2026.) |
| One brief (all lenses) | first full run: US$0.24 for the 2027 budget; capped at US$0.50 | Logged per call in the record. `TODO(verify)` final figures after the demo runs. |
| One question | a small test question: 5 model calls, about 12,300 input and 700 output tokens, US$0.012; capped at US$0.50 | `agents/fixtures/cache/agents-cli.jsonl`. `TODO(verify)` typical cost on the real budget decision. |
| One translation of a brief | `TODO(verify)` | Cached after the first request per language, so paid once per brief version. |
| Daily ceiling on model spend | US$5 (configurable) | `DAILY_LIMIT_USD`. |
| Staff time | `TODO(verify)`: our estimate is 30 to 60 minutes to review a brief | Not yet measured with real staff. |

Model prices double on 1 January 2027 under Google's published schedule, so per-brief
and per-question costs should be re-checked then. Energy and CO2e are estimated from
tokens and published on the spend page with the method (`server/usage.ts`): about
0.0003 Wh per output token and 0.00003 Wh per input token (anchored on Google's
published 0.24 Wh median Gemini text prompt, 2025), and Ontario's grid at about 30 g
CO2e per kWh. These are estimates, not measurements.

## 8. What would change for production

1. Canadian-region or on-premises model, and a privacy impact assessment.
2. City single sign-on for staff, with individual accounts and roles (drafter,
   reviewer, publisher).
3. Publish the record's head hash on a schedule outside the city's sole control.
4. Agent runs as queued jobs; briefs served from a CDN.
5. A "report an error" flow that goes to the clerk's office and is itself logged.
6. Accessibility audit with residents who use assistive technology, and community
   review of translations for the top languages.
