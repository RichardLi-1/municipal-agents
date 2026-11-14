# Municipal Agents: software requirements

Status: working prototype built for CIVIC Hack 2026 (12 to 14 November 2026), live at
https://municipal-agents.fly.dev; not yet used by a city. This document says who the
product is for, what it must do, how well it must do it, and what could go wrong.

The product: AI agents read a city's own documents and turn a proposed decision into a
brief a resident can read in five minutes: what is proposed, how it may affect them,
and when they can have a say. Every figure links to the page it came from, and a named
staff member reviews every statement before it is published.

Pilot setting: Waterloo Region, Ontario (`cities/waterloo-region.json`: the Region,
three cities and four townships). The main decision is the Region of Waterloo 2027 Plan
and Budget (`data/decisions/row-2027-budget.json`). Staff present the overview to
Regional Council on 16 December 2026 (register to speak by noon on 9 December), with
detailed review days on 19 and 27 January 2027 and an online survey open to 26 February
2027. From 15 November 2026 the Regional Chair has strong-mayor budget powers (O. Reg.
530/22 and Part VI.1 of the Municipal Act, 2001): the Chair must propose the budget by
1 February 2027, then Council has 30 days to amend it, the Chair 10 days to veto, and
Council 15 days to override by a two-thirds vote. The draft is not public yet, so the
2027 figures come from the forecast in the 2026 budget book, and the brief says so.

Two more decisions show the range: the Region's Water Supply Strategy Update
(`row-water-supply-2051.json`; online meeting 17 November, drop-in 24 November 2026)
and Kitchener's Committee of Adjustment hearing on six zoning variances for the
Kitchener Central Transit Hub (`kitchener-transit-hub-variances.json`; 17 November 2026,
10 am; appeals to the Ontario Land Tribunal by 7 December 2026 under s. 45 of the
Planning Act). The agents read 25 public documents (399 pages) from the Region, Grand
River Transit, the City of Kitchener and the Province of Ontario.

Related documents: [design and UML](design.md), [architecture](architecture.md),
[code tour](code-tour.md), [references](references.md), [planner workflows](planner-workflows.md),
[spec](spec.md).

---

## 1. The problem

Municipal decisions are explained in documents written for council: a budget book of
191 pages, staff reports, agendas, consultation notices, regulations. The facts a
resident needs are in there, but they are spread across many files, written in
technical language, and the chance to take part (a survey, a delegation, a hearing, an
appeal window) is easy to miss. The residents most affected are often the least likely
to have time to read them: renters, shift workers, newcomers, people with a disability,
seniors. Rules also change: the 2027 budget is the first the Region's Chair proposes
under strong-mayor powers, which moves the dates residents need to know.

Staff, in turn, must explain decisions accurately and run consultation with small teams.
A general chatbot is not an answer: it can state a wrong figure with confidence, and a
city cannot publish something it has not checked.

So the requirement is not "summarise a PDF". It is: explain a decision in plain words,
show where each fact came from, let staff check it before anyone relies on it, keep
working when the AI provider doesn't, and make the record of what was said impossible
to change quietly.

## 2. Stakeholders and their needs

