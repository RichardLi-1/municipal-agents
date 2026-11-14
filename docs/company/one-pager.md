# Municipal Agents: one-pager

Status on 14 November 2026: a working prototype built at CIVIC Hack 2026. We have no
customers, no letters of intent and no revenue yet. Web sources below were read on
14 November 2026 unless a different date is given. Figures marked **estimate** are our
own arithmetic, and the assumptions are written next to them.

## What we do (one line)

AI agents that read a city's own documents and turn a proposed decision into a short
brief with a citation for every fact: what's proposed, how it may affect you, and when
you can have a say. City staff approve every statement before it goes out.

## The problem

- Decisions are explained in documents written for council. To cover three Waterloo
  Region decisions, the prototype's agents read 27 public documents (412 pages) ([readiness report](../../report/readiness-report.html);
  [requirements](../requirements.md)). The Region's budget book alone is 191 pages.
- Residents find out late, can't tell how a decision touches them, and miss the window
  to take part. In the demo, the window is a delegation registration that closes at
  noon on 9 December 2026 for a 16 December council meeting
  ([requirements](../requirements.md)).
- Staff have to explain decisions accurately with small teams. A general-purpose chatbot
  doesn't solve this, because it can state a wrong figure with confidence and a city
  can't publish text it hasn't checked.

## Why now

