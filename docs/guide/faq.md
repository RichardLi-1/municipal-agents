---
title: Frequently asked questions
description: Short answers for residents, city staff, IT teams and judges on accuracy, cost, models, hosting, languages, accessibility and adapting Municipal Agents to another city.
---

Short answers, with links to the longer ones.

## For residents

### Is this the official notice?

No. Municipal Agents explains a decision; it does not replace the city's notice. Every
brief has a **Read the official notice** link. If they ever disagree, the official
notice is right.

### Who wrote the brief?

AI agents drafted it from the city's own public documents. City staff then approve,
edit or reject every statement before publishing it under their name. The top of each
brief says which it is: **Approved by (name) on (date)**, **In review by city staff**,
or **Draft: not yet reviewed by city staff**. See the [resident guide](residents.md#read-a-brief).

### Can it be wrong?

Yes, and the product is built around that. Code checks that every quoted passage is
really on the page it cites, and that every number in a statement appears in its quote.
A tick means those checks passed. It does not prove the sentence reads the page fairly,
which is why staff review every statement and why every figure opens its source page,
so you can check it yourself. If you find a mistake, tell the clerk's office named on
the official notice.

### Will it tell me how to vote?

No. Code refuses statements that tell people what to think or how to vote, and removes
such sentences from answers. Trade-offs are always shown from both sides.

### Do I need an account? Is my question private?

No account, no sign-in, no tracking. But questions are **public**: each one goes into
the public record, with no name or internet address attached. Please don't type
personal details. More in [security and privacy](security-privacy.md#no-personal-information-by-design).

### Which languages can I use?

On the Waterloo Region site: English, French, Punjabi, Arabic, Chinese, Spanish,
Portuguese, German, Romanian, Persian and Vietnamese. The brief is translated by AI
agents from the English brief and labelled as such; the citations keep the original
quotes. You can ask questions in any language. Buttons and labels are in English and
French. See [languages](residents.md#read-it-in-your-language).

### Is it accessible?

It aims to meet WCAG 2.2 AA: keyboard and screen-reader use, light and dark themes,
reduced motion and higher contrast settings, and plain words (the reading grade is
measured and shown on every brief). It has not yet been audited with residents who use
assistive technology; that is **Planned**.

## For city staff

### How much work is a review?

You approve, edit or reject each statement, with its quote and page shown beside it, so
you're checking judgement, not hunting for pages. The draft briefs on the public site
have 29 to 37 statements each, counting the statements in their lenses (14 November). We estimate 30 to 60 minutes per brief; this has not yet
been measured with real staff. See the [staff guide](staff.md#review-each-statement).

### Can the agents publish on their own?

No. A new draft is always saved as a draft. Publishing needs the staff passcode, a
reviewer's name, and an action on every statement. See
[what agents never do](staff.md#what-agents-never-do).

### What if a document is a scan?

A PDF without a text layer is refused at upload, because nothing in it could be cited.
Run it through OCR first. Built-in OCR is **Planned**.

## For IT teams

### What does it cost to run?

| Item | Cost | Basis |
|---|---|---|
| Hosting | about US$7 to 10 a month | One Fly.io `shared-cpu-1x` machine with 1 GB of memory, plus a 1 GB volume |
| One brief, all lenses | US$0.26 to US$0.37 for the three briefs on the public site; capped at US$0.50 | The `costUsd` of each committed brief |
| One question | US$0.07 on average (median 30 seconds) in our evaluation run; capped at US$0.50 | [Evaluation results](evals.md) |
| A question already answered | US$0 | Replayed from the saved run |
| A translation | paid once per language per brief version | Cached until the English brief changes |
| Model spending ceiling | US$5 a day | `DAILY_LIMIT_USD` |

Prices are the model's paid-tier prices in November 2026 (US$0.75 per million input
tokens and US$3.75 per million output tokens for `gemini-3.6-flash`). Google's
published schedule doubles them on 1 January 2027. Every model call's cost is in the
public record, and `/spend` shows the totals.

### Which AI model does it use?

Google's `gemini-3.6-flash` by default, through the Gemini API, set by `LEAD_MODEL`
and `SPECIALIST_MODEL`. There is no agent framework: the loop each specialist runs is about 340 lines of
TypeScript ([agents/loop.ts](../../agents/loop.ts)), and the model client is one file. See [how it works](how-it-works.md).

### Can it run on Canadian hosting, or our own servers?

The service and all stored data can: the public site runs on one Fly.io machine in
Toronto, and the same Docker image runs on any container host or a city server. Model
calls are the exception: the Gemini API processes them in the US. For production, use
a Canadian-hosted or on-premises model by replacing the one client file,
[agents/gemini.ts](../../agents/gemini.ts); the checks that decide what residents see
don't depend on the model. See [self-hosting](self-host.md).

### What does it store about people?

Nothing personal by design: no accounts, no cookies, no internet addresses written
anywhere. Staff names are stored on purpose, because a named person approves what is
published. Details: [security and privacy](security-privacy.md).

### What happens if the model is down or the budget runs out?

Briefs, sources, calendars and the record keep working, because none of them call a
model. Questions get a plain message, or, if the model can't be reached, an answer
built by code from the brief's checked statements.

## For judges and the curious

### Why not just a chatbot over the PDFs?

A chatbot can state a wrong figure with confidence, and a city can't publish what it
hasn't checked. Here, quotes are checked against the page by code, staff approve every
statement, and the record of what was said and who approved it can't be changed
quietly. A resident opening a brief triggers no model call at all: what staff approved
is exactly what residents read.

### Why not have a second AI check the first?

A model asked to check another model fails in the same ways: it can "confirm" a quote
that isn't there. String matching in code can't be talked out of its answer, is
cheap, and has tests.

### How good are the answers?

In our latest evaluation run, 6 of 12 test questions passed every check. Five of the
six failures were only the reading grade (9.2 to 12.2 against a limit of 9). Every
citation was found again on its page, no answer gave voting advice, and every question
the documents don't answer was answered as such. Full results: [evaluation](evals.md).

### Is it open source?

The code is public on [GitHub](https://github.com/RichardLi-1/municipal-agents). The
repository does not have a licence file yet, so until one is added, default copyright
applies and it is not formally open source. Third-party parts keep their own licences,
listed in [CREDITS.md](../../CREDITS.md).

### Can another city use it?

Yes. Each city is one settings file (`cities/<id>.json`) plus its documents, decisions
and open data. See [adapt it to your city](adapt-your-city.md).

### How was it built?

At CIVIC Hack 2026 (Future Cities Institute, University of Waterloo), 12 to 14 November
2026. Code and documents were drafted with Claude Code and reviewed by the team; the
product's agents use Gemini at run time. See the [code tour](../code-tour.md#how-ai-was-used-and-how-we-checked-it).
