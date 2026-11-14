---
title: Guide for city staff
description: How clerks, communications and planning staff draft a brief with the agents, review every statement, publish under their name, and upload a new PDF.
---

The agents write a first draft; you decide what residents see. Every statement in a
draft arrives with its quote and page already checked by code, so your time goes on
judgement (is it fair, is it clear, is anything missing), not on hunting for page
numbers. Nothing reaches residents as approved until a named staff member publishes it,
and every step you take is written to the public record under your name.

The staff screen is at `/staff`. Everything it does is also available through the
[API](api.md#staff-routes).

## Sign in with the passcode

The staff screen asks for the **Staff passcode** and checks it with the server before it
shows any tools. If it's wrong you'll see **That passcode was not accepted.**

- The passcode is the server's `STAFF_TOKEN` setting. The person who runs the
  deployment sets it as a secret ([self-hosting](self-host.md)).
- If `STAFF_TOKEN` is not set, every staff route answers `503` with "Staff sign-in isn't
  set up on this server (STAFF_TOKEN is missing)."
- The screen keeps the passcode in this browser tab only (session storage) until you
  **Sign out** or close the tab.
- API calls send it as a header:

```http
Authorization: Bearer <passcode>
```

The server compares the passcode in constant time, so its response time gives nothing
away.

> [!WARNING]
> The prototype has one shared passcode for all staff. Use a long random value and
> share it only with the people who review briefs. Individual accounts through the
> city's single sign-on are **Planned**.

## Put your name in

Type **Your name** at the top of the screen. It goes on every review and publication,
in the brief and in the public record. In the record, "Ana Silva" appears as the actor
`staff:ana-silva`, and the full name is in the entry's details. The screen remembers
the name for this tab.

Publishing needs a name. Reviews without one are recorded as `staff`.

## Draft a brief with the agents

### From a decision's own documents

1. Pick the **Decision**.
2. Select **Draft brief with agents**.
3. Watch the agents work (below). When they finish you'll see **Draft ready for
   review**.

The agents read only that decision's source documents. A full brief runs, side by
side, the explainer for two parts (the overview, and the impacts with trade-offs) and
one specialist for each lens the decision has. Then the lead makes a plain-language pass
(below). A run stops after 15 minutes, 40 model calls or US$0.50, whichever comes
first, and the day's spending cap applies.

### From a PDF you upload

Open **Or upload a PDF and draft a new brief**, choose the **PDF file**, add a
**Document title** and **Who decides**, then select **Upload and draft**. The server:

1. checks the file is a PDF (up to 30 MB and 600 pages) with a text layer. A scanned
   PDF without text is refused, because the agents couldn't cite it;
2. extracts the text of each page (`pdftotext -layout`);
3. adds the PDF as a new source and creates a new decision for it, with status
   "proposed" and the tag "uploaded";
4. writes a `source.added` entry to the record with the file's SHA-256 fingerprint;
5. starts the draft, exactly as above.

The screen sends the three fields above, plus your name as `reviewer`. Through the API you can also send these form
fields (all optional except the file):

| Field | Used for | Default |
|---|---|---|
| `file` | The PDF itself (any file field works) | required |
| `title` | Document and decision title | the file name |
| `reviewer` | Your name, for the record | none |
| `publisher` | Who published the document | "Uploaded by city staff" |
| `url` | Where the document is published | empty |
| `published` | The date the document carries (YYYY-MM-DD) | today |
| `licence` | The document's licence | "Public record" |
| `kind` | `staff-report`, `agenda`, `budget`, `plan`, `progress-report`, `dataset`, `notice` or `other` | `staff-report` |
| `plainTitle` | The plain title residents see | the title |
| `decidedBy` | Who decides | "To be confirmed by staff" |
| `officialUrl` | The official notice | `url`; if neither is sent the link is empty, so send one of them |

> [!IMPORTANT]
> Uploaded documents are public. The PDF is served to anyone at
> `/api/sources/<id>/pdf` and the new decision appears in the list. Upload only
> documents the city has already published.

> [!NOTE]
> An uploaded decision starts with no dates and no lenses. Its timeline (meetings,
> deadlines and ways to take part) is hand-checked data in the decision's JSON file
> (`uploads/decisions/<id>.json` in the data folder, copied to `decisions/<id>.json`). A form to add dates on the staff screen is **Planned**.

### Watch the agents work

While the run goes, the steps panel shows the lead's plan, each specialist (working,
done or failed), and every tool call with a one-line summary: which pages were
searched and read, and each statement recorded. Below it you'll see the model calls,
tokens and US dollars spent so far.

Statements the checker refuses never appear in the draft. They go to the record as
`statement.rejected`, with the reason, and the reason goes back to the agent, for
example "That quote is on page 14, not page 12". Most agents then fix the citation and
try again.