| Stakeholder | Who, concretely | What they need | What they must not get |
|---|---|---|---|
| **Residents (primary)** | Renters, homeowners, transit riders, drivers, people who walk or cycle, business owners, seniors, students, parents | What is proposed, what it may mean for *them*, the next date they can take part and how, in under five minutes | Opinions on how to vote; figures with no source; a page that looks like the official notice |
| Residents with a disability | Screen-reader users, keyboard-only users, people with low vision or cognitive disabilities | Full keyboard and screen-reader use, good contrast, plain words, no time limits, text alternatives for the map and charts | Content that only works with a mouse or only as a map |
| Newcomers and people who read better in another language | Waterloo Region's most common home languages after English and French include Punjabi, Arabic, Mandarin, Spanish (see `cities/waterloo-region.json`, `sourcesNote`) | The brief and answers in their language, with the same citations; a clear note that translations are machine-made | A translation that drops the uncertainty or the "not official" notice |
| Equity-deserving groups and people with low digital access | Low-income households, people on mobile data, people without a computer, Indigenous residents, racialised communities | Works on an older phone and a slow connection; no account; something community workers can carry offline | A process that assumes everyone will come online |
| **Clerks and communications staff** | Clerk's office, communications and engagement teams | A first draft they can trust *and check quickly*: each sentence shown with its quote and page; approve, edit or reject with a note; publish under their name; a record of who approved what; what residents are asking | More work than writing it themselves; anything published without their review |
| Planners and subject-matter staff | Finance, transit, housing, climate, capital projects | Lens results they can recognise (method stated, inputs cited, assumptions shown); scenarios to discuss with residents (the construction scout) | Numbers whose method they cannot see; a tool that picks a site for them |
| Councillors and their offices | Councillors, constituency assistants | A neutral, sourced explainer to send to constituents; the dates residents can speak | Advocacy for or against a position |
| Community groups | Neighbourhood associations, tenant groups, transit and cycling advocates, settlement agencies | A brief to share with members, the participation steps and deadlines, a calendar feed | A tool that speaks for them |
| City IT, web and records staff | IT, web, privacy and records staff | Few moving parts, no personal data, a known monthly cost, a widget for the city's own site, records that can be disposed of under the retention by-law, a model that can move to a Canadian region | A new platform to maintain, vendor lock-in, resident data in a US service |
| Province and auditors (indirect) | Information and Privacy Commissioner of Ontario, internal audit | Evidence of human oversight of AI, disclosure of AI use, a verifiable record | Undisclosed automated content |

## 3. Scope

**In scope (this prototype)**

- Briefs for proposed decisions, drafted by agents from the city's own public
  documents, reviewed and published by staff.
- Plain-language summary, audience impacts, a "have your say" timeline with calendar
  files and a feed, unknowns and trade-offs, glossary, sources.
- Five lenses on the same decision: transit access, lifecycle cost, commitments,
  housing pipeline, and a construction scout (an illustrative what-if).
- A question box that answers with verified citations and shows each agent's steps;
  replays of recorded answers; offline answers from checked material when the model
  can't be reached.
- Machine translation of a brief on request, labelled.
- A staff screen to start or replay a brief, review each statement and publish; staff
  insights on what residents ask; records-retention purge.
- A public, hash-chained record and a public spend page.
- Several cities on one deployment, an embeddable card for city websites, an OpenAPI
  description, a landing site and a docs site.

**Out of scope (deliberately)**

- Collecting formal consultation input (surveys, delegation registration). We link to
  the city's official channels instead of replacing them.
- Resident accounts, profiles, newsletters or tracking.
- Saying what residents should think or how a councillor should vote.
- Legal notice: the product never replaces the official notice.
- Choosing sites or designing infrastructure: the construction scout ranks candidates
  by stated rules for engineers and staff to evaluate.
- Scanned documents without a text layer (OCR), audio and video of meetings (next steps).
- Production identity management for staff (the prototype uses one shared passcode).

## 4. User stories and acceptance criteria

Each story lists the functional requirements (FR) it relies on.

**US-1. Find what is being decided near me.** As a resident, I want to see the
decisions open now on a map and a list.
- Each decision shows a plain title, who decides, and the next chance to take part with
  a countdown in days.
- I can find a decision by typing a neighbourhood or street, without a map.
- Works with a keyboard and a screen reader. (FR-1, FR-2, NFR-1)

**US-2. Understand the decision in five minutes.**
- The overview has 3 to 6 statements, each with at least one citation link.
- The reading grade is shown and is 8 or lower for the summary and impacts, or the page
  says it is higher. (Measured: budget 7.3, water supply 6.0, transit hub 6.7.)
- Review status is visible: "Approved by <name> on <date>", "In review by city staff" or
  "Draft: not yet reviewed by city staff". (FR-3, FR-4, FR-8, FR-12)

**US-3. See how it may affect me.** As a renter who takes the bus, I want impacts for
my situation.
- I can pick more than one audience; impacts appear for each.
- Impacts use "may", "might" or "could" and say what is uncertain. (FR-5, FR-9)

