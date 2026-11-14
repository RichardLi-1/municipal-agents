# Municipal Agents: software requirements

Status: prototype built for CIVIC Hack 2026 (12 to 14 November 2026). This document
says who the product is for, what it must do, how well it must do it, and what could
go wrong. Items marked `TODO(verify)` depend on code that was still being written when
this was drafted.

The product: AI agents read a city's own documents and turn a proposed decision into a
brief a resident can read in five minutes: what is proposed, how it may affect them,
and when they can have a say. Every figure links to the page it came from, and a named
staff member approves every statement before it is published.

Pilot setting: Waterloo Region, Ontario (`cities/waterloo-region.json`: the Region,
three cities and four townships). The main decision is the Region of Waterloo 2027
Plan and Budget (`data/decisions/row-2027-budget.json`): the draft goes to Regional
Council on 16 December 2026 (register to speak by noon on 9 December), with detailed
review days on 19 and 27 January 2027 and an online survey open to 26 February 2027.
The draft itself is not public yet, so the 2027 figures come from the forecast in the
2026 budget book, and the brief says so. Secondary decisions: the Region's Water Supply
Strategy Update (`data/decisions/row-water-supply-2051.json`; online meeting 17
November, drop-in 24 November 2026) and Kitchener's Committee of Adjustment hearing on
the Kitchener Central Transit Hub variances (17 November 2026, 10 am; `TODO(verify)`
file name). The agents read 19 public PDFs from the Region, Grand River Transit and the
City of Kitchener, plus 4 web pages saved as PDF.

Related documents: [design and UML](design.md), [architecture](architecture.md),
[code tour](code-tour.md), [references](references.md), [spec](spec.md).

---

## 1. The problem

Municipal decisions are explained in documents written for council: a budget book of
191 pages, staff reports, agendas, consultation notices. The facts a resident needs are
in there, but they are spread across many files, written in technical language, and the
chance to take part (a survey, a delegation, a council meeting) is easy to miss.
Residents who are most affected are often the least likely to have time to read them:
renters, shift workers, newcomers, people with a disability, seniors.

Staff, in turn, must explain decisions accurately and run consultation with small teams.
A general chatbot is not an answer: it can state a wrong figure with confidence, and a
city cannot publish something it has not checked.

So the requirement is not "summarise a PDF". It is: explain a decision in plain words,
show where each fact came from, let staff check it before anyone relies on it, and make
the record of what was said impossible to change quietly.

## 2. Stakeholders and their needs

| Stakeholder | Who, concretely | What they need | What they must not get |
|---|---|---|---|
| **Residents (primary)** | Renters, homeowners, transit riders, drivers, people who walk or cycle, business owners, seniors, students, parents | What is proposed, what it may mean for *them*, the next date they can take part and how, in under five minutes | Opinions on how to vote; figures with no source; a page that looks like the official notice |
| Residents with a disability | Screen-reader users, keyboard-only users, people with low vision or cognitive disabilities | Full keyboard and screen-reader use, good contrast, plain words, no time limits, text alternatives for the map and charts | Content that only works with a mouse or only as a map |
| Newcomers and people who read better in another language | Waterloo Region's most common home languages after English and French include Punjabi, Arabic, Mandarin, Spanish (see `cities/waterloo-region.json`, `sourcesNote`) | The brief and answers in their language, with the same citations; a clear note that translations are machine-made | A translation that drops the uncertainty or the "not official" notice |
| Equity-deserving groups and people with low digital access | Low-income households, people on mobile data, people without a computer, Indigenous residents, racialised communities | Works on an older phone and a slow connection; no account; a printable or shareable version that community workers can carry offline | A process that assumes everyone will come online |
| **Clerks and communications staff** | Clerk's office, communications and engagement teams | A first draft they can trust *and check quickly*: each sentence shown with its quote and page; approve, edit or reject with a note; publish under their name; a record of who approved what | More work than writing it themselves; anything published without their approval |
| Planners and subject-matter staff | Finance, transit, housing, climate staff | Lens results they can recognise (method stated, inputs cited, assumptions shown) and a place to correct them | Numbers whose method they cannot see |
| Councillors and their offices | Councillors, constituency assistants | A neutral, sourced explainer to send to constituents; the dates residents can speak | Advocacy for or against a position |
| Community groups | Neighbourhood associations, tenant groups, transit and cycling advocates, settlement agencies | A brief to share with members, the participation steps and deadlines, an `.ics` calendar file | A tool that speaks for them |
| City IT and records | IT, privacy and records staff | Few moving parts, no personal data, a known monthly cost, logs that satisfy records retention, a model that can move to a Canadian region | A new platform to maintain, vendor lock-in, resident data in a US service |
| Province and auditors (indirect) | Information and Privacy Commissioner of Ontario, internal audit | Evidence of human oversight of AI, disclosure of AI use, a verifiable record | Undisclosed automated content |

