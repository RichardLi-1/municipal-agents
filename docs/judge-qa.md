# Judge questions and answers

Forty questions the finalist judges are likely to ask, grouped by what each judge cares
about, with a short answer in plain words and the file to open if they ask to see the
code. The pitch script is in [pitch.md](pitch.md).

Judges: Eryn Stewart (managing director, Future Cities Institute), Clarence Woudsma
(transportation planning), Melanie Hains (UX and storytelling), Susan Brown (research
coordination), Pedro Miranda (secure data and consent). The rubric penalises generated
code the team can't explain, so group E is the one to rehearse.

Numbers are quoted as they appear in the README, `docs/architecture.md`,
`docs/code-tour.md`, `agents/evals/results.md` and the files in `data/`, as of
14 November 2026. Line numbers are from the working tree that morning.

## How to answer in three minutes

- Three minutes is six to eight questions. Answer in about 20 seconds: the direct answer
  first, then one number or one limit, then stop.
- If they want code, say "I'll open it" and go to the file and function named under
  **Show**. Have these open in the editor before you go on, in this order:
  1. `shared/verify.ts` (`quoteOnPage`, line 53)
  2. `agents/tools.ts` (`checkCitation`, line 241; `recordStatement`, line 292)
  3. `server/log.ts` (`appendInTx`, line 212; `verifyChain`, line 289)
  4. `lenses/transit/csa.ts` (`earliestArrival`, line 77)
  5. `agents/lead.ts` (`groundAnswer`, line 132)
  6. `agents/offline.ts` (`offlineAnswer`, line 272)
  7. `agents/loop.ts` (`runStep`, line 211)
- If you don't know: "I don't know; here's how I'd find out" is a fine answer. Never
  guess a number.

## Limits to say before they're found

Say these plainly when they come up. Each one is in the docs already.

1. **Evals:** 6 of 12 questions passed in the latest run. All 6 failures were reading
   grade above 9; one (2026 tax) also found nothing to cite. 0 citation failures, 0
   voting advice. 6 more cases were skipped at the spend cap.
2. **The briefs are unreviewed drafts.** No Region staff have reviewed any statement. My
   27 corrections are labelled "Corrected by the Municipal Agents team (not Region staff)".
3. **The model credit ran out** at about 2:20 am ET on 14 November. The site answers from
   replays and checked material since.
4. **The construction scout is illustrative,** not a Region plan; the renders are AI
   illustrations.
5. **Gemini is a US service.** The record is stored in Toronto, but prompts go to the US.
6. **The record can't prove** that whoever runs the server didn't rebuild the whole chain.
7. **Transit walking is straight-line** distance × 1.3, not the street network.
8. **"Verified" means the quote is on the page,** not that the sentence reads it fairly.

---

## A. Planning accuracy (Clarence Woudsma)

### 1. What exactly does the transit lens measure, and why 45 minutes?

