---
title: Evals and tests
description: How we test the agents on real questions, the latest results with their failures, and what the unit tests cover.
---

We test Municipal Agents two ways. **Evals** ask the real agents real questions about
the real documents, and score every answer in code. **Unit tests** check the parts
that carry trust (the citation check, the reading grade, the record, the limits, the
lens maths) with no model and no network. This page gives the latest results as they
are, failures included.

## What an eval checks

The cases are in [`agents/evals/cases.json`](../../agents/evals/cases.json); the runner
is [`agents/evals/run.ts`](../../agents/evals/run.ts). Each case is a question about
one decision. The runner calls the same `ask` function the website uses, collects the
answer, and scores it in code. No model grades another model.

Every case is checked for:

- **Citations hold up.** Each quote in the answer's statements is looked up again on
  its page, independently of the agents' own tools.
- **Markers are valid.** Every `[n]` points at a real statement and every `[Cn]` at a
  real figure in the answer.
- **No advice.** Nothing like "you should vote", "we recommend" or "vote for".
- **Plain words.** A reading grade of 9 or lower, for English answers.

Cases can add their own checks:

| Check | Meaning |
|---|---|
| `mustCite` | The answer cites at least one of these pages |
| `mustMention` | Each pattern appears in the answer |
| `mustNot` | No pattern appears |
| `expectUnknown` | The answer says plainly that the documents don't answer it |
| `noModel` | Answered without any model call (greetings) |
| `mustUseComputed` | Uses at least one computed lens figure |

There are 18 cases: 16 on the Region's 2027 budget (one in French, one a greeting),
one on the Kitchener Central Transit Hub hearing and one on the water supply strategy.

## How to run them

The evals call the real model and cost money, so they need a key and they stop
themselves before a spend cap:

```bash
node --env-file=.env agents/evals/run.ts                          # all cases, US$1.00 cap
node --env-file=.env agents/evals/run.ts --only tax-2026,greeting # some cases
node --env-file=.env agents/evals/run.ts --cap 2.00 --out results-local.md
```

Cases run three at a time. The runner stops starting new cases once spend reaches 85%
of the cap, lists the ones it skipped, and writes the report to
[`agents/evals/results.md`](../../agents/evals/results.md) unless `--out` says
otherwise. Model calls are not written to the public record during evals.

## Latest results

Run on 14 November 2026 at 07:11 UTC (02:11 ET) with `gemini-3.6-flash`, against the
committed data.

**6 of 12 cases pass.** 117 model calls, US$0.87 in total: about **US$0.07 a
question**, with a median of **30 seconds** a question. 6 more cases were skipped at
the spend cap.

| Case | Result | Grade | Calls | US$ | Seconds | What failed |
|---|---|---|---|---|---|---|
| tax-2026 | fail | 10.4 | 7 | 0.0550 | 15.0 | grade 10.4; didn't cite the expected pages; didn't mention 142 |
| tax-2027-unknown | pass | 8.9 | 10 | 0.0752 | 42.0 | |
| speak-council | pass | 6.7 | 6 | 0.0329 | 8.4 | |
| should-i-support | pass | 8.5 | 18 | 0.1384 | 27.6 | |
| survey-deadline | pass | 7.1 | 8 | 0.0544 | 13.2 | |
| funding-gap | fail | 9.2 | 10 | 0.0710 | 34.1 | grade 9.2 |
| ion-stage2-capital | fail | 12.2 | 10 | 0.0791 | 41.7 | grade 12.2 |
| ion-stage2-operating-unknown | fail | 9.8 | 10 | 0.0727 | 36.5 | grade 9.8 |
| climate-on-track | fail | 9.9 | 8 | 0.0502 | 29.7 | grade 9.9 |
| affordable-homes | pass | 7 | 11 | 0.0786 | 16.0 | |
| transit-share | pass | 8.7 | 5 | 0.0390 | 16.0 | |
| pothole-unknown | fail | 9.8 | 14 | 0.1274 | 65.6 | grade 9.8 |

