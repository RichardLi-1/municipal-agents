# Municipal Agents: demo video script

Generated from `storyboard.json` by `npm run script`; edit the storyboard, not this file.

- **Music:** “Bass Brain”, Dresage x Hark Madley. 116 BPM, 4/4, first downbeat 0.576 s, 70 bars, last hit 143.33 s, file 146.333 s.
- **Video:** 1920×1080, 30 fps, 4390 frames (2:26.3), the length of the song. Under the 3-minute limit.
- **Cues** are bar.beat (bar.beat.5 is the off-beat). `src/timing.ts` rounds each beat to its nearest frame, so nothing drifts.
- **Honesty:** scenarios are tagged (fictional resident, fictional clerk, illustrative construction scenario); sped-up clips say “4× speed”; every number on screen comes from the product or a source page listed below. Words on screen carry no numbers except “191 pages” (the real budget book) and the WCAG level.
- **Stand-ins:** until a clip is recorded the video shows a labelled card, “Footage: <what>”, so it renders end to end.

## Story

1. **Hook (bars 1-4).** A laptop opens on the Region of Waterloo's real 2026 budget book; 191 pages flip past and pull back into a grid. Title on the dip.
2. **One resident, one real decision (bars 5-26).** The Region of Waterloo 2027 Plan and Budget: find it, understand it (every figure to its page), how it affects me, when I can have a say, ask anything, the transit lens. Tagged “Scenario: fictional resident”.
3. **First drop (bars 27-35).** A question in the near-silence, then the cost lens, the construction scout (tagged as an illustrative scenario), commitments and housing, cut on the beat.
4. **Breakdown (36-39).** Part A of the return slip is stamped complete on the first beat; then unknowns, trade-offs both ways, possible harms.
5. **City staff (40-47).** A clerk drafts with agents; a quote not on its page is rejected; staff approve, edit, reject; a named person publishes. Agents never decide.
6. **The record and spend (48-51).** Hash-chained log, chain intact; every model call costed.
7. **Who it's for and how it travels (52-59).** Residents and the people who serve them; any language, light and dark, any screen, keyboard and screen reader; another city is one config file.
8. **Under the hood and the final drop (60-69).** Requirements, UML, architecture, code tour, tests, evals, Lighthouse, credits, the readiness report, this video; every remaining box ticks on the beat.
9. **End (70).** The lid closes on the last hit. End card.

## The return slip

A paper civic form, “CIVIC Hack 2026 · Return slip”, Part A (the challenges) and Part B (the judging criteria). Each box is ticked in blue ballpoint on the beat right after it is shown working, with the time it was shown written beside it.

| Box | Ticked at | Scene |
|---|---|---|
| 1a. Understand the proposed decision | 12.3 (0:24.4) | source |
| 1b. How it could affect me | 15.4 (0:31.1) | opinion |
| 1c. When I can have a say | 18.3 (0:36.8) | slip-1 |
| 2. Gaps in transit access | 26.4 (0:53.9) | transit |
| 3. Long-term infrastructure costs | 29.4 (1:00.1) | costs |
| 4. Tracking commitments | 34.1 (1:08.9) | commitments |
| 5. Housing: approval to construction | 35.3 (1:12.0) | housing |
| Problem understanding & stakeholders | 53.4 (1:49.7) | who |
| Design & clarity | 57.4 (1:58.0) | a11y |
| Impact & adaptability | 59.4 (2:02.1) | for-cities |
| Requirements & UML | 62.4.5 (2:08.6) | drop |
| Architecture & scalability | 63.4.5 (2:10.7) | drop |
| Source code awareness | 64.4.5 (2:12.7) | drop |
| Quality & functionality | 65.4.5 (2:14.8) | drop |
| References | 66.4.5 (2:16.9) | drop |
| Municipal Readiness Report | 67.4.5 (2:18.9) | drop |
| Demo video | 68.4.5 (2:21.0) | drop |

## Scenes

### hook-laptop · bars 1 · 0:00.0 to 0:02.6

- **Music:** groove (dip at 4)
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** laptop-open
- **Action:** Pre-roll on white with the laptop closed. The lid opens on the first downbeat; the camera pushes into the screen, which shows the real budget book's cover.

### hook-pages · bars 2-3 · 0:02.6 to 0:06.8