For each 400 m grid cell of 2021 census population (2,201 origins and 584,145 people;
rural areas count from their census area's centre), it computes the travel time by GRT
bus, ION and walking to the nearest of eight kinds of essential place (626 points from
OpenStreetMap: hospital, clinic, pharmacy, grocery, school, college, library, community
centre), at weekday 8 am, weekday 10 pm and Sunday 8 am. Travel time is the median over departures every 5 minutes for half an hour, and a
type counts as reached if its nearest one is within 45 minutes; 45 is my stated threshold
from the spec, not a GRT standard. It also finds stop gaps (first trip after 6:30 am, last
before 11 pm, fewer than two departures in the hour) and people beyond 800 m of
15-minute service.

**Show:** `lenses/transit/lens.ts` (`buildTransitLens`, line 170); the `method` and
`limits` fields of `data/lenses/transit-region.json`; `lenses/README.md`.

### 2. You use straight-line walking. Near the 401 or the Grand River that's wrong.

Yes, and the page says so. Walking is straight-line distance × 1.3 at 4.8 km/h, with 800
m to reach a stop and 300 m for transfers, so a home across a highway or river from a stop
looks closer than it is; that overstates access exactly where you'd worry. There's no
allowance for winter, slopes or mobility devices either. The fix is a walking graph from
OpenStreetMap streets; the Connection Scan itself doesn't change, only the access and
transfer times.

**Show:** `lenses/transit/csa.ts` (`DEFAULT_WALK`, line 22; `walkSecs`;
`buildFootpaths`, line 35).

### 3. Are the "possible fixes" GRT proposals? What would they cost?

No. They're candidates computed from the timetable and labelled "not a GRT proposal",
ranked by residents within 800 m of the changed stops who lack that service today: people
near the stops, not expected riders. Bus-hours count trip time only (no layovers,
deadheading or fleet limits), and there's no dollar figure because I had no cited GRT cost
per service hour. The top one, starting route 1 Queen-River by 6:30 am on Sundays, reaches
87,943 people for about 4 more trips and roughly 3 more bus-hours each Sunday.

**Show:** `lenses/transit/lens.ts` (the fixes section, line 460); `fixes` and `limits` in
`data/lenses/transit-region.json`.

### 4. What does it leave out: Saturday, MobilityPLUS, reliability, equity?

It uses the static timetable for one weekday (Tuesday 17 November 2026) and one Sunday (15
November 2026); Saturday isn't computed, and delays, crowding and missed connections
aren't modelled. MobilityPLUS and on-demand service aren't in the GTFS, so they aren't
counted, and headway at a stop counts all routes together. There's no income or equity
overlay yet, only population; adding the low-income share by dissemination area and
comparing each gap with the regional share is the next step I'd take.

**Show:** `limits` in `data/lenses/transit-region.json`; `docs/planner-workflows.md`
section 3.

### 5. Who decides the 2027 budget, and where do your dates come from? Did the AI find them?

From 15 November 2026 the Regional Chair has strong-mayor budget powers (O. Reg. 530/22,
item 203.1, added by O. Reg. 189/26): the Chair proposes by 1 February 2027, then Council
has 30 days to amend, the Chair 10 days to veto, and Council 15 days to override by
two-thirds. The timeline is hand-checked by me against the official pages, with a citation
per date; dates that follow from the rules but aren't published are marked "at the
latest". The agents' draft said "Regional Council decides", so I corrected that statement
and re-checked it on the regulation's pages 3, 17 and 18; it's labelled as my correction.

**Show:** `data/decisions/row-2027-budget.json` (`timeline`, `notices`) and
`row-2027-budget.notes.md`; `data/corrections/row-2027-budget.json` (statement `s22`).

### 6. The cost tab says about $1,393 per household per year. Is that my tax bill?

No, and the page says "not your bill". It's the gross cost of GRT's Business Plan over 25
years, $7.74 billion, of which the upfront $798 million is 10%, divided by 222,426
households (2021 census), with fares and other revenue not subtracted. Every input is
either a figure whose quote was checked on its page (the build stops if one fails) or a
labelled assumption with a slider, such as operating cost held at $262 million a year
after 2034; the discount rate is 0% by default, with 3% as the option.

**Show:** `lenses/cost/build.ts`; `lenses/cost/lifecycle.ts` (`lifecycleCost`, line 78);
`summary` and `inputNotes` in `data/lenses/cost-row-2027-budget.json`.

### 7. Housing: permits aren't completions. How do you define the stages?

For Kitchener, Waterloo and Cambridge together, the lens counts units from the cities'
building permit data: 22,486 at permit issued, 9,464 under construction and 21,416
completed. "Approved" and "site plan" are marked as not tracked, with the reason: only
Kitchener publishes applications, and without unit counts. Approval to permit can't be
measured because the two lists share no file number; progress to the target uses the
province's own count, 15,902 of 70,000 homes from 2022 through 2024.

**Show:** `lenses/housing/build.ts`, `lenses/housing/README.md`,
`data/lenses/housing-region.json` (`stages`, `timeBetween`, `target`).

---

## B. Residents and equity (Melanie Hains)

### 8. How do you know residents actually understand the brief?

I don't yet: I measure readability, not understanding. Code computes the Flesch-Kincaid
grade of the summary and impacts and shows it (7.4, 6.7 and 6.9 for the three briefs,
target 8), with a heuristic syllable counter good to about ±0.5 grade; answers are worse,
with 6 of 12 eval answers above grade 9. A comprehension test with residents, including
screen-reader users and newcomers, is the first thing a pilot should measure.

**Show:** `shared/readability.ts`; `agents/plain.ts` (`rewriteProblem`: a rewrite is kept
only if it reads easier and keeps every number); `agents/evals/results.md`.

### 9. What about people who aren't online?

The pages are light, work on an older phone, need no account, and the dates go into a
calendar file or feed; a city can also put a card on its own website with one script tag.
But the product doesn't reach people offline by itself: community partners and printed
briefs do, and it never replaces phone, in-person channels or the official notice. That's
why "how to take part" lists speaking, writing and the survey with contacts, not only links.

**Show:** `embed/embed.js` (live at /embed/demo); `server/ics.ts`; `docs/requirements.md`
section 7, "Digital divide".

### 10. Machine translation of civic information is risky. How do you handle it?

Translation is on request, from the English brief, with every citation still pointing to
the original page, and it's labelled "Machine translation by AI. The English brief is the
reference." It costs about US$0.009 per language and is cached until the brief changes. No
person reviews translations yet; community review of the region's most common languages is
a next step, and offline answers are only partly translated (English and French lines).

**Show:** `agents/lead.ts` (`translateBriefWith`); `server/routes/agents.ts`
(`cachedTranslation`); `agents/skills/translator/SKILL.md`.

### 11. Is it accessible?

axe-core reports 0 violations on the main pages and every decision tab, at 1280 and 390
px, light and dark. It has keyboard navigation, visible focus, labelled controls, list
equivalents for the map, reduced motion and cooperative gestures on phones. That's
automated testing only: I haven't tested with residents who use assistive technology, and
a formal WCAG 2.2 AA audit is needed before real use.

**Show:** `docs/requirements.md` (NFR-1); `web/src/screens/Decision.tsx` (tab keyboard
handling, `onTabKey`).

### 12. Doesn't "AI-written" undermine trust, or invite over-trust?

Both risks are real, so the status is plain text at the top of every brief: "Draft: not
yet reviewed by city staff", "Drafted by AI agents from the city's documents; every quote
checked in code", and "Not the official notice" with a link. Every figure is one click from
its page, impacts say "may", unknowns get their own tab, and replays and offline answers
say what they are. People may still skim; whether they notice the labels is something the
pilot should test.

**Show:** `web/src/screens/Decision.tsx` (the header badges); `web/src/components/Citations.tsx`.

### 13. Who chose the 11 audiences, and couldn't the agents tilt opinion by what they stress?

The list is fixed in code (renter, homeowner, transit rider, driver, walk or cycle,
business owner, senior, student, parent, disability, newcomer), and the agents write
impacts only where the documents support them. Code refuses advocacy wording, requires
"may" in impacts and both sides in trade-offs, and drops answer sentences that give voting
advice; "Should I support this budget?" passed the eval by declining and giving both
sides. Bias in what gets emphasised can remain, so staff can reject, and the audience list
deserves community review.

**Show:** `agents/tools.ts` (`AUDIENCES`, line 17; `ADVOCACY` and `ruleProblems`, line
111); `agents/lead.ts` (`ADVICE`, used by `groundAnswer`).

---

## C. Privacy, consent and security (Pedro Miranda)

### 14. What personal data do you collect, and how do residents consent?

None by design: no accounts, no sign-in, no tracking scripts. A question is logged with its
text, chosen audiences and language under the actor "visitor", and IP addresses live only
in memory for the 10-minute rate-limit window. Consent is by notice: under the box it says
"Your question is posted, without your name, on the public record. Don't include personal
details." The gap: someone can still type personal details, the public log isn't redacted
automatically and purging is manual; redaction before logging and before the model is
planned.

**Show:** `agents/lead.ts` (`question.asked` in `askWith`, line 322); `server/limits.ts`
(`RateLimiter`); `web/src/components/Chat.tsx` (the notice).

### 15. Questions go to Google in the US. Is that acceptable under MFIPPA?

Today, prompts (public document text and the resident's question) go to Google's Gemini
API, a US service; Google says paid-tier prompts aren't used to improve its products, and
the record, briefs and runs are stored in Toronto. For production a city should use a
Canadian-region or on-premises model and complete a privacy impact assessment. Vertex AI in
Montréal lists Gemini 3.5 and 3.8 Flash but not the 3.6 I used, so a swap means re-running
the evals; it's one client file, and the checks that decide what residents see are code,
so they don't change with the model.

**Show:** `agents/gemini.ts`; `docs/architecture.md` section 6;
`docs/company/trust-and-compliance.md` section 7.

### 16. Can staff see who asked what?

Staff insights are aggregate: counts by day, language, audience and topic, and question
wording only for groups of at least 3 similar questions (50% word overlap or more), with
emails, phone numbers, web addresses, postal codes and long numbers replaced by
"[removed]". Smaller groups are only counted. Questions aren't tied to anyone, though the
raw questions are in the public record, which is the bigger exposure (question 14).

**Show:** `server/routes/insights.ts` (`K_ANONYMITY`, line 23; `redact`, line 71).

### 17. How is staff access secured? Couldn't anyone type any name?

Staff routes need a bearer passcode, and the server compares SHA-256 digests in constant
time. The reviewer's name is typed, not authenticated: anyone with the one shared
passcode could type any name. That's acceptable for a demo, not for production; a pilot
needs the city's single sign-on with individual accounts and roles (drafter, reviewer,
publisher).

**Show:** `server/routes/staff.ts` (`requireStaff`, line 27; `staffActor`).

### 18. What about prompt injection, or someone abusing the question box?

The agents can only read this decision's documents and write into a draft: no browsing,
email or file access. Injected text in a PDF could still steer which true quotes get
picked, but every statement must quote its page, advocacy is refused and staff review
everything; a prompt-injection test set is planned. For abuse: questions are capped at
1,000 characters, 30 model-backed questions per 10 minutes per network, 4 runs at once,
US$0.50 a run and US$5 a day, plus a Content-Security-Policy with per-page script hashes,
HSTS and `nosniff`.

**Show:** `agents/tools.ts` (`TOOLS`, `toolsFor`); `server/limits.ts`;
`server/security.ts`; `server/routes/agents.ts`.

### 19. How do you square an append-only record with records retention?

Each entry's hash covers its payload's own SHA-256, not the payload, and the payload sits
in a separate table. Staff purge one entry's content with a reason; that appends a
`record.purged` entry saying which entry, why and who, blanks the content (and the words
in that run's file), and the chain still verifies. Content missing without a matching purge
entry is reported as tampering, SQLite triggers allow only that one change, and purges are
manual, one at a time.

**Show:** `server/log.ts` (the triggers in `SCHEMA`; `purge`, line 242);
`server/routes/records.ts`.

---

## D. AI reliability and harms

### 20. How often is the AI wrong?

In the four brief runs the citation checker rejected 78 attempts and accepted 116; the
agents fixed most by quoting the right page. In the latest eval run 6 of 12 cases passed:
all 6 failures were over the reading-grade limit of 9 (one, the 2026 tax question, also
found nothing to cite), with 0 citation failures and 0 voting advice, and 6 more cases
were skipped at the spend cap. Reading the drafts myself, I made 27 corrections across the
three briefs (24 edits, 3 withdrawals): that's the clearest measure of what code alone
misses.

**Show:** `agents/evals/results.md`; `agents/evals/run.ts`; `data/corrections/`;
`data/runs/*-brief-*.jsonl`.

### 21. A quote being on the page doesn't make the sentence true.

Correct, and it's the biggest limit. The checker proves the words are on that page, not
that the sentence reads them fairly; code also flags "weak" support when a sentence shares
fewer than 2 meaningful word stems and no non-date number with its quotes, but that counts
words, it doesn't understand meaning. Examples I caught by reading: a water statement whose
quote was about staffing, which I re-cited, and an impact saying renters pay regional
water rates with no source, which I withdrew. Staff review is the control.

**Show:** `agents/tidy.ts` (`supportOf`, line 32); `agents/tools.ts` (`sharesWords`, line
202); `data/corrections/row-water-supply-2051.json` (`s5`, `s6`).

### 22. Your model credit ran out. What happened?

The prepaid Gemini credit ran out at about 2:20 am ET on 14 November (HTTP 402).
Residents see a plain "The agents can't be reached right now", never the provider's
error, and get either a replay of a real cited answer to the same question or an offline
answer built only from checked material: brief statements staff didn't reject, the
hand-checked timeline, computed lens results, then exact quotes from the documents, then
the Clerk's contact. The limits: no fresh research until billing is back, weaker relevance
for complex questions, and production needs billing alerts.

**Show:** `agents/errors.ts` (`isUnreachable`, line 10); `agents/offline.ts`
(`offlineAnswer`, line 272); `server/runfiles.ts` (`findCachedAnswer`, line 175).

### 23. Could a replay give the right answer to the wrong question?

Rarely. A replay needs the same decision, language and audiences, exactly the same
numbers in the question, and at least 85% word overlap, and only runs that produced a real
cited answer qualify (no offline answers, no "couldn't find"). A near-identical question
with a different intent could still match, so every replay is labelled with when it was
first answered.

**Show:** `server/runfiles.ts` (`sameQuestion`, line 113; `answerOf`, line 131).

### 24. Is it responsible to have unreviewed drafts live? Who's accountable?

It's a demo on public documents, and every page says draft and "not the official notice",
with a link to the notice; no Region staff have reviewed any statement. My corrections are
labelled "Corrected by the Municipal Agents team (not Region staff)", and each one is a
`statement.reviewed` entry by `operator:municipal-agents-team` in the public record. Every
statement has a "Report an error" link (my GitHub issues in the demo; a city points it at
its own channel), and real use needs the municipality's legal review.

**Show:** `shared/corrections.ts`; `server/corrections.ts`;
`web/src/components/Citations.tsx` (the report link).

---

## E. Code awareness

### 25. Walk me through how a citation is checked.

An agent calls `record_statement` with a sentence and citations (source id, page, quote).
`checkCitation` refuses a source that isn't one of this decision's, a page that doesn't
exist, a quote with "..." or one under 8 characters; then `verifyCitation` calls
`quoteOnPage`, which normalises both texts (NFKC, curly quotes, dashes, soft and
line-break hyphens, case, spacing) and looks for the quote as a substring, then with all
spaces removed, then word by word, in order, across the columns of a two-column page. Then
code checks the wording rules, that every number in the sentence is in a quote, and that
the sentence shares words with its quotes; only then is it stored as verified, and every
rejection is logged with its reasons. The same `verifyCitation` runs again on staff edits,
on my corrections, when the cost lens is built and in the evals.

**Show:** `agents/tools.ts` (`recordStatement`, line 292; `checkCitation`, line 241);
`shared/verify.ts` (`quoteOnPage`, line 53; `matchAcrossColumns`, line 154);
`shared/verify.test.ts`.

### 26. What happens if the model paraphrases a quote?

It fails: nothing is fuzzy, every word must be there, in order. The model then gets a
reason it can act on: if the exact quote is on another page, "That quote is on page 2 of
wr-ghg-inventory-2022, not page 3. Cite page 2."; if it's in another source, which one;
otherwise the closest line on the cited page. It can retry within its call budget; if it
never fixes it, the statement never enters the brief, and the attempt stays in the record
as `statement.rejected`.

**Show:** `agents/tools.ts` (`checkCitation`, line 241; `closestLine`, line 225);
`shared/verify.ts` (`findQuotePages`, line 78); the real example in
`data/runs/20261114T064913Z-brief-77113e.jsonl`.

### 27. How does the hash chain work, and what can't it prove?

Each append runs in one `BEGIN IMMEDIATE` transaction: the payload's canonical JSON (keys
sorted, no spaces) is hashed to `payloadHash`, and the entry's hash is SHA-256 of the
previous hash plus the canonical header {seq, at, actor, kind, decisionId, payloadHash},
starting from 64 zeros. Triggers refuse UPDATE and DELETE; the server and your browser
(Web Crypto) both recompute every hash, and a test checks their two canonical-JSON
implementations agree, so changing any past entry breaks every later hash. It can't prove
that whoever runs the server didn't rebuild the whole chain or cut entries off the end,
that the clock was right, or that everything was logged: the current briefs were drafted
from the command line, whose log is a local file, and their run files were rebuilt from
that output and say so. Publishing the head hash on a schedule somewhere the city doesn't
control alone would catch rebuilds and truncation; it isn't built yet.

**Show:** `server/log.ts` (`appendInTx`, line 212; `verifyChain`, line 289);
`server/canonical.ts`; `web/src/lib/hash.ts`; `server/canonical.test.ts`;
`server/log.test.ts` (tamper and purge tests); live check at /api/log/verify.

### 28. How does Connection Scan work?

For one service day I turn the GTFS into connections, one per pair of consecutive stops on
a trip with its departure and arrival times, sorted by departure. From an origin, stops
within 800 m get a walk-in time; then I scan the connections once, in order: a connection
is usable if its trip is already boarded or I can be at its departure stop in time
(respecting no-pickup and no-drop-off flags), and when it improves the arrival at its stop
I relax walking transfers to stops within 300 m, with 60 seconds to change vehicles. It's
one pass with no priority queue, linear in connections, stopping 90 minutes after
departure; it gives earliest arrival only, not fewest transfers, and I run it from each of
2,201 origins for 6 departures and 3 scenarios and take the median.

**Show:** `lenses/transit/csa.ts` (`earliestArrival`, line 77); `lenses/transit/gtfs.ts`
(`buildDay`, line 159); `lenses/transit/transit.test.ts`.

### 29. Which parts did AI write, and how did you check them?

Most of the TypeScript, the data pipelines, the skill files and the docs were drafted with
Claude Code (Claude Opus 5.5) under my direction, and I reviewed every change before
committing; at run time the agents use Gemini 3.6 Flash, and the construction pictures were
made once with Gemini's image model. I decided the product rules and that code enforces
them, chose the decisions and documents, checked every timeline date by hand, and made the
architecture choices. I checked the code with 205 tests on the parts that carry trust
(citation checker, canonical JSON in browser and server, chain tamper and purge, review
rules, answer cache, offline answers, limits, the Connection Scan and lens maths), strict
type checking, evals on real documents and a smoke test of the live site, and by reading
the output, which is how I found the weak statements and wrote the 27 corrections. I won't
claim I typed every line, but I can walk you through any line between a question and a
cited answer.

**Show:** `docs/code-tour.md` ("How AI was used and how we checked it"); `CREDITS.md`;
`npm test`.

### 30. How do you stop the written answer from adding numbers?

The lead writes the answer only from numbered, verified statements. Then `groundAnswer`
splits it into sentences, drops any with voting advice, drops any sentence that states a
number without a valid [n] marker unless the number appears in a cited statement or the
hand-checked timeline, renumbers the markers and keeps only cited statements. A sentence
that carries markers is checked number by number against exactly what those markers cite
(the statements' text and quotes, or the computed figures), with the same thousands and
millions handling as the citation check. One honest gap: it's a text match, so a short
number like "5" can pass by coincidence.

**Show:** `agents/lead.ts` (`groundAnswer`); `agents/lead.test.ts` (a "64" cited to the
wrong statement and a "52%" cited to a 48% figure are both dropped).

### 31. Can the model invent a transit or cost figure?

The maths runs before deployment in code (Connection Scan, lifecycle cost, the commitments
straight-line test, housing stages), and the agents only read results through tools. To
put a computed number in a brief, the agent must call `record_computed_figure`, and code
checks the number appears in a lens result it looked up in this run (allowing for "$
thousands" scaling) and that the value and display agree within 1%. For the cost lens,
each input must be a cited figure with a matching value, or a stated assumption, or the
build is refused.

**Show:** `agents/tools.ts` (`record_computed_figure`, line 862; `build_lifecycle_cost`;
`transit_gaps`); `lenses/commitments/status.ts` (`commitmentStatus`, line 37).

### 32. Walk me through the agent loop. Why no framework?

`runStep` builds the system prompt from `RULES.md`, the specialist's `SKILL.md` and the
decision's metadata, then loops: call the model, run any tools it asked for, send the
results back, and stop when it stops asking, hits its step limit or the run's budget is
gone. Every model call goes through `budgetedCall`, which counts, prices and logs it; a run
stops at 40 calls or US$0.50 with a reserve for the lead's answer, and calls running in
parallel are priced pessimistically until they return. Old page text is trimmed from the
history to keep calls cheap; it's about 300 lines, so I can show exactly what the model is
told and can do, which a framework would hide.

**Show:** `agents/loop.ts` (`Budget`, line 15; `budgetedCall`, line 112; `runStep`, line
211); `agents/lead.ts` (`askWith`, line 322; `generateBriefWith`, line 548);
`agents/skills/RULES.md`.

### 33. Your corrections: aren't you just editing the AI's output by hand?

Yes, but in public. Each correction lives in a committed file per decision with a note,
who and when; every corrected quote must pass the same `verifyCitation` or it's refused;
residents see the label; it goes on the record once, keyed by a hash of the correction;
and a named staff member's review always overrides mine. My corrections never count as a
staff review: publishing needs a named staff member to have reviewed every statement a
resident will see, including the sentences inside precomputed lens files (like the cost
lens), so the 409 lists them until staff approve, edit or reject each one.

**Show:** `shared/corrections.ts` (`applyCorrections`, line 55); `server/corrections.ts`;
`server/statements.ts` (`unreviewed`, line 38); `server/routes/staff.ts` (publish);
`data/corrections/row-2027-budget.json`.

---

## F. Feasibility, cost and procurement (Eryn Stewart)

### 34. What would it cost a city, and how would it buy it?

Measured model fees: US$0.24 to 0.37 for a full brief with five lenses (about 40 calls),
about US$0.05 to 0.07 a question, nothing for a repeated question, about US$0.009 per
translation, and hosting about US$7 to 10 a month. A year for one city (50 briefs, 5,000
questions) is about US$360 to 500 at 2026 model prices and US$630 to 870 from 2027, when
Gemini's prices double; staff time is extra. My proposed prices are a CA$7,500 90-day pilot
(a low-value purchase under most Ontario by-laws), then CA$12,000 a year for a town,
CA$36,000 for a city and from CA$96,000 for a region; a three-year city contract
($108,000) stays under the CFTA threshold of $139,000. Nobody has paid these prices: I have
no customers or letters of intent yet.

**Show:** `docs/architecture.md` section 7; `docs/company/pricing.md`; the README cost
table.

### 35. Won't reviewing every statement take staff longer than writing it?

That's the main thing a pilot has to measure. Statements arrive already checked, each with
its quote and page beside it (the budget brief has 30), and staff approve, edit or reject
one at a time; replaying a run costs nothing. My estimate is 30 to 60 minutes a brief, but
I haven't measured it with real staff.

**Show:** `web/src/screens/Staff.tsx`; `server/routes/staff.ts`; `docs/requirements.md`
section 7, "Staff workload".

### 36. You're one student. Why would a city depend on this?

I built it so a city IT team can own it: one Node 24 process, no web framework, no runtime
dependencies at the server root, one container, data as plain files plus one SQLite file,
an MIT licence, and every decision written down (requirements, eleven UML diagrams,
architecture, a code tour). It runs on the city's own server as easily as on Fly.io. The
realistic path is a supported pilot, for example through FCI's CIVIC co-op program, before
any long contract.

**Show:** `docs/architecture.md` (D1); `Dockerfile`; `fly.toml`; `package.json`.

---

## G. Scale and other cities

### 37. How would another city adapt it?

For the brief and the cost and commitments lenses it's files: a `cities/<id>.json`
settings file, its PDFs turned into page text with `npm run sources`, one hand-checked
decision file per decision, and some wording in the skill files; my estimate is about two
days. Transit needs no code: the city file lists its GTFS feeds (`gtfsUrls`) and its
Statistics Canada census division, and `node lenses/transit/build.ts --city <id>` does
the rest (Canadian cities only, since population comes from Statistics Canada). Housing
means mapping each permit portal's fields, a small function per portal and the biggest job. Scanned PDFs need OCR first,
which isn't built; several cities can share one deployment.

**Show:** `docs/guide/adapt-your-city.md`; `cities/waterloo-region.json`;
`lenses/transit/fetch.ts` (`--city`); `server/routes/cities.ts`.

### 38. Will it scale?

Reading a brief makes no model call: it's stored JSON, so it can sit behind a CDN, and the
cost per decision is small and linear. Questions are limited per network, 4 runs at once
and US$5 a day, and repeats are free, so the cost per question falls as common questions
repeat; next would be agent runs as queued jobs. The record is SQLite with one writer; for
several instances it moves to Postgres with the same serialised append and hash format,
and search moves from in-memory BM25 to SQLite FTS5 for thousands of pages. I haven't
load-tested it.

**Show:** `docs/architecture.md` section 4; `server/limits.ts`; `agents/corpus.ts`.

---

## H. What's next (Susan Brown, Eryn Stewart)

### 39. What would a pilot measure, and how would you run it as research?

On one live decision: staff review minutes per brief, reading grade, citation errors
caught before publication, residents' views, questions and calendar adds, and errors
residents report, with success criteria written down before we start. Comprehension
testing with residents, including screen-reader users and newcomers, ideally run by a
CIVIC co-op student so the measurement is independent of me. The eval suite (18 cases
scored in code) grows with each city's real questions, and I'd publish the results
whatever they show.

**Show:** `agents/evals/cases.json`; `docs/company/go-to-market.md` sections 1.4 and 2.4;
`docs/company/roadmap.md`.

### 40. What's the biggest risk, and what do you build next?

The biggest risk is a statement that passes the checker but misleads, and people trusting
it because it looks official; staff review, the labels and the record are the controls,
and the pilot tests whether they're enough. Next, in order: a pilot with one clerk's
office; a Canadian-hosted model with a privacy impact assessment; staff single sign-on;
publishing the record's head hash outside our control; redacting personal details before
logging; billing alerts; then OCR and agenda-system ingestion, so a brief starts the day an
agenda is published.

**Show:** `docs/architecture.md` section 8; `docs/company/roadmap.md`.