## 3. Scope

**In scope (this prototype)**

- Briefs for proposed decisions in one region, drafted by agents from the city's own
  public documents, reviewed and published by staff.
- Plain-language summary, audience impacts, a "have your say" timeline with an
  `.ics` file, unknowns and trade-offs, glossary, sources.
- Four lenses on the same decision: transit access, lifecycle cost, commitments,
  housing pipeline.
- A question box that answers with verified citations, showing each agent's steps.
- Machine translation of a brief on request.
- A staff screen to start a brief, review each statement and publish.
- A public, hash-chained record and a public spend page.
- One city configuration file per region.

**Out of scope (deliberately)**

- Collecting formal consultation input (surveys, delegation registration). We link to
  the city's official channels instead of replacing them.
- Resident accounts, profiles, newsletters or tracking.
- Saying what residents should think or how a councillor should vote.
- Legal notice: the product never replaces the official notice.
- Scanned documents without a text layer (OCR), audio and video of meetings (a later
  step; see "What's next" in the [architecture](architecture.md)).
- Production identity management for staff (the prototype uses one shared passcode).

## 4. User stories and acceptance criteria

Each story lists the functional requirements (FR) it relies on.

**US-1. Find what is being decided near me.** As a resident, I want to see the
decisions open now on a map and a list, so I know which ones matter to me.
- Given the home page, I see each decision with a plain title, who decides, and the
  next chance to take part with a countdown in days.
- I can find a decision by typing a neighbourhood or street, without a map.
- Works with a keyboard and a screen reader. (FR-1, FR-2, NFR-1)

**US-2. Understand the decision in five minutes.** As a resident, I want a short,
plain explanation of what is proposed and why now.
- The overview has 3 to 6 statements, each with at least one citation link.
- The reading grade is shown and is 8 or lower for the summary and impacts, or the
  page says it is higher.
- Review status is visible: "Approved by <name>, <date>" or "Draft: not yet reviewed
  by staff". (FR-3, FR-4, FR-8, FR-12)

**US-3. See how it may affect me.** As a renter who takes the bus, I want impacts for
my situation.
- I can pick more than one audience; impacts appear for each.
- Impacts use "may", "might" or "could" and say what is uncertain. (FR-5, FR-9)

**US-4. Know when and how I can have a say.** As a resident, I want the dates and
the ways to take part.
- A timeline shows report, committee, public input, council and implementation, with
  the next opportunity highlighted.
- Each way to take part shows the deadline, contact and link, and I can add it to my
  calendar (`.ics`, RFC 5545). (FR-6, FR-7)

**US-5. Check a figure.** As a sceptical resident or journalist, I want to see where
a number came from.
- Every figure and statement links to a source page. Opening it shows the PDF page with
  the quote highlighted and a link to the original document.
- Statements whose quotes could not be found are not shown as verified. (FR-8, FR-10)

**US-6. Ask my own question.** As a resident, I want to ask in my own words and
language.
- I get an answer with numbered citations, or a plain "the documents don't say" with
  who can answer.
