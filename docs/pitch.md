# Finalist showcase: pitch and live demo script

Saturday 14 November 2026, 12:30 pm ET. Five minutes of pitch and live demo, then three
minutes of questions. Judges: Eryn Stewart (managing director, Future Cities Institute),
Clarence Woudsma (transportation planning), Melanie Hains (UX and storytelling), Susan
Brown (research coordination), Pedro Miranda (secure data and consent).

Questions and answers are in [judge-qa.md](judge-qa.md). The 30-second version is at the
end of this file.

Everything on screen below was checked on the live site and in the repo on the morning of
14 November 2026. Numbers are quoted as they appear in the README, `docs/architecture.md`,
`agents/evals/results.md` and the lens files in `data/lenses/`.

---

## Run sheet (glance at this during the pitch)

| Time | Screen | Action | Say, in short |
|---|---|---|---|
| 0:00 | Tab 1, budget brief, Overview | No clicks | A renter in Cambridge; 191 pages; register by noon 9 Dec; the Chair from tomorrow |
| 0:25 | Same | Point at the header | What it is, who it's for, the three rules, it's a draft |
| 0:45 | Same, chat pane | Type the transit question; click the p. 12 chip | Replayed real answer; every number opens its page |
| 1:25 | Same, chat pane | Type the Chair question | Credit ran out at 2:20 am; it answers from checked material |
| 1:45 | Have your say tab | Point at the next chance and the strong-chair dates | Hand-checked dates; 25 days; calendar |
| 2:10 | Transit tab | Show on map; scroll to fixes | Connection Scan; 303,052 people; route 1 fix; straight-line walking |
| 2:50 | Construction tab | Point at the label; pick step 3 | Illustrative, not a Region plan; it ranks, people decide |
| 3:10 | Tab 2, /staff | Replay the agents' last real run; Publish | 78 rejected, 116 accepted; I won't approve; 27 fixes labelled |
| 3:40 | Tab 3, /log | Point at "Chain intact" | Hash chain checked in your browser; its limit |
| 3:55 | Tab 1 (any) | No clicks | Another city: files; the costs |
| 4:30 | Same | No clicks | The ask: one pilot |

**Length.** The main path is about 650 spoken words: roughly 4:15 of speech at a calm pace,
plus about 40 seconds of clicks and waiting. Rehearse it twice with a timer. Lines marked
optional or "if" are extra, not part of the 650.

**Checkpoints.** At 1:45 you should be clicking Have your say. At 2:50, Construction. At
3:55, the cost lines. If you are more than 15 seconds behind at 2:50, replace the
construction block with one sentence (given below). If you are behind at 3:40, skip the
Publish click.

---

## Before you go on (30 minutes before)

1. **Health.** Open https://municipal-agents.fly.dev/api/health. It should say `"ok":true`.
2. **Browser.** Chrome, notifications off, Do Not Disturb on. Window at least 1280 px wide
   at 100% zoom, so the brief, the map and the chat sit side by side. Check this on the
   projector itself.
3. **Tabs, in this order, in one window:**
   - **Tab 1:** https://municipal-agents.fly.dev/d/row-2027-budget (Overview, chat empty).
   - **Tab 2:** https://municipal-agents.fly.dev/staff. Sign in with the staff passcode now,
     off screen (the tab keeps it for the session). Set **Decision** to the 2027 budget.
     Leave **Your name** empty for now.
   - **Tab 3:** https://municipal-agents.fly.dev/log
   - **Tab 4 (spare):** https://municipal-agents.fly.dev/decisions
4. **Warm the PDF.** In Tab 1, Overview, under Key figures, click **2026 regional tax for
   average home, $2,928.62** once. The 191-page budget book (5.4 MB) loads and is cached.
   Close the viewer. Do not type anything in the chat.
