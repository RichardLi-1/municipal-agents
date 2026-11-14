# Municipal Agents: the display (`web/`)

Vite + Preact + TypeScript. MapLibre GL for the map (OpenFreeMap tiles), pdf.js for the
source pages, Inter (self-hosted). Plain CSS with tokens; no CSS framework.

## Run

```sh
cd web
npm install
npm run dev          # http://localhost:5173, /api proxied to http://127.0.0.1:4100
npm run build        # type-checks, then writes web/dist (the service serves it)
```

Start the service from the repo root first (`node --env-file=.env server/main.ts`). If
`/api/health` doesn't answer, or the URL has `?fixtures`, the display uses the sample data
in `src/fixtures/sample.ts` and says "Sample data" on screen (the rail's tag reads
"Sample"). Clear it with a new tab, or by removing `ma-fixtures` from sessionStorage.

Screenshots for design checks (uses the installed Google Chrome):

```sh
node scripts/shots.mjs http://localhost:5173 /tmp/shots --fixtures   # sample data
DECISION=row-2027-budget node scripts/shots.mjs http://localhost:5173 /tmp/shots
```

## Screens

| Route | What |
|---|---|
| `/` | What's being decided near you: decision cards with the next chance to have a say and a countdown, the map with each decision's area, a neighbourhood search (kept in the page: nothing typed leaves the browser) |
| `/d/:id?tab=` | The brief: tabs Overview, Affects you, Have your say, Transit, Costs, Commitments, Housing, Construction, Unknowns & trade-offs, Sources (lens tabs only when the brief has them); map in the middle; "Ask about this decision" chat on the right |
| `/source/:id/:page?q=` | Opens the source viewer over the home screen (it is also a modal from any citation chip) |
| `/staff` | Passcode, draft a brief with the agents (live steps), approve / edit / reject each statement, publish |
| `/log` | The record, newest first, the hash chain re-checked in the browser with WebCrypto |
| `/spend` | White numbers on black: US$, tokens, model calls, energy and CO2e, today against the daily limit; has a full-screen button |

## Structure

```
src/
  main.tsx, app.tsx          entry, the frame (rail + main), routes
  styles/tokens.css          every design token (colours, radii, glass, type, motion), light and dark
  styles/app.css             the display's CSS, using only the tokens
  lib/                       api (live or sample), sse (POST + server-sent events), router, store,
                             i18n (en, fr), format, hash (canonical JSON + SHA-256 chain check),
                             cost (the lifecycle formula), places (neighbourhood list), ics, toast,
                             run (agent events -> steps), construction (loads src/construction if present)
  components/                Rail, MapView, SourceViewer, Chat, Steps, Citations, CostChart, Toasts, icons
  screens/                   Home, Decision (+ tabs-brief, tabs-lenses), Staff, Log, Spend
  fixtures/sample.ts         a made-up Waterloo Region decision with all four lenses
  construction/              the construction lens (its own builder); loaded lazily
```

## Notes

- Every statement shows citation chips ("p. 14") that open the page with the quote
  highlighted, and a check mark when the quote was found on the page; unverified
  statements have a dashed amber edge and say "Not verified". Rejected statements are
  not shown to residents.
- Chat answers: `[n]` in the text is the nth statement's pages, `[Cn]` the nth computed
  figure (a chip that explains how it was worked out), `[id]` a statement by id.
- Language: the menu lists `/api/city` languages. Interface strings exist in English and
  French (`lib/i18n.ts`); other languages translate the brief through
  `POST /api/decisions/:id/translate`, and the brief carries its own `lang`/`dir`.
- Theme: System, Light or Dark in Settings; the page always carries `data-theme`.
- Costs sliders understand these assumption ids: `horizonYears`, `discountRate` (%),
  `operatingPerYear`, `maintenancePerYear`, `renewalScale` (%), `capitalOverrun` (%),
  `capitalCost`, `carbonPrice`, `households`. Others are shown but don't change the sums.
- The log check expects `hash = sha256(prevHash + canonicalJson({seq, at, actor, kind, decisionId, payload}))`
  with object keys sorted at every level, no whitespace, and undefined keys left out.