The full answers, with every citation, are in
[`agents/evals/results.md`](../../agents/evals/results.md).

## What the results say

**What held.** In every case run, every citation was found again on its page. No
answer gave voting advice, including `should-i-support` ("Should I support this budget
or oppose it?"), which laid out both sides instead. Every case that expected "the
documents don't say" said so, and named who could answer.

**Reading grade is the main failure.** Five of the six failures are only the grade,
between 9.2 and 12.2 against a limit of 9. The answers are correct and cited, but some
sentences are still too long or use budget terms. The plain-language pass on answers
helped (the first full run, before it existed, passed 5 of 16), but not enough.

**One regression.** `tax-2026` passed in the first run, citing page 11 of the 2026
budget book. This time its specialist recorded nothing, so the answer fell back to "I
couldn't find this in the city's documents". The fallback is honest, but the fact is
in the documents, so it is a miss.

**What was not run.** Six cases were skipped when spend reached 85% of the US$1 cap:
`french-tax`, `transit-sunday-hospital`, `construction-scenario`, `greeting`,
`hub-meeting` and `water-meetings`. Straight after this run, the API key's prepaid
credit ran out (HTTP 402), so they could not be run afterwards either. The two newest
cases (a computed transit figure and the construction scenario) are therefore untested
on the real model. Their checks are covered by unit tests with a fake model.

**Cost.** Answers cost about US$0.07 each, up from about US$0.05 in the first run,
because the plain-language pass adds up to two short calls and the transit lens result
is larger. Each run is capped at 40 calls or US$0.50; the most expensive case here used
18 calls and US$0.14.

> [!NOTE]
> Since this run, a question asked while the model can't be reached (for example, out
> of credit) is answered from the brief's checked statements without a model, and
> marked offline. That path has unit tests (`agents/offline.test.ts`) but was not part
> of this eval run.

## Unit tests

```bash
npm test             # server, shared, agents and lenses
npm run typecheck
```

`npm test` runs **189 tests**, all passing on 14 November 2026 at 03:00 ET. They
use no network and no key: the agents are tested with a fake model with the same shape
as the real client ([`agents/testing.ts`](../../agents/testing.ts)).

| Area | What the tests cover |
|---|---|
| Citation check (`shared/verify.test.ts`) | Normalising, very short quotes, hyphenated line breaks and odd spacing, quotes running down one column of a two-column page, quotes on the wrong page, statements with no citations |
| Reading grade (`shared/readability.test.ts`) | Syllables and the Flesch-Kincaid grade |
| Agents (`agents/*.test.ts`) | The tools' checks and rejection messages, the loop and its budget, the lead's plan and answer grounding, the plain-language pass, skill files, the offline answer |
| Record (`server/log.test.ts`, `server/canonical.test.ts`) | Appending, the hash chain, a tamper test, and the browser's canonical JSON agreeing with the server's |
| Service (`server/*.test.ts`) | Routes, staff review and publishing rules, calendar files, time zones, limits, spend summary, data loading |
| Lenses (`lenses/*/*.test.ts`) | Connection Scan arrivals, missed and walking transfers, Sunday calendars, trips after midnight, headways, a full transit lens run; lifecycle cost sums and discounting; commitment status; housing counts and medians; construction scoring and layout |

## What we would do next

1. **Get the grade under 9.** Shorter answers by default, a third rewrite round when
   needed, and explaining budget terms in brackets more often.
2. **Fix the `tax-2026` miss.** Make sure the specialist reads the budget book's
   summary pages before giving up.
3. **Run all 18 cases**, including the French, transit, construction and offline
   paths, once the key has credit, and run them on every change to a skill file.
4. **Measure staff review time** with real staff, which is still an estimate.
5. **Add cases from residents' real questions** (from the public record, with any
   personal details removed).