- A steps panel shows which specialists worked on it.
- Sentences with figures that no verified statement supports are removed before I see
  them. (FR-13, FR-14, FR-15)

**US-7. Read it in my language.** As a newcomer, I want the brief in Punjabi.
- The brief is translated on request, cached, and marked as machine translation of the
  staff-approved English brief. (FR-16) `TODO(verify)`: the "machine translation"
  label on screen.

**US-8. Draft a brief.** As a communications officer, I want agents to draft a brief
from the documents I choose.
- I start a run from the staff screen and watch the agents' steps.
- When it ends I have a draft with every statement's citations already checked, a
  count of statements the checker rejected, and the cost of the run. (FR-17, FR-18,
  FR-10, FR-21)

**US-9. Review and publish.** As a clerk, I want to approve, edit or reject each
statement with a note, then publish under my name.
- Each action records my name, the time and (for edits) the original text.
- Publishing needs my name; the record shows how many statements were approved, edited,
  rejected and left unreviewed. (FR-19, FR-20, FR-22)

**US-10. Trust the record.** As an auditor or resident, I want to know nothing was
changed after the fact.
- The record page lists every brief, check, question, answer, review, publication and
  spend entry, and checks the hash chain in my browser ("Chain intact: N entries"). (FR-22, FR-23)

**US-11. See the transit gap.** As a transit rider in a part of the region with
poor service, I want to see which essential places I cannot reach in 45 minutes,
and what fixes would help most. (FR-24)

**US-12. See the full cost.** As a homeowner, I want the upfront price compared with
what an asset costs to run and renew over its life, per household, and to change the
assumptions. (FR-25)

**US-13. Check a commitment.** As a member of a climate group, I want to see whether
the Region is on track for a target this decision touches. (FR-26)

**US-14. Follow housing from approval to construction.** As a housing advocate, I
want to see units at each stage and where public data stops. (FR-27)

**US-15. Adapt it to my city.** As a city IT lead elsewhere, I want to point it at
our documents and data without changing code. (FR-28)

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | The home page lists open decisions with plain title, decision-maker, status, next participation event and a countdown. |
| FR-2 | A map shows each decision's area; a text search finds a decision by place name. |
| FR-3 | Each decision has a brief: summary (3 to 6 statements), why now, audience impacts, have-your-say, figures, unknowns, trade-offs, glossary, sources, lenses. |
| FR-4 | Every page links to the official notice and says it is not the official notice. |
| FR-5 | Residents can select one or more of 11 audiences; impacts are shown for each selected audience. |
| FR-6 | The have-your-say tab shows the decision timeline with participation methods, deadlines, contacts and links; the next opportunity is highlighted. |
| FR-7 | `GET /api/decisions/:id/calendar.ics` returns the participation dates as an RFC 5545 calendar. |
| FR-8 | Every statement and figure carries at least one citation (source, page, exact quote) or is labelled computed or assumption. |
| FR-9 | A statement is recorded only after passing rule checks in code: under 40 words, no advice on how to think or vote, "may" language for impacts, both sides for trade-offs. |
| FR-10 | A statement is marked verified only if every citation's quote is found on the cited page after normalising; otherwise it is rejected and the agent is told where the quote really is or what the page says. |
| FR-11 | The source viewer renders the cited PDF page, highlights the quote and links to the original. |
| FR-12 | The brief's Flesch-Kincaid reading grade is computed in code and shown. |
| FR-13 | `POST /api/decisions/:id/ask` answers a question in plain words with numbered citations, streaming the agents' steps as server-sent events. |
| FR-14 | The lead agent plans, hands sub-questions to specialists, and merges only verified statements into the answer. |
| FR-15 | Before an answer is sent, sentences that give voting advice or contain a number not found in a cited statement or the hand-checked timeline are removed. |
| FR-16 | `POST /api/decisions/:id/translate` returns the brief in a requested language, cached and reused until the source brief changes. |
| FR-17 | Staff can start a brief for a decision (or from an uploaded PDF) and watch progress. |
| FR-18 | Each run stops at 40 model calls or US$0.50; the public site stops new runs at US$5 per day (Toronto time). |
| FR-19 | Staff can approve, edit (keeping the original text) or reject each statement with a note; each action records the reviewer's name and time. |
| FR-20 | Publishing requires the reviewer's name and changes the brief's status to published. |
| FR-21 | Staff routes require a bearer passcode, compared in constant time. |
| FR-22 | Every brief start, generation, recorded and rejected statement, review, publication, question, answer, translation and model call is appended to the log. |
| FR-23 | The log is append-only and hash-chained (SHA-256); the chain can be verified on the server and in the browser. |
| FR-24 | Transit lens: share of the area reaching each essential destination type within 45 minutes at set times, service gaps, first/last-mile gaps, ranked fixes with trade-offs, method and limits stated. |
| FR-25 | Cost lens: capital, operating, maintenance, renewal and environmental cost over a stated horizon, per household, with adjustable assumptions and a stated discount rate. |
| FR-26 | Commitments lens: each public commitment the decision touches, who made it, target, latest cited progress, status and what is unclear. |
| FR-27 | Housing lens: units by stage from approval to completion, median time between stages where data allow, and stages with no public data. |
| FR-28 | A city is configured by one file (`cities/<id>.json`) plus its documents and open data; no code changes. |
| FR-29 | The spend page shows calls, tokens, US dollars and estimated energy and CO2e, computed from the log. |

