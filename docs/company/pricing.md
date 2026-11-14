# Municipal Agents: pricing

This is a proposal, written 14 November 2026. Nobody has paid these prices yet. Prices are
in Canadian dollars before tax unless they say US$. Wherever we convert, we assume
**US$1 = CA$1.40**; check the Bank of Canada rate before quoting. **Estimate** means our
own arithmetic, with the assumptions shown.

## Principles

1. **Residents never pay.** There are no resident accounts, no ads and no data sales.
2. **The price follows the population.** That is how municipalities already think about
   budgets, and it matches how many decisions get made and how many questions residents
   ask.
3. **Pilots are cheap enough to buy on a purchasing card.** The 90-day pilot sits below
   typical low-value purchase limits, and the three-year City contract sits below the
   CFTA open-tender threshold. See [procurement fit](#procurement-fit).
4. **Hard caps on spend.** Every run and every day has a dollar cap enforced in code (in
   the prototype, US$0.50 a run and US$5 a day; see [spec](../spec.md)). A city can never
   receive a surprise bill.

## Tiers

| | **Pilot (90 days)** | **Town** | **City** | **Region / Enterprise** |
|---|---|---|---|---|
| For | Any municipality trying it on one live decision | Population under 50,000 | 50,000 to 250,000 | 250,000+, upper-tier and regional governments, shared service for member municipalities |
| Price | **$7,500 one-time**, 100% credited to year one if they subscribe within 60 days of the pilot ending | **$12,000 / year** | **$36,000 / year** | **from $96,000 / year** |
| Published decisions | up to 3 | up to 24 a year | up to 75 a year | unlimited (fair use) |
| Resident questions included | 1,500 | 3,000 a year | 15,000 a year | 50,000 a year |
| Questions beyond the included amount | n/a (hard cap) | $0.25 each, or a hard cap (the city chooses) | same | same |
| Languages (machine translation, labelled) | English, French + 2 | English, French + 4 | English, French + 9 (the 11 in the prototype) | Any supported, plus human review of the top languages as a pass-through cost |
| Lenses | Any whose data exist | Commitments, lifecycle cost, housing pipeline; transit if the city has a GTFS feed | All, including transit and the construction scout | All, plus up to 2 custom lenses a year (for example water, climate, fire service) |
| Staff seats | 5 | 5 | 25 | Unlimited |
| Roles (drafter, reviewer, publisher) | yes | yes | yes | yes, plus custom roles |
| Sign-in | Email sign-in for each staff member | Email sign-in | **SSO** (SAML or OIDC: Entra ID, Okta, Google) | SSO + SCIM provisioning + audit export |
| Canadian data residency | Stored data in Canada; model choice noted in the pilot agreement | Stored data in Canada; Canadian-region model where available | Stored data **and model processing** in Canada | Same, or **on-premises / city cloud with a model of the city's choice** (open-weight or its existing contract) |
| Public record (hash-chained) and spend page | yes | yes | yes | yes, plus scheduled publication of the head hash outside our control |
| Agenda-system connector (eSCRIBE, Legistar, CivicWeb) | manual upload | manual upload | 1 connector included as it ships ([roadmap](roadmap.md)) | all connectors |
| Staff analytics (topics asked, unanswered questions, reading grade over time) | end-of-pilot report | basic | full | full + export to the city's BI tool |
| Embed on the city's website | yes | yes | yes | yes, white-label |
| Support | Onboarding done by us, weekly check-in | Business-hours email, onboarding included | Priority, quarterly review | Named success manager, 99.9% uptime target, security review support |
| Trust package | PIA template, AI disclosure text | same | + accessibility conformance report, AIA-style assessment | + SOC 2 report when available, custom terms |

**Add-ons (estimates):** extra agenda connector $6,000 a year; custom lens from $15,000
one-time; on-premises setup from $25,000 one-time. **County bundle:** an upper-tier
municipality buys the tier that matches its own population and adds $3,000 a year for each
lower-tier member under 10,000 people, so small towns are covered without a separate sale
(a county of 100,000 with 8 small members: $36,000 + $24,000 = $60,000 a year).
Multi-year terms lock the price for three years at 5% off.

**What the pilot proves:** On one live decision we measure staff review time per brief
(our estimate of 30 to 60 minutes has not been measured), the reading grade, citation
failures caught before publication, resident use (views, questions, calendar adds), and
errors residents report. The city gets a short written report it can take to council.

## Benchmarks

What Ontario and North American municipalities pay for comparable civic-tech tools,
from public records. The tools are not identical to ours. Engagement platforms host
surveys and project pages; we explain decisions. Still, these prices come from the same
budget lines.

| Product | Buyer (population, 2021 Census) | Price | Year | Source |
|---|---|---|---|---|
| EngagementHQ (Bang the Table, now Granicus) | Town of Collingwood, ON (24,811) | $15,000 a year | 2022 | [opencouncil.ca](https://opencouncil.ca/municipal-public-engagement/) (edited 10 Feb 2026), citing [Collingwood council document](https://collingwood.civicweb.net/document/89725/) |
| EngagementHQ | Township of Centre Wellington, ON (31,093) | $10,000 a year, then $10,176 a year | 2016, 2021 | opencouncil.ca, citing [Centre Wellington council document](https://centrewellington.civicweb.net/document/45681/) |
| EngagementHQ | City of Sarnia, ON (72,047) | $18,000 a year | 2019 | opencouncil.ca, citing [Sarnia council document](https://sarnia.civicweb.net/document/121749/) |
| EngagementHQ | Municipality of Chatham-Kent, ON (103,988) | $22,500 a year | 2020 | opencouncil.ca, citing Chatham-Kent council minutes of 1 Feb 2021 |
| Granicus short-term rental compliance (four modules) | Township of North Kawartha, ON (2,877) | $33,884.07 a year | Jul 2026 to Jul 2027 quote | [North Kawartha committee report, 3 Jun 2025](https://www.northkawartha.ca/media/5sgnzmeo/b5_summary-of-granicus.pdf) |
| Polco community survey | City of Orono, MN | US$23,000 (2026 survey project) | Feb 2026 | [Orono council packet](https://publicinfo.ci.orono.mn.us/WebLink/0/doc/233922/Page60.aspx) |
| Polco / NRC National Community Survey | City of Milton, GA | US$19,700 | as reported | [AJC](https://ajc.com/neighborhoods/north-fulton/milton-to-conduct-community-survey-of-residents/6U53ZCP2JJEFLEIDO65HYU244M) |
| Polco / NRC National Community Survey price sheet | (Ramsey, MN packet) | subscription US$5,670 vs one-time US$6,020 for one option; US$12,215 for another | 2020 | [Polco/NRC pricing 2020](https://public.destinyhosted.com/ramsedocs/2020/CCWS/20200728_21764/11094_The%20NCS%20Pricing%202020.pdf) |
| Go Vocal (CitizenLab) | n/a | Not published; a personalized offer on request. A third-party listing reports "starting from $5,000" | 2026 | [Go Vocal plans](https://govocal.com/plans); [Fitgap](https://us.fitgap.com/products/024215/go-vocal) |
| Social Pinpoint / OpenPoint | n/a | Quote only (socialpinpoint.com/plans redirects to openpoint.com) | 2026 | [OpenPoint](https://www.openpoint.com/plans/request-pricing/) |

**What we take from this:** Ontario towns and mid-size cities already pay about
**$10,000 to $22,500 a year** for one engagement platform. Small townships pay more than
$30,000 a year for a niche Granicus compliance module. Our Town price of $12,000 sits
inside the range towns already pay for engagement software. Our City price of $36,000 sits
above a single engagement subscription. It replaces hours of staff writing on every major
decision and adds lenses no engagement platform has. Our pitch to cities is "keep your
engagement platform; we make it worth visiting". We are not asking them to swap.

## Unit economics

### Measured costs (prototype, default model)

| Item | Measured | Source |
|---|---|---|
| One full brief with all four lenses | **US$0.24** (17 statements, each quote verified, 8 figures, 6 unknowns) | First full run, [readiness report](../../report/readiness-report.html); [architecture §7](../architecture.md) |
| One resident question (average of 12 eval questions) | **US$0.0728**; median 29.7 s; 117 model calls and US$0.8739 in total | `agents/evals/results.md`, run of 14 Nov 2026 |
| One small test question | US$0.012 (5 calls, ~12,300 input and 700 output tokens) | [architecture §7](../architecture.md) |
| Reading a published brief | **US$0** in model fees (served as stored JSON) | [architecture D4](../architecture.md) |
| Hosting, one city (prototype) | about US$7 to US$10 a month (Fly.io shared-cpu-1x 1 GB at US$6.70 a month, volume US$0.15 per GB-month) | [architecture §7](../architecture.md), citing [Fly.io pricing](https://fly.io/docs/about/pricing) |
| Model price | Gemini 3.6 Flash US$0.75 / US$3.75 per million input / output tokens to 31 Dec 2026; **US$1.50 / US$7.50 from 1 Jan 2027** | [architecture D7](../architecture.md), citing [Google](https://ai.google.dev/gemini-api/docs/pricing) |

### Planning costs (estimates, at 2027 model prices, i.e. double the measured costs)

| Unit | Estimate | Assumption |
|---|---|---|
| Brief run | US$0.48 | Measured US$0.24 × 2 |
| Published decision | **US$2.00** | 4 runs per decision (drafts and re-runs after new documents) at ~US$0.50 |
| Translation of one brief into one language | US$0.05 | About 6,000 input and 5,000 output tokens; not yet measured (`TODO(verify)` in architecture) |
| Resident question | **US$0.15** | Measured US$0.0728 × 2 |
| Canadian-region model | +0 to 30% on the above | Vertex AI Montréal lists Gemini 3.5 and 3.8 Flash but not 3.6 ([architecture §4](../architecture.md)); price not yet checked |

### Gross margin estimate

Assumptions per customer per year: support and onboarding at CA$80 an hour (Town 20 h,
City 40 h, Region 120 h); production hosting with a managed database, backups,
monitoring and a staging copy (Town CA$1,200 on shared multi-tenant hosting, City CA$4,800,
Region CA$12,000 single-tenant); 2 versions × each language for every published decision.
All **estimates**.

| | Town ($12,000) | City ($36,000) | Region ($96,000) |
|---|---|---|---|
| Model: decisions + translations | 24 × $2 + 24 × 6 × 2 × $0.05 = US$62 | 75 × $2 + 75 × 11 × 2 × $0.05 = US$233 | 200 × $2 + 200 × 11 × 2 × $0.05 = US$620 |
| Model: questions **at the included cap** | 3,000 × $0.15 = US$450 | 15,000 × $0.15 = US$2,250 | 50,000 × $0.15 = US$7,500 |
| Model total (CA$) | ≈ $720 | ≈ $3,480 | ≈ $11,370 |
| Hosting (CA$) | $1,200 | $4,800 | $12,000 |
| Support and onboarding (CA$) | $1,600 | $3,200 | $9,600 |
| **Cost of revenue (CA$)** | **≈ $3,520** | **≈ $11,480** | **≈ $32,970** |
| **Gross margin at the cap** | **≈ 71%** | **≈ 68%** | **≈ 66%** |
| Gross margin at a third of the question cap | ≈ 74% | ≈ 74% | ≈ 73% |
| Gross margin, software only (no human support), at the cap | ≈ 84% | ≈ 77% | ≈ 76% |

**Pilot:** $7,500 against about 30 hours of onboarding ($2,400) and under $300 of
model and hosting costs, so about 65% gross margin. The pilot's main job is to qualify
the customer and set up their city configuration, which year one then reuses.

**Reading the table:** Model fees stay small even at 2027 prices, at 2 to 12% of
revenue. Most of the cost of revenue is people (onboarding and support) and Canadian
hosting. The costs that move margin most are (1) onboarding hours per city, which the
city-config tooling and agenda connectors are meant to bring down, and (2) the number of
resident questions. We can lower question costs by publishing staff-reviewed answers to
common questions (no model call when they are reused), sending simple questions to a
cheaper model, and caching. These are planned, not built.

## Procurement fit

| Contract | Value over its term | Typical route (check each municipality's purchasing by-law) |
|---|---|---|
| Pilot | $7,500 | Low-value purchase. Typical Ontario by-laws allow direct purchase up to about $10,000 to $15,000 ([opencouncil.ca, 2024](https://opencouncil.ca/municipal-procurement-ontario/)); Thorold's CAO can approve up to $25,000 ([Thorold policy, Apr 2025](https://www.thorold.ca/media/5z1iw20i/policy_300-01-april-29-2025.pdf)) |
| Town, 3 years | $36,000 | Informal quotation in many by-laws. Essex: informal RFQ/RFP from $15,001 to $50,000 ([Essex by-law summary](https://essex-ca.govstack.com/media/eiwhjvqe/summary-of-procurement-by-law-2129.pdf)) |
| City, 3 years | $108,000 | Formal RFQ/RFP under the municipality's own by-law. Below the **CFTA** threshold of **$139,000** for municipal services in 2026 to 2027 ([Nova Scotia trade-agreement table, Feb 2026](https://www.novascotia.ca/sites/default/files/documents/1-1072/trade-agreements-thresholds-and-posting-timelines-en.pdf); [CFTA notice](https://www.cfta-alec.ca/adjusted-covered-procurement-threshold-values-january-1-2026-to-december-31-2027)) |
| Region, 3 years | $288,000+ | Above the CFTA threshold, so an open competitive process is required, or a cooperative purchasing agreement such as [Canoe's Public Administration Software Program](https://canoeprocurement.ca/?p=7335), which lists "citizen engagement" and says it complies with CETA and CFTA. See [go-to-market](go-to-market.md) |

## Open questions

- What does a resident question cost on a Canadian-region model? We need to measure it.
- How many staff hours does a review take? This is the main pilot measurement.
- Should the City tier include a connector before connectors exist? For now, City
  contracts should describe it as "when available".
- Should the price be per decision instead (for example $1,500 per published decision)?
  That is simpler to understand but harder to budget for. Ask pilot clerks which they
  prefer.