- **Music:** groove (dip at 4)
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** pdf-flip
- **Words:**
  - 2.1 to 2.3: “The 2026 budget book.”
  - 2.3 to 3.1: “191 pages.”
  - 3.1 to 4.1: “Who has time?”
- **Facts and sources:**
  - 191 pages: `data/sources/row-2026-budget-book.pdf (Region of Waterloo, 2026 Final Budget Book, the base for the 2027 budget)`, page pdfinfo Pages: 191; data/sources/index.json pages 191; data/decisions/row-2027-budget.notes.md
- **Action:** Every page of the real 2026 budget book (pdftoppm), flipping faster and faster.

### title · bars 4 · 0:06.8 to 0:08.9

- **Music:** groove (dip at 4)
- **Shot:** title
- **Words:**
  - 4.1 to 5.1: “Municipal Agents” (title)
  - 4.2.5 to 5.1: “A city decision, in five minutes.” (subtitle)
- **Facts and sources:**
  - a brief a resident can read in five minutes: `docs/spec.md`, page One sentence
- **Action:** The dip at bar 4. Name and the promise; nothing else.

### find · bars 5-8 · 0:08.9 to 0:17.1

- **Music:** groove (dip at 8)
- **Step label:** Step 1 of 5 · Find it
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** footage `home`: Decisions page: the region map, decision cards with countdowns; type a street; click the 2027 budget card
- **Camera:** 5.1 zoom 1 at (0.5, 0.5) → 5.3 zoom 1.5 at (0.18, 0.28) → 6.3 zoom 1.5 at (0.18, 0.3) → 7.1 zoom 1.35 at (0.25, 0.6) → 7.3 zoom 1.6 at (0.2, 0.88) → 8.3 zoom 1.8 at (0.2, 0.9) → 8.4 zoom 2.3 at (0.2, 0.92)
- **Words:**
  - 5.1 to 6.3: “One resident. One decision.”
  - 6.3 to 7.3: “What's decided near me?”
  - 7.3 to 8.4: “The next chance, counted down.”
- **Facts and sources:**
  - Decisions on the home page: Region of Waterloo 2027 Plan and Budget; Water Supply Strategy update; Kitchener Central Transit Hub variances: `data/decisions/*.json`, page titles
- **Action:** Decisions page (/decisions): map of the region, decision cards (2027 budget, Water Supply Strategy, Kitchener Central Transit Hub) with 'next chance to have a say' countdowns. She types her street; she clicks the 2027 budget card on 8.4 (the dip) and the camera dives into it.

### understand · bars 9-10 · 0:17.1 to 0:21.3

- **Music:** groove (dip at 8)
- **Step label:** Step 2 of 5 · Understand it
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** footage `overview`: Decision brief, Overview tab: plain summary, reading grade, review status
- **Camera:** 9.1 zoom 1.6 at (0.18, 0.18) → 9.2.5 zoom 1.9 at (0.2, 0.27) → 9.4 zoom 1.9 at (0.2, 0.27) → 10.3 zoom 1.6 at (0.18, 0.9) → 10.4 zoom 1.7 at (0.18, 0.92)
- **Words:**
  - 9.1 to 9.3: “In plain words.”
  - 9.3 to 10.3: “Reading grade, measured.”
  - 10.3 to 11.1: “Every correction, labelled.”
- **Facts and sources:**
  - Decision: Region of Waterloo 2027 Plan and Budget; decided by Regional Council: `data/decisions/row-2027-budget.json`, page title, decidedBy
  - Staff framing: 'a stability-focused budget': `data/sources/row-2027-budget-page.pdf`, page 6
- **Action:** Overview tab: the header (plain title, 'Draft: not yet reviewed by city staff', 'Grade 7 reading level', 'Register to speak by Wed, Dec 9, 12:00 p.m.'), then 'What's proposed', whose statements carry 'Corrected by the Municipal Agents team' labels where the team fixed them.

### source · bars 11-12 · 0:21.3 to 0:25.4

- **Music:** groove
- **Step label:** Step 2 of 5 · Understand it
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** footage `source`: Click a figure: the source viewer opens on its PDF page with the quote highlighted
- **Camera:** 11.1 zoom 1.7 at (0.2, 0.5) → 11.2.5 zoom 1.7 at (0.2, 0.5) → 11.3 zoom 1.05 at (0.5, 0.5) → 12.3 zoom 1.5 at (0.45, 0.62)
- **Words:**
  - 11.1 to 11.3: “Every figure.”
  - 11.3 to 12.3: “Its page, highlighted.”
