---
title: API reference
description: Every route of the Municipal Agents HTTP API, with methods, auth, request and response shapes, streaming events and curl examples against the live site.
---

Municipal Agents is one Node 24 service. The web app you see at
`https://municipal-agents.fly.dev` is built entirely on the API described here, so
anything the app shows, you can fetch yourself: decisions, briefs, sources, the public
record and the spend. Read routes are open to anyone. Two routes start an AI run for a
visitor (ask, translate), and six routes are for city staff only.

The route handlers live in `server/routes/`:
[`public.ts`](../../server/routes/public.ts), [`cities.ts`](../../server/routes/cities.ts),
[`platform.ts`](../../server/routes/platform.ts), [`agents.ts`](../../server/routes/agents.ts),
[`staff.ts`](../../server/routes/staff.ts), [`insights.ts`](../../server/routes/insights.ts) and
[`records.ts`](../../server/routes/records.ts). Every
shape named below is defined in [`shared/types.ts`](../../shared/types.ts). The same API is
described as OpenAPI 3.1 at [`/api/openapi.json`](#openapi).

## Basics

| | |
|---|---|
| Base URL | `https://municipal-agents.fly.dev/api` |
| Format | JSON (UTF-8). Two routes stream [server-sent events](#streaming-events). Two return iCalendar, two return files. |
| Compression | Responses over 1 KB are gzipped when you send `Accept-Encoding: gzip`. |
| Caching | Most read routes send `Cache-Control: no-cache` with a weak `ETag`, so a repeat request with `If-None-Match` gets `304 Not Modified`. Page text, calendars, PDFs and renders are cacheable for a while (see each route). Spend, the record and health are `no-store`. |
| `HEAD` | Every `GET` route also answers `HEAD`. |
| Auth | None for reading. Staff routes need `Authorization: Bearer <STAFF_TOKEN>`. |
| CORS | Routes made for other sites (the [embed card](#embed-card), the [calendar feed](#calendar-feed), its [subscribe links](#subscribe-links) and [OpenAPI](#openapi)) send `Access-Control-Allow-Origin: *`, never with credentials. The rest send no CORS headers: call them from a server, a script or the same origin. |
| Security headers | Every response carries HSTS, `X-Content-Type-Options: nosniff`, a referrer policy, a permissions policy and `X-Frame-Options: SAMEORIGIN`. API responses also get `Content-Security-Policy: default-src 'none'` (except PDFs, so the browser's viewer can open them). See [`server/security.ts`](../../server/security.ts). |
| Time zone | Dates are ISO 8601. A date with no time (`2026-12-16`) means that whole day in Toronto time. |

### Errors

Every error is JSON with one field, written so it can be shown to a resident as is:

```json
{ "error": "No decision with id \"nope\"" }
```

| Status | When |
|---|---|
| `400` | The body isn't a JSON object, or a field is missing or invalid (for example an empty question). |
| `401` | A staff route without the right passcode: `{"error": "Staff passcode required."}` |
| `404` | Unknown decision, source, page, render or route. |
| `405` | The path exists but not for that method. |
| `409` | Publishing a brief that still has statements nobody has reviewed, or purging content that is already purged or is the record's own bookkeeping. |
| `413` | Body too large (JSON bodies: 64 KB; PDF uploads: 30 MB or 600 pages). |
| `415` | The uploaded file isn't a PDF. |
| `422` | The PDF has no text layer (a scan), or its text couldn't be read. |
| `429` | A visitor's rate limit, or today's spend cap. A rate-limit answer carries `Retry-After` in seconds. |
| `500` | Something unexpected. The message is generic; details stay in the server log. |
| `502` | A translation failed before any of its response was sent. |
| `503` | The agents aren't loaded, all run slots are busy, or staff sign-in isn't set up (`STAFF_TOKEN` missing). |

### Limits

These protect the public site's budget. The values are the defaults; a city can change
them with [environment variables](self-host.md#environment-variables).

| Limit | Default | Applies to | Answer when hit |
|---|---|---|---|
| Questions per visitor | 10 per 10 minutes, per IP address | `ask`, `translate` (shared) | `429` with `Retry-After` |
| Runs at once | 4, across all visitors and staff | `ask`, `translate`, starting a brief | `503` "The agents are busy..." |
| Daily spend cap | US$5, resetting at midnight Toronto time | `ask`, `translate`, starting a brief | `429` "Today's budget ... has been used" |
| One run | 40 model calls or US$0.50 | each `ask`, brief or translation | the run stops and reports what it has |
| Run time | 240 s for a question, 900 s for a brief or translation | | the stream ends with an `error` event |
| Question length | 1,000 characters | `ask` | `400` |

IP addresses are kept in memory for the rate-limit window only. They are never written
to disk or to the record ([`server/limits.ts`](../../server/limits.ts)).

## Public routes

### Health

`GET /api/health` · no auth · `no-store`

Whether the service is up, and a few counts. Fly.io's health check calls this every 30 s.

```bash
curl https://municipal-agents.fly.dev/api/health
```

```json
{
  "ok": true,
  "startedAt": "2026-11-14T06:59:10.964Z",
  "version": "c46a78d-wt",
  "decisions": 3,
  "sources": 19,
  "logEntries": 14,
  "agents": { "available": true },
  "runsActive": 0
}
```

`version` is `GIT_SHA`, else Fly's image reference, else `dev`. When the agents failed to
load, `agents` is `{ "available": false, "error": "..." }` and the read routes keep working.

### Cities

`GET /api/cities` · no auth

Every city this deployment serves, one per file in `cities/`. Each is a `CityConfig` plus
two extra fields: `default` (true for the city served when no `?city=` is given) and
`decisions` (how many decisions it has).

```bash
curl https://municipal-agents.fly.dev/api/cities
```

### City

`GET /api/city` · no auth

One city's settings: a `CityConfig`.

| Query | Meaning |
|---|---|
| `city` | A city id. Default: the `CITY` environment variable, else the first file in `cities/`. An unknown id answers `404`. |

```bash
curl https://municipal-agents.fly.dev/api/city
```

```ts
interface CityConfig {
  id: string;                    // "waterloo-region"
  name: string;                  // "Waterloo Region"
  municipalities: string[];
  center: [number, number];      // [lng, lat]
  zoom: number;
  languages: string[];           // offered in the language menu: "en", "fr", "pa", ...
  officialNoticeUrl: string;
  clerkContact: string;
  gtfsUrl?: string;
  openData: { name: string; url: string; licence: string }[];
}
```

### Decisions

`GET /api/decisions` · no auth

The decision cards for the home page, soonest chance to take part first. Decisions with
no upcoming chance come last.

| Query | Meaning |
|---|---|
| `city` | Only this city's decisions (default: the default city). `all` for every city. A decision whose `city` matches no config counts as the default city's. |

```bash
curl https://municipal-agents.fly.dev/api/decisions
curl "https://municipal-agents.fly.dev/api/decisions?city=all"
```

Each item is a `DecisionCard` plus one extra field, `open`:

```ts
interface DecisionCard {
  id: string;
  plainTitle: string;
  decidedBy: string;
  status: "proposed" | "in-consultation" | "decided";
  next?: TimelineEvent;          // the soonest event with a way to take part that hasn't begun
  center: [number, number];
  reviewStatus: "draft" | "in-review" | "published" | "none";
  lenses: LensId[];              // "transit" | "cost" | "commitments" | "housing" | "construction"
}
// extra field on this route:
//   open: TimelineEvent[]       // ways to take part that have begun and not yet closed
```

```json
[
  {
    "id": "row-2027-budget",
    "plainTitle": "The Region's 2027 budget: what your regional taxes and water bills will pay for next year",
    "decidedBy": "Regional Council, Region of Waterloo",
    "status": "in-consultation",
    "next": {
      "id": "overview",
      "date": "2026-12-16",
      "kind": "council",
      "title": "Regional Council: 2027 Plan and Budget Overview",
      "plain": "Staff show the new Council the draft 2027 budget for the first time. You can ask to speak to Council or write to them.",
      "participation": [
        {
          "method": "speak",
          "instructions": "Register as a delegation with the Regional Clerk. ...",
          "deadline": "2026-12-09T12:00:00-05:00",
          "url": "https://forms.regionofwaterloo.ca/Council-and-Administrative-Services/CAS/Delegation-Registration",
          "contact": "regionalclerk@regionofwaterloo.ca, 519-575-4400"
        }
      ],
      "citation": { "sourceId": "row-2027-budget-page", "page": 7, "quote": "December 16, 2026 - 2027 Plan and Budget Overview" }
    },
    "open": [ { "id": "survey", "date": "2026-09-14", "end": "2027-02-26T23:59:00-05:00", "kind": "public-input", "...": "..." } ],
    "center": [-80.4925, 43.4643],
    "reviewStatus": "draft",
    "lenses": ["transit", "cost", "commitments", "housing"]
  }
]
```

### One decision

`GET /api/decisions/:id` · no auth (staff see more with the passcode)

The decision, its brief and its sources: a `DecisionDetail`. The lens results computed
from open data are merged into `brief.lenses`. When there is no brief yet, they come in
an extra top-level `lenses` field instead, so the large map layers are sent only once.

| Query | Meaning |
|---|---|
| `lang` | Optional language code (`fr`, `pa`, `zh`...). Serves a translation that was already made. It never starts a model run; if there is none, you get the original brief. To make one, use [Translate a brief](#translate-a-brief). |

```bash
curl https://municipal-agents.fly.dev/api/decisions/row-2027-budget
curl "https://municipal-agents.fly.dev/api/decisions/row-2027-budget?lang=fr"
```

```ts
interface DecisionDetail {
  decision: Decision;            // hand-checked metadata, timeline, map area
  brief?: Brief;                 // absent until the agents have drafted one
  sources: SourceDoc[];          // the documents this decision cites
}
// extra field on this route, only when there is no brief yet:
//   lenses: Brief["lenses"]     // { transit?, cost?, commitments?, housing?, construction? }
```

What residents get, and what staff get:

- `brief.review.status` says where the brief stands: `draft`, `in-review` or `published`.
  Show "Draft: not yet reviewed by staff" unless it is `published`.
- In a **published** brief, statements staff rejected are left out. A draft is shown whole,
  because it is labelled as a draft.
- With the staff passcode in `Authorization`, a published brief keeps its rejected
  statements, so staff can change their minds.
- `brief.lenses` is the computed lens (from `data/lenses/`) with what the agents added on
  top: their cited statements, the commitments they drafted, and any lens the computed
  data doesn't have.

A trimmed example of one statement in `brief.summary`:

```json
{
  "id": "s22",
  "text": "Regional Council decides the 2027 plan and budget for regional services.",
  "kind": "fact",
  "citations": [
    { "sourceId": "row-2027-budget-page", "page": 7, "quote": "December 16, 2026 - 2027 Plan and Budget Overview" }
  ],
  "verified": true
}
```

`verified` is set by the citation checker in code, never by a model: it is `true` only
when every quote was found on the page it names. After staff review, a statement also
has `review: { action, by, at, note?, originalText? }`.

### Calendar file

`GET /api/decisions/:id/calendar.ics` · no auth · cacheable for 5 minutes

The decision's upcoming chances to take part as an iCalendar file (RFC 5545), for "Add to
calendar". Times are in UTC; date-only events are all-day events. A participation deadline
that falls before its meeting (for example "register to speak by noon on 9 December") gets
its own short event. Each event says it is not the official notice and links to it.

```bash
curl -O https://municipal-agents.fly.dev/api/decisions/row-2027-budget/calendar.ics
```

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Municipal Agents//Have your say//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:The Region's 2027 budget: what your regional taxes and water bills will pay for next year
X-WR-TIMEZONE:America/Toronto
BEGIN:VEVENT
UID:row-2027-budget.survey@municipal-agents
DTSTART;VALUE=DATE:20270226
DTEND;VALUE=DATE:20270227
SUMMARY:Last day: Online budget survey and quiz on EngageWR: ...
...
```

Links back to the brief use `PUBLIC_URL` when it is set, otherwise the request's host.

### Calendar feed

`GET /api/calendar.ics` · no auth · CORS · cacheable for 15 minutes

One subscription feed for many decisions, for calendar apps to follow (`webcal://`). It
asks the app to refresh every 6 hours, keeps events from the last 30 days so they don't
vanish from people's calendars, and carries the same "not the official notice" line and
links as the single-decision file. Everyone gets the same public file: nothing personal
is asked for or stored.

| Query | Meaning |
|---|---|
| `decisions` | Comma-separated decision ids. An unknown id answers `404` naming it. |
| `city` | Without `decisions`: every decision of this city (`all` for every city). Default: the default city. |

```bash
curl "https://municipal-agents.fly.dev/api/calendar.ics?decisions=row-2027-budget,row-water-supply-2051"
```

### Subscribe links

`GET /api/calendar` · no auth · CORS

Ready-made links to subscribe to the [calendar feed](#calendar-feed) for the same
selection (same `decisions` and `city` query).

```bash
curl "https://municipal-agents.fly.dev/api/calendar?decisions=row-2027-budget"
```

```ts
{
  name: string;          // one decision: "Have your say: <plain title>"; a whole city: "Have your say: <city name>";
                         // several decisions or city=all: "Have your say: municipal decisions"
  ics: string;           // https://.../api/calendar.ics?decisions=...
  webcal: string;        // the same feed as webcal://
  google: string;        // add to Google Calendar
  outlook: string;       // add to Outlook.com
  decisions: { id: string; plainTitle: string; ics: string }[];  // each decision's own file
  privacy: string;       // a sentence saying nothing personal is asked for or stored
}
```

### Embed card

`GET /api/embed/:id` · no auth · CORS · cacheable for a minute

The compact card the [embeddable widget](embed.md) shows: the plain title, up to three
summary statements with their citations, the next chance to have a say, the review status
and links. Statements staff rejected are never included.

| Query | Meaning |
|---|---|
| `lang` | A language code. Uses a cached translation of the brief if there is one; otherwise the brief's own language. Never starts a model run. |

```bash
curl https://municipal-agents.fly.dev/api/embed/row-2027-budget
```

```ts
interface EmbedCard {
  id: string;
  plainTitle: string;
  decidedBy: string;
  status: "proposed" | "in-consultation" | "decided";
  lang: string;                  // the language the summary is in
  summary: {
    id: string; text: string; kind: StatementKind;
    verified: boolean;           // the citation checker's verdict
    edited: boolean;             // staff changed the wording
    citations: { sourceId: string; source: string; page: number; url: string }[];  // url opens the page with the quote
  }[];                           // at most 3, each with at most 3 citations
  next?: {
    id: string; title: string; plain: string; date: string; end?: string; location?: string;
    open: boolean;               // already begun (a survey that is open now)
    methods: { method: string; instructions: string; deadline?: string; url?: string }[];
  };
  review: { status: "draft" | "in-review" | "published" | "none"; by?: string; at?: string };
  readingGrade?: number;
  links: { brief: string; calendar: string; official: string; subscribe: string };
}
```

### Sources

`GET /api/sources` · no auth

Every document the agents can read: committed sources plus any PDFs staff uploaded.

```bash
curl https://municipal-agents.fly.dev/api/sources
```

```ts
interface SourceDoc {
  id: string;                    // "row-2026-budget-book"
  title: string;
  publisher: string;             // "Region of Waterloo"
  url: string;                   // where it was downloaded from
  published: string;             // the date the document carries
  retrieved: string;             // when it was downloaded
  pages: number;
  licence: string;               // "Public record", "Open Government Licence ..."
  kind: "staff-report" | "agenda" | "budget" | "plan" | "progress-report" | "dataset" | "notice" | "other";
}
```

### Source PDF

`GET /api/sources/:id/pdf` · no auth · cacheable for a day

The PDF exactly as published. Supports `Range: bytes=a-b` (answers `206`), which pdf.js
uses to load large documents in pieces, and a strong `ETag`.

```bash
curl -O https://municipal-agents.fly.dev/api/sources/row-2026-budget-book/pdf
```

### Page text

`GET /api/sources/:id/pages/:n` · no auth · cacheable for an hour

The text of one page, as the agents read it and as the citation checker matches quotes
against. Pages are numbered from 1.

```bash
curl https://municipal-agents.fly.dev/api/sources/row-2027-budget-page/pages/7
```

```json
{ "sourceId": "row-2027-budget-page", "page": 7, "pages": 10, "text": "..." }
```

A page outside `1` to `pages` answers `404`.

### Renders

`GET /api/renders/:file` · no auth · cacheable for a week

Illustrative images for the construction lens (`.png`, `.jpg` or `.webp`). The file names
are listed in the construction lens of a decision. Supports `Range` like the PDFs.

```bash
curl -O https://municipal-agents.fly.dev/api/renders/construction-launch-b4aa6a77.jpg
```

### The record

`GET /api/log` · no auth · `no-store`

The public, append-only record: every brief, citation check, question, answer, review,
publication and model call, oldest first. Entries whose content staff purged under the
city's records retention by-law are still listed, with `payload: null` and a `purged`
field.

| Query | Meaning |
|---|---|
| `decision` | Only entries about this decision id. |
| `kind` | Only this kind, for example `usage` or `brief.published`. |
| `after` | Only entries with `seq` greater than this. Use it to page forward. |
| `before` | Only entries with `seq` less than this. |
| `limit` | At most this many (1 to 10,000; default 10,000). |
| `order` | `desc` for newest first; otherwise oldest first. |

```bash
curl "https://municipal-agents.fly.dev/api/log?limit=2&order=desc"
curl "https://municipal-agents.fly.dev/api/log?decision=row-2027-budget&kind=statement.reviewed"
```

```ts
interface LogEntry {
  seq: number;
  at: string;                    // ISO time, UTC
  actor: string;                 // "agent:lead", "agent:transit-access", "staff:ana-silva", "visitor", "system"
  kind:
    | "source.added" | "brief.started" | "brief.generated"
    | "statement.recorded" | "statement.rejected" | "statement.reviewed"
    | "brief.published" | "question.asked" | "answer.given"
    | "translation.made" | "usage"
    | "record.purged" | "record.migrated";
  decisionId?: string;
  payload: unknown;              // depends on kind; null once purged
  payloadHash?: string;          // sha256(canonical JSON of payload)
  prevHash: string;              // the previous entry's hash; 64 zeros for the first
  hash: string;                  // sha256(prevHash + canonical JSON of {seq, at, actor, kind, decisionId, payloadHash})
  purged?: { at: string; reason: string; bySeq: number }; // set when the content was purged; bySeq is the record.purged entry
  legacyHash?: string;           // entries written before payload hashing: their original hash
}
```

The chain hashes each payload's own hash, not the payload, so content can be purged and
every hash still checks out. Canonical JSON means keys sorted, no whitespace and
undefined keys dropped ([`server/canonical.ts`](../../server/canonical.ts)). Anyone can
recompute every hash; the Record page does it in the browser with the Web Crypto API.
Questions are logged with the actor `visitor` and nothing that identifies the person.

Two kinds are the record's own bookkeeping:

- `record.purged`: staff purged another entry's content. Payload:
  `{seq, kind, payloadHash, reason, by?}` (the purged entry, its kind and payload hash,
  why, and the reviewer's name if given).
- `record.migrated`: written once when a record from before payload hashing (format 1)
  was converted. Payload: `{from, to, entries, legacyHeadHash, headHash, why}`. Each
  converted entry keeps its old hash as `legacyHash`.

### Verify the record

`GET /api/log/verify` · no auth · `no-store`

The server recomputes every hash from the first entry and says whether the chain holds.

```bash
curl https://municipal-agents.fly.dev/api/log/verify
```

```json
{ "intact": true, "count": 14, "headHash": "2a4c724983a8754abda02b5360e4c4c130858ed3f771798241932864d948fd2b" }
```

It checks each entry's link to the one before, its hash, that its content matches its
`payloadHash`, and that any content that is gone has a `record.purged` entry naming that
entry and that payload hash. When some content has been purged, the answer adds
`purged` (how many entries). When the chain doesn't hold, it adds `brokenAt` (the first
bad `seq`) and `reason`, for example "content was removed without a record.purged
entry". Keep
`headHash` somewhere the city doesn't control alone: any later rewrite of the record would
no longer lead to it.

### Spend

`GET /api/usage` · no auth · `no-store`

What the agents have cost, summed from the `usage` entries in the record: a `UsageSummary`
plus the method used for the energy estimate.

```bash
curl https://municipal-agents.fly.dev/api/usage
```

```json
{
  "calls": 8,
  "inputTokens": 42846,
  "outputTokens": 1194,
  "costUsd": 0.036612,
  "energyWh": 1.644,
  "co2eGrams": 0.0493,
  "byModel": {
    "gemini-3.6-flash": { "calls": 8, "inputTokens": 42846, "outputTokens": 1194, "costUsd": 0.036612 }
  },
  "today": { "costUsd": 0.036612, "limitUsd": 5 },
  "method": {
    "whPerInputToken": 0.00003,
    "whPerOutputToken": 0.0003,
    "gridGCo2ePerKwh": 30,
    "note": "Energy is an estimate: tokens times an assumed Wh per token, ..."
  }
}
```

Energy and CO2e are estimates from token counts, not measurements.

### OpenAPI

`GET /api/openapi.json` · no auth · CORS

This API as an OpenAPI 3.1 document, for code generators and API tools. The data shapes
are generated from `shared/types.ts` (`scripts/openapi-schemas.ts`), and a test fails if
a route is missing from it, so it stays in step with the code.

```bash
curl https://municipal-agents.fly.dev/api/openapi.json
```

## Routes that run the agents

These two routes can spend money on model calls. They share the per-visitor limit, the
run slots and the daily cap described in [Limits](#limits).

### Ask a question

`POST /api/decisions/:id/ask` · no auth · streams events

Ask anything about one decision in plain words, in any language. The answer arrives as a
stream of [server-sent events](#streaming-events): the lead agent's plan, each specialist's
steps, every statement that passed the citation check, then the answer.

```ts
// request body (JSON)
{
  question: string;              // required, 1 to 1,000 characters
  audiences?: AudienceId[];      // "renter" | "homeowner" | "transit-rider" | "driver" | "walk-cycle"
                                 // | "business-owner" | "senior" | "student" | "parent" | "disability" | "newcomer"
  lang?: string;                 // answer language, e.g. "fr"; unknown audiences and bad codes are ignored
}
```

```bash
curl -N https://municipal-agents.fly.dev/api/decisions/row-2027-budget/ask \
  -H 'Content-Type: application/json' \
  -d '{"question": "When can I speak to Council about the budget?", "audiences": ["renter"]}'
```

> [!WARNING]
> Every question is written to the public record, word for word. Don't put names,
> addresses or other personal details in a question. A new question also spends real
> money from the daily budget.

What happens, in order:

1. The question is checked: not empty, under 1,000 characters, the decision exists.
2. **Answer cache.** If a real run already answered the same question (or a very close
   one with the same numbers) for this decision, in the same language and for the same
   audiences, that run is replayed from its saved file. It costs nothing and skips the
   daily cap, but still counts toward the visitor's limit. The answer carries a `replay`
   field and a line saying when it was answered.
3. Otherwise the cheap checks run before any money is spent: agents loaded, daily cap,
   visitor limit, a free run slot.
4. The question is logged (`question.asked`), the stream opens, and the agents work.
   Every event is also saved to `runs/<runId>.jsonl` in the data folder.
5. The stream ends with `answer` then `done`, or `error` then `done`.

If the model can't be reached (no credit, an outage, no API key), the lead answers
**without a model**: it ranks the brief's checked statements against the question and
shows the best few with their citations. That answer has `offline: true` and costs nothing.

The answer's `text` carries `[n]` markers; `n` is the 1-based position in
`answer.statements`. Before you see it, code drops any sentence that gives voting advice
or has a number not found in a cited statement or the decision's timeline.

### Translate a brief

`POST /api/decisions/:id/translate` · no auth

The decision's brief in another language, made by the translator agent the first time and
cached after that. Citations keep their original quotes, so they still match the page.

```ts
// request body (JSON)
{ lang: string }                 // a language code: "fr", "pa", "zh", "pt-br"
// response: Brief, as residents see it (rejected statements left out once published)
```

```bash
curl https://municipal-agents.fly.dev/api/decisions/row-2027-budget/translate \
  -H 'Content-Type: application/json' \
  -d '{"lang": "fr"}'
```

- If `lang` is the brief's own language, you get the brief straight away.
- A cached translation is reused while the brief it came from is unchanged (it stores the
  source brief's hash). After staff edit or publish, the next request makes a new one.
- Two visitors asking for the same language at once share one run.
- A translation can take a minute. If it isn't ready in 10 s, the server sends the
  headers and a space every 10 s (JSON allows leading spaces) so proxies keep the
  connection open. If it then fails, the body is `{"error": "..."}` with status `200`, so
  check for an `error` field.
- `404` if the decision has no brief yet; `400` if `lang` isn't a language code.
- Each new translation is logged as `translation.made`.

## Staff routes

Staff routes need the passcode set in `STAFF_TOKEN`, sent as a bearer token. It is
compared in constant time. If the server has no `STAFF_TOKEN`, these routes answer `503`.

```http
Authorization: Bearer <STAFF_TOKEN>
```

Every staff action is written to the public record with the reviewer's name
(`"Ana Silva"` becomes the actor `staff:ana-silva`). See the [staff guide](staff.md) for the
screens built on these routes.

> [!IMPORTANT]
> One shared passcode is a prototype shortcut. A production deployment should use the
> city's single sign-on with individual accounts. **Planned**

### Check the passcode

`GET /api/staff/check` · staff

Lets the staff screen check a passcode before showing its tools.

```bash
curl https://municipal-agents.fly.dev/api/staff/check -H "Authorization: Bearer $STAFF_TOKEN"
```

```json
{ "ok": true }
```

Wrong or missing passcode: `401 {"error": "Staff passcode required."}`.

### Start a brief

`POST /api/staff/briefs` · staff · streams events

The agents draft a full brief for a decision. The explainer works twice: once on the
overview (what's proposed, why now, how to have a say) and once on the impacts (who it may
affect, trade-offs, unknowns). One specialist works on each lens the decision lists. Then
a plain-language pass rewrites sentences above grade 8 and adds glossary terms. Progress streams as
[events](#streaming-events), ending with a `brief` event, then `done`.

The new brief is saved with `review.status: "draft"`, replacing the previous one (the old
file is kept in `cache/brief-history/`). It is logged as `brief.generated` by the lead agent
with its statement and rejection counts, reading grade, calls, cost and models (the
server adds its own entry, with the brief's hash, only if the agents didn't log one).

Two ways to call it.

**From a decision's existing sources** (JSON body):

```ts
{ decisionId: string; reviewer?: string }   // "by" is accepted as another name for "reviewer"
```

```bash
curl -N https://municipal-agents.fly.dev/api/staff/briefs \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "row-2027-budget", "reviewer": "Ana Silva"}'
```

**From a PDF you upload** (`multipart/form-data`). The PDF becomes a new source and a new
decision (status `proposed`, id `upload-<title>-<random>`), and the agents draft its brief
straight away.

| Field | Required | Meaning |
|---|---|---|
| any file field (e.g. `file`) | yes | The PDF. Up to 30 MB and 600 pages. It must have a text layer. |
| `title` | no | Document title. Default: the file name. |
| `reviewer` | no | Your name, for the record. |
| `plainTitle` | no | The decision's plain-language title. Default: the title. |
| `decidedBy` | no | Who decides. Default: "To be confirmed by staff". |
| `publisher` | no | Default: "Uploaded by city staff". |
| `url` | no | Where the document is published. |
| `officialUrl` | no | The official notice. Default: `url` (empty when no `url` is sent, so send one of the two). |
| `published` | no | The date the document carries. Default: today. |
| `licence` | no | Default: "Public record". |
| `kind` | no | A `SourceDoc` kind. Default: `staff-report`. |

```bash
curl -N https://municipal-agents.fly.dev/api/staff/briefs \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -F file=@staff-report.pdf \
  -F title="Report PDS-26-101: Main Street bike lanes" \
  -F decidedBy="Planning and Development Committee" \
  -F reviewer="Ana Silva"
```

**Replay the agents' last real run** (JSON body `{decisionId, replay: true}`). Streams
the saved events of the real run that drafted the current brief (or, if that one isn't
saved, the most recent saved brief run), ending with the current brief.
No model call, no spend, nothing written. `404` with "There's no saved run of the agents
drafting this brief." when none is saved.

```bash
curl -N https://municipal-agents.fly.dev/api/staff/briefs \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "row-2027-budget", "replay": true}'
```

The upload is logged as `source.added` with the file's SHA-256. Uploads live in
`uploads/` in the data folder and survive redeploys. The server needs `pdftotext` (from
poppler-utils, included in the Docker image) to read them.

An uploaded decision has no timeline yet. Add its dates and ways to take part to its
decision file before residents rely on "Have your say" (see
[Adapt it to your city](adapt-your-city.md#write-a-decision-file)).

### Review a statement

`POST /api/staff/review` · staff

Approve, edit or reject one statement, with an optional note. The first review moves the
brief from `draft` to `in-review`.

```ts
// request body (JSON)
{
  decisionId: string;
  statementId: string;
  action: "approve" | "edit" | "reject";   // "approved", "edited", "rejected" also accepted
  text?: string;                           // required for "edit": the new wording, up to 2,000 characters
  note?: string;                           // why, up to 2,000 characters
  reviewer?: string;                       // your name; "staff" if left out
}
// response
{ statement: Statement; brief: Brief }
```

```bash
curl https://municipal-agents.fly.dev/api/staff/review \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "row-2027-budget", "statementId": "s22", "action": "edit",
       "text": "Regional Council decides the 2027 budget for regional services.",
       "note": "Shorter", "reviewer": "Ana Silva"}'
```

- An edit keeps the first wording in `review.originalText`. Approving an edited statement
  keeps it marked `edited`, so residents still see that staff changed it.
- After any review, the statement's citations are checked again against the new wording.
  `verified` always says what the checker says now. Problems are returned in the record
  entry.
- An edit recomputes the brief's reading grade.
- Logged as `statement.reviewed`, with the before and after text for an edit, the
  reviewer's name and the new brief hash.

### Publish a brief

`POST /api/staff/publish` · staff

Publish the brief under a named reviewer. Every statement must have been approved,
edited or rejected first.

```ts
// request body (JSON)
{ decisionId: string; reviewer: string }   // reviewer is required
// response
{ brief: Brief }                           // review: { status: "published", by, at }
```

```bash
curl https://municipal-agents.fly.dev/api/staff/publish \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"decisionId": "row-2027-budget", "reviewer": "Ana Silva"}'
```

- `400` without a reviewer's name.
- `409` while statements are unreviewed, for example: "3 of 41 statements haven't been
  reviewed yet. Approve, edit or reject each one before publishing."
- The reading grade is recomputed on what residents will read (without rejected
  statements).
- Logged as `brief.published` with the counts approved, edited and rejected.

### What residents are asking

`GET /api/staff/insights` · staff

An aggregated view of the questions residents asked: how many, in which languages, for
which audiences, on which topics, how many went unanswered or were answered offline or
from the answer cache, and which source pages answers cited most. It is built so that no
one person's question is exposed.

| Query | Meaning |
|---|---|
| `decision` | Only this decision. Without it, all decisions, with a count for each. |
| `days` | The period, in days back from now: 1 to 3,650, default 30. |

```bash
curl "https://municipal-agents.fly.dev/api/staff/insights?decision=row-2027-budget&days=30" \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

The privacy rule (k-anonymity with k = 3), also returned in the response as `privacy`:

- Counts only: questions per day, languages, audiences, topics, unanswered and offline
  answers, the pages answers cited.
- Wording is shown only for a group of at least 3 similar questions (half or more of
  their words in common, common words ignored), as the group's most typical question with
  emails, phone numbers, web addresses, postal codes and long numbers replaced by
  `[removed]`, beside the words at least 3 of them share.
- Smaller groups are counted under `suppressed`, never shown.

Response fields: `decision`, `decisions` (without `decision`), `period`, `totals`
(`questions`, `answered`, `unanswered`, `offline`, `replayed`), `perDay`, `languages`,
`audiences`, `topics`, `similar` (`questions`, `example`, `sharedWords`, `topic`),
`suppressed`, `citedPages` and `privacy`.

### Purge an entry's content

`POST /api/staff/purge` · staff · JSON body

Removes one entry's content when its retention period under the city's records
retention by-law has ended. The entry keeps its header, `payloadHash` and `hash`, so the
chain still verifies, and a `record.purged` entry is appended saying which entry, why and
who ([`server/routes/records.ts`](../../server/routes/records.ts)).

| Field | Required | Meaning |
|---|---|---|
| `seq` | yes | The entry whose content to purge (a whole number, 1 or more). |
| `reason` | yes | Why, in words, up to 500 characters. For example the by-law and schedule. |
| `reviewer` or `by` | no | Your name, up to 80 characters. The actor becomes `staff:<name>`; without it, `staff`. |

```bash
curl -X POST https://municipal-agents.fly.dev/api/staff/purge \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"seq": 42, "reason": "Retention period ended under By-law 2024-01, schedule B", "reviewer": "Ana Silva"}'
```

The answer is `{purged, record}`: the entry, now with `payload: null` and `purged` set,
and the new `record.purged` entry. Both are `LogEntry`s.

| Status | When |
|---|---|
| `200` | Purged. |
| `400` | `seq` missing or not a whole number of 1 or more, or no `reason`. |
| `401` | Wrong or missing passcode. |
| `404` | No entry with that `seq`. |
| `409` | Its content was already purged, or it is a `record.purged` or `record.migrated` entry (the record's own bookkeeping is kept). |

> [!NOTE]
> A purged `usage` entry no longer counts toward the spend page or the daily cap, which
> both read the content of `usage` entries.

## Streaming events

`ask` and `staff/briefs` answer with `Content-Type: text/event-stream`. Each event has a
name equal to its `type`, and its data is the whole event as JSON. A shortened,
illustrative transcript of a question:

```text
: stream open

event: plan
data: {"type":"plan","agent":"lead","steps":[{"id":"step-1","specialist":"explainer","question":"How and when can residents speak to Council about the 2027 budget?"}]}

event: step.start
data: {"type":"step.start","id":"step-1","specialist":"explainer","question":"How and when can residents speak to Council about the 2027 budget?"}

event: tool
data: {"type":"tool","id":"step-1","specialist":"explainer","tool":"search_pages","summary":"Searched the documents for \"delegation register speak\": row-delegation-guide p.1, ..."}

event: statement
data: {"type":"statement","id":"step-1","statement":{"id":"s1","text":"You can register online to speak as a delegation to Regional Council.","kind":"fact","citations":[...],"verified":true}}

: ping

event: usage
data: {"type":"usage","calls":4,"inputTokens":18210,"outputTokens":612,"costUsd":0.015954}

event: step.end
data: {"type":"step.end","id":"step-1","specialist":"explainer","status":"done","summary":"..."}

event: answer
data: {"type":"answer","text":"You can register online to speak as a delegation to Regional Council [1]. ...","statements":[...]}

event: done
data: {"type":"done"}
```

Lines starting with `:` are comments: `: stream open` at the start and `: ping` every
15 s, so proxies keep the connection open. The stream always ends with one `done`. If you
close the connection, the run is cancelled.

### Event types

These are the `AgentEvent` shapes from [`shared/types.ts`](../../shared/types.ts).

| `type` | Fields | When |
|---|---|---|
| `plan` | `agent`, `steps: {id, specialist, question}[]` | The lead has decided which specialists to ask. A brief's steps are `overview`, `impacts` and one per lens. |
| `step.start` | `id`, `specialist`, `question` | A specialist starts. The plain-language pass shows up as a step with id `plain` and specialist `lead`. |
| `tool` | `id`, `specialist`, `tool`, `summary` | A specialist used a tool: `search_pages`, `read_page`, `record_statement`, a lens tool... `summary` is one plain line for the steps panel. |
| `statement` | `id`, `statement: Statement` | A statement passed the citation check and was recorded. A rejected attempt sends no `statement` event: its `tool` event's summary starts "Rejected a statement:", and the record gets a `statement.rejected` entry with the reasons. |
| `step.end` | `id`, `specialist`, `status: "done" \| "failed"`, `summary` | A specialist finished or stopped. |
| `usage` | `calls`, `inputTokens`, `outputTokens`, `costUsd` | Running totals for this run, after each model call. |
| `answer` | `text`, `statements`, `figures?`, `offline?`, `replay?` | `ask` only. `[n]` in `text` points at `statements[n-1]`. `offline: true` when answered without a model. `replay: {runId, at, label, costUsd?}` when replayed from a saved run. |
| `brief` | `brief: Brief` | `staff/briefs` only. The finished draft. |
| `error` | `message` | Something stopped the run. The message is plain and safe to show. |
| `done` | | Always last. |

### Reading the stream in JavaScript

`EventSource` only does `GET`, so read the `POST` response with `fetch`:

```ts
async function ask(decisionId: string, question: string, onEvent: (e: any) => void) {
  const res = await fetch(`https://municipal-agents.fly.dev/api/decisions/${decisionId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error((await res.json()).error); // 400, 404, 429, 503...
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
      if (data) onEvent(JSON.parse(data)); // comments (": ping") have no data line
    }
  }
}

await ask("row-2027-budget", "When can I speak to Council?", (e) => {
  if (e.type === "tool") console.log("·", e.summary);
  if (e.type === "answer") console.log(e.text);
  if (e.type === "error") console.error(e.message);
});
```

`ask` sends no CORS headers, so this works from a page on the same origin, from Node 24
(which has `fetch` built in), or through your own server.

## Types

All shapes are in one file, [`shared/types.ts`](../../shared/types.ts). Changes to it are
additive only, so a client written against today's shapes keeps working. The main ones:

| Type | What it is |
|---|---|
| `Decision` | A proposed decision: titles, who decides, status, official link, sources, timeline, map area, lenses. Hand-checked. |
| `TimelineEvent`, `Participation` | A date in the decision's life, and the ways to take part (speak, write, survey, attend, watch, contact a councillor) with deadline, link and contact. |
| `Brief` | What the agents wrote: summary, why now, impacts by audience, have your say, figures, unknowns, trade-offs, glossary, lenses, review status. |
| `Statement`, `Citation` | One sentence and the quotes that back it, each with a source id and page. |
| `Figure` | A number on screen: `cited`, `computed` (with its formula and inputs) or an `assumption`. |
| `TransitLens`, `CostLens`, `CommitmentsLens`, `HousingLens`, `ConstructionLens` | The lens results. See the [planners' guide](planners.md). |
| `LogEntry` | One entry in the public record. |
| `AgentEvent` | One streamed event. |
| `UsageSummary` | The spend page's numbers. |

The full, machine-readable version is [`/api/openapi.json`](#openapi).
