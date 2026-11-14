# Municipal Agents: roadmap (30 / 90 / 365 days)

Starting point, 14 November 2026: a working prototype for Waterloo Region with three
decisions, seven agent skills, four lenses plus a construction scout, staff review and
publish, a hash-chained public record and a spend page. It has no customers. Open items
are marked `TODO(verify)` in [architecture](../architecture.md) and
[requirements](../requirements.md). Dates are targets, not commitments. Customer numbers
are goals, not forecasts.

## Next 30 days (to 14 December 2026): make it pilot-ready

**Product quality**
- Bring every eval case to reading grade 9 or lower (5 of the last 12 failed on grade
  alone) and fix the `tax-2026` regression. Run all 18 cases, including the 6 skipped
  when the spend cap was reached (`agents/evals/results.md`).
- Measure the `TODO(verify)` items: translation cost per brief, the final brief cost, a
  load test of `GET /api/decisions/:id`, and volume snapshot retention.
- Add a "Report an error" flow to the clerk, which is itself logged. Add the "don't type
  personal details" notice and the "machine translation" label on screen.

**Trust**
- Publish the record's head hash daily outside our control (a public Git repository),
  so a rebuilt chain would be detected.
- Replace the shared staff passcode with individual accounts (email sign-in) and roles:
  drafter, reviewer, publisher.
- Prepare a pilot pack: a filled-in PIA template, AI disclosure text, a subprocessor
  list, a data processing agreement template, a company privacy policy, and a named
  privacy officer ([trust and compliance](trust-and-compliance.md)).

**Canadian hosting**
- Prototype the Canadian-region model: point the model client at Vertex AI Montréal
  (Gemini 3.5 or 3.8 Flash; 3.6 is not listed there, per [architecture §4](../architecture.md)),
  re-run the evals, and compare quality and cost.

**Company and sales**
- Incorporate a Canadian corporation, which is needed for contracts and for any ISC
  bid. Decide by 1 December whether to bid on the ISC challenge on AI traceability
  (it closes 22 December 2026; [go-to-market §1.4](go-to-market.md#14-innovation-and-pilot-routes)).
- Make private previews for the four Waterloo Region municipalities. Send two pilot
  proposals.

**Ingestion**
- Add "paste an agenda URL": pull a meeting's agenda and staff-report PDFs from a public
  agenda portal and start a draft brief.

## Next 90 days (to mid-February 2027): three pilots live

**Customers (goal):** 3 paid pilots on live decisions (budget season, housing, transit).
Measure staff review time, reading grade, citation errors caught before publication,
resident use, and errors residents report.

**Agenda-system integrations (read-only)**
- **Legistar**: a connector to its public Web API for matters and events
  ([examples](https://webapi.legistar.com/Home/Examples)). A new agenda item creates a
  draft brief.
- **eSCRIBE** and **CivicWeb (iCompass)**: ingest from their public meeting portals, and
  ask both vendors for API access through a partnership.
- OCR for scanned PDFs that have no text layer. Today these fail safe, with fewer
  statements, but they are common.

**More cities**
- Run several cities in one service: the city id in the path, and spend caps, staff
  accounts and records kept separately for each city ([architecture §4](../architecture.md)).
- City-config tooling: a guided setup for `cities/<id>.json`, sources and the decision
  timeline. The goal is to cut onboarding from days to hours (onboarding hours are the
  biggest cost driver in [pricing](pricing.md#gross-margin-estimate)).

**Staff analytics v1**
- Show topics residents ask about and questions the documents don't answer (a signal
  for comms), review minutes per brief, reading grade over time, and views and calendar
  adds per decision. No personal data.

**Trust and compliance**
- Single sign-on (OIDC, SAML) for City tier pilots.
- Redact personal details in questions before they are logged or sent to the model.
- Build the retention design: payloads can be purged under the city's retention by-law
  while the hash chain still verifies ([trust §8](trust-and-compliance.md#8-records-retention)).
- Commission an independent WCAG 2.2 AA audit and an Accessibility Conformance Report.
  Schedule a penetration test.
- Make the Canadian-region model the default for pilots if it passes the evals.

**Lenses**
- Generalize "Have your say" timelines for planning applications, so a statutory public
  meeting, notice period and appeal window are computed and cited.
- Explore a development-charges lens with FCI's Development Charges Monitor
  ([FCI](https://uwaterloo.ca/future-cities-institute/news/practical-tools-local-leaders-fci-amo-2026)).

## Next 365 days (to November 2027): a repeatable product

**Customers (goal):** 10 Ontario customers (pilot or paid), 5 on annual contracts,
including the first county bundle. One pilot outside Ontario.

**Integrations**
- Production connectors for eSCRIBE, Legistar and CivicWeb, so briefs start the day an
  agenda is published.
- "Have your say" deep links and embeds for engagement platforms: EngagementHQ, Go
  Vocal, Social Pinpoint / OpenPoint, PublicInput.
- Export to the city's records system and BI tools.

**More cities**
- Ten or more city configurations. Each one adds eval cases from real resident
  questions to `agents/evals/cases.json`.
- A Québec or New Brunswick pilot to exercise French as the primary language.
- US discovery through Legistar cities. Don't sell yet; confirm the US price bands in
  the [one-pager](one-pager.md).

**More lenses and modules**
- Lenses for water and wastewater rates, climate and emissions commitments (extending
  the commitments lens), fire and emergency service levels, and an accessibility
  lens (for example which facilities are step-free).
- A "what we heard" module: summarize consultation submissions with a citation to each
  submission. This needs a privacy design, because submissions contain personal
  information. Build it only with the city's privacy office.
- Council and constituent Q&A: staff-reviewed answers published to each brief, so
  common questions cost nothing to answer again.

**Canadian-hosted models and model choice**
- A Canadian-region model by default for all tiers.
- A reference on-premises deployment with an open-weight model on the city's hardware
  for Region / Enterprise.
- An eval gate: no model switch ships without passing the eval suite.

**Analytics for staff, v2**
- Benchmarks across decisions (review time, reading grade, use). Opt-in comparisons
  across cities. Reports a clerk can attach to a council report.

**Scale**
- Agent runs as queued jobs with workers. Briefs served from a CDN or written as static
  files. The record moves to Postgres with serialized appends; the hash format does not
  change ([architecture §4](../architecture.md)).

**Procurement-ready security package**
- A SOC 2 Type I report, a penetration test summary, a standard security questionnaire,
  a subprocessor list and data processing agreement, the PIA template, an AIA-style
  assessment, and the accessibility conformance report. Plus cyber and errors-and-omissions
  insurance.
- A response to one cooperative purchasing solicitation (Canoe or Kinetic GPO).

**Evidence**
- A comprehension study with residents (including screen-reader users and newcomers)
  through FCI's CIVIC program, published whatever the result.

## What we will not build (on purpose)

- Resident accounts, profiles, tracking or ads.
- Anything that tells residents what to think or how to vote.
- A replacement for the official notice, the city's consultation tools or its
  engagement platform.

## Metrics we will report each quarter

| Metric | Target |
|---|---|
| Statements shown as verified whose quotes are not on the page | 0 (checked in code) |
| Eval pass rate | All cases ≥ 90% by Q2 2027 |
| Reading grade of summary and impacts | ≤ 8 |
| Staff review minutes per brief | Measured in pilots, then a target set below 45 |
| Pilot to paid conversion | ≥ 50% |
| Model cost per published decision | ≤ US$2 at 2027 prices ([pricing](pricing.md#unit-economics)) |
| Accessibility issues open at AA level | 0 at go-live |