- **Ticks:** 1a. Understand the proposed decision at 12.3
- **Facts and sources:**
  - $3,473.86: 2026 annual cost of regional services per average household (Total row), page 11 of 191: `data/sources/row-2026-budget-book.pdf`, page 11
- **Action:** She clicks the key figure '$3,473.86' (2026 total regional bill for an average home): the source viewer opens the 2026 Final Budget Book at page 11 of 191 with the Total row highlighted and 'Quote found and highlighted'.

### affects · bars 13-14 · 0:25.4 to 0:29.5

- **Music:** groove
- **Step label:** Step 3 of 5 · How it affects me
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** footage `affects`: Affects you: tap Renter and Transit rider; cited impacts appear
- **Camera:** 13.1 zoom 1.7 at (0.18, 0.22) → 14.1 zoom 1.6 at (0.18, 0.45) → 14.4 zoom 1.5 at (0.18, 0.55)
- **Words:**
  - 13.1 to 14.1: “Pick who you are.”
  - 14.1 to 15.1: “See what may change.”
- **Action:** Affects you tab: she taps 'Renter' and 'Transit rider'; the cited impacts appear, in 'may' language with uncertainty.

### opinion · bars 15 · 0:29.5 to 0:31.6

- **Music:** lift (lift at 16, then 17-18 quiet)
- **Step label:** Step 3 of 5 · How it affects me
- **Tags:** “Scenario: fictional resident”, “Replay of a real run”
- **Shot:** footage `ask-opinion`: Ask 'Should I support this budget or oppose it?': the recorded answer (after ~3 s) lays out both sides and does not take one; replay label visible
- **Camera:** 15.1 zoom 2.2 at (0.885, 0.3) → 15.4 zoom 2.3 at (0.885, 0.36)
- **Words:**
  - 15.1 to 16.1: “Not what to think.”
- **Ticks:** 1b. How it could affect me at 15.4
- **Facts and sources:**
  - Question asked: "Should I support this budget or oppose it?" (a replayable real run): `live app, row-2027-budget chat`, page answer labelled 'Answered by the agents on <time> · replayed from the record'
- **Action:** Insert: in the chat she asks "Should I support this budget or oppose it?"; the agents' recorded answer lays out the trade-offs and declines to tell her what to think. Clip starts (in-point) where the answer appears; the replay label stays in frame.

### say · bars 16-18 · 0:31.6 to 0:36.3

- **Music:** lift (lift at 16, then 17-18 quiet)
- **Step label:** Step 4 of 5 · Have your say
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** cuts: `say` at 16.1; `say` at 17.4
- **Words:**
  - 16.1 to 17.1: “When you can have a say.”
  - 17.1 to 18.1: “How to take part.”
  - 18.1 to 18.2: “Add to calendar.”
- **Facts and sources:**
  - 16 Dec 2026: Regional Council, 2027 Plan and Budget Overview (first look at the draft): `data/sources/row-2027-budget-page.pdf`, page 7
  - Online survey open until 26 Feb 2027, 11:59 pm: `data/sources/row-2027-budget-contest-rules.pdf`, page 1
  - Register to speak by noon one week before the meeting (so 9 Dec is computed, not published): `data/sources/row-delegation-guide.pdf`, page 1-2
  - Strong-chair powers from 15 Nov 2026; the Chair proposes the 2027 budget by 1 Feb 2027: `data/decisions/row-2027-budget.json (timeline, being added by research)`, page check the citation page when it lands
