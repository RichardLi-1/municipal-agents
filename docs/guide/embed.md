---
title: Embed a brief
description: Put a decision's plain-language card, with its citations and the next chance to have a say, on a city web page with one script tag.
---

A city's own website is where most residents look first. The embeddable widget puts a
compact card about one decision there: the plain title, up to three cited summary
statements, the next chance to have a say with a countdown and "Add to calendar", the
staff review status, and links to the full brief and the official notice.

It is one small script with no dependencies ([`embed/embed.js`](../../embed/embed.js)).
See it on a mock city page at `/embed/demo`
(for example `https://municipal-agents.fly.dev/embed/demo`).

## The snippet

Paste this where the card should appear, and set `data-decision` to your decision's id:

```html
<script src="https://municipal-agents.fly.dev/embed.js" data-decision="row-2027-budget"></script>
```

The card is inserted just before the script tag.

For several cards on one page, load the script once and mark a placeholder for each card:

```html
<div data-municipal-agents data-decision="row-2027-budget"></div>
<div data-municipal-agents data-decision="row-water-supply-2051" data-lang="fr"></div>
<script src="https://municipal-agents.fly.dev/embed.js"></script>
```

## Options

Set these as `data-` attributes on the script tag or on a placeholder `div`.

| Attribute | Default | Meaning |
|---|---|---|
| `data-decision` | none (required) | The id of the decision to show. |
| `data-lang` | the page's `lang`, else `en` | The card's language. The interface text is in English and French; other languages use English labels. The summary is shown in that language if a translation of the brief has already been made (see [Translate a brief](api.md#translate-a-brief)); otherwise in the brief's own language. |
| `data-theme` | `auto` | `light`, `dark`, or `auto` to follow the visitor's system setting. |

On a self-hosted copy, load `embed.js` from your own address. The card reads its data
from the same server the script came from.

## Find a decision's id

The id is the last part of a decision's address on the site: `/d/row-2027-budget` has the
id `row-2027-budget`. Or list the decisions with the API:

```bash
curl -s "https://municipal-agents.fly.dev/api/decisions?city=all" | jq -r '.[] | "\(.id)  \(.plainTitle)"'
```

```text
kitchener-transit-hub-variances  Kitchener's new central transit hub asks to bend six zoning rules
row-water-supply-2051  ...
row-2027-budget  The Region's 2027 budget: what your regional taxes and water bills will pay for next year
```

## What the card shows

| Part | What residents see |
|---|---|
| Header | Status ("Proposed decision", "In consultation", "Decided"), who decides, and the plain title. |
| Review status | "Reviewed and approved by city staff" with the name and date once published; "Being reviewed by city staff"; "Draft: not yet reviewed by city staff"; or, with no brief yet, "A plain-language brief is being prepared." |
| What's proposed | Up to three summary statements. Each has "[Source, p. N]" links that open the cited page with the quote, a "Citation not checked" tag if the checker didn't verify it, and "Edited by staff" if staff changed the wording. Statements staff rejected are never shown. |
| Next chance to have your say | The next meeting or deadline with a live countdown (or "Open now" for a survey that is running, with when it closes), the place, a plain description, up to three ways to take part with their deadlines, and "Add to calendar" (the decision's `.ics` file). |
| Links | "Read the full brief" and "Official notice", both opening in a new tab. |
| Footer | "Explained by Municipal Agents. This is not the official notice." |

The data comes from [`GET /api/embed/:id`](api.md#embed-card), which applies the same rules
as the site: rejected statements are left out, and the review status comes from the brief
itself.

## Fits any page

- **Isolated styles.** The card lives in a Shadow DOM, so its styles don't touch your
  page and yours don't break it. It is at most 36 rem wide and uses the page's width
  below that.
- **Accessible.** It is an `article` with a heading; the review status is announced as a
  status; links say when they open a new tab; focus is visible; animation respects
  "reduce motion".
- **Safe.** Text from the data is always inserted as text, never as HTML.
- **Fails quietly.** If the decision can't be loaded, the card says so in one line with a
  link to the site.

## Privacy

From the widget's own code: it sets no cookies, stores nothing in the browser, and loads
nothing but one JSON file from the same server as the script, fetched without
credentials or referrer. Its links to the full brief, the official notice and the
sources open with `noreferrer`; the "Add to calendar" link is an ordinary link to the
calendar file, so the browser may send your page's address with it. The server keeps no IP addresses beyond the in-memory rate limit for
questions, and the card asks no questions. Nothing about who reads a card is written to
the public record.

## Content Security Policy

If your site sets a Content-Security-Policy, allow the Municipal Agents origin for the
script and its data, for example:

```text
script-src 'self' https://municipal-agents.fly.dev;
connect-src 'self' https://municipal-agents.fly.dev;
```

The card's styles are attached to its Shadow DOM (as a constructed stylesheet, or a
`<style>` element in older browsers); if your policy blocks inline styles, check the card
renders before you publish.

## Other ways to link

To link to the full brief:

```html
<a href="https://municipal-agents.fly.dev/d/row-2027-budget">Read the plain-language brief on the 2027 budget</a>
```

To let residents follow the dates in their own calendar app (a subscription that updates
itself, see [Calendar feed](api.md#calendar-feed)):

```html
<a href="webcal://municipal-agents.fly.dev/api/calendar.ics?decisions=row-2027-budget">Follow the budget dates in your calendar</a>
```

To build your own display, read `GET /api/embed/:id` (it allows cross-origin requests) or
`GET /api/decisions/:id` from your server. See the [API reference](api.md).
