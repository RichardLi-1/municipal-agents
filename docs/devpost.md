# Devpost submission: Municipal Agents

**Title:** Municipal Agents

**Tagline:** AI agents read the city's own documents and explain a proposed decision in
five minutes: what's proposed, how it may affect you, and when you can have a say.
Every figure links to its page; staff approve every statement.

**Links**
- Live site: `TODO(verify)`
- Code: `TODO(verify)` (GitHub)
- Demo video: `TODO(verify)`
- Municipal Readiness Report (one page): `report/municipal-readiness-report.pdf`

---

## The problem

The Region of Waterloo's 2027 budget will set regional property taxes and water rates
for everyone in its three cities and four townships. The facts are
public, but they are spread over a 191-page budget book, asset management reports,
transit plans and engagement pages. The draft goes to Regional Council on 16 December
2026, and residents who want to speak must register by noon on 9 December. Most
people affected will never find those dates, let alone the page that explains what
the budget means for a renter who takes the bus.

City staff have the opposite problem: they must explain decisions accurately to
everyone, in many languages, with small teams. A general chatbot does not help. It
can state a wrong figure with confidence, and a city cannot publish what it has not
checked.

## Who it's for

- **Residents**, by situation: renters, homeowners, transit riders, drivers, people
  who walk or cycle, business owners, seniors, students, parents, people with a
  disability, and newcomers who read better in another language.
- **Clerks and communications staff**, who draft, check and publish the explanation.
- **Councillors' offices and community groups**, who share it.

## What it does

Municipal Agents turns a proposed decision into a brief a resident can read in five
minutes:

- **What's proposed and why now**, in plain words, with the reading grade measured
  and shown.
- **How it may affect you**: pick who you are, see cited impacts with "may" language
  and what is uncertain.
- **Have your say**: the timeline, the next chance to take part with a countdown, how
  to speak, write or answer a survey, and an "add to calendar" file.
- **Four lenses on the same decision**, one for each of the other challenges:
  transit gaps (Connection Scan over GRT's GTFS), lifecycle costs per household
  (with sliders for the assumptions), the public commitments it touches and their
  progress, and housing from approval to construction.
- **Ask anything**, in any language. A lead agent hands the question to specialists;
  you watch each one work; the answer comes back with numbered citations.
- **Every figure is a link** to the page it came from, shown with the quote highlighted.

What makes it trustworthy enough for a city to use:

- **Citations are checked in code, not by a model.** A statement is accepted only if
  its quote is found on that page. When it is not, the agent is told where the quote
  really is and tries again.
- **Staff publish.** Agent output is a draft until a named staff member approves,
  edits or rejects each statement.
- **The record can't be edited quietly.** Every brief, check, question, answer,
  approval and dollar spent is in a hash-chained public log that your browser verifies.
- **No personal data.** No accounts; questions are stored without identity.
- **Not the official notice**, and every page says where the official notice is.

## How we built it

- One **Node 24** process: `node:http`, `node:sqlite`, TypeScript run directly, no
  framework and no runtime dependencies on the server.
- **Agents as a small loop we can explain** (about 300 lines): the lead plans, six
  specialists (explainer, transit access, lifecycle cost, commitments, housing
  pipeline, translator) each follow a Markdown skill file and call tools to search
  pages, read pages and record statements. **Gemini 3.6 Flash** over the REST API with
  function calling. Each run is capped at 40 calls or US$0.50, the site at US$5 a day.
- **Search** is BM25 over page passages: fast, free, exact page numbers.
- **Lenses are computed ahead of time** from open data (GRT GTFS, OpenStreetMap,
  Kitchener, Waterloo and Cambridge permits, Statistics Canada, Ontario housing
  progress), so a resident's page view never waits on a model.
- **Web app**: Preact, MapLibre with OpenFreeMap tiles, pdf.js for the source viewer,
  Inter, light and dark, keyboard and screen-reader accessible.
- **Hosting**: one Fly.io machine in Toronto with a volume for the record.
- **Docs**: requirements, eight UML diagrams, architecture rationale, code tour and a
  one-page Municipal Readiness Report.

## Challenges we ran into

- **PDFs are not text.** Budget books are laid out in columns, so a sentence is split
  across lines interleaved with the next column. Our citation checker had to match
  quotes word by word across column segments, without becoming fuzzy.
- **Models paraphrase when asked to quote.** A bare "rejected" gives the agent nothing
  to fix, so the checker now says exactly why a quote failed ("that quote is on page
  14, not 12", or the closest line on the page) and the agent can fix it.
  `TODO(verify)`: rejected-versus-accepted counts from the record.
- **The decision itself isn't public yet.** The draft 2027 budget comes out in
  December, so the brief uses the 2026 budget book's forecast for 2027 and says so.
- **Official dates disagree.** Two official pages gave different dates for a budget
  review day; we checked every date by hand and noted the conflict.
- **Plain language is hard to hit.** The first brief measured grade 11.8 against our
  target of 8. We show the grade rather than hide it. `TODO(verify)`: grade after the
  rewrite pass.

## Accomplishments that we're proud of

- Every statement in the first real brief has a quote that was found on its page.
- A full brief with four lenses for the Region's 2027 budget cost about US$0.24 in
  model calls; a question costs about a cent.
- One challenge answered in full and the other four answered as lenses on the same
  decision, in one product.
- A city IT team could run it: one process, one container, one settings file per city.

## What we learned

- The useful part of AI here is drafting and finding; the trustworthy part is
  everything we check in code and everything staff approve.
- Explaining "when can I have a say" matters as much as explaining "what is proposed",
  and it is the part least likely to be in one document.
- Showing uncertainty ("may", unknowns, trade-offs on both sides) makes a brief more
  credible, not less.

## What's next

- **Pilot with a clerk's office** to measure staff review time and resident
  understanding.
- **Data residency**: run the model in a Canadian region or on the city's own
  hardware.
- **Report an error** that goes to the clerk's office and into the public record.
- **Community review of translations** for the region's most common languages.
- **Meeting video and agendas as they are published**, so briefs update as a decision
  moves through committee and council.
- **More cities**: a settings file, their documents and their GTFS.

## Built with

TypeScript, Node.js 24, node:sqlite (SQLite), node:http, Google Gemini API
(gemini-3.6-flash), Preact, Vite, MapLibre GL JS, OpenFreeMap, OpenStreetMap,
PDF.js, Poppler (pdftotext), Inter, GTFS (Grand River Transit), Fly.io, Docker,
Remotion, Mermaid, Claude Code.

## AI disclosure

Code, data pipelines and documents were drafted with Claude Code (Anthropic, model
Claude Opus 5.5) directed and reviewed by the team; the product's runtime agents use
Google's Gemini API (gemini-3.6-flash). Full credits: `CREDITS.md`.