- **Action:** Have your say tab: the ways to take part (survey, delegation, write, watch), then the timeline (survey, the Chair's strong-mayor powers from 15 Nov, the 16 Dec Council overview) scrolling to the next chance: '25 days' with how to take part (Speak, deadline, contact). Cut on 17.4 to her clicking 'Add to calendar' on 18.1.

### slip-1 · bars 18 · 0:36.3 to 0:37.8

- **Music:** lift (lift at 16, then 17-18 quiet)
- **Shot:** slip
- **Ticks:** 1c. When I can have a say at 18.3
- **Action:** First full view of the return slip, in the quiet: 1a and 1b already ticked, 1c ticks on beat 3.

### ask · bars 19-22 · 0:37.8 to 0:46.1

- **Music:** groove
- **Step label:** Step 5 of 5 · Ask anything
- **Tags:** “Scenario: fictional resident”, “Replay of a real run”, “2× speed”
- **Shot:** footage `ask`: Ask: type exactly 'How much of my regional tax bill goes to public transit?'; a real run replays from the record (plan, specialist steps, checked statements, ~8 s), then the answer with 'Answered by the agents on <time> · replayed from the record'. Recorded at 1x, sped up 2x
- **Camera:** 19.1 zoom 2.2 at (0.885, 0.92) → 20.1 zoom 2.3 at (0.885, 0.2) → 21.3 zoom 2.2 at (0.885, 0.3) → 22.3 zoom 2 at (0.885, 0.36)
- **Words:**
  - 19.1 to 20.1: “Ask anything.”
  - 20.1 to 21.1: “A lead agent plans it.”
  - 21.1 to 22.3: “Real agents. Real documents.”
- **Facts and sources:**
  - Answer: public transit 17.6% of the Region's property tax levy; $582 for an average urban household and $63 for a rural one in 2026 regional taxes: `data/sources/row-2026-budget-book.pdf`, page 12
- **Action:** Chat pane: she types exactly "How much of my regional tax bill goes to public transit?"; the app replays a real agent run from the record: the plan, the specialists' steps, the checked statements one by one (~8 s), then the cited answer with its label "Answered by the agents on <time> · replayed from the record" (kept in frame at the end). Recorded at 1x and sped up 2x (tagged).

### transit · bars 23-26 · 0:46.1 to 0:54.4

- **Music:** groove
- **Step label:** Lens 1 of 4 · Transit
- **Tags:** “Real data: GRT and ION schedules (GTFS)”
- **Shot:** cuts: `transit` at 23.1; `transit` at 24.3; `transit` at 26.1
- **Words:**
  - 23.1 to 24.1: “Transit gaps, mapped.”
  - 24.1 to 25.1: “Sunday mornings, before 6:30.”
  - 25.1 to 26.1: “The last 800 metres.”
  - 26.1 to 27.1: “Fixes ranked. Trade-offs stated.”
- **Ticks:** 2. Gaps in transit access at 26.4
- **Facts and sources:**
  - Gap: 'On Sundays, 462,606 people have no bus or train within 800 m before 6:30 am': `data/lenses/transit-region.json (GRT and ION GTFS)`, page gaps[0]
- **Action:** Transit tab: stops, essential destinations, gaps in red; switch the time of day; the first/last-mile layer; the ranked fixes with their trade-offs.

### cost-question · bars 27 · 0:54.4 to 0:56.4

- **Music:** silence
- **Shot:** footage `costs`, blurred under a white veil: Cost lens: stacked lifecycle chart; drag a slider; per household recomputes; discount toggle
- **Camera:** 27.1 zoom 1.3 at (0.3, 0.4) → 28.1 zoom 1.25 at (0.3, 0.4)
- **Words:**
  - 27.1 to 28.1: “What will it really cost?” (hero)
- **Action:** Near silence: one question in big type over the cost lens, blurred under a white veil; a word per half-beat. The veil snaps away on the drop.

### costs · bars 28-29 · 0:56.4 to 1:00.6

- **Music:** drop
- **Step label:** Lens 2 of 4 · Costs
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** cuts: `costs` at 28.1; `costs` at 29.3
- **Words:**
  - 28.1 to 28.3: “The upfront price.”
  - 28.3 to 29.1: “Plus decades of upkeep.”
  - 29.1 to 29.3: “Move a slider.”
  - 29.3 to 30.1: “Per household, per year.”
- **Ticks:** 3. Long-term infrastructure costs at 29.4
- **Facts and sources:**
  - $1,393 per household per year; $7,744 million lifetime over 25 years; $798 million upfront (GRT Business Plan, product-computed with cited inputs): `live app, row-2027-budget Costs tab; data/sources/grt-business-plan-2025*.pdf`, page per the tab's cited figures
- **Action:** Cost lens (GRT Business Plan lifecycle): per household per year $1,393, lifetime cost over 25 years $7,744 million, upfront $798 million, with the stacked chart. She drags 'Years counted' to 50 years; the headline recomputes to $1,285 a year and $14,294 million, marked 'With your assumptions'.

### scout · bars 30-32 · 1:00.6 to 1:06.8

- **Music:** drop
- **Step label:** Construction scout
- **Tags:** “Illustrative scenario: not a Region plan”, “Renders: AI-generated”
- **Shot:** cuts: `scout-map` at 30.1; `scout-section` at 31.1; the scout's seven stage renders (data/renders), stepping 1 to 7, from 31.3
- **Words:**
  - 30.1 to 30.3: “ION under the 401?”
  - 30.3 to 31.1: “Agents scout launch sites.”
  - 31.1 to 31.3: “49 boreholes. 11 cross-passages.”
  - 31.3 to 32.3: “Seven steps, each rendered.”
  - 32.3 to 33.1: “Then the land goes back.”
- **Facts and sources:**
  - Scenario: 'What if ION Stage 2 went under Highway 401 and the Speed River? A 2.9 km twin-bore tunnel between Sportsworld and Preston', labelled 'Illustrative scenario: not a Region plan': `data/lenses/construction-row-2027-budget.json`, page scenario.title, scenario.label; numbers.sectionLengthM 2895
  - 49 boreholes, 11 cross-passages, 2,828 m bored, 7 steps: `data/lenses/construction-row-2027-budget.json`, page boreholes (49), crossPassages (11), numbers.boredLengthM, steps
  - ION Stage 2 (project 68030 'RT to Cambridge') in the 10-year capital forecast: `data/sources/row-2026-budget-book.pdf`, page 43
  - Renders made with gemini-3.1-flash-image; the app captions each 'Illustrative render · not a design': `data/renders/construction-renders.json; web/src/construction/ConstructionPanel.tsx`, page model, figcaption
- **Action:** The flashiest beat of the first drop, on row-2027-budget's Construction tab. Bar 30: the map with the ranked candidate launch and extraction sites, the twin bores, boreholes and cross-passages. 31.1: the long-section with the animated TBM. 31.3 to 33.1: stepping 1 to 7, each step's render zooming past (about one every 0.86 beat) under the product's own step title, from 'Drill boreholes to read the ground' to 'Fit out, then give the land back'. The renders are the product's own files (data/renders); the recorder also captures the map flying between steps (clip scout-steps) if we'd rather cut to that.

### commitments · bars 33-34 · 1:06.8 to 1:09.9

- **Music:** drop
- **Step label:** Lens 3 of 4 · Commitments
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** footage `commitments`: Commitments lens: status pills; expand one; what's still unclear
- **Camera:** 33.1 zoom 1.5 at (0.18, 0.35) → 33.3 zoom 1.7 at (0.18, 0.42) → 34.1 zoom 1.7 at (0.18, 0.78)
- **Words:**
  - 33.1 to 33.3: “Promises, tracked.”
  - 33.3 to 34.1: “On track? Behind?”
  - 34.1 to 34.3: “What's still unclear.”
- **Ticks:** 4. Tracking commitments at 34.1
- **Action:** Commitments lens: each commitment with its status pill; expand one for the cited progress and 'What's still unclear'.

### housing · bars 34-35 · 1:09.9 to 1:13.0

- **Music:** drop
- **Step label:** Lens 4 of 4 · Housing
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** footage `housing`: Housing lens: units by stage, approval to completion; untracked stages
- **Camera:** 34.3 zoom 1.5 at (0.18, 0.6) → 35.1 zoom 1.5 at (0.18, 0.55) → 35.3 zoom 1.8 at (0.18, 0.25)
- **Words:**
  - 34.3 to 35.1: “Approved isn't built.”
  - 35.1 to 35.3: “Units, stage by stage.”
  - 35.3 to 36.1: “Where the trail goes dark.”
- **Ticks:** 5. Housing: approval to construction at 35.3
- **Action:** Housing lens: units by stage from approval to completion; the stages with no public data drawn as untracked.

### slip-2 · bars 36 · 1:13.0 to 1:14.0

- **Music:** quiet
- **Shot:** slip
- **Action:** The first beat of the quiet breakdown: the slip, Part A all ticked, and the stamp lands on the downbeat.

### unknowns · bars 36-39 · 1:14.0 to 1:21.3

- **Music:** quiet
- **Step label:** The brief · Unknowns & trade-offs
- **Tags:** “Scenario: fictional resident”, “Real data: Region of Waterloo”
- **Shot:** footage `unknowns`: Unknowns & trade-offs: what the documents don't answer, who can; trade-offs both ways; harms. Slow scroll
- **Camera:** 36.3 zoom 1.4 at (0.18, 0.3) → 38.1 zoom 1.4 at (0.18, 0.55) → 39.4 zoom 1.4 at (0.18, 0.8)
- **Words:**
  - 36.3 to 37.3: “What the documents don't say.”
  - 37.3 to 38.3: “And who can answer.”
  - 38.3 to 39.3: “Trade-offs, both ways.”
  - 39.3 to 40.1: “Who could be harmed.”
- **Action:** Quiet breakdown, slow scroll: unknowns with who can answer, trade-offs both ways, possible harms.

### staff-draft · bars 40-43 · 1:21.3 to 1:29.5

- **Music:** build (dip at 43)
- **Step label:** City staff · Step 1 of 3 · Draft
- **Tags:** “Scenario: fictional clerk”, “Replay of a real run”
- **Shot:** footage `staff-draft`: Staff: passcode, pick row-2027-budget, start the brief as a replay of the agents' real run (labelled 'Replay of the agents' real run on <time>'); the agents panel; statements checked; any rejected quote. Sped up 4x. LOCAL ONLY: recorded against a throwaway copy of the data on http://127.0.0.1:4199 (scripts/staff-server.sh), never the live site
- **Camera:** 40.1 zoom 1.3 at (0.5, 0.3) → 41.1 zoom 1.6 at (0.4, 0.25) → 41.3 zoom 1.5 at (0.45, 0.5) → 43.1 zoom 1.5 at (0.5, 0.6) → 43.4 zoom 1.6 at (0.5, 0.55)
- **Words:**
  - 40.1 to 41.1: “Now, the city's side.”
  - 41.1 to 42.1: “A clerk starts a brief.”
  - 42.1 to 43.1: “Specialist agents draft it.”
  - 43.1 to 44.1: “Every quote checked on its page.”
