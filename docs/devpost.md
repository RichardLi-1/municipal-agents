# Devpost submission: Municipal Agents

**Title:** Municipal Agents

**Tagline:** AI agents read the city's own documents and explain a proposed decision in
five minutes: what's proposed, how it may affect you, and when you can have a say.
Every figure links to its page; staff review every statement.

**Short description (for the Devpost form):** Residents rarely find out what a
proposed municipal decision means for them, or when they can have a say, until it's too
late. Municipal Agents reads a city's own documents and turns a proposed decision into a
five-minute, plain-language brief: what's proposed, how it may affect you (by who you
are), and every date and way to take part, with a calendar file. Every figure links to the
highlighted page it came from, quotes are checked in code, and nothing is official until
a named staff member approves each statement. Five lenses cover the other challenges:
transit gaps, lifecycle costs, commitments, housing from approval to construction, and a
construction scout. It is for residents first, and for the clerks and planners who explain
decisions. Live on the Region of Waterloo's 2027 budget. Next: a pilot with one municipality.

**Links**
- Live site: https://municipal-agents.fly.dev (the app: https://municipal-agents.fly.dev/decisions;
  the 2027 budget brief: https://municipal-agents.fly.dev/d/row-2027-budget)
- Code: https://github.com/RichardLi-1/municipal-agents
- Video: (add the YouTube link when uploading)
- Docs: https://municipal-agents.fly.dev/docs
- Municipal Readiness Report (one page): `report/municipal-readiness-report.pdf` in the repo
- API: https://municipal-agents.fly.dev/api/openapi.json

---

## The problem

The Region of Waterloo's 2027 budget will set regional property taxes and water rates
for everyone in its three cities and four townships. The facts are public, but they are
spread over a 191-page budget book, asset management reports, transit plans and
engagement pages. Staff present the overview to Regional Council on 16 December 2026,
and residents who want to speak must register by noon on 9 December. And the rules just
changed: from 15 November 2026 the Regional Chair has strong-mayor budget powers, so the
Chair proposes the budget by 1 February and Council then has fixed windows to amend,
the Chair to veto and Council to override. Most people affected will never find those
dates, let alone what the budget means for a renter who takes the bus.

City staff have the opposite problem: they must explain decisions accurately to
everyone, in many languages, with small teams. A general chatbot does not help. It can
state a wrong figure with confidence, and a city cannot publish what it has not checked.

## Who it's for

- **Residents**, by situation: renters, homeowners, transit riders, drivers, people who
  walk or cycle, business owners, seniors, students, parents, people with a disability,
  and newcomers who read better in another language.
- **Clerks and communications staff**, who draft, check and publish the explanation.
- **Planners**, who get lenses and scenarios they can take to a public meeting.
- **Councillors' offices and community groups**, who share it.

## What it does

Municipal Agents turns a proposed decision into a brief a resident can read in five
minutes:

- **What's proposed and why now**, in plain words, with the reading grade measured and
  shown (6.7 to 7.4 for our three briefs; target 8).
- **How it may affect you**: pick who you are, see cited impacts with "may" language
  and what is uncertain.
- **Have your say**: the timeline, the next chance to take part with a countdown, how
  to speak, write or answer a survey, an "add to calendar" file and a calendar feed.
- **Five lenses on the same decision**, covering the other four challenges and more:
  transit gaps (Connection Scan over GRT's bus and ION timetables, 2021 census
  population, OpenStreetMap destinations), lifecycle cost per household (built in code
  from cited budget figures, with sliders for the assumptions), the public commitments
  it touches and whether they are on track, housing from approval to construction, and
  a **construction scout**: an illustrated what-if of ION Stage 2 in twin tunnels under
  Highway 401 and the Speed River, with candidate work sites scored from open data,
  cross-passages and boreholes laid out by NFPA 130 and FHWA rules, seven steps and what
  neighbours would notice.
- **Ask anything**, in any language. A lead agent hands the question to specialists;
  you watch each one work; the answer comes back with numbered citations.
- **Every figure is a link** to the page it came from, shown with the quote highlighted.
- **For cities**: an embeddable card for the city's own website, an OpenAPI, several
  municipalities on one deployment, and staff insights into what residents ask (only
  for groups of 3 or more similar questions, personal details removed).

What makes it trustworthy enough for a city to use:

- **Citations are checked in code, not by a model.** A statement is accepted only if
  its quote is found on that page. In our four brief runs the checker rejected 78
  attempts and accepted 116, telling the agent each time where the quote really was.
- **Staff publish.** Agent output is a draft until a named staff member has approved,
  edited or rejected every statement. Edits are re-checked; rejected statements never
  reach residents. The team's own fixes before then go in a public corrections file,
  re-checked on their pages and labelled as ours, not the Region's (27 so far).
- **Weak support is flagged.** Code checks each sentence shares words or numbers with
  its quotes, and labels a weak match.
- **The record can't be edited quietly.** Every brief, check, question, answer,
  approval and dollar spent is in a hash-chained public log your browser verifies, and
  staff can still purge content under a records-retention by-law without breaking it.
- **It keeps working when the AI doesn't.** Repeated questions are replayed from the
  record at no cost; when the model can't be reached, answers come from statements that
  were already checked.
- **No personal data.** No accounts; questions are stored without identity.
- **Not the official notice**, and every page links to the official notice.

