---
title: Security and privacy
description: What data Municipal Agents keeps and where, how staff access and secrets are protected, the limits that stop abuse, where data leaves Canada, and what a city should change before production.
---

Municipal Agents is designed so that there is very little to protect: no resident
accounts, no personal information, and only documents the city has already published.
This page says what the prototype does today, what its limits are, and what a city
should change before relying on it. It is written for city IT, privacy and records
staff. The reasoning behind each choice is in [the architecture](../architecture.md#6-security-and-privacy).

## What we keep, and where

| Data | Where it lives | Who can see it |
|---|---|---|
| Source documents (PDFs and their page text) | In the deployed image, and uploads on the data volume | Everyone: they are public documents, served at `/api/sources/<id>/pdf` |
| Decisions (hand-checked dates and ways to take part) | In the image; uploaded ones on the volume | Everyone |
| Briefs and translations | On the data volume (`briefs/`), with every earlier version in `cache/brief-history/` | Everyone. A draft is shown labelled as a draft; once published, statements staff rejected are left out for everyone but staff |
| The record: briefs, checks, questions, answers, reviews, publications, model spend | `log.db` (SQLite) on the volume | Everyone, at `/log` and `GET /api/log` |
| Each agent run's events | `runs/<run id>.jsonl` on the volume | Server operators only; there is no public route for these files |
| Staff passcode, model API key | Environment variables (Fly secrets) | Server operators only |
| Internet addresses | In the server's memory only, for the rate limit | Nobody; never written to disk or logs |

On the public site, the data volume is on Fly.io in Toronto (`yyz`).

## No personal information, by design

- **No accounts and no sign-in for residents.** There is nothing to register and no
  profile to keep.
- **No tracking.** The web app loads no analytics or advertising scripts and sets no
  cookies. The theme and language you pick are saved in your own browser's storage.
- **Questions carry no identity.** A question is written to the record with the actor
  `visitor` and only the question text, the audiences picked, the language and the id
  of the agents' run (or of the saved run it was replayed from). No name, account,
  internet address or device id.
- **Internet addresses stay in memory.** The per-visitor rate limit needs to count
  requests from one address. It holds the address in the server's memory only, and
  never writes it to the record, a file or the server's logs.
- **The server's own logs** record the method, the path, the status and the time taken
  for each request. No internet addresses and no query strings.
- **The neighbourhood search runs in the browser.** The list of places is part of the
  page, so what a resident types there is never sent anywhere.
- **Public office contacts only.** Contacts in the briefs are offices (the clerk's
  office, a project team), not staff members' names. The agents' rules tell them to
  name offices, not people.

### What is public that people might not expect

> [!WARNING]
> **Questions are public.** Every question asked, and its answer, is in the public
> record. If a resident types their name, address or health details into a question,
> that text is published. The resident guide asks people not to. Automatic removal of
> personal details before a question is logged is **Planned**. Today, staff can purge
> that entry's content afterwards (see [records retention](#records-retention-and-purging)).

- **Staff names are public.** The name a reviewer types goes on every review and
  publication, in the brief and in the record (for example `staff:ana-silva`). This is
  deliberate: accountability sits with a named person.
- **Notes on reviews are public** in the record.
- **Uploaded PDFs are public.** An upload becomes a source anyone can download. Upload
  only documents the city has already published.
- **Map tiles come from OpenFreeMap** directly to the resident's browser, so
  OpenFreeMap sees the resident's internet address, as any website host would. No API
  key or tracking is involved.

## Staff access

- Staff routes need the passcode in an `Authorization: Bearer <passcode>` header. The
  server compares SHA-256 digests of the sent value and the real one with a
  constant-time comparison (`requireStaff` in
  [server/routes/staff.ts](../../server/routes/staff.ts)), so timing gives nothing away.
- A wrong or missing passcode gets `401`. If the server has no passcode set
  (`STAFF_TOKEN`), every staff route answers `503`: staff tools are off rather than
  open.
- The staff screen keeps the passcode in the browser tab's session storage only, until
  sign-out or the tab closes.

> [!IMPORTANT]
> The prototype uses **one shared passcode**, not individual accounts, and does not
> limit how many wrong passcodes can be tried. Use a long random passcode (32 or more
> characters), share it only with reviewers, and change it when someone leaves. For
> production, staff sign-in should go through the city's single sign-on with individual
> accounts and roles (drafter, reviewer, publisher). That is **Planned**.

## Secrets

- `GEMINI_API_KEY` and `STAFF_TOKEN` are environment variables, set as Fly secrets on
  the public site. They are never committed; the repository's `.gitignore` and
  `.dockerignore` keep `.env` files out of Git and out of the image.
- The model API key is only ever sent in a request header to Google
  (`x-goog-api-key`), never in a URL. Error messages from the model client never echo
  request headers.

## Limits that stop abuse and runaway spending

| Guard | Default | Setting |
|---|---|---|
| JSON request body | 64 KB | fixed |
| PDF upload | 30 MB, 600 pages, must have a text layer | fixed |
| Question length | 1,000 characters | fixed |
| Staff edit or note | 2,000 characters | fixed |
| Questions and new translations per internet address | 10 per 10 minutes | `ASK_PER_WINDOW`, `ASK_WINDOW_MIN` |
| Agent runs at once, across the site | 4 | `MAX_CONCURRENT_RUNS` |
| One question | 4 minutes, 40 model calls or US$0.50 | `RUN_TIMEOUT_SEC` (calls and dollars fixed) |
| One brief or translation | 15 minutes, 40 model calls or US$0.50 | `BRIEF_TIMEOUT_SEC` |
| Model spending per day | US$5, resets at midnight Toronto time | `DAILY_LIMIT_USD` |

Checks run cheapest first, so a refused request costs nothing. When a limit is reached,
residents get a plain message, and briefs, sources and the record keep working because
none of them call a model.

## Web security headers

Every response carries security headers set in one place
([server/security.ts](../../server/security.ts)):

- `Strict-Transport-Security` (two years), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`,
  `Cross-Origin-Opener-Policy: same-origin`;
- a `Permissions-Policy` that turns off the camera, microphone, payment, USB and other
  device features;
- a Content-Security-Policy for pages that allows scripts only from the site itself
  (plus the exact inline scripts each page carries, by hash), and map tiles only from
  OpenFreeMap. The API gets a stricter policy that lets nothing run.

The web app is served from the same origin as the API, so most of the API sends no CORS
headers. The routes meant for other sites send `Access-Control-Allow-Origin: *`: the
embed card data (`/api/embed/:id`), the calendar feed (`/api/calendar`,
`/api/calendar.ics`), the OpenAPI description and `/embed.js` itself. They are read-only
and carry no cookies. A `security.txt` file (RFC 9116) at `/.well-known/security.txt` says how to
report a security problem.

## Prompt injection

Text inside a source PDF could try to give the agents instructions. The damage such
text can do is limited by design:

- the agents' tools only search and read this decision's pages and lens results, and
  record statements into a draft. They can't browse, send email, reach other files or
  change any other data;
- every statement must quote words found on the cited page, and advice on how to vote
  or what to think is refused by code;
- a new draft is always saved as a draft, whatever the agents produce;
- staff review every statement before anything is published.

## Where data goes outside Canada

- **Stored data stays in Canada.** On the public site, the record, briefs, uploads and
  run files are on one Fly.io machine and volume in Toronto (`yyz`).
- **Model calls go to the United States.** To draft briefs, answer questions and
  translate, the server sends public document text and residents' questions to
  Google's Gemini API (default model `gemini-3.6-flash`), which processes them in the
  US. Google's paid-tier terms say prompts are not used to improve its products; check
  the current terms before relying on that.

For production, a city should use a model hosted in Canada or on its own servers. The
model is called from one small file ([agents/gemini.ts](../../agents/gemini.ts)), and
the checks that decide what residents see do not depend on the model. See
[self-hosting](self-host.md) for the options.

### Ontario context

- **MFIPPA.** The prototype collects no personal information on purpose. Questions
  residents type are the one place personal information could appear, which is why they
  should be screened (see the warning above). A city should still complete a privacy
  impact assessment before use.
- **Bill 194** (Strengthening Cyber Security and Building Trust in the Public Sector
  Act, 2024) lets the province require public sector bodies that use AI to inform the
  public, keep an accountability framework, manage risk and have a person oversee it.
  The prototype labels every brief's review status ("Draft: not yet reviewed by city
  staff", or the approver's name and date), labels translations as machine translation
  by AI, and puts a named approver on every published brief. A plain note on every
  brief saying AI agents drafted it is not on the page yet and should be added.
- **Records retention.** The record is append-only, so it can serve as the record of
  what was published and approved. How long to keep each kind of entry is the city's
  call under its retention by-law; staff can purge an entry's content when its period
  ends (below).

The [readiness report](../../report/municipal-readiness-report.pdf) covers this in more
detail.

## The record can't be changed quietly

Every brief, check, question, answer, review, publication and model call is appended to
the record in SQLite. Each entry's hash is SHA-256 of the previous entry's hash plus a
canonical JSON of the entry's header and the SHA-256 of its content (`payloadHash`),
starting from 64 zeros. Database triggers refuse any `UPDATE` or `DELETE` on the chain,
and allow only one change to content: a purge (below). The whole chain is checked,
including that each entry's content still matches its hash:

- at every start-up of the server;
- on request, at `GET /api/log/verify`;
- in every visitor's browser on the record page, with the browser's own SHA-256
  (Web Crypto), so nobody has to take the server's word for it.

```bash
curl https://municipal-agents.fly.dev/api/log/verify
# {"intact":true,"count":14,"headHash":"2a4c7249..."}
```

> [!WARNING]
> **The limit of a hash chain.** Anyone who controls the server could rebuild the whole
> chain from the start, and it would still check out. The fix is to publish the latest
> hash (`headHash`) somewhere the city does not control alone, such as council minutes,
> a public Git repository or a timestamping service, on a schedule. Then any rewrite
> would no longer match a hash already published. This is **Planned**, not built.

### Records retention and purging

A municipality may have to destroy a record when its retention period under its records
retention by-law ends (Municipal Act, 2001, s. 255), and an append-only record can't
delete anything. So the chain covers each entry's content hash rather than the content
itself, and staff can purge one entry's content with `POST /api/staff/purge`, giving a
reason ([staff guide](staff.md#purge-content-when-its-retention-period-ends)):

- the content is removed and served as `null`; the entry's header and content hash
  stay, so the chain still verifies and the old content can't be swapped for something
  else unnoticed;
- a `record.purged` entry says which entry, why and who, and can't itself be purged;
- content that disappears any other way breaks the chain check, on the server and in
  the browser.

The same tool handles a question in which someone typed personal details: purge that
`question.asked` entry (and its `answer.given` entry, which repeats the question).

> [!WARNING]
> A purge clears the public record only. The agents' run files on the server
> (`runs/<run id>.jsonl` in the data folder) also keep the question text; they are not
> served by the API, but someone with access to the server must delete that file by
> hand. Backups and volume snapshots taken earlier still hold the content until they
> expire.

Back up the data volume too: if it is lost, the record is lost. Fly.io takes volume
snapshots; publishing the head hash also lets a restored copy be checked.

## Report a problem

To report a security problem, use the contacts in `/.well-known/security.txt`, or open
a private advisory on the
[GitHub repository](https://github.com/RichardLi-1/municipal-agents/security/advisories/new).
Please don't test against the public site with real personal data or load tests.

## Before production: what a city should change

1. A model hosted in Canada or on the city's own servers, and a privacy impact
   assessment.
2. Staff sign-in through the city's single sign-on, with individual accounts and roles.
3. Publish the record's head hash on a schedule, outside the city's sole control.
4. Screen questions for personal details before they are logged.
5. Agent runs as queued jobs, and published briefs served from a CDN.
6. A "report an error" flow that goes to the clerk's office and is itself logged.
7. An accessibility audit with residents who use assistive technology, and community
   review of translations for the top languages.
8. Volume backups with a retention period the records team signs off.

Items 1 to 7 come from [the architecture](../architecture.md#8-what-would-change-for-production).