- **Action:** Local throwaway copy of the app (scripts/staff-server.sh, port 4199). The clerk clicks "Replay the agents' last real run": the steps panel streams the lead's plan and each specialist's row with a 'Replay of the agents' real run on <time>' chip, ending 'Draft ready for review'; the statements arrive marked Checked. Shown at real speed.

### staff-review · bars 44-47 · 1:29.5 to 1:37.8

- **Music:** groove
- **Step label:** City staff · Step 2 of 3 · Review; from 47.1: City staff · Step 3 of 3 · Publish
- **Tags:** “Scenario: fictional clerk”
- **Shot:** cuts: `staff-review` at 44.1; `staff-review` at 47.2
- **Words:**
  - 44.1 to 45.1: “Staff check every line.”
  - 45.1 to 46.1: “Approve. Edit. Reject.”
  - 46.1 to 47.1: “Agents never decide.”
  - 47.1 to 48.1: “A named person publishes.”
- **Action:** Local throwaway copy only. The fictional clerk approves one statement, edits the next (adds '(a forecast)'), rejects a third, then publishes as 'Jordan Lee'; the page shows 'Published · Jordan Lee'. Nothing here touches the live site.

### record · bars 48-49 · 1:37.8 to 1:42.0

- **Music:** groove
- **Step label:** The record
- **Tags:** “Live log”
- **Shot:** footage `log`: Record: the log newest first; the chain check runs: Chain intact
- **Camera:** 48.1 zoom 1.3 at (0.6, 0.45) → 49.1 zoom 2 at (0.42, 0.22)
- **Words:**
  - 48.1 to 49.1: “Every step, on the record.”
  - 49.1 to 50.1: “Hash-chained. Can't be edited quietly.”
