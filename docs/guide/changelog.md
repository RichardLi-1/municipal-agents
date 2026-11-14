---
title: Changelog
description: What changed in Municipal Agents and when, newest first, from the project's commit history.
---

Municipal Agents was built during CIVIC Hack 2026, 12 to 14 November 2026. Times are
Eastern (Toronto). Each entry is a commit in the
[repository](https://github.com/RichardLi-1/municipal-agents/commits/main); the live
site may run a slightly older build than the newest entry.

## Unreleased

In the repository and being finished for the 10:00 am deadline.

- **These docs** (`docs/guide/`, built by `docs-site/`) and the product site, served
  from the same machine at `/docs` and `/`.

## 14 November 2026

### 02:45: Cost lenses for every decision, and staff replay

- **Lifecycle cost lenses built in code** from cited figures for all three decisions:
  every input is a figure whose quote is checked on its page, or a labelled assumption
  with a slider. See [planners](planners.md#lifecycle-cost).
- Cost ramps are kept when a resident moves a slider.
- Lens files are attached to decisions by name.
- Staff can **replay the agents' last real run** for a decision: no model, no spend.
  See [staff](staff.md#watch-the-agents-work).

### 02:43: The platform

- **Embeddable widget:** one script tag puts a decision's card on a city web page. See
  [embed](embed.md).
- **Platform routes:** a list of cities (`GET /api/cities`) for one deployment serving
  several, a calendar feed and subscribe links, the data behind the embed card, the
  OpenAPI description at `/api/openapi.json`, and a staff summary of what residents
  are asking. See the [API reference](api.md).
- **Records retention:** the record's hash chain now covers each entry's payload hash,
  so staff can purge an entry's content when its retention period ends (for example a
  question where someone typed personal details) and the chain still verifies. A
  `record.purged` entry says which entry, why and who. Older records are migrated once
  at start. See [the hash-chained record](how-it-works.md#the-hash-chained-record).
- **Security headers** on every response, with a strict Content-Security-Policy for
  pages and `/.well-known/security.txt`.
- Routing for the product site at `/` and the docs at `/docs`.

### 02:42: Better offline answers

- Offline answers (when the model can't be reached) now find what residents mean:
  timeline events, computed transit gaps, and the clerk as a last resort.
- Repeated trade-offs and unknowns are dropped, and statements with stray words are
  rejected.
- Who can appeal a minor variance is explained.

### 02:40: The resident display

- Decisions on a map; the brief with every figure linked to its highlighted page; the
  have-your-say timeline and calendar; the transit, cost, commitments, housing and
  construction lenses; chat with the agents' steps; staff review; the public record and
  the spend page. See [residents](residents.md).

### 02:38: Appeals, noise rules and borehole depths

- Who can appeal a minor variance and the 20-day window.
- A notice on the Chair's new budget powers.
- Each city's construction noise rules and the approval a tunnel would need.
- The FHWA borehole depths confirmed.

### 02:36: Company documents and planner workflows

- Eight municipal scenarios under Ontario law, step by step, mapped to what the product
  does today: [planner workflows](../planner-workflows.md).
- The company documents: one-pager, pricing, go-to-market, trust and compliance, and
  a roadmap (see Company in the menu).

### 02:33: Plain language, offline answers and saved runs

- **Plain-language pass:** statements above grade 8 are rewritten by the model, and
  code keeps a rewrite only if it reads easier, keeps every number and still matches its
  quotes. See [how it works](how-it-works.md#the-plain-language-pass).
- **Computed lens figures** that the agents cite as computed, not quoted, and a new
  **construction scout** specialist.
- **Saved answers:** a question that a real run already answered is replayed from the
  record instead of paying again.
- **Offline answers:** when the model can't be reached, the answer is built from the
  brief's checked statements and labelled as such.
- Every agent run's steps are kept as a file.
- Agent evals on real questions, with honest results: [evals](evals.md).

### 02:33: The Region's new budget powers

- The Region of Waterloo gets "strong chair" budget powers from 15 November 2026. The
  2027 budget's timeline now shows the Chair's proposal by 1 February and Council's
  amendment, veto and override windows, cited to O. Reg. 530/22 and the Municipal Act.

### 02:17: Construction scout

- Candidate excavation and launch-portal sites along ION Stage 2, scored from open
  data; twin bores, cross-passages and boreholes laid out by NFPA 130 and FHWA rules;
  seven illustrated construction steps. Always labelled "Illustrative scenario: not a
  Region plan". See [planners](planners.md#construction-scout).

### 02:04: Every statement reviewed before publishing

- Publishing now needs a staff decision on every statement (approve, edit or reject).
- An edited statement's citations are checked again.
- Construction renders are served at `/api/renders/:file`.
- The code tour, references, credits and Devpost text.

### 02:04: Transit, cost and commitments lenses

- **Transit access:** Connection Scan over Grand River Transit and ION schedules, 2021
  census population and OpenStreetMap destinations.
- **Lifecycle cost** and **commitment status** lenses.

### 01:48: Architecture

- The architecture and its rationale, the readiness report's case study, and service
  refinements: timeouts, spend counting, next-event countdowns and lens matching.

### 01:44: Housing lens and PDF upload

- The housing pipeline lens (approved to completed) for Kitchener, Waterloo, Cambridge
  and the Region.
- Staff can upload a PDF to start a brief.
- The software requirements, and the Kitchener Central Transit Hub variances as a third
  decision.

### 01:41: The agents

- The Gemini client, tools that check citations on the spot, the skill files, the lead
  and the specialists.
- The Region's Water Supply Strategy Update as a second decision.

### 01:40: The service

- The hash-chained public record, the API routes, the `.ics` calendar and the limits.
- The Fly.io deploy in Toronto, the Waterloo Region city settings and the housing data
  fetcher.

### 01:37: The first decision

- The Region of Waterloo 2027 Plan and Budget, with its source documents, a
  hand-checked timeline and notes.
- Citation and reading-grade checks in code, and the UML diagrams.

### 01:23: Start

- The product spec, the shared types and the repository settings.