## How we built it

- One **Node 24** process: `node:http`, `node:sqlite`, TypeScript run directly, no
  framework and no runtime dependencies on the server. It also serves the landing site,
  the docs site and the embed script.
- **Agents as a small loop we can explain** (about 300 lines): the lead plans; seven
  specialists (explainer, transit access, lifecycle cost, commitments, housing pipeline,
  construction scout, translator) each follow a Markdown skill file and call tools to
  search pages, read pages and record statements. **Gemini 3.6 Flash** over the REST API
  with function calling. Each run is capped at 40 calls or US$0.50, the site at US$5 a day.
- **A plain-language pass**: statements above grade 8 are rewritten; code keeps a
  rewrite only if it reads easier and keeps every number.
- **Search** is BM25 over page passages: fast, free, exact page numbers.
- **Lenses are computed ahead of time** in code from open data and cited figures, so a
  resident's page view never waits on a model.
- **Evals** scored in code on 18 question cases (citations found again on their pages,
  no voting advice, reading grade).
- **Web app**: Preact, MapLibre with OpenFreeMap tiles, pdf.js for the source viewer,
  Inter, light and dark, keyboard and screen-reader support.
- **Hosting**: one Fly.io machine in Toronto with a volume for the record.
- **205 tests** with Node's built-in test runner.
- **Docs**: requirements, eleven UML diagrams, architecture rationale, code tour, planner
  workflows for eight municipal scenarios, and a one-page Municipal Readiness Report.

## Challenges we ran into

- **PDFs are not text.** Budget books are laid out in columns, so a sentence is split
  across lines interleaved with the next column. Our citation checker matches quotes
  word by word across column segments, without becoming fuzzy.
- **Models paraphrase when asked to quote.** A bare "rejected" gives the agent nothing
  to fix, so the checker says exactly why a quote failed ("that quote is on page 14, not
  12", or the closest line on the page) and the agent can fix it.
- **The decision itself isn't public yet.** The draft 2027 budget comes out in December,
  so the brief uses the 2026 budget book's forecast for 2027 and says so.
- **Official dates disagree, and the rules changed mid-hackathon.** Two official pages
  gave different dates for a budget review day, and strong-mayor powers for the Regional
  Chair took effect on 15 November. We checked every date by hand and cited the regulation.
- **Plain language is hard to hit.** Briefs now read at grade 6.7 to 7.4, but half the
  eval answers were still above grade 9. We show the grade rather than hide it.
- **Found on the page isn't the same as supporting the sentence.** Our reviewers caught
  statements whose quote was on the page but didn't back the claim. Code now flags weak
  support (too few shared words, or only a shared date), and we fixed each one with a
  committed corrections file: every new quote re-checked, every correction labelled
  "Municipal Agents team (not Region staff)" and logged on the public record. The briefs
  stay drafts until real staff review them.
- **We ran out of model credit at 2:20 am.** Instead of going dark, the site now replays
  real answers and answers from the checked brief. It became a feature.

## Accomplishments that we're proud of

- Every statement in our briefs has a quote that was found on its page; the evals found
  no citation failures and no voting advice, even for "Should I support this budget?".
- A full brief with five lenses costs US$0.24 to US$0.37 in model calls; a question about
  US$0.05–0.07; a translation about US$0.009 per language; a repeated question nothing.
  A year for one city (50 briefs, 5,000 questions, hosting) comes to about US$360–500.
- All five challenges answered in one product, on the same decision.
- 0 axe-core accessibility violations on the main pages and every decision tab, on
  desktop and phone, light and dark.
- A city IT team could run it: one process, one container, one settings file per city,
  and a card they can drop on their own website.

## What we learned

- The useful part of AI here is drafting and finding; the trustworthy part is
  everything we check in code and everything staff review.
- Explaining "when can I have a say" matters as much as explaining "what is proposed",
  and it is the part least likely to be in one document.
- Showing uncertainty ("may", unknowns, trade-offs on both sides) makes a brief more
  credible, not less.
- Plan for the AI being unavailable. A cached, checked answer beats an error page.

## What's next

- **Pilot with a clerk's office** to measure staff review time and resident understanding.
- **Data residency**: run the model in a Canadian region or on the city's own hardware.
- **Billing alerts** and monitoring of offline answers.
- **Community review of translations** for the region's most common languages.
- **Testing with residents** who use assistive technology (automated checks already pass).
- **Meeting video and agendas as they are published**, so briefs update as a decision
  moves through committee and council.
- **More cities**: a settings file, their documents and their GTFS.

## Built with

TypeScript, Node.js 24, node:sqlite (SQLite), node:http, Google Gemini API
(gemini-3.6-flash, gemini-3.1-flash-image), Preact, Vite, MapLibre GL JS, OpenFreeMap,
OpenStreetMap, PDF.js, Poppler (pdftotext), marked, highlight.js, Inter, GTFS (Grand
River Transit), Statistics Canada, NRCan CDEM, Fly.io, Docker, Remotion, Mermaid,
Claude Code.

## AI disclosure

Code, data pipelines and documents were drafted with Claude Code (Anthropic, model
Claude Opus 5.5) directed and reviewed by the team; the product's runtime agents use
Google's Gemini API (gemini-3.6-flash). Full credits: `CREDITS.md`.