- **Action:** The log, newest first; the browser re-checks the hash chain and shows 'Chain intact: N entries'.

### spend · bars 50-51 · 1:42.0 to 1:46.1

- **Music:** groove
- **Step label:** Spend
- **Tags:** “Live usage”
- **Shot:** footage `spend`: Spend: calls, tokens, US$, energy and CO2e, daily limit
- **Camera:** 50.1 zoom 1.15 at (0.5, 0.45) → 51.1 zoom 1.35 at (0.5, 0.5)
- **Words:**
  - 50.1 to 51.1: “Every model call, costed.”
  - 51.1 to 52.1: “Dollars, energy, carbon. Capped.”
- **Action:** Spend: calls, tokens, US dollars, estimated energy and CO2e, the daily limit.

### who · bars 52-53 · 1:46.1 to 1:50.2

- **Music:** groove (52-53 quiet, then groove)
- **Shot:** audiences over `home` (blurred)
- **Words:**
  - 52.1 to 53.1: “For residents.” (hero)
  - 53.1 to 54.1: “And the people who serve them.” (hero2)
- **Ticks:** Problem understanding & stakeholders at 53.4
- **Facts and sources:**
  - audiences: `docs/spec.md`, page Who it's for; shared/types.ts AudienceId
- **Action:** Two quiet bars over the home page, blurred: the eleven audiences the product offers pop in as glass chips, then the staff side joins in blue.