5. **Backups open and ready:**
   - `~/Desktop/municipal-agents-loop.mp4` in QuickTime, paused at 0:00, View > Loop on.
     It is a 60-second silent loop of the resident's journey (timestamps below).
   - Copy `~/dev/municipal-agents/video/out/municipal-agents.mp4` (the full 2:26 video) to
     the Desktop and open it muted. The staff side and the record are at 1:21 to 1:46.
   - A local copy of the app: in a terminal, `cd ~/dev/municipal-agents && sh
     video/scripts/staff-server.sh`. It serves the same app and committed data at
     http://127.0.0.1:4199 and writes only to a scratch copy outside the repo. Replays and
     offline answers work there; map tiles still need internet. Sign in to
     http://127.0.0.1:4199/staff too.
   - Phone hotspot on and ready.
6. **Don't do these on the live site** during the pitch or the questions:
   - **Draft brief with agents** on the staff screen. With no credit it fails and writes a
     failed run to the public record; with credit it spends money.
   - **Approve, Edit or Reject.** Each writes a real review under your name to the public
     record, and you are not Region staff. Do these only on the local copy (port 4199).
   - **The language menu.** The French and Spanish translations in the record were made
     before my corrections changed the brief, so switching language will likely call the
     model; with no credit it falls back to English with a note. Fine if asked, but don't
     demo it.

**Words to use:** "checked against the page", "a draft", "corrected by me, labelled as
mine", "candidates, not GRT proposals", "illustrative". **Words to avoid:** "verified true",
"accurate", "the Region approved", "official".

---

## The five minutes

### 0:00 to 0:25 · The resident's problem

**Screen:** Tab 1, the budget brief, Overview. No clicks yet.

**Say:**
> "Picture a renter in Cambridge who takes the bus. The Region's 2027 budget sets her
> regional taxes, her water rates and her bus service. It's all public, spread over a
> 191-page budget book and seventeen other documents. To speak to Council, she must
> register by noon on December 9. And from tomorrow, the Regional Chair proposes the
> budget. She won't find any of that."

**Point at:** the notice box **"New: the Regional Chair now proposes the budget"**, then the
button **"Next chance to have a say … in 25 days"** in the header.

**If it fails:** if the page doesn't load in five seconds, say "The venue network is slow,
so I'll use the same app on my laptop" and switch to http://127.0.0.1:4199/d/row-2027-budget.
If the laptop can't show it either, play the loop from 0:00 and keep talking.

### 0:25 to 0:45 · What it is and who it's for

**Screen:** same. No clicks.

**Say:**
> "I built Municipal Agents: AI agents that read the city's own documents and turn a
> decision into a five-minute brief: what's proposed, how it may affect her, when she can
> have a say. It's for residents, and for the clerks who have to explain decisions. Every
> figure links to its page, code checks every quote, and staff approve every statement.
> This one is still a draft, and it says so."

**Point at:** in the header, **"Draft: not yet reviewed by city staff"**, **"Grade 7 reading
level"**, **"Drafted by AI agents from the city's documents; every quote checked in code"**
and **"Not the official notice"**.

**Optional, for Melanie Hains, only if ahead:** "The grade is measured in code and shown,
not hidden."

**If it fails:** nothing to click; keep talking over the loop at 0:08 to 0:12 (the
Overview).

### 0:45 to 1:45 · The moment of value: ask, then check the page

**Screen:** Tab 1, the chat pane on the right ("Ask about this decision").

**Do:** click in **Your question** and type exactly:

`How much of my regional tax bill goes to public transit?`

Press Enter. (It is also the first suggestion button, if typing is awkward.)

**Say, while it plays (about 8 seconds):**
> "She asks in plain words. This one was asked before, so the site replays the agents'
> real answer from the record, at no cost, and labels it."

**Point at:** the checked statements arriving, then the answer: **17.6 percent** of the
regional levy, **$582** for an average urban household, each sentence with a **p. 12** chip;
and the grey label **"Answered by the agents on … ET · replayed from the record"**.

**Do:** click the **p. 12** chip after the $582 sentence.

**Point at:** page 12 of the 2026 budget book with the **Public Transit** row highlighted,
and **"Quote found and highlighted."**

**Say:**
> "Every number opens its page, quote highlighted. She doesn't have to trust me or the
> AI. She can check."

**Do:** close the viewer. Click in **Your question** again and type exactly:

`Who proposes the budget now, the Chair or Council?`

**If the answer appears within a second or two (the model is out of credit):**
> "A new question. My model credit ran out at 2:20 this morning, so it answers from
> statements code already checked. Nothing in it is written by a model."

