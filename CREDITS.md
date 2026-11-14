# Credits

Municipal Agents was built for CIVIC Hack 2026 (Future Cities Institute, University of
Waterloo). It stands on the work below. Full citations, links and versions are in
[docs/references.md](docs/references.md).

## AI assistance

Code, data pipelines and documents were drafted with **Claude Code** (Anthropic, model
**Claude Opus 5.5**) directed and reviewed by the team; the product's runtime agents
use **Google's Gemini API (`gemini-3.6-flash`)**. The construction scout's illustrations
were generated once with Gemini's image model (`gemini-3.1-flash-image`). How we checked
the AI's work: [docs/code-tour.md](docs/code-tour.md#how-ai-was-used-and-how-we-checked-it).

## Software

| Name | Version | Licence | Where |
|---|---|---|---|
| Node.js (incl. `node:sqlite`; SQLite is public domain) | 24 | MIT | server |
| TypeScript | 5.9.3 | Apache-2.0 | everywhere (dev) |
| @types/node, @types/geojson | 24.19.2, 7946.0.16 | MIT | dev |
| Poppler `pdftotext` (run as a separate program) | Debian `poppler-utils` | GPL-2.0-or-later | PDF text |
| Preact | 10.29.8 | MIT | app |
| Vite, @preact/preset-vite | 7.3.8, 2.10.6 | MIT | app, landing |
| MapLibre GL JS | 5.24.1 | BSD-3-Clause | app |
| PDF.js (`pdfjs-dist`) | 5.7.284 | Apache-2.0 | app |
| marked | 18.1.2 | MIT | docs site |
| highlight.js | 11.12.0 | BSD-3-Clause | docs site |
| Inter (@fontsource-variable/inter; @fontsource/inter in the report) | 5.3.0; 5.1.0 | SIL OFL 1.1 | app, landing, docs, report |
| playwright-core | 1.65.1 | Apache-2.0 | screenshots, video footage (dev) |
| Remotion (demo video) | 4.0.541 | Remotion License (free for individuals and companies of up to three people) | video |
| React, React DOM (demo video) | 19.2.0 | MIT | video |
| Mermaid CLI | 11 | MIT | UML diagrams |

## Services

- **Fly.io**: hosting, one machine in Toronto.
- **Google Gemini API**: the agents' model and the construction illustrations.
- **OpenFreeMap**: map tiles and styles; **OpenMapTiles** schema.
- **Overpass API**: OpenStreetMap queries at build time.
- **Statistics Canada** Census Profile API; **Natural Resources Canada** CDEM elevation service.

## Data

- **Region of Waterloo**: budget, asset management, transit, housing, water supply,
  election and Kitchener Central Transit Hub documents (public records); Grand River
  Transit GTFS (bus and ION), ION Routes and Stops, and the regional boundary (Region of
  Waterloo Open Data Licence v.2.0). Contains information provided by the Regional
  Municipality of Waterloo under licence.
- **ClimateActionWR**: Waterloo Region community greenhouse gas inventory (public record).
- **City of Kitchener**: building permits, planning and site plan applications (Open
  Government Licence – City of Kitchener); Committee of Adjustment notice (public record);
  construction noise rules.
- **City of Waterloo**: building permits (City of Waterloo open data terms).
- **City of Cambridge**: building permits and site plans (City of Cambridge Open Data
  Licence v2.1); Noise By-law 32-04.
- **Government of Ontario**: O. Reg. 530/22, Municipal Act Part VI.1, Planning Act s. 45,
  O. Reg. 200/96, O. Reg. 231/08 (e-Laws, public record); housing supply progress (Open
  Government Licence – Ontario).
- **Statistics Canada**: 2021 Census population, households, dissemination areas and
  languages; CMHC housing data (Statistics Canada Open Licence). Adapted from Statistics
  Canada; this does not constitute an endorsement by Statistics Canada.
- **Natural Resources Canada**: Canadian Digital Elevation Model (Open Government
  Licence – Canada).
- **OpenStreetMap contributors**: map data, essential destinations and land use (Open
  Database Licence 1.0). Map data © OpenStreetMap contributors.

## Algorithms, standards and guidance

- Connection Scan Algorithm: Dibbelt, Pajor, Strasser and Wagner (2013; 2018).
- BM25: Robertson and Zaragoza (2009). Jaccard similarity (1912). k-anonymity: Sweeney (2002).
- Flesch-Kincaid grade level: Kincaid, Fishburne, Rogers and Chissom (1975).
- SHA-256: NIST FIPS 180-4; hash chains after Haber and Stornetta (1991).
- iCalendar RFC 5545; GeoJSON RFC 7946; CSV RFC 4180; security.txt RFC 9116; OpenAPI 3.1;
  WCAG 2.2.
- Tunnel layout: NFPA 130 (cross-passage spacing); FHWA-NHI-10-034, *Technical Manual for
  Design and Construction of Road Tunnels — Civil Elements* (borehole depth and spacing).
- Lifecycle cost: Ontario Regulation 588/17 (municipal asset management planning).

## Media

- Music in the demo video: "Bass Brain", Dresage x Hark Madley.
- Video made with Remotion.