Last, the lead's **plain-language pass** sends any sentence above grade 8 back to the
model to be rewritten in shorter, everyday words, and adds glossary entries for jargon
the brief uses. Code keeps a rewrite only if it reads easier, keeps every number
exactly, keeps "may" in impacts and both sides of a trade-off, and still shares words
with its quotes. Otherwise the original stays.

> [!TIP]
> **Replay the agents' last real run** shows the saved steps of the real run that
> drafted the current brief (or the most recent saved one), ending with the current
> brief. It calls no model, spends nothing
> and writes nothing, so it is safe for a demonstration or a training session. The
> screen also offers it when the agents can't be reached.

When the run ends, the draft is saved and `brief.generated` is written to the record
with the number of statements, how many attempts the checker rejected, the reading
grade before and after the plain-language pass, the calls each step made, the cost and
the models. Each review of a statement then records a fingerprint of the exact
brief you reviewed.

## Review each statement

Under **Statements to review** you'll see every statement, grouped by section: What's
proposed, Why now, one group per audience, Have your say, Trade-offs and possible
harms, Costs, Housing, and each commitment. At the top it says **All quotes checked**,
or how many are **Not verified**.

Each statement shows its text, its kind, its page chips (open one to see the quote
highlighted on the PDF page) and whether the quote was found. For each one:

| Action | What happens |
|---|---|
| **Approve** | The statement is shown to residents as it is. |
| **Edit** | Change the wording, then **Save**. The original wording is kept with the statement (`originalText`) and in the record. Residents see **Edited by staff**. |
| **Reject** | The statement is hidden from residents once the brief is published. |

Add a **Note (optional)** to any action to explain it (up to 2,000 characters). Notes
are public in the record.

Some details worth knowing:

- **An edit keeps its citations, and they are checked again.** After an edit the
  server re-runs the citation check on the statement's quotes, so its "verified" mark
  always says what the checker says now. The checker confirms the quotes are still on
  their pages; it can't tell whether your new wording still matches them. That part is
  your judgement.
- **Approving an edited statement keeps it "edited".** Residents still see **Edited by
  staff**; the record shows the approval.
- **You can change your mind.** Review the same statement again with a different action.
  Each review is a new entry in the record.
- Editing changes the brief's reading grade, which is worked out again.
- The first review moves the brief from **Draft** to **In review**. There's no separate
  "start review" step.

## Publish

When every statement has an action, check **Publishing as (your name)** and select
**Publish**.

- **Every statement must be reviewed first.** Until then, publishing is refused with a
  message such as "3 of 24 statements haven't been reviewed yet. Approve, edit or
  reject each one before publishing."