**Point at:** **"The agents can't be reached right now. Here is what the checked brief says
about that:"**, the **February 1, 2027** deadline line, and the statement marked
**"Corrected by the Municipal Agents team"**.

**If instead the steps panel shows the lead planning (credit is back):**
> "Credit's back, so that's a live run: the lead plans and hands it to a specialist. It
> takes 15 to 30 seconds and about six cents. I'll come back to it."

Then go straight on to Have your say (clicking a tab doesn't stop the chat) and glance back
at the answer when it lands.

**If it fails:**
- The chat shows an error or nothing happens: say "That's the plain message residents see
  when something fails", and move on. Show the loop at 0:29 to 0:37 (the same question
  replayed) and 0:12 to 0:16 (a source page highlighted).
- The PDF viewer is slow: say "It's loading the real 191-page PDF; the quote is on page
  12", and move on. The viewer also says "The quote is on this page" when it can't
  highlight.
- Short on time: skip the second question.

### 1:45 to 2:10 · Have your say

**Do:** click the **"Next chance to have a say"** button in the header (or the **Have your
say** tab).

**Say:**
> "I checked every date here by hand, and each one is cited. To speak on December 16 she
> registers by noon on December 9: 25 days. From tomorrow the
> Chair proposes by February 1; then Council has 30 days to amend, the Chair 10 to veto,
> Council 15 to override. Dates that aren't published yet are marked as worked out from
> the rules. One click adds them all to her calendar."