1. **AI drafting is now cheap enough to use on every decision.** A full brief,
   with all five lenses, costs **US$0.24–0.37** in model fees. A resident question in our
   test suite costs **about US$0.05–0.07** (eval averages, `agents/evals/results.md`). That run
   used Gemini 3.6 Flash at US$0.75 per million input tokens and US$3.75 per million
   output tokens. Those prices rise to US$1.50 and US$7.50 on 1 January 2027
   ([architecture §7](../architecture.md), citing
   [Google's pricing page](https://ai.google.dev/gemini-api/docs/pricing)).
2. **Ontario is pressing municipalities on housing and budgets.** 50 municipalities have
   provincial housing targets toward 1.5 million homes by 2031. In 2024 the province
   recorded 94,908 new homes against a 125,000 target (75.93%)
   ([Ontario, Tracking housing supply progress](https://www.ontario.ca/page/tracking-housing-supply-progress),
   updated 15 Dec 2025). The $1.2B, three-year Building Faster Fund rewards
   municipalities that reach at least 80% of their annual target
   ([CBC, 2023](https://www.cbc.ca/lite/story/1.6942488)). So decisions on rezoning,
   infrastructure and development charges keep coming, and they are public and contested. Budgets are under the same
   pressure. The demo Region reports an infrastructure funding gap of $87.6M a year
   (agents/evals/results.md, citing the Region's 2026 asset management review).
3. **Accessibility, plain language and AI transparency are now expected.** Ontario
   requires designated public sector organizations to make public web content meet
   WCAG 2.0 Level AA, with deadlines that have already passed
   ([Ontario, How to make websites accessible](https://ontario.ca/page/how-make-websites-accessible)).
   Bill 194 (S.O. 2024, c. 24) lets the province require public sector entities that use
   AI to disclose it, keep accountability frameworks and assign human oversight. No AI
   regulation has been made yet, and municipalities are not among the entities prescribed
   so far ([Ontario EDSTA page](https://www.ontario.ca/page/enhancing-digital-security-and-trust-act),
   updated 22 Oct 2026). In January 2026 Ontario's Information and Privacy Commissioner
   and Human Rights Commission jointly published six principles for public sector AI
   ([Lerners summary](https://lerners.ca/insights/ai-governance-reimagined-ontarios-new-joint-principles-for-the-responsible-use-of-artificial-intelligence)).
   Our product already includes what those principles call for: disclosure, a named
   human approver and a verifiable record.
4. **Municipal staff are stretched.** AMO's workforce project calls recruitment and
   retention a major concern for municipal governments; its research drew on more than
   30 CAOs and HR professionals and more than 2,400 municipal employees
   ([AMO roadmap, 2024](https://www.amo.on.ca/sites/default/files/assets/AMOWorkforceDevelopmentProjectRoadmap2024.pdf)).
   StrategyCorp's 2026 CAO survey says municipalities still struggle to attract and keep
   specialized staff ([AMCTO](https://www.amcto.com/node/4095)).
5. **Incumbents have confirmed the demand.** In August 2026 Granicus announced
   "conversational access" to agendas, minutes and decisions, and an agenda agent in
   development. It says it serves more than 7,000 public sector organizations
   ([Granicus, 21 Aug 2026](https://granicus.com/?p=105568)). The announcement doesn't
   mention checking each quote against its page, staff approving each statement, or a
   public tamper-evident record. Those three things are what we build.

## Who buys, who uses

| | Who | Budget line they pay from |
|---|---|---|
| **Buyer (economic)** | Clerk's office, communications and engagement teams, CAO's office | Communications or public engagement software. Today that line pays for EngagementHQ subscriptions of $10,000 to $22,500 a year in Ontario towns and cities (see [pricing](pricing.md#benchmarks)) |
| **Buyer (champion)** | Planning, finance and transit departments (lenses), councillors' offices | Planning studies, budget consultation, transit planning |
| **Approver** | IT, privacy (MFIPPA coordinator), procurement, legal | See [trust and compliance](trust-and-compliance.md) |
| **User** | Residents (renters, homeowners, riders, seniors, students, newcomers, people with a disability) | Free, with no account |
| **Daily user** | Communications officers and clerks reviewing and publishing statements | |

## Traction so far (honest)

- A working prototype is live at <https://municipal-agents.fly.dev>. It was built during
  CIVIC Hack 2026, run by the Future Cities Institute at the University of Waterloo from
  12 to 14 November 2026
  ([event page](https://uwaterloo.ca/engineering/events/civic-hackathon-2026)).
- It covers three real Waterloo Region decisions, using public data only: the 2027 Plan
  and Budget, the Water Supply Strategy Update, and the variances for the Kitchener
  Central Transit Hub.
- Seven agent skills: explainer, transit access, lifecycle cost, commitments, housing
  pipeline, construction scout and translator. Code checks citations and the reading
  grade. Staff review and publish each statement. There is a public hash-chained
  record, a public spend page, and 11 languages in the menu.
- Quality, measured: in the latest eval run, **6 of 12** resident-question cases passed.
  Five of the six failures were on reading grade alone (grade 9.2 to 12.2 against a
  limit of 9). Every cited quote was found again on its page, and no answer gave voting
  advice (agents/evals/results.md).
- **We have no customers, pilots or LOIs.** We are not affiliated with the Region of
  Waterloo or its municipalities.

## Business model

An annual SaaS subscription for each municipality, priced by population band, with a
paid 90-day pilot that is credited against year one. Residents never pay. Full detail is
in [pricing.md](pricing.md).

| Tier | For | List price (CA$/year) |
|---|---|---|
| Pilot | 90 days, up to 3 decisions | $7,500 one-time, credited to year one |
| Town | Under 50,000 people | $12,000 |
| City | 50,000 to 250,000 | $36,000 |
| Region / Enterprise | 250,000+, upper-tier and regional governments, shared service for member municipalities | from $96,000 |

Estimated gross margin at list price is about 66 to 74% including model, hosting,
onboarding and support, and 76 to 84% for the software alone. The calculation is in
[pricing.md](pricing.md#gross-margin-estimate).

## Market size

**Counts (sourced)**

- **Ontario:** 444 municipalities
  ([Ontario](https://www.ontario.ca/page/list-ontario-municipalities)). These are 30
  upper-tier and 414 local municipalities, and the local ones split into 241 lower-tier
  and 173 single-tier. Our tabulation of 2021 Census populations
  ([StatCan table 98-10-0002](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000203&geocode=A000235),
  as compiled in [Wikipedia's list](https://en.wikipedia.org/wiki/List_of_municipalities_in_Ontario))
  gives this split:

  | Population (2021) | Local municipalities | Upper-tier | Total |
  |---|---|---|---|
  | under 10,000 | 263 | 0 | 263 |
  | 10,000 to 49,999 | 109 | 5 | 114 |
  | 50,000 to 99,999 | 14 | 14 | 28 |
  | 100,000 to 249,999 | 19 | 4 | 23 |
  | 250,000 and over | 9 | 7 | 16 |
  | **Total** | **414** | **30** | **444** |

- **Canada:** Statistics Canada counts 5,161 census subdivisions in 2021, which include
  reserves and unorganized areas
  ([StatCan dictionary](https://www12.statcan.gc.ca/census-recensement/2021/ref/dict/tab/index-eng.cfm?ID=t1_5)).
  Adding up the provincial lists gives about 3,570 incorporated municipalities
  ([Wikipedia tally](https://en.wikipedia.org/wiki/Lists_of_municipalities_in_Canada);
  **estimate**). In 2021, 100 municipalities had at least 52,662 people, 56 had 100,000
  or more, and 21 had 250,000 or more. These are our counts from the
  [list of the 100 largest](https://en.wikipedia.org/wiki/List_of_the_largest_municipalities_in_Canada_by_population),
  which uses 2021 Census data. FCM has more than 2,000 member municipalities, covering
  about 90% of Canadians ([FCM](https://fcm.ca/en/about-fcm/membership/our-members)).
- **United States (later):** 90,837 local governments in 2022: 3,031 counties, 19,491
  municipalities, 16,214 townships, 12,546 school districts and 39,555 special districts
  ([St. Louis Fed, 2024](https://www.stlouisfed.org/publications/regional-economist/2024/march/local-governments-us-number-type)).
  The 2025 count is 91,438
  ([Census Bureau, 2026](https://www.census.gov/library/publications/2026/econ/govtorg2225.html)).
  Of 19,479 incorporated places in 2024, 817 had 50,000 or more people, 342 had 100,000
  or more, and 14,603 had fewer than 5,000
  ([Census Bureau, May 2025](https://census.gov/newsroom/press-releases/2025/vintage-2024-popest.html)).

**Bottom-up sizing (all estimates, at our list prices, one subscription per government)**

| | Assumptions | Annual value |
|---|---|---|
| **SAM: Ontario** | 109 local municipalities of 10k to 50k at $12k; 33 of 50k to 250k at $36k; 9 of 250k+ at an average of $120k; 7 large upper-tier at $96k; 23 other upper-tier at $36k; 263 under 10k bought through their county at $3k each | **≈ CA$5.9M** |
| **TAM: Canada** | 21 municipalities of 250k+ at an average of $120k; about 80 of 50k to 250k at $36k; about 260 of 10k to 50k at $12k (Ontario's 109 scaled by 2.4, Canada's ratio to Ontario in the 50k+ band); about 3,200 under 10k at $3k; about 150 regional bodies (Ontario upper-tier, BC regional districts, Québec MRCs) at $36k | **≈ CA$24M** (≈ US$17M at 1.40 CAD per USD, an assumption) |
| **TAM: United States** | 342 cities of 100k+ at US$45k; 475 of 50k to 100k at US$26k; 4,059 of 5k to 50k at US$9k; 3,031 counties at an average of US$20k; 30,817 places under 5k and townships at US$2k through county or state-association bundles. School and special districts are excluded. | **≈ US$185M** |
| **SOM: 36 months** | 50 customers, mostly in Ontario: 20 Town at $12k, 20 City at $36k, 5 Region at $96k and 5 county bundles at about $60k | **≈ CA$1.7M ARR** (a goal, not a forecast) |

The decision brief alone is a wedge-sized market, about US$200M a year across North
America. The larger opportunity is the clerk's and communications team's whole
explanation workflow: consultation "what we heard" reports, answers to council
questions, records requests, and agenda preparation. Any of these could carry the same
verified-citation engine at a higher price per customer. We have not built them.

## Competition and why we win

| Who | What they do | How we differ |
|---|---|---|
| **EngagementHQ (Bang the Table, owned by Granicus since 2021)** ([Washington Technology](https://washingtontechnology.com/articles/2021/06/17/grancius-two-acquisitions.aspx)) | Project pages, surveys and forums. Widely used in Ontario, including the EngageWR hub for Waterloo Region ([opencouncil.ca](https://opencouncil.ca/municipal-public-engagement/)) | We explain the decision itself, with citations, and link to their survey as the place to have a say. We complement them; we don't replace them. |
| **Granicus (GXA, Legistar)** | Agendas, websites, notifications. AI conversational access to meetings announced in Aug 2026 ([Granicus](https://granicus.com/?p=105568)) | Each statement is checked against its page in code, approved by a named staff member, and kept in a public tamper-evident record. We can be neutral across agenda vendors. |
| **Go Vocal (formerly CitizenLab)** | Engagement platform with "sensemaking" of resident input ([plans](https://govocal.com/plans)) | They summarize what residents say to the city. We explain what the city is proposing to residents. |
| **Polco** | Surveys and benchmarking (National Community Survey); AI assistant "Polly" ([Polco blog, Jun 2026](https://blog.polco.us/the-2026-plain-language-guide-to-ai-in-city-hall)) | They measure opinion. We inform it, with sources. |
| **Zencity** | Resident sentiment analytics, AI assistant and post writer for comms teams ([Zencity](https://zencity.io/zencity-for-communication-teams/)) | They write outbound messaging for staff. We write cited, reviewable briefs for residents, plus a public record. |
| **Social Pinpoint** (socialpinpoint.com/plans now redirects to openpoint.com), **PublicInput** | Engagement and consultation CRM | Same as EngagementHQ: we complement them. |
| **CivicPlus** | Websites and agendas; markets AI summaries of meeting materials ([CivicPlus blog](https://www.civicplus.com/blog/cxp/role-use-ai-local-government/)) | Our differences are verification in code, the staff approval trail, the public record, and the lenses. |
| **OpenGov** | Budgeting, ERP, permitting | A possible data source and integration partner for the cost lens. |
| **eSCRIBE (OnBoard, acquired Aug 2021)** ([Mergr](https://mergr.com/transaction/onboard-acquires-escribe)), **iCompass / CivicWeb (Diligent)** ([softwarereview](https://softwarereview.com/s/icompass)) | Agenda and meeting management used by many Ontario councils | Integration partners: their agendas are our inputs. |
| **Generic chatbots** (ChatGPT, Copilot, Gemini) | Fast, cheap, general | No check that a quote is on its page, no staff approval, no record, no AODA or French-language plan. A city can't publish their output as is. |
| **Consultants and in-house comms** | Plain-language rewrites by hand | Slow and costly per decision. We give them a checked first draft. |

**Why we win:** (1) We start from the decision rather than the engagement project.
(2) Every statement carries a verified citation, a named approver and a public
record. That is the trust case that IT, privacy staff and council need for AI.
(3) Lenses add transit access, lifecycle cost, commitments and the housing pipeline,
computed from the city's open data. (4) Our price is low enough that a pilot and a
three-year City contract stay under the usual procurement thresholds (see
[go-to-market](go-to-market.md)).

## Moat (what compounds)

1. **The verified-citation engine and the public record.** Code checks every quote on
   its page, and each brief, review and approval is appended to a hash-chained log.
   Copying a demo is easy. Earning a clerk's trust over many reviewed decisions is not.
2. **Municipal skills and evals.** These are agent skill files written in plain language
   that staff can read, plus an eval suite of real resident questions scored in code
   (`agents/evals/cases.json`). Each new city adds cases.
3. **City configurations.** Each city gets a config with its timelines, sources,
   languages, transit feed and permit data. Every one we set up makes the next city
   faster to onboard.
4. **Integrations** with agenda systems (eSCRIBE, Legistar, CivicWeb) and engagement
   platforms. This is where switching costs build up.
5. **A procurement-ready trust package:** privacy impact assessment template, an
   algorithmic impact assessment in the style of the federal tool, accessibility test
   results and a SOC 2 plan. See [trust and compliance](trust-and-compliance.md).

Honest note: none of these is a moat yet. Each is a head start that only lasts if we
keep shipping.

## Risks

| Risk | Mitigation |
|---|---|
| A wrong or out-of-context statement damages trust or creates liability | Quotes are checked in code, figures in answers must match a cited statement, staff approve before publishing, and every page says it is "not the official notice". Each city's legal review happens before go-live. |
| Long public-sector sales cycles | Pilots priced under direct-purchase thresholds, cooperative purchasing vehicles, and FCI and AMO channels ([go-to-market](go-to-market.md)) |
| Incumbents bundle "good enough" AI (Granicus, CivicPlus) | Verification and the public record as the standard to meet, plus neutrality across agenda vendors and integrations |
| Data residency: our default model runs in the US | Move to a Canadian-region or on-premises model. Vertex AI's Montréal region doesn't list Gemini 3.6 Flash ([architecture §4](../architecture.md); [Google](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)) |
| Reading grade above target (5 of 12 eval cases) | Plain-language pass, a rewrite loop and measured targets |
| Staff review time not yet measured (our estimate is 30 to 60 minutes per brief) | Measure it in the pilot and price it in |
| Model price doubling on 1 Jan 2027 | Model fees are about 2 to 12% of revenue even at the new prices ([pricing](pricing.md#gross-margin-estimate)) |
| A small Canadian market | Go deep in Ontario first, then expand to the rest of Canada and the US |

## The ask

1. **Two or three Ontario municipalities for a 90-day paid pilot on one live decision**
   (budget, housing or transit), with a clerk or communications lead as the reviewer.
2. **Introductions** to clerks, communications directors and IT and privacy leads,
   through FCI's CIVIC program (City Innovation Via Internships and Co-op), AMO and
   AMCTO.
3. **Pre-seed funding of about CA$1M** (**estimate**) for 18 months: three people, a
   Canadian-hosted model, two agenda-system integrations, a WCAG 2.2 AA audit and
   readiness for a SOC 2 Type I report.

Founders and team: *(to be filled in by the founders; not stated here).*
