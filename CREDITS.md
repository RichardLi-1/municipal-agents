# Credits

Municipal Agents was built for CIVIC Hack 2026 (Future Cities Institute, University of
Waterloo). It stands on the work below. Full citations, links and versions are in
[docs/references.md](docs/references.md).

## AI assistance

Code, data pipelines and documents were drafted with **Claude Code** (Anthropic, model
**Claude Opus 5.5**) directed and reviewed by the team; the product's runtime agents
use **Google's Gemini API (`gemini-3.6-flash`)**. How we checked the AI's work:
[docs/code-tour.md](docs/code-tour.md#how-ai-was-used-and-how-we-checked-it).

## Software

| Name | Version | Licence |
|---|---|---|
| Node.js (incl. `node:sqlite`, SQLite is public domain) | 24 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| @types/node, @types/geojson | 24.19.2, 7946.0.16 | MIT |
| Poppler `pdftotext` (run as a separate program) | Debian `poppler-utils` | GPL-2.0-or-later |
| Preact | 10.29.8 | MIT |
| Vite, @preact/preset-vite | 7.3.8, 2.10.6 | MIT |
| MapLibre GL JS | 5.24.1 | BSD-3-Clause |
| PDF.js (`pdfjs-dist`) | 5.7.284 | Apache-2.0 |
| Inter typeface (@fontsource-variable/inter; @fontsource/inter in the report) | 5.3.0; 5.1.0 | SIL OFL 1.1 |
| playwright-core | 1.65.1 | Apache-2.0 |
| Remotion (demo video) | 4.0.541 | Remotion License (free for individuals and companies of up to three people) |
| React, React DOM (demo video) | 19.2.0 | MIT |
| Mermaid CLI (UML diagrams) | 11 | MIT |

## Services

- **Fly.io**: hosting, one machine in Toronto.
- **Google Gemini API**: the agents' model.
- **OpenFreeMap**: map tiles and styles; **OpenMapTiles** schema.

## Data

- **Region of Waterloo**: budget, asset management, transit, housing and water supply
  documents (public records); Grand River Transit GTFS and the regional boundary
  (Region of Waterloo Open Data Licence v.2.0).
- **ClimateActionWR**: Waterloo Region community greenhouse gas inventory (public record).
- **City of Kitchener**: building permits, planning and site plan applications (Open
  Government Licence – City of Kitchener); Committee of Adjustment documents (public record).
- **City of Waterloo**: building permits (City of Waterloo open data terms).
- **City of Cambridge**: building permits and site plans (City of Cambridge Open Data
  Licence v2.1).
- **Statistics Canada**: housing data from CMHC; 2021 Census languages (Statistics
  Canada Open Licence).
- **Government of Ontario**: housing supply progress (Open Government Licence – Ontario).
- **OpenStreetMap contributors**: map data and essential destinations (Open Database
  Licence 1.0). Map data © OpenStreetMap contributors.

## Algorithms

- Connection Scan Algorithm: Dibbelt, Pajor, Strasser and Wagner (2013; 2018).
- BM25: Robertson and Zaragoza (2009).
- Flesch-Kincaid grade level: Kincaid, Fishburne, Rogers and Chissom (1975).
- SHA-256: NIST FIPS 180-4; hash chains after Haber and Stornetta (1991).
- iCalendar: RFC 5545. GeoJSON: RFC 7946.
- Lifecycle cost: Ontario Regulation 588/17 (municipal asset management planning);
  carbon price: Government of Canada federal benchmark 2023–2030.

## Media

- Music in the demo video: "Bass Brain", Dresage x Hark Madley.
- Video made with Remotion.