**US-4. Know when and how I can have a say.**
- A timeline shows report, committee, public input, council, deadlines and
  implementation, with the next opportunity highlighted, including rule changes that
  move the dates (the Chair's budget powers; the Committee of Adjustment appeal window).
- Each way to take part shows the deadline, contact and link, and I can add it to my
  calendar or subscribe to a feed. (FR-6, FR-7, FR-34, FR-40)

**US-5. Check a figure.** As a sceptical resident or journalist, I want to see where a
number came from.
- Every figure and statement links to a source page. Opening it shows the PDF page with
  the quote highlighted and a link to the original document.
- Statements whose quotes could not be found are not shown as verified. (FR-8, FR-10, FR-11)

**US-6. Ask my own question.** As a resident, I want to ask in my own words and language.
- I get an answer with numbered citations, or a plain "the documents don't say" with
  who can answer.
- A steps panel shows which specialists worked on it.
- Sentences with figures that no verified statement supports are removed before I see
  them. (FR-13, FR-14, FR-15)

**US-7. Read it in my language.** As a newcomer, I want the brief in Punjabi.
- The brief is translated on request, cached, and labelled "Machine translation by AI.
  The English brief is the reference." (FR-16)

**US-8. Draft a brief.** As a communications officer, I want agents to draft a brief
from the documents I choose.
- I start a run from the staff screen (or replay the last real run at no cost) and
  watch the agents' steps.
- When it ends I have a draft with every statement's citations already checked, and the
  cost of the run. (FR-17, FR-18, FR-10, FR-21, FR-42)

**US-9. Review and publish.** As a clerk, I want to approve, edit or reject each
statement with a note, then publish under my name.
- Each action records my name, the time and, for edits, the original text; an edit is
  re-checked against its pages.
- Publishing needs my name and is refused until every statement is reviewed; rejected
  statements are left out of the public brief. (FR-19, FR-20, FR-22)

**US-10. Trust the record.** As an auditor or resident, I want to know nothing was
changed after the fact.
- The record page checks the hash chain in my browser ("Chain intact: N entries").
- A purge under the retention by-law is itself an entry, and the chain still verifies.
  (FR-22, FR-23, FR-38)

**US-11. See the transit gap.** As a rider in a poorly served area, I want to see which
essential places I cannot reach in 45 minutes, and what fixes would help most. (FR-24)

**US-12. See the full cost.** As a homeowner, I want the upfront price compared with
what an asset costs to run and renew over its life, per household, and to change the
assumptions. (FR-25)

**US-13. Check a commitment.** As a member of a climate group, I want to see whether the
Region is on track for a target this decision touches. (FR-26)

**US-14. Follow housing from approval to construction.** (FR-27)

**US-15. Adapt it to my city.** As a city IT lead elsewhere, I want to point it at our
documents and data without changing code, and run it alongside other cities. (FR-28, FR-33)

**US-16. Picture how it would be built.** As a planner preparing a public meeting, I want
a scenario showing where work sites and boreholes could go, the steps of the work and
what neighbours would notice, with every rule stated, so residents can discuss it. (FR-32)

**US-17. Still get an answer when the AI is down.** As a resident, I want a useful,
checked answer even when the model provider is unavailable. (FR-30, FR-31)

**US-18. Put it on our website.** As a city web team, I want a card about a decision on
our own page with one script tag. (FR-35)

**US-19. Know what residents are asking.** As a communications lead, I want the common
questions and the unanswered ones, without seeing anyone's private details. (FR-37)

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | The decisions page lists open decisions with plain title, decision-maker, status, next participation event and a countdown. |
| FR-2 | A map shows each decision's area; a text search finds a decision by place name. |
| FR-3 | Each decision has a brief: summary (3 to 6 statements), why now, audience impacts, have-your-say, figures, unknowns, trade-offs, glossary, sources, lenses. |
| FR-4 | Every brief page links to the official notice and says it is not the official notice. |
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
| FR-16 | `POST /api/decisions/:id/translate` returns the brief in a requested language, cached until the source brief changes, labelled as machine translation. |
| FR-17 | Staff can start a brief for a decision or from an uploaded PDF, or replay the last real run, and watch progress. |
| FR-18 | Each run stops at 40 model calls or US$0.50; new runs stop at US$5 per day (Toronto time). |
| FR-19 | Staff can approve, edit (keeping the original text, re-checking citations, shown as "Edited by staff") or reject each statement with a note; each action records the reviewer's name and time. |
| FR-20 | Publishing requires the reviewer's name and every statement reviewed (409 otherwise); the public brief leaves out rejected statements. |
| FR-21 | Staff routes require a bearer passcode, compared in constant time. |
| FR-22 | Every brief start, generation, recorded and rejected statement, review, publication, question, answer, translation, purge and model call is appended to the log. |
| FR-23 | The log is append-only and hash-chained (SHA-256 over each entry's header and payload hash); the chain can be verified on the server and in the browser. |
| FR-24 | Transit lens: share of people reaching each essential destination type within 45 minutes at set times, service gaps, first/last-mile gaps, ranked fixes with trade-offs, method and limits stated. |
| FR-25 | Cost lens: capital, operating, maintenance, renewal and environmental cost over a stated horizon, per household, with adjustable assumptions and a stated discount rate; built in code from cited figures. |
| FR-26 | Commitments lens: each public commitment the decision touches, who made it, target, latest cited progress, status computed against a straight line to the target, and what is unclear. |
| FR-27 | Housing lens: units by stage from approval to completion, median time between stages where data allow, and stages with no public data. |
| FR-28 | A city is configured by one file (`cities/<id>.json`) plus its documents and open data; no code changes. |
| FR-29 | The spend page shows calls, tokens, US dollars and estimated energy and CO2e, computed from the log. |
| FR-30 | A question that a recorded run already answered with citations (same decision, language and audiences, same numbers, at least 85% of the same words) is replayed from the record at no model cost, labelled with its original date. |
| FR-31 | When the model can't be reached, the question is answered offline from verified statements, the hand-checked timeline and computed lens results, labelled as such, with the Clerk's contact as a last resort. |
| FR-32 | Construction scout lens: for a line in a decision, candidate work sites scored by stated weights from open data, a twin-bore layout with cross-passages (NFPA 130) and boreholes (FHWA-NHI-10-034), seven illustrated steps with work hours from local noise rules, the approvals a change would need, and limits; always labelled a scenario. |
| FR-33 | `GET /api/cities` lists every configured municipality; each decision names its city. |
| FR-34 | `GET /api/calendar.ics?decisions=…` returns one subscription feed for several decisions. |
| FR-35 | A city can embed a card about a decision on its own site with one `<script>` tag (`/embed.js`, data from `/api/embed/:id`). |
| FR-36 | `GET /api/openapi.json` describes every route; a test fails if a route is missing. |
| FR-37 | Staff insights show what residents ask, aggregated: counts by day, language, audience and topic, unanswered and offline answers; question wording only for groups of at least 3 similar questions, with personal details removed. |
| FR-38 | Staff can purge one log entry's content under the records-retention by-law, with a reason; a `record.purged` entry is appended and the chain still verifies. |
| FR-39 | Each statement has a "Report an error" link that goes to the deployment operator (`feedbackUrl` in the city file; in the demo, the team's GitHub issues), naming the decision and statement. A city points it at its own channel. |
| FR-40 | Decision data records rule changes that move participation dates, each cited to the law (O. Reg. 530/22 for the Chair's budget powers; Planning Act s. 45 and O. Reg. 200/96 for minor variances and appeals). |
| FR-41 | A landing site at `/` and a docs site at `/docs` are served by the same process. |
| FR-42 | After drafting, statements above grade 8 are rewritten by the model; code keeps a rewrite only if it reads easier, keeps every number and keeps hedges and both sides. |
| FR-43 | Each statement carries a support strength measured in code from the words and numbers it shares with its quotes; `weak` statements are flagged for the reviewer. |

## 6. Non-functional requirements

| ID | Quality | Target and how it is checked |
|---|---|---|
| NFR-1 | Accessibility | WCAG 2.2 Level AA as the design target: skip link, visible focus (`:focus-visible`), labelled controls and screen-reader text, reduced motion respected, information not by colour alone. Not yet audited with automated tools or by assistive-technology users; that audit is required before real use. |
| NFR-2 | Plain language | Summary and impacts at Flesch-Kincaid grade 8 or lower, measured in code (`shared/readability.ts`) and shown. Briefs: 6.0 to 7.3. Answers are checked against grade 9 in the evals; 6 of 12 were above it in the latest run. |
| NFR-3 | Citation integrity | 100% of statements shown as verified have every quote found on its page (checked at record time, on staff edit, and at cost-lens build). No ellipses; quotes under 8 characters refused. Evals: 0 citation failures. |
| NFR-4 | Neutrality | Rule checks refuse advocacy wording; answers drop advice sentences; trade-offs must show both sides. Evals: 0 voting-advice failures, including "Should I support this budget?". |
| NFR-5 | Privacy | No resident accounts, no tracking; browser storage only for preferences. Questions logged without any identifier; IP addresses held in memory only for rate limiting (`server/limits.ts`). Staff insights apply k = 3. |
| NFR-6 | Human oversight | Agent output is a draft until a named staff member has reviewed every statement and published; the review state is shown on every brief. |
| NFR-7 | Auditability | Every action in FR-22 is logged; tampering with any past entry breaks every later hash; purges are visible. |
| NFR-8 | Cost control | Per run: 40 calls, US$0.50. Per day: US$5 (`DAILY_LIMIT_USD`). Unknown models are priced at the dearest known price. Measured: a brief US$0.24 to 0.37; a question about US$0.05–0.07 (eval averages); a translation about US$0.009 per language; a replay US$0. |
| NFR-9 | Performance | Brief and decision pages load from stored JSON (no model call). Measured question time in the evals: median 30 s; replays and offline answers return in about a second. Hard timeout 240 s. Not load-tested. |
| NFR-10 | Availability and resilience | One always-on machine with a health check. If the model API fails or credit runs out, briefs, sources, lenses and the record still work, repeated questions are replayed and new ones are answered offline from checked material. Exercised for real on 14 November 2026. |
| NFR-11 | Multilingual | English and French offered first, then 9 more languages from census data. Translations labelled machine-made; not staff-reviewed. |
| NFR-12 | Portability | Runs anywhere Node 24 runs; one container; data in files plus one SQLite file. |
| NFR-13 | Security | Secrets only in environment variables; staff passcode compared in constant time; request bodies size-capped; per-IP rate limit and a cap on concurrent runs; CSP with per-page script hashes, HSTS, `nosniff`. |
| NFR-14 | Maintainability | No framework on the server; no runtime dependencies at the root; 189 tests with `node --test`; OpenAPI coverage test. |
| NFR-15 | Transparency | Methods for each lens, the energy estimate and the reading grade are stated with references; construction scores show their weights. |

## 7. Potential harms and mitigations

| Harm | How it could happen | Mitigation in the product | Remaining risk |
|---|---|---|---|
| **Misinformation** | The model misstates a figure or quotes the wrong page | Quotes checked on the page in code (78 rejected attempts in four brief runs); numbers in answers must appear in a cited statement; staff review every statement; every figure links to its page | A sentence can be accurate to its quote but miss context. Staff review is the control. |
| **Over-trust in AI** | Residents treat the brief as the official position | "Not the official notice" with a link; review status shown; translations and replays labelled; uncertainty and unknowns shown | People may still skim. A plain "drafted by AI agents" label beside the review status would help. |
| **Over-trust in a scenario** | A construction what-if is read as the Region's plan | Labelled "Illustrative scenario: not a Region plan"; weights and assumptions shown; the scout ranks, never picks; required approvals (O. Reg. 231/08) stated | Renders look real. They are labelled as illustrations. |
| **Digital divide** | Those without devices or data miss out | Light pages, works on phones, no account, calendar files; agents never replace in-person and phone channels | The product does not reach people offline by itself; community partners do. |
| **Language** | Translations distort meaning or drop hedges | Translate from the brief, keep citations to the original page, label machine translation, English is the reference | Errors in less-resourced languages. Community review for the top languages is a next step. |
| **Manipulation** | Someone tries to make the agent advocate, or floods the question box | Rule checks refuse advocacy; answers drop advice sentences; per-IP and daily caps; the model only sees the decision's own documents | Prompt-injection text inside a source PDF could steer a draft. Staff review and the citation check limit the effect. |
| **Liability** | A resident relies on a wrong statement | Not the official notice; staff review; public record of who approved what; "Report an error" on every statement goes to the operator | Needs municipal legal review before real use. |
| **Staff workload** | Reviewing every statement takes longer than writing | Statements arrive pre-checked with quote and page side by side; replay a run instead of re-running; insights show what residents actually ask | Review time not yet measured with real staff; our estimate is 30 to 60 minutes a brief. |
| **Bias in emphasis** | Agents choose which impacts to show and for whom | Fixed audience list including disability and newcomer; trade-offs must show both sides; staff can reject | Selection bias remains possible; community review of the audience list is a next step. |
| **Privacy** | Questions contain personal details | No accounts or identifiers; IPs never stored; the chat box asks people not to include personal details; insights remove personal details and suppress groups under 3; retention purge | The raw public log is not redacted automatically. |
| **Provider dependency** | The AI provider is down or credit runs out | Replays, offline answers from checked material, briefs unaffected | No fresh research for new questions until billing is restored; production needs billing alerts. |
| **Environmental cost** | Many model calls | Precomputed briefs and lenses; small model; replays at no cost; spend and estimated energy published | Energy per token is an estimate, not a measurement. |

## 8. Traceability: requirement to code

| Requirement | Server and agents | Shared and lenses | Web | Tests |
|---|---|---|---|---|
| FR-1 | `server/routes/public.ts` (`GET /api/decisions`) | `DecisionCard` | `web/src/screens/Home.tsx` | `server/routes.test.ts` |
| FR-2 | `server/routes/public.ts` | | `web/src/components/MapView.tsx`, `web/src/lib/places.ts` | |
| FR-3 | `agents/lead.ts` (`assembleBrief`), `agents/tidy.ts`, `server/data.ts` | `Brief` | `web/src/screens/Decision.tsx`, `web/src/screens/tabs-brief.tsx` | `server/routes.test.ts`, `agents/lead.test.ts`, `agents/tidy.test.ts` |
| FR-4 | `cities/waterloo-region.json` (`officialNoticeUrl`) | | `web/src/screens/Decision.tsx` | |
| FR-5 | `server/routes/agents.ts` (`AUDIENCES`), `agents/tools.ts` | `AudienceId` | `web/src/screens/tabs-brief.tsx` | `agents/tools.test.ts` |
| FR-6 | `data/decisions/*.json` (hand-checked timeline) | `TimelineEvent`, `Participation` | `web/src/screens/tabs-brief.tsx` | `server/time.test.ts` |
| FR-7 | `server/ics.ts`, `server/routes/public.ts` | | `web/src/lib/ics.ts` | `server/ics.test.ts` |
| FR-8 | `agents/tools.ts` (`record_statement`, `record_figure`, `record_computed_figure`) | `Citation`, `Figure` | `web/src/components/Citations.tsx` | `agents/tools.test.ts` |
| FR-9 | `agents/tools.ts` (`ruleProblems`) | | | `agents/tools.test.ts` |
| FR-10 | `agents/tools.ts` (`checkCitation`) | `shared/verify.ts` | | `shared/verify.test.ts`, `agents/tools.test.ts` |
| FR-11 | `server/routes/public.ts` (`/api/sources/:id/pdf`) | | `web/src/components/SourceViewer.tsx` | |
| FR-12 | `agents/lead.ts` | `shared/readability.ts` | `web/src/screens/Decision.tsx` | `shared/readability.test.ts` |
| FR-13 | `server/routes/agents.ts`, `server/http.ts` (`openSse`) | `AgentEvent` | `web/src/components/Chat.tsx`, `web/src/lib/sse.ts` | `server/routes.test.ts` |
| FR-14 | `agents/lead.ts` (`plan`, `askWith`), `agents/loop.ts` (`runStep`) | | `web/src/components/Steps.tsx` | `agents/lead.test.ts`, `agents/loop.test.ts` |
| FR-15 | `agents/lead.ts` (`groundAnswer`) | | | `agents/lead.test.ts` |
| FR-16 | `server/routes/agents.ts` (translate), `agents/lead.ts` (`translateBriefWith`) | | `web/src/screens/Decision.tsx`, `web/src/lib/i18n.ts` | `server/routes.test.ts` |
| FR-17 | `server/routes/staff.ts` (`/api/staff/briefs`), `server/upload.ts`, `server/runfiles.ts` | | `web/src/screens/Staff.tsx` | `server/routes.test.ts`, `server/runfiles.test.ts` |
| FR-18 | `agents/loop.ts` (`Budget`), `agents/lead.ts`, `server/limits.ts` | | | `agents/loop.test.ts`, `server/routes.test.ts` |
| FR-19 | `server/routes/staff.ts` (`/api/staff/review`), `server/statements.ts` (`recheck`) | `Statement.review` | `web/src/screens/Staff.tsx`, `web/src/components/Citations.tsx` | `server/statements.test.ts` |
| FR-20 | `server/routes/staff.ts` (`/api/staff/publish`), `server/statements.ts` (`unreviewed`, `publicBrief`) | `Brief.review` | `web/src/screens/Staff.tsx` | `server/statements.test.ts`, `server/routes.test.ts` |
| FR-21 | `server/routes/staff.ts` (`requireStaff`) | | | `server/routes.test.ts` |
| FR-22 | `server/log.ts`, `server/routes/*.ts`, `agents/loop.ts` (`budgetedCall`) | `LogEntry` | `web/src/screens/Log.tsx` | `server/log.test.ts` |
| FR-23 | `server/log.ts` (`verifyChain`), `server/canonical.ts` | | `web/src/lib/hash.ts` | `server/log.test.ts`, `server/canonical.test.ts` |
| FR-24 | `agents/tools.ts` (`transit_gaps`) | `lenses/transit/` (`csa.ts`, `lens.ts`) | `web/src/screens/tabs-lenses.tsx` | `lenses/transit/transit.test.ts` |
| FR-25 | `agents/tools.ts` (`lifecycle_cost`) | `lenses/cost/build.ts` | `web/src/components/CostChart.tsx`, `web/src/lib/cost.ts` | `lenses/cost/build.test.ts`, `lenses/cost/cost.test.ts` |
| FR-26 | `agents/tools.ts` (`record_commitment`, `commitment_progress`) | `lenses/commitments/status.ts` | `web/src/screens/tabs-lenses.tsx` | `lenses/commitments/commitments.test.ts` |
| FR-27 | `agents/tools.ts` (`housing_stages`) | `lenses/housing/` | `web/src/screens/tabs-lenses.tsx` | `lenses/housing/housing.test.ts` |
| FR-28 | `server/config.ts`, `server/data.ts`, `cities/*.json` | `CityConfig` | | `server/data.test.ts` |
| FR-29 | `server/usage.ts`, `server/routes/public.ts` (`/api/usage`) | `UsageSummary` | `web/src/screens/Spend.tsx` | `server/usage.test.ts` |
| FR-30 | `server/runfiles.ts`, `server/routes/agents.ts` | | `web/src/components/Chat.tsx` (replay label) | `server/runfiles.test.ts` |
| FR-31 | `agents/offline.ts`, `server/routes/agents.ts` | | `web/src/components/Chat.tsx` | `agents/offline.test.ts`, `agents/errors.test.ts` |
| FR-32 | `agents/skills/construction-scout/SKILL.md`, `agents/tools.ts` (`construction_sites`), `server/routes/public.ts` (`/api/renders/:file`) | `lenses/construction/` (`build.ts`, `scout.ts`, `layout.ts`, `steps.ts`, `render.ts`) | `web/src/screens/tabs-lenses.tsx` | `lenses/construction/construction.test.ts` |
| FR-33 | `server/routes/cities.ts` | `CityConfig` | | `server/platform.test.ts` |
| FR-34 | `server/routes/platform.ts`, `server/ics.ts` | | | `server/platform.test.ts` |
| FR-35 | `server/routes/platform.ts` (`/api/embed/:id`), `server/site.ts` | | `embed/embed.js`, `embed/demo.html` | `server/platform.test.ts` |
| FR-36 | `server/openapi.ts`, `server/openapi-schemas.json` | `shared/types.ts` | | `server/openapi.test.ts` |
| FR-37 | `server/routes/insights.ts` | | API only (no screen yet) | `server/platform.test.ts` |
| FR-38 | `server/routes/records.ts`, `server/log.ts` (`purge`) | | `web/src/screens/Log.tsx` | `server/log.test.ts` |
| FR-39 | `cities/waterloo-region.json` (`feedbackUrl`) | | `web/src/components/Citations.tsx`, `web/src/screens/Decision.tsx` | |
| FR-40 | `data/decisions/row-2027-budget.json`, `data/decisions/kitchener-transit-hub-variances.json` | `data/sources/` (`oreg-530-22`, `municipal-act-part-vi1`, `planning-act-s45`, `oreg-200-96`) | `web/src/screens/tabs-brief.tsx` | |
| FR-41 | `server/site.ts` | | `landing/`, `docs-site/` | `server/platform.test.ts` |
| FR-42 | `agents/plain.ts` | `shared/readability.ts` | | `agents/plain.test.ts` |
| FR-43 | computed where statements are recorded | `shared/types.ts` (`Statement.support`) | `web/src/components/Citations.tsx` ("Check: the quote may not fully support this") | |

Test file names are those in the repository on 14 November 2026; a test listed for a
requirement exercises that module, not necessarily every clause of the requirement.