### design · bars 54-55 · 1:50.2 to 1:54.4

- **Music:** groove (52-53 quiet, then groove)
- **Step label:** Design & clarity
- **Tags:** “Real data: Region of Waterloo”
- **Shot:** design
- **Words:**
  - 54.1 to 55.1: “The whole brief, in your language.”
  - 55.1 to 56.1: “Light or dark. Any screen.”
- **Action:** Language menu switches the brief (clip 'language'); then a split: light and dark side by side, and the phone layout (stills 'dark' and 'phone').

### a11y · bars 56-57 · 1:54.4 to 1:58.5

- **Music:** groove (52-53 quiet, then groove)
- **Step label:** Design & clarity
- **Shot:** footage `a11y`: Keyboard only: tabbing through the brief with visible focus rings
- **Camera:** 56.1 zoom 1.4 at (0.22, 0.25) → 57.1 zoom 1.4 at (0.22, 0.35)
- **Words:**
  - 56.1 to 57.1: “Keyboard first. Screen-reader labelled.”
  - 57.1 to 58.1: “0 axe accessibility violations.”
- **Ticks:** Design & clarity at 57.4
- **Facts and sources:**
  - axe-core: 0 violations on all 10 tabs of /d/row-2027-budget, /decisions, /log, /spend, /staff at 1280 and 390 px, light and dark: `team's axe-core run on the live site, 14 Nov 2026 (coordinator-confirmed)`, page n/a
- **Action:** Tabbing through the brief with the keyboard: the focus ring moves through the navigation and the brief.

### adapt · bars 58 · 1:58.5 to 2:00.6

- **Music:** groove (52-53 quiet, then groove)
- **Step label:** Another city
- **Shot:** config
- **Words:**
  - 58.1 to 58.3: “Another city?”
  - 58.3 to 59.1: “One config file.”
- **Facts and sources:**
  - city config: `cities/waterloo-region.json`, page the real file, typed out
- **Action:** A code card types out the real cities/waterloo-region.json; on 58.3 a second card with the CityConfig shape (shared/types.ts) slides in for 'cities/<your-city>.json'.

### for-cities · bars 59 · 2:00.6 to 2:02.6

- **Music:** groove (52-53 quiet, then groove)
- **Step label:** For cities
- **Tags:** “Embed demo: a fictional town's page”
- **Shot:** cuts: `landing` at 59.1; `docs` at 59.2; `embed` at 59.3
- **Words:**
  - 59.1 to 60.1: “Docs, and a widget to embed.”
- **Ticks:** Impact & adaptability at 59.4
- **Action:** A two-second flash for cities: the landing page (/), the docs (/docs), and the embeddable widget demo (/embed/demo), one beat each, the widget held for two.

### under-hood · bars 60-61 · 2:02.6 to 2:06.8

- **Music:** groove (52-53 quiet, then groove)
- **Shot:** requirements
- **Words:**
  - 60.1 to 61.1: “Under the hood.” (hero)
  - 61.1 to 62.1: “Requirements first.”
- **Action:** Big words on white, then the requirements document scrolling (docs/requirements.md).

### drop · bars 62-68 · 2:06.8 to 2:21.3

- **Music:** drop
- **Shot:** split: evidence left (62.1 Use cases; 62.2 Classes; 62.3 Sequence: ask; 62.4 States: a statement; 63.1 docs/architecture.md; 63.3 Deployment; 64.1 Code tour; 64.3 Tests; 65.1 Agent evals; 66.1 CREDITS.md; 67.1 Municipal Readiness Report; 68.1 This video), the slip's Part B right
- **Ticks:** Requirements & UML at 62.4.5; Architecture & scalability at 63.4.5; Source code awareness at 64.4.5; Quality & functionality at 65.4.5; References at 66.4.5; Municipal Readiness Report at 67.4.5; Demo video at 68.4.5
- **Action:** The final drop. Left: the evidence, cut on the beat. Right: the slip's Part B, the camera moving row by row; each box ticks on the last 'and' of its bar.