## 6. Non-functional requirements

| ID | Quality | Target and how it is checked |
|---|---|---|
| NFR-1 | Accessibility | WCAG 2.2 Level AA: keyboard operable, visible focus, contrast 4.5:1 for text, labelled controls, text alternatives for map and charts, no information by colour alone, respects reduced motion. Checked with axe and a manual keyboard and VoiceOver pass. `TODO(verify)`: results. |
| NFR-2 | Plain language | Summary and impacts at Flesch-Kincaid grade 8 or lower, measured in code (`shared/readability.ts`) and shown. The grade is a guide, not a guarantee of clarity. |
| NFR-3 | Citation integrity | 100% of statements shown as verified have every quote found on its page (checked in code at record time, `shared/verify.ts`). No ellipses in quotes; quotes under 8 characters are refused. |
| NFR-4 | Neutrality | Rule checks refuse advocacy wording in statements; answers drop advice sentences; trade-offs must show both sides. |
| NFR-5 | Privacy | No resident accounts, no cookies for tracking, no personal information collected. Questions are logged without any identifier. IP addresses are held in memory only for rate limiting and never written (`server/limits.ts`). |
| NFR-6 | Human oversight | Agent output is a draft until a named staff member publishes it; the review state is shown on every brief. |
| NFR-7 | Auditability | Every action in FR-22 is logged; tampering with any past entry breaks every later hash. |
| NFR-8 | Cost control | Per run: 40 calls, US$0.50. Per day: US$5 (configurable `DAILY_LIMIT_USD`). Unknown models are priced at the dearest known price so spend is never understated. |
| NFR-9 | Performance | Brief and decision pages load from stored JSON (no model call). Target: first meaningful paint under 2.5 s on a mid-range phone on 4G. A question shows its first step within 3 s and finishes within 60 s typical, 240 s hard timeout. `TODO(verify)`: measured times. |
| NFR-10 | Availability | One always-on machine with a health check; if the model API fails, briefs, sources, lenses and the record still work. |
| NFR-11 | Bilingual and multilingual | English and French offered first (Ontario's official languages context); 9 further languages from census data. Translations are labelled as machine-made. |
| NFR-12 | Portability | Runs anywhere Node 24 runs; one container; data in files plus one SQLite file. |
| NFR-13 | Security | Secrets only in environment variables; staff passcode compared in constant time; request bodies size-capped; per-IP rate limit and a cap on concurrent runs. |
| NFR-14 | Maintainability | No framework on the server; three dev dependencies at the root; tests with `node --test`. |
| NFR-15 | Transparency | Methods for each lens, the energy estimate and the reading grade are stated on screen with references. |

## 7. Potential harms and mitigations

| Harm | How it could happen | Mitigation in the product | Remaining risk |
|---|---|---|---|
| **Misinformation** | The model misstates a figure or quotes the wrong page | Quotes checked on the page in code; numbers in answers must appear in a cited statement; staff approve before publishing; every figure links to its page | A sentence can be accurate to its quote but miss context (e.g. a figure from last year's budget). Staff review is the control. |
| **Over-trust in AI** | Residents treat the brief as the official position | "Not the official notice" on every page with a link to it; review status shown; AI use disclosed; uncertainty and unknowns shown | People may still skim. Keep the disclosure short and visible. |
| **Digital divide** | Those without devices or data miss out | Light pages, works on phones, no account, `.ics` and printable briefs for community workers; agents never replace in-person and phone channels | The product does not reach people offline by itself; community partners do. |
| **Language** | Translations distort meaning or drop hedges | Translate from the staff-approved brief, keep citations to the original page, label machine translation | Errors in less-resourced languages. Partner review for the top languages is a next step. |
| **Manipulation** | Someone tries to make the agent advocate or insult, or floods the question box | Rule checks refuse advocacy; answers drop advice sentences; per-IP and daily caps; the model only sees the decision's own documents | Prompt-injection text inside a source PDF could steer a draft. Staff review and the citation check limit the effect. |
| **Liability** | A resident relies on a wrong statement | Not the official notice; staff approval; a public record of who approved what; a way to report an error | `TODO(verify)`: the "Report an error" link in the web app. Needs municipal legal review before real use. |
| **Staff workload** | Reviewing every statement takes longer than writing | Statements arrive pre-checked with quote and page side by side; approve in one click; review only what changed | Review time not yet measured (`TODO(verify)`). |
| **Bias in emphasis** | Agents choose which impacts to show and for whom | Fixed audience list including disability and newcomer; trade-offs must show both sides; staff can add or reject | Selection bias remains possible; community review of the audience list is a next step. |
| **Privacy** | Questions contain personal details | No accounts or identifiers; questions are public in the log, so the page asks people not to type personal details | `TODO(verify)`: the on-screen notice; automated redaction is a next step. |
| **Environmental cost** | Many model calls | Precomputed briefs and lenses; small model; spend and estimated energy published | Energy per token is an estimate, not a measurement. |

## 8. Traceability: requirement to code

Paths are the modules that implement each requirement. `TODO(verify)` marks paths in
`web/` and `lenses/` that were still being written.

| Requirement | Server and agents | Shared | Web | Tests |
|---|---|---|---|---|
| FR-1 | `server/routes/public.ts` (`GET /api/decisions`) | `shared/types.ts` (`DecisionCard`) | `web/src/screens/` home `TODO(verify)` | `server/routes.test.ts` |
| FR-2 | `server/routes/public.ts` | | `web/src/components/MapView.tsx`, `web/src/lib/places.ts` | |
| FR-3 | `agents/lead.ts` (`assembleBrief`), `server/data.ts` | `shared/types.ts` (`Brief`) | `web/src/screens/Decision.tsx`, `web/src/screens/tabs-brief.tsx` | `server/routes.test.ts` |
| FR-4 | `cities/waterloo-region.json` (`officialNoticeUrl`) | | `web/src/screens/common.tsx` `TODO(verify)` | |
| FR-5 | `server/routes/agents.ts` (`AUDIENCES`), `agents/tools.ts` | `AudienceId` | `web/src/screens/tabs-brief.tsx` | |
| FR-6 | `data/decisions/*.json` (hand-checked timeline) | `TimelineEvent`, `Participation` | `web/src/screens/tabs-brief.tsx` | |
| FR-7 | `server/ics.ts`, `server/routes/public.ts` | | `web/src/lib/ics.ts` | `server/ics.test.ts` |
| FR-8 | `agents/tools.ts` (`record_statement`, `record_figure`) | `Citation`, `Figure` | `web/src/components/Citations.tsx` | |
| FR-9 | `agents/tools.ts` (`ruleProblems`) | | | `TODO(verify)` |
| FR-10 | `agents/tools.ts` (`checkCitation`) | `shared/verify.ts` | | `shared/verify.test.ts` |
| FR-11 | `server/routes/public.ts` (`/api/sources/:id/pdf`) | | `web/src/components/SourceViewer.tsx` | |
| FR-12 | `agents/lead.ts` | `shared/readability.ts` | `web/src/screens/tabs-brief.tsx` | `shared/readability.test.ts` |
| FR-13 | `server/routes/agents.ts`, `server/http.ts` (`openSse`) | `AgentEvent` | `web/src/components/Chat.tsx`, `web/src/lib/sse.ts` | `server/routes.test.ts` |
| FR-14 | `agents/lead.ts` (`plan`, `askWith`), `agents/loop.ts` (`runStep`) | | `web/src/components/Steps.tsx` | `TODO(verify)` |
| FR-15 | `agents/lead.ts` (`groundAnswer`) | | | `TODO(verify)` |
| FR-16 | `server/routes/agents.ts` (translate), `agents/lead.ts` (`translateBriefWith`) | | `web/src/lib/i18n.ts` | |
| FR-17 | `server/routes/staff.ts` (`/api/staff/briefs`), `server/upload.ts` | | staff screen `TODO(verify)` | `server/routes.test.ts` |
| FR-18 | `agents/loop.ts` (`Budget`), `agents/lead.ts` (`RUN_MAX_CALLS`, `RUN_MAX_USD`), `server/limits.ts` (`checkDailyCap`) | | | `TODO(verify)` |
| FR-19 | `server/routes/staff.ts` (`/api/staff/review`) | `Statement.review` | staff screen `TODO(verify)` | `server/routes.test.ts` |
| FR-20 | `server/routes/staff.ts` (`/api/staff/publish`) | `Brief.review` | staff screen `TODO(verify)` | `server/routes.test.ts` |
| FR-21 | `server/routes/staff.ts` (`requireStaff`) | | | `server/routes.test.ts` |
| FR-22 | `server/log.ts`, `server/routes/*.ts`, `agents/loop.ts` (`budgetedCall`) | `LogEntry` | | `server/log.test.ts` |
| FR-23 | `server/log.ts` (`verifyChain`), `server/canonical.ts` | | `web/src/lib/hash.ts` | `server/log.test.ts` |
| FR-24 | `agents/tools.ts` (`transit_gaps`) | `TransitLens` | `web/src/screens/tabs-lenses.tsx` | `lenses/transit/` `TODO(verify)` |
| FR-25 | `agents/tools.ts` (`lifecycle_cost`) | `CostLens` | `web/src/components/CostChart.tsx`, `web/src/lib/cost.ts` | `TODO(verify)` |
| FR-26 | `agents/tools.ts` (`record_commitment`, `commitment_progress`) | `CommitmentsLens` | `web/src/screens/tabs-lenses.tsx` | |
| FR-27 | `lenses/housing/` (`fetch.ts`, `build.ts`, `lib.ts`), `agents/tools.ts` (`housing_stages`) | `HousingLens` | `web/src/screens/tabs-lenses.tsx` | `TODO(verify)` |
| FR-28 | `server/config.ts`, `server/data.ts`, `cities/*.json` | `CityConfig` | | |
| FR-29 | `server/usage.ts`, `server/routes/public.ts` (`/api/usage`) | `UsageSummary` | spend screen `TODO(verify)` | `TODO(verify)` |