**Point at:** the **Next chance** pill on **Regional Council: 2027 Plan and Budget
Overview**, the countdown, **How to take part** (speak, write, watch, with the deadline),
an event marked **"At the latest"** with **"Worked out from the rules, not yet published"**,
and the **Add to calendar** button (don't click it; it downloads a file).

**Optional, only if ahead (5 seconds):** **Affects you** tab, tap **Renter** and **Transit
rider**: "Pick who you are; every impact says 'may'."

**If it fails:** loop 0:23 to 0:29 (the timeline and Add to calendar).

### 2:10 to 2:50 · A lens: the transit gap

**Do:** click the **Transit** tab.

**Say:**
> "Challenge two, transit gaps, computed in code, not by the AI: the Connection Scan
> Algorithm over GRT's bus and ION timetables, from every 400-metre cell of census
> population to 626 essential places, at three times of day."

**Point at:** the bars under **"Can people reach what they need by transit?"**: the
**Hospital** row, **64%** at weekday 8 am against **48%** at Sunday 8 am.

**Do:** scroll to **Gaps**. On **"Sunday 8 am: 303,052 people (52%) can't reach a hospital
within 45 minutes by transit and walking"**, click **Show on map**.

**Say:**
> "On a Sunday at 8 am, 303,052 people, about half the region, can't reach a hospital
> within 45 minutes."

**Do:** scroll to **Possible fixes, ranked**. Point at number 1, **"Start route 1
Queen-River by 6:30 am on Sundays"**, and its **Trade-off** line.

**Say:**
> "Fixes are ranked by people reached: starting route 1 by 6:30 on Sundays reaches about
> 88,000 people for four more trips, trade-off stated. They're candidates, not GRT
> proposals, and the limits are on the page: walking is straight-line, not the street
> network."

**If it fails:** loop 0:37 to 0:46 (the transit lens). If the map doesn't move, the list
still makes the point; don't wait for tiles.

### 2:50 to 3:10 · A second lens, briefly: the construction scout

**Do:** click the **Construction** tab. Under **"How it could be built, step by step"**,
pick step 3, **Dig the launch shaft**.

**Say:**
> "Briefly, a what-if, labelled illustrative, not a Region plan: ION Stage 2 under the 401
> and the Speed River. It scores work sites with stated weights, places cross-passages by
> NFPA 130 and 49 boreholes, and tells neighbours what they'd notice, with each city's
> real noise hours. The pictures are AI illustrations. It ranks; people decide."

**Point at:** the orange label **"Illustrative scenario: not a Region plan"**, the stats row
(**49** boreholes first, **11** cross-passages, about **100** trucks a day at peak), the
render's tag **"Illustrative render · not a design"**, and the step's "what residents
notice" text.

**If behind at 2:50, say this one sentence on the Transit tab instead and move on:**
> "There's also a construction scout for ION Stage 2, clearly labelled illustrative; I'm
> happy to show it in questions."

**If it fails:** loop 0:52 to 0:58 (the construction scout).

### 3:10 to 3:40 · The staff side

**Do:** switch to **Tab 2** (/staff, already signed in, 2027 budget selected). Click
**Replay the agents' last real run**. It streams for about five seconds.

**Say:**
> "The staff side. This replays the agents' real drafting run. When a quote isn't on its
> page, code rejects it and says where it really is: 78 rejections and 116 acceptances
> across four runs."

**Point at:** the **"Replay of the agents' real run on …"** chip, the specialists' rows, and
a **Rejected** line, ideally **"Rejected a commitment: Progress 1: That quote is on page 2 of
wr-ghg-inventory-2022, not page 3. Cite page 2."** Then **Statements to review**, **All
quotes checked**, and the **Approve / Edit / Reject** buttons. (The list also shows the
lens statements, so its count is higher than the brief's 30.)

**Say:**
> "Each statement reaches the clerk with its quote and page: approve, edit or reject. I'm
> not Region staff, so I won't approve. My own 27 fixes are labelled as mine."

**Optional, only if on time:** type your name in **Your name**, click **Publish**. It is
refused with "21 of 30 statements haven't been reviewed yet" (the 9 others carry my
corrections) and nothing is written.
> "And it won't publish until a named person has reviewed every statement."

**If it fails** (passcode rejected, replay error, slow): switch to the full video at 1:21
to 1:38, muted, and say "This is a recording on a local copy, with a fictional clerk."
Or use http://127.0.0.1:4199/staff, where you can also press Approve safely.

### 3:40 to 3:55 · The record

**Do:** switch to **Tab 3** (/log). Reload if it was opened long ago.

**Say:**
> "Everything, from questions to dollars spent, is in a hash-chained record your browser
> re-checks. Its limit: whoever runs the server could rebuild it, so next I'll publish the
> latest hash somewhere the city doesn't control alone."

**Point at:** **"Chain intact: N entries · SHA-256 · checked in your browser"**, and an
entry by **operator:municipal-agents-team** (my corrections are on the record too).

**If it fails:** full video 1:38 to 1:42 (the record), or skip with the same words.

### 3:55 to 4:30 · How another city adapts it, and what it costs

**Screen:** go back to Tab 1, or stay. No clicks.

**Say:**
> "Another city adapts it mostly with files: a settings file, its PDFs, one hand-checked
> file per decision, its transit feed. One process, one container, no resident data. A
> full brief costs 24 to 37 cents in model fees, a question 5 to 7 cents, a repeat
> nothing; with hosting, about 360 to 500 US dollars a year for one city. About two days
> to start with the brief and the cost and commitments lenses."

**If it fails:** nothing to click.

### 4:30 to 5:00 · The ask

**Say:**
> "So my ask is a pilot. One live decision, one municipality, 90 days, with a clerk or
> communications lead as the reviewer. We'd measure how long review takes, whether
> residents understand the brief, including screen-reader users and newcomers, and every
> error caught before publication. If FCI can introduce me to one clerk's office, I'll
> bring them a private draft built from their own public documents. Thank you."

Stop. Leave Tab 1 or the record on screen for questions.

---

## Fallback kit

**Order of fallbacks:** live site → phone hotspot → local copy at http://127.0.0.1:4199
(same URLs, same click path) → the 60-second loop → the full video, muted.

**`~/Desktop/municipal-agents-loop.mp4` (60 s, silent).** It is bars 5 to 34 of the demo
video. Times are approximate (about one second either way):

| Loop time | What it shows |
|---|---|
| 0:00 to 0:08 | Decisions page: the map, decision cards with countdowns, the budget card |
| 0:08 to 0:12 | Overview: plain title, draft label, reading grade, corrections labelled |
| 0:12 to 0:16 | A figure opens its PDF page with the quote highlighted |
| 0:16 to 0:21 | Affects you: Renter and Transit rider picked |
| 0:21 to 0:23 | "Should I support this budget?": the replayed answer declines and gives both sides |
| 0:23 to 0:29 | Have your say: the timeline, the next chance, Add to calendar |
| 0:29 to 0:37 | The transit tax question, replayed (2× speed), answer and label |
| 0:37 to 0:46 | Transit lens: gaps, first and last mile, ranked fixes |
| 0:46 to 0:52 | Cost lens: lifecycle cost, a slider moved |
| 0:52 to 0:58 | Construction scout (illustrative) |
| 0:58 to 1:00 | Commitments |

**Full video, `video/out/municipal-agents.mp4` (2:26, has music: mute it).** Staff
drafting 1:21 to 1:30; staff review 1:30 to 1:38 (a local copy, fictional clerk "Jordan
Lee"); the record 1:38 to 1:42; spend 1:42 to 1:46; who it's for and other cities 1:46 to
2:03.

**If the model answers live and it's slow:** keep going. The chat pane keeps running
while you click other tabs. Don't reload the page; a reload clears the chat.

**If a judge asks to type their own question:** let them. If credit is out it answers
offline from checked material in about a second; if credit is back it runs live for 15 to
30 seconds. Either way it says which it is.

---

## The 30-second version

> "Residents rarely find out what a city decision means for them, or when they can speak,
> until it's too late. I built Municipal Agents: AI agents read a city's own documents and
> turn a decision into a five-minute brief: what's proposed, how it may affect you, and
> when you can have a say. Every figure links to its page, code checks every quote, and
> nothing is official until staff approve each statement. It's live on Waterloo Region's
> 2027 budget, and a brief costs under 40 cents. I'm looking for one municipality to
> pilot it on one live decision."

**Ten seconds:**
> "Municipal Agents turns a city decision into a five-minute brief where every number
> links to its page, code checks every quote, and staff approve every statement."

---

## Numbers card

| What | Number | Where it comes from |
|---|---|---|
| Budget book | 191 pages | `data/sources/index.json` |
| Sources for the budget brief | 18 documents (27 documents, 412 pages across the three decisions) | `data/decisions/row-2027-budget.json`; `docs/requirements.md` |
| Register to speak on 16 Dec | by noon, 9 Dec 2026 | `data/decisions/row-2027-budget.json` |
| Strong-mayor powers | from 15 Nov 2026; Chair proposes by 1 Feb 2027; 30 / 10 / 15 days | O. Reg. 530/22 as amended by O. Reg. 189/26 |
| Budget brief | 30 statements, 11 figures, grade 7.4, draft, US$0.368 | `data/briefs/row-2027-budget.json` |
| Reading grades | 7.4, 6.7, 6.9 (target 8) | README |
| Citation checker | 78 rejected, 116 accepted in four brief runs | `data/runs/*-brief-*.jsonl` |
| Operator corrections | 27 (24 edits, 3 withdrawals) | `data/corrections/` |
| Evals | 6 of 12 pass; all 6 failures over grade 9; 0 citation failures; 0 voting advice | `agents/evals/results.md` |
| Transit: hospital, Sunday 8 am | 303,052 people (52%) can't reach one in 45 min | `data/lenses/transit-region.json` |
| Transit: Sunday before 6:30 am | 462,606 people have no bus or train within 800 m | same |
| Top fix | Route 1 by 6:30 am Sundays: 87,943 people, about 4 trips, 3 bus-hours | same |
| Construction | 2,828 m bored, 11 cross-passages, 49 boreholes; renders about US$0.64 | `data/lenses/construction-row-2027-budget.json` |
| Costs | brief US$0.24–0.37; question US$0.05–0.07; repeat US$0; translation ~US$0.009; hosting US$7–10/month | README, `docs/architecture.md` §7 |
| A year, one city | US$360–500 (2026 prices); US$630–870 from 2027 | same |
| Caps | 40 calls or US$0.50 a run; US$5 a day | `agents/loop.ts`, `server/limits.ts` |
| Credit ran out | about 2:20 am ET, 14 Nov 2026 | `docs/architecture.md` D6 |
| Tests | 205, all passing (14 Nov, 04:15 ET) | `docs/code-tour.md` |