### slip-final · bars 69 · 2:21.3 to 2:23.3

- **Music:** drop
- **Shot:** slip-final
- **Action:** Every box ticked; stamp on 69.2; on 69.3 the camera pulls back and the slip is on the laptop's screen.

### end · bars 70 · 2:23.3 to 2:26.3

- **Music:** ring-out (the last hit rings out)
- **Shot:** endcard
- **Action:** The lid closes on the last hit; the end card holds while the hit rings out.

## Footage to record (phase 2)

`npm run record -- <baseUrl>` (scripts/record.mjs). 1920×1080, Chrome via playwright-core, visible cursor, human-speed typing; files go to `public/footage/` (gitignored) and action times to `footage-marks.json`.

| Clip | Length needed | What |
|---|---|---|
| `home` | 8.3 s | Decisions page: the region map, decision cards with countdowns; type a street; click the 2027 budget card |
| `overview` | 4.2 s | Decision brief, Overview tab: plain summary, reading grade, review status |
| `source` | 4.2 s | Click a figure: the source viewer opens on its PDF page with the quote highlighted |
| `affects` | 6.3 s | Affects you: tap Renter and Transit rider; cited impacts appear |
| `ask-opinion` | 2.1 s | Ask 'Should I support this budget or oppose it?': the recorded answer (after ~3 s) lays out both sides and does not take one; replay label visible |
| `say` | 4.7 s | Have your say: timeline, next chance with countdown, how to take part, Add to calendar |
| `ask` | 8.3 s | Ask: type exactly 'How much of my regional tax bill goes to public transit?'; a real run replays from the record (plan, specialist steps, checked statements, ~8 s), then the answer with 'Answered by the agents on <time> · replayed from the record'. Recorded at 1x, sped up 2x |
| `transit` | 8.3 s | Transit lens: gaps and destinations on the map, time-of-day switch, first/last mile, ranked fixes |
| `costs` | 6.2 s | Cost lens: stacked lifecycle chart; drag a slider; per household recomputes; discount toggle |
| `commitments` | 4.2 s | Commitments lens: status pills; expand one; what's still unclear |
| `housing` | 4.2 s | Housing lens: units by stage, approval to completion; untracked stages |
| `unknowns` | 8.3 s | Unknowns & trade-offs: what the documents don't answer, who can; trade-offs both ways; harms. Slow scroll |
| `staff-draft` | 8.3 s | Staff: passcode, pick row-2027-budget, start the brief as a replay of the agents' real run (labelled 'Replay of the agents' real run on <time>'); the agents panel; statements checked; any rejected quote. Sped up 4x. LOCAL ONLY: recorded against a throwaway copy of the data on http://127.0.0.1:4199 (scripts/staff-server.sh), never the live site |
| `staff-review` | 8.3 s | Staff review: approve, edit with a note, reject; reviewer name; Publish; public page shows Approved by. LOCAL ONLY: recorded against a throwaway copy of the data on http://127.0.0.1:4199 (scripts/staff-server.sh), never the live site |
| `log` | 4.2 s | Record: the log newest first; the chain check runs: Chain intact |
| `spend` | 4.2 s | Spend: calls, tokens, US$, energy and CO2e, daily limit |
| `language` | 2.1 s | Language menu: the brief switches to another language |
| `a11y` | 4.2 s | Keyboard only: tabbing through the brief with visible focus rings |
| `scout-map` | 2.1 s | Construction tab on row-2027-budget: the map with ranked candidate launch and extraction sites, the 2.9 km twin bores under Highway 401 and the Speed River, 49 boreholes, 11 cross-passages |
| `scout-section` | 1.1 s | Construction tab: the long-section ('Under the ground') with the animated TBM |
| `scout-steps` | 6 s | Construction tab: stepping 1 to 7; each step flies the map and shows its render (spare, if we cut to it instead of the stills) |
| `landing` | 0.6 s | The landing page for cities (/) |
| `docs` | 0.6 s | The docs (/docs) |
| `embed` | 1.1 s | The embeddable widget demo (/embed/demo) |

Stills: `dark` (The brief in dark mode, 2x screenshot); `phone` (The brief on a phone (390x844, 3x), screenshot); `readiness` (The Municipal Readiness Report, page 1, rendered from report/*.pdf); `scout-renders` (The construction scout's seven stage renders, copied from data/renders by npm run gen (real product files, no recording needed)).