- Publishing needs your name; without it the button stays off ("Type your name above to
  publish.").
- The brief becomes **Published**. Residents see **Approved by (your name) on (date)**.
- Rejected statements are left out of what residents get, from the API as well as the
  screen. Staff signed in with the passcode still get the whole brief, so you can
  change your mind.
- The reading grade shown to residents is worked out again from what they will read,
  without the rejected statements.
- `brief.published` goes into the record with your name, a fingerprint of the exact
  brief, and how many statements were approved, edited and rejected.

> [!NOTE]
> Publishing checks every statement in the brief, wherever it sits, including any inside
> the transit or construction lens. If the count in the message doesn't match what the
> screen lists, review the rest with `POST /api/staff/review` ([API](api.md#staff-routes)).

Translations are made from the current English brief. When the English brief changes,
saved translations are made again the next time someone asks for them.

## Draft again

You can draft a decision again at any time, for example when a new staff report comes
out. The new draft **replaces the current brief, even a published one**: residents see
it labelled **Draft** until someone reviews and publishes it again. Every earlier
version is kept on the server (`cache/brief-history/` in the data folder), and the
record keeps every review and publication of every version.

## What goes in the record

Every staff action is a new entry in the public, hash-chained record (`/log`). Nothing
is overwritten.

| Action | Record entry | What it holds |
|---|---|---|
| Upload a PDF | `source.added` | source id, title, pages, size, SHA-256 of the file |
| Start a draft | `brief.started` | the decision's sources, the run id |
| Agents accept or refuse a statement | `statement.recorded`, `statement.rejected` | the statement, or the reasons it was refused |
| Each model call | `usage` | model, tokens, cost |
| Draft finished | `brief.generated` | statement and rejection counts, reading grade, calls per step, cost, models |
| Review a statement | `statement.reviewed` | statement id, action, your name, note, the old and new text for edits, whether its quotes still check out |
| Publish | `brief.published` | your name, brief fingerprint, counts approved, edited and rejected |
| Purge an entry's content | `record.purged` | which entry, its kind and payload hash, the reason, your name |

Each agent run's events are also saved on the server, one file per run
(`runs/<run id>.jsonl` in the data folder), so what the agents said can be checked
later.

## Purge content when its retention period ends

The record is append-only, but a city may have to destroy a record once its retention
period under its records retention by-law ends (Municipal Act, 2001, s. 255). For that,
staff can purge the content of one entry. This is also how to remove personal details
that someone typed into a question.

There is no button for it on the staff screen yet (**Planned**). Use the API with the
entry's number (`seq`, shown on the Record page and in `GET /api/log`) and a reason:

```bash
curl -X POST https://municipal-agents.fly.dev/api/staff/purge \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"seq": 42, "reason": "Retention period ended under By-law 2024-01, schedule B", "reviewer": "Ana Silva"}'
```

- **What goes:** the entry's content (its payload). It becomes `null` everywhere it is
  served.
- **What stays:** the entry's number, time, actor, kind, decision, and the hash of the
  content that was there. So the chain still verifies, and nobody can put different
  content back without it showing.
- **What is added:** a `record.purged` entry with which entry, its kind, its content's
  hash, your reason and your name. The purged entry itself shows when, why and by which
  entry it was purged.
- **What can't be purged:** an entry purged already, and the record's own `record.purged`
  and `record.migrated` entries (the answer is `409`).

A purge is permanent. Purging a `usage` entry also takes its cost out of the spend
page. See the [API reference](api.md#purge-an-entrys-content) for every field and answer.

## What agents never do

The agents are drafting tools. Most of these limits are enforced by code, not by the
model's good behaviour; the two that are instructions to the model are marked.

- **They never publish.** A new draft is always saved as a draft, whatever the agents
  say. Only a staff route with the passcode and a named reviewer publishes.
- **They never review or approve their own work.** The checks are code: citation
  matching, wording rules, the reading grade, and the answer check.
- **They never decide, and never tell residents what to think or how to vote.** Wording
  that advises ("you should vote", "we recommend") is refused before it's stored, and
  answer sentences that give voting advice are removed.
- **They never state a fact without a page.** Each statement must quote words found on
  the page it names. Every number in a statement must be in one of its quotes.
- **They can't slip in a quote that isn't on the page.** The checker looks for the exact
  words (after tidying spacing, case and punctuation); nothing is fuzzy.
- **They read only this decision's documents.** Their tools search and read those pages
  and the precomputed lens results. They can't browse the web, send email, reach other
  files or change any data except the draft they're writing.
- **They never do the maths.** Travel times, lifecycle costs, housing counts and
  commitment status are computed by code; the agents explain the results.
- **They never set the dates.** Meetings, deadlines and ways to take part come from
  hand-checked decision files.
- **They never name people** (an instruction). The rules tell them to name public
  offices, not staff.
- **They never pick a construction site** (an instruction). Code ranks candidate sites
  by stated rules, and the scenario is labelled "Illustrative scenario: not a Region
  plan" for engineers and staff to evaluate.
- **They can't spend without limit.** Each run stops at 40 model calls or US$0.50, and
  the site stops at its daily cap.

What the checks can't promise: a quote on the page does not prove the sentence reads it
fairly or keeps its context. That is why you review every statement.

The agents' full instructions are plain Markdown anyone can read:
[shared rules](../../agents/skills/RULES.md) and one file per specialist in
[agents/skills](../../agents/skills/explainer/SKILL.md).

## Do it with the API

The same steps from a terminal. Replace `$STAFF_TOKEN` and the ids with your own.

```bash
# Draft a brief (server-sent events stream back while the agents work)
curl -N https://municipal-agents.fly.dev/api/staff/briefs \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decisionId": "row-2027-budget", "reviewer": "Ana Silva"}'

# Upload a PDF and draft from it
curl -N https://municipal-agents.fly.dev/api/staff/briefs \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -F file=@staff-report.pdf \
  -F title="Fairway Road station area plan" \
  -F decidedBy="Kitchener City Council" \
  -F reviewer="Ana Silva"

# Edit one statement, with a note
curl https://municipal-agents.fly.dev/api/staff/review \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decisionId": "row-2027-budget", "statementId": "s22", "action": "edit",
       "text": "Regional Council decides the 2027 budget.", "note": "Shorter", "reviewer": "Ana Silva"}'

# Publish
curl https://municipal-agents.fly.dev/api/staff/publish \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decisionId": "row-2027-budget", "reviewer": "Ana Silva"}'
```

`action` takes `approve`, `edit` or `reject`. These calls change the brief and write to
the public record, so try them on your own deployment first. Full details are in the
[API reference](api.md#staff-routes).
