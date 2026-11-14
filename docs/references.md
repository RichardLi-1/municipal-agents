# References

Everything Municipal Agents builds on: software, data, services, algorithms, standards,
law and policy, and AI assistance. The short version for the repository root is
[CREDITS.md](../CREDITS.md). Versions are the exact ones in the lockfiles
(`package-lock.json`, `web/`, `landing/`, `docs-site/` and `video/package-lock.json`) on
14 November 2026.

## 1. AI assistance

Code, data pipelines and documents were drafted with **Claude Code** (Anthropic, model
**Claude Opus 5.5**) directed and reviewed by the team; the product's runtime agents
use **Google's Gemini API (`gemini-3.6-flash`)**. The construction scout's eight
illustrations were generated once, ahead of time, with Gemini's image model
(`gemini-3.1-flash-image`); they are labelled as illustrations.

What that means in practice, and how we checked the output:
[code-tour.md, "How AI was used and how we checked it"](code-tour.md#how-ai-was-used-and-how-we-checked-it).

- Anthropic. Claude Code. https://docs.anthropic.com/en/docs/claude-code
- Google. Gemini API, `generateContent` with function calling, and image generation.
  https://ai.google.dev/gemini-api/docs
- Google. Gemini API pricing (paid tier: `gemini-3.6-flash` US$0.75 per million input
  tokens and US$3.75 per million output tokens to 31 December 2026; US$1.50 and US$7.50
  from 1 January 2027; paid-tier content not used to improve products). Retrieved 14
  November 2026. https://ai.google.dev/gemini-api/docs/pricing
- Google Cloud. Vertex AI generative AI data residency (Canadian region
  `northamerica-northeast1`, Montréal). Retrieved 14 November 2026.
  https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency

## 2. Software

### Runtime and server (root `package.json`)

The server has no runtime dependencies. It uses Node's built-in modules: `node:http`,
`node:sqlite`, `node:crypto`, `node:zlib`, `node:test`.

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| Node.js | 24 (24.12.0 locally; `node:24-slim` image) | MIT | Runtime, HTTP, SQLite, crypto, test runner, type stripping | https://nodejs.org |
| SQLite (bundled in Node as `node:sqlite`) | as bundled with Node 24 | Public domain | The hash-chained record | https://sqlite.org |
| TypeScript | 5.9.3 | Apache-2.0 | Type checking (dev only) | https://www.typescriptlang.org |
| @types/node | 24.19.2 | MIT | Node type definitions (dev only) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/geojson | 7946.0.16 | MIT | GeoJSON type definitions (dev only) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| Poppler `pdftotext` | Debian `poppler-utils`; Homebrew | GPL-2.0-or-later | Turns PDFs into page text (`-layout`), run as a separate program at build time and for staff uploads | https://poppler.freedesktop.org |
| macOS `sips` | system tool | Apple | Resizes and compresses the construction illustrations (build time only) | |

### Resident and staff app (`web/package.json`, 178 packages resolved)

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| Preact | 10.29.8 | MIT | User interface | https://preactjs.com |
| Vite | 7.3.8 | MIT | Build and dev server | https://vite.dev |
| @preact/preset-vite | 2.10.6 | MIT | Preact support for Vite | https://github.com/preactjs/preset-vite |
| MapLibre GL JS | 5.24.1 | BSD-3-Clause | Vector map, 3D view of the construction scenario | https://maplibre.org |
| PDF.js (`pdfjs-dist`) | 5.7.284 | Apache-2.0 | Renders the cited PDF page and highlights the quote | https://mozilla.github.io/pdf.js/ |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (font), MIT (package) | Inter typeface, self-hosted | https://fontsource.org/fonts/inter |
| playwright-core | 1.65.1 | Apache-2.0 | Screenshots (dev only) | https://playwright.dev |
| @axe-core/playwright (with axe-core 4.11.4) | 4.11.0 | MPL-2.0 | Automated accessibility checks of the live site (dev only) | https://github.com/dequelabs/axe-core-npm |
| TypeScript, @types/geojson | 5.9.3, 7946.0.16 | Apache-2.0, MIT | Types (dev only) | as above |

### Landing site (`landing/package.json`, 67 packages resolved)

| Software | Version | Licence | Use |
|---|---|---|---|
| Vite | 7.3.8 | MIT | Builds the static pages at `/`, `/pricing`, `/security`, `/company`, `/contact`, `/changelog` |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Inter |
| playwright-core | 1.65.1 | Apache-2.0 | Screenshots (dev only) |
| TypeScript | 5.9.3 | Apache-2.0 | Types (dev only) |

### Docs site (`docs-site/package.json`)

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| marked | 18.1.2 | MIT | Markdown to HTML for `/docs` | https://marked.js.org |
| highlight.js | 11.12.0 | BSD-3-Clause | Code highlighting in the docs | https://highlightjs.org |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Inter | |
| playwright-core | 1.65.1 | Apache-2.0 | Screenshots (dev only) | |

### Demo video (`video/package.json`)

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| Remotion (`remotion`, `@remotion/cli`, `@remotion/google-fonts`) | 4.0.541 | Remotion License: free for individuals, non-profits and companies of up to three people; larger companies need a company licence | Video made in React | https://www.remotion.dev/license |
| React, React DOM | 19.2.0 | MIT | Remotion's rendering | https://react.dev |
| @types/react | 19.2.2 | MIT | Types (dev only) | |
| playwright-core | 1.65.1 | Apache-2.0 | Recording app footage | https://playwright.dev |

### Documentation tools

| Software | Version | Licence | Use |
|---|---|---|---|
| Mermaid CLI (`@mermaid-js/mermaid-cli`) | 11 | MIT | Renders the UML diagrams in `docs/uml/` |
| Google Chrome (headless) | installed version | Proprietary (Chromium is BSD-3-Clause) | Renders diagrams, the readiness report PDF and screenshots |
| @fontsource/inter static files | 5.1.0 | OFL-1.1 | Inter embedded in the readiness report (`report/fonts/`) |
| Poppler `pdfinfo`, `pdftoppm` | Homebrew | GPL-2.0-or-later | Page count and preview of the report |
| `cwebp` (libwebp) | Homebrew | BSD-3-Clause | Compresses the README screenshots |

### Hosting and services

| Service | Use | Terms |
|---|---|---|
| Fly.io | One machine in Toronto (`yyz`) with a 1 GB volume | https://fly.io/legal/terms-of-service ; pricing https://fly.io/docs/about/pricing/ |
| Google Gemini API | The agents' model calls; construction illustrations (once) | https://ai.google.dev/gemini-api/terms |
| OpenFreeMap | Map tiles and styles (Positron, Dark), no key, no tracking | https://openfreemap.org |
| OpenMapTiles | Vector tile schema used by OpenFreeMap | https://openmaptiles.org |
| Overpass API (overpass-api.de, overpass.kumi.systems) | OpenStreetMap queries at build time | https://wiki.openstreetmap.org/wiki/Overpass_API |
| Statistics Canada Census Profile SDMX API | Population and households by dissemination area | https://api.statcan.gc.ca |
| Esri Canada ArcGIS service | Mirror of the 2021 dissemination area boundaries | https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/DisseminationAreas/FeatureServer/0 |
| Natural Resources Canada, CDEM altitude service | Ground levels for the construction scout | https://geogratis.gc.ca/services/elevation/cdem/altitude |

## 3. Data

Every document the agents read is a public record published by the government named.
The full list with titles, dates, page counts and download URLs is
`data/sources/index.json` (27 documents, 412 pages); how each lens dataset was obtained
is `data/open/README.md` and `lenses/construction/README.md`.

### Documents (`data/sources/`)

| Publisher | Documents | Status |
|---|---|---|
| Region of Waterloo | 2027 Plan and Budget page; EngageWR 2027 budget page; budget contest rules; delegation guide; 2026 budget book (191 pages); 2026 budget summary; 2026 asset management review; 2026 infrastructure gap report; affordable housing plan page; 2026 municipal election page; water supply strategy charter, public notice and 2024 slides; Kitchener Central Transit Hub reports EES-SAM-24-002 and EES-FFM-26-002; Rumpel Felt demolition notice | Public record |
| Region of Waterloo (Grand River Transit) | GRT 2025 business plan and Appendix A | Public record |
| ClimateActionWR (Region of Waterloo, Kitchener, Waterloo, Cambridge and partners) | Waterloo Region 2022 community greenhouse gas inventory | Public record |
| City of Kitchener | Committee of Adjustment meeting notice, 17 November 2026 | Public record |
| Government of Ontario (e-Laws) | O. Reg. 530/22 (Part VI.1 of the Municipal Act); Municipal Act, 2001, Part VI.1 (ss. 284.2 to 284.17); Planning Act s. 1 (1) and s. 45; O. Reg. 200/96 (Minor Variance Applications) | Public record (e-Laws consolidations, dates in `index.json`) |
| Government of Ontario, Ministry of Municipal Affairs and Housing | Regional Head of Council (web page) | Public record |
| Government of Ontario | Residential rent increases (web page: the 2027 rent increase guideline, 1.9%); Residential Tenancies Act, 2006, s. 126 (above-guideline increases) | Public record |

"Public record" means a document a government published for the public; we keep each
one as published, link to the original, and claim no licence over it.

### Open data (lenses and map)

| Dataset | Publisher | Licence | Use |
|---|---|---|---|
| Grand River Transit GTFS: buses (`staticfeeds/1`) and ION light rail (`staticfeeds/2`) | Region of Waterloo | Region of Waterloo Open Data Licence v.2.0 | Transit lens |
| ION Routes and ION Stops (OpenData MapServer layers 6 and 5) | Region of Waterloo Open Data | Region of Waterloo Open Data Licence v.2.0 | Construction scout: Stage 2 alignment and stations |
| Regional boundary | Region of Waterloo Open Data | Region of Waterloo Open Data Licence v.2.0 | Decision area on the map |
| Essential destinations (626 points: hospitals, clinics, pharmacies, grocery stores, schools, colleges, libraries, community centres) | OpenStreetMap contributors | Open Database Licence (ODbL) 1.0 | Transit lens |
| Candidate land, motorways and rivers along ION Stage 2 | OpenStreetMap contributors | ODbL 1.0 | Construction scout |
| Base map data | OpenStreetMap contributors, via OpenFreeMap | ODbL 1.0 | Map |
| 2021 Census population and private households by dissemination area (766 areas; 587,165 people; 222,426 households) | Statistics Canada | Statistics Canada Open Licence | Transit lens (people reached); cost lens (per household) |
| 2021 dissemination area boundaries | Statistics Canada (served by Esri Canada) | Statistics Canada Open Licence | Transit lens |
| Canadian Digital Elevation Model (CDEM) | Natural Resources Canada | Open Government Licence – Canada | Construction scout: ground levels |
| Building Permits; Planning Applications Active; Application Status Report Site Plan | City of Kitchener | Open Government Licence – City of Kitchener | Housing lens |
| Building Permits | City of Waterloo | City of Waterloo open data terms (the item names no licence) | Housing lens |
| Building Permits; Site Plans | City of Cambridge GeoHub | City of Cambridge Open Data Licence v2.1 | Housing lens |
| Housing starts, under construction and completions, Kitchener-Cambridge-Waterloo CMA (table 34-10-0154-01, CMHC data) | Statistics Canada | Statistics Canada Open Licence | Housing lens |
| Ontario's housing supply progress | Government of Ontario, Ministry of Municipal Affairs and Housing | Open Government Licence – Ontario | Housing lens: 2031 target and progress |
| 2021 Census: languages spoken at home, Kitchener-Cambridge-Waterloo CMA (11-627-M2022051) | Statistics Canada | Statistics Canada Open Licence | Languages in `cities/waterloo-region.json` |
| 2016 Census Bulletin #4, Language | Region of Waterloo | Public record | Languages |

Attribution as the licences ask: "Contains information provided by the Regional
Municipality of Waterloo under licence"; "© OpenStreetMap contributors"; "Adapted from
Statistics Canada; this does not constitute an endorsement by Statistics Canada";
"Contains information licensed under the Open Government Licence – Canada".

Licence texts:
- Region of Waterloo Open Data Licence: https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/open-data/
- Open Government Licence – City of Kitchener: https://open-kitchenergis.opendata.arcgis.com/
- City of Cambridge Open Data Licence v2.1: https://www.cambridge.ca/mayor-city-council-government/open-data/
- Statistics Canada Open Licence: https://www.statcan.gc.ca/en/reference/licence
- Open Government Licence – Ontario: https://www.ontario.ca/page/open-government-licence-ontario
- Open Government Licence – Canada: https://open.canada.ca/en/open-government-licence-canada
- Open Database Licence: https://opendatacommons.org/licenses/odbl/1-0/ ; attribution
  https://www.openstreetmap.org/copyright

## 4. Algorithms and methods

| Method | Where | Reference |
|---|---|---|
| Connection Scan Algorithm (earliest arrival over one service day, with walking transfers) | `lenses/transit/csa.ts` | Dibbelt, J., Pajor, T., Strasser, B., and Wagner, D. (2013). Intriguingly Simple and Fast Transit Routing. *Experimental Algorithms (SEA 2013)*, LNCS 7933, 43–54. Springer. https://doi.org/10.1007/978-3-642-38527-8_6 ; and (2018). Connection Scan Algorithm. *ACM Journal of Experimental Algorithmics* 23, 1.7. https://doi.org/10.1145/3274661 |
| BM25 ranking (k1 = 1.2, b = 0.75, non-negative idf log(1 + (N − df + 0.5)/(df + 0.5)) as in Lucene) | `agents/corpus.ts` (`search`), `agents/offline.ts` | Robertson, S., and Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. *Foundations and Trends in Information Retrieval* 3(4), 333–389. https://doi.org/10.1561/1500000019 |
| Flesch-Kincaid grade level: 0.39 × words per sentence + 11.8 × syllables per word − 15.59 | `shared/readability.ts`, `agents/plain.ts` | Kincaid, J. P., Fishburne, R. P., Rogers, R. L., and Chissom, B. S. (1975). *Derivation of New Readability Formulas (Automated Readability Index, Fog Count and Flesch Reading Ease Formula) for Navy Enlisted Personnel*. Research Branch Report 8-75. Naval Technical Training Command, Millington, TN. Our syllable count is a vowel-group heuristic, about ±0.5 grade. |
| Jaccard similarity (word overlap) for the answer cache (≥ 0.85) and staff-insight grouping (≥ 0.5) | `server/runfiles.ts`, `server/routes/insights.ts` | Jaccard, P. (1912). The distribution of the flora in the alpine zone. *New Phytologist* 11(2), 37–50. https://doi.org/10.1111/j.1469-8137.1912.tb05611.x |
| k-anonymity (k = 3) for staff insights | `server/routes/insights.ts` | Sweeney, L. (2002). k-Anonymity: A Model for Protecting Privacy. *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems* 10(5), 557–570. https://doi.org/10.1142/S0218488502001648 |
| SHA-256 | `server/log.ts`, `web/src/lib/hash.ts` | National Institute of Standards and Technology (2015). *Secure Hash Standard (SHS)*, FIPS PUB 180-4. https://doi.org/10.6028/NIST.FIPS.180-4 |
| Hash-chained, append-only record (hash over each payload's hash, so content can be purged) | `server/log.ts`, `server/canonical.ts` | Haber, S., and Stornetta, W. S. (1991). How to Time-Stamp a Digital Document. *Journal of Cryptology* 3(2), 99–111. https://doi.org/10.1007/BF00196791 |
| Canonical JSON (sorted keys, no whitespace) | `server/canonical.ts`, `web/src/lib/hash.ts` | A simpler form in the spirit of RFC 8785, JSON Canonicalization Scheme (Rundgren, Jordan and Erdtman, 2020), https://www.rfc-editor.org/rfc/rfc8785 . We do not claim RFC 8785 conformance. |
| Citation matching (normalised exact match, column-aware word order) | `shared/verify.ts` | Our own method, described in the file and in [code-tour.md](code-tour.md). |
| Lifecycle cost (capital, operating, maintenance, renewal, environmental over the asset's life; 0% discount by default, adjustable 0 to 7%) | `lenses/cost/lifecycle.ts`, `lenses/cost/build.ts` | Categories follow the lifecycle view Ontario requires in municipal asset management plans: Ontario Regulation 588/17, *Asset Management Planning for Municipal Infrastructure*. https://www.ontario.ca/laws/regulation/170588 ; Region of Waterloo, *Asset Management Plan 2025*. https://www.regionofwaterloo.ca/media/pvxp1jgw/asset-management-plan_2025_access.pdf . Discounting context: Treasury Board of Canada Secretariat, *Policy on Cost-Benefit Analysis* (2018). https://www.canada.ca/en/treasury-board-secretariat/services/federal-regulatory-management/guidelines-tools/policy-cost-benefit-analysis.html . The discount rate is a resident-adjustable assumption, not a Region policy. |
| Carbon cost | `lenses/cost/lifecycle.ts` (supported, not applied) | The model supports emissions × a carbon price, but no source document gives the assets' emissions, so no carbon cost is counted and the lens says so. For reference, the federal minimum price schedule: Environment and Climate Change Canada, *Update to the Pan-Canadian Approach to Carbon Pollution Pricing 2023–2030* (C$65 per tonne CO2e in 2023 rising C$15 a year to C$170 in 2030). https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/carbon-pollution-pricing-federal-benchmark-information/federal-benchmark-2023-2030.html |
| Commitment status (latest figure against a straight line from baseline to target) | `lenses/commitments/status.ts` | A plain linear-trajectory test, stated on screen. |
| Construction site scoring (weights 25/25/20/15/15) and tunnel layout | `lenses/construction/scout.ts`, `layout.ts`, `steps.ts` | Our own rules, every weight and assumption stated in the lens. Standards below. |
| Energy and CO2e estimate for model calls | `server/usage.ts` | Google (2025). *Measuring the environmental impact of delivering AI at Google scale* (median Gemini Apps text prompt 0.24 Wh). Epoch AI (2025), estimate of energy per ChatGPT query (about 0.3 Wh). Ontario grid intensity about 30 g CO2e per kWh: IESO annual planning outlooks; Canada Energy Regulator, *Provincial and Territorial Energy Profiles: Ontario*. These anchor an assumption; they are not measurements of our calls. |

## 5. Standards and engineering guidance

- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. W3C Recommendation.
  https://www.w3.org/TR/WCAG22/ ; checked with Deque's axe-core rules (0 violations on the
  live site).
- Desruisseaux, B., ed. (2009). *Internet Calendaring and Scheduling Core Object
  Specification (iCalendar)*. RFC 5545. https://www.rfc-editor.org/rfc/rfc5545
- Butler, H., et al. (2016). *The GeoJSON Format*. RFC 7946. https://www.rfc-editor.org/rfc/rfc7946
- Shafranovich, Y. (2005). *Common Format and MIME Type for Comma-Separated Values (CSV)
  Files*. RFC 4180 (the GTFS reader). https://www.rfc-editor.org/rfc/rfc4180
- Foudil, E., and Shafranovich, Y. (2022). *A File Format to Aid in Security
  Vulnerability Disclosure*. RFC 9116 (`/.well-known/security.txt`). https://www.rfc-editor.org/rfc/rfc9116
- Jones, M., and Hardt, D. (2012). *The OAuth 2.0 Authorization Framework: Bearer Token
  Usage*. RFC 6750. https://www.rfc-editor.org/rfc/rfc6750
- OpenAPI Initiative. *OpenAPI Specification 3.1*. https://spec.openapis.org/oas/v3.1.0
- WHATWG. *HTML Living Standard*, Server-sent events.
  https://html.spec.whatwg.org/multipage/server-sent-events.html
- W3C. *Content Security Policy Level 3*. https://www.w3.org/TR/CSP3/
- MobilityData. *GTFS Schedule Reference*. https://gtfs.org/documentation/schedule/reference/
- National Fire Protection Association. *NFPA 130, Standard for Fixed Guideway Transit
  and Passenger Rail Systems* (cross-passages no more than 244 m, 800 ft, apart).
  https://www.nfpa.org/codes-and-standards/nfpa-130-standard-development/130
- Federal Highway Administration (2009). *Technical Manual for Design and Construction of
  Road Tunnels — Civil Elements*. FHWA-NHI-10-034. Section 3.5.2.1, p. 3-16 (borings at
  least 1.5 tunnel diameters below the invert, and 1.5 times the shaft depth at shafts);
  Table 3-4 (borehole spacing, after AASHTO 1988).
  https://www.fhwa.dot.gov/bridge/tunnel/pubs/nhi09010/tunnel_manual.pdf
- Metrolinx, Eglinton Crosstown tunnel boring machines (about 6.5 m diameter), cited in
  `lenses/construction/README.md` as the typical light-rail size.

## 6. Law and policy (Ontario and Canada)

- *Municipal Act, 2001*, S.O. 2001, c. 25, Part VI.1, Special Powers and Duties of the
  Head of Council (ss. 284.2 to 284.17). https://www.ontario.ca/laws/statute/01m25
- O. Reg. 530/22, *Part VI.1 of the Act*, under the Municipal Act, 2001 (the Regional
  Chair's budget powers from 15 November 2026: propose the budget by 1 February, Council
  amends within 30 days, Chair may veto within 10 days, Council may override by
  two-thirds within 15 days). https://www.ontario.ca/laws/regulation/220530
- *Planning Act*, R.S.O. 1990, c. P.13, s. 45 (minor variances; who may appeal to the
  Ontario Land Tribunal and the 20-day window). https://www.ontario.ca/laws/statute/90p13
- O. Reg. 200/96, *Minor Variance Applications*, under the Planning Act.
  https://www.ontario.ca/laws/regulation/960200
- O. Reg. 231/08 under the *Environmental Assessment Act* (the Transit Project
  Assessment Process), s. 15 (addendum after the statement of completion; public notice
  and 30 days for objections). https://www.ontario.ca/laws/regulation/080231
- O. Reg. 588/17, *Asset Management Planning for Municipal Infrastructure*.
  https://www.ontario.ca/laws/regulation/170588
- City of Kitchener, *Noise complaints and exemptions* (construction noise 7 a.m. to 7 p.m.,
  seven days a week). https://www.kitchener.ca/bylaws-and-enforcement/noise-complaints-and-exemptions/
- City of Cambridge, *By-law 32-04* (Noise By-law), s. 2 (b).
  https://www.cambridge.ca/media/1gvdnrdg/noise-by-law-032-04.pdf
- *Residential Tenancies Act, 2006*, S.O. 2006, c. 17, s. 126 (application for a rent
  increase above the guideline). https://www.ontario.ca/laws/statute/06r17
- Government of Ontario, *Residential rent increases* (the rent increase guideline: 1.9%
  for 2027). https://www.ontario.ca/page/residential-rent-increases
- *Municipal Freedom of Information and Protection of Privacy Act*, R.S.O. 1990, c. M.56
  (MFIPPA). https://www.ontario.ca/laws/statute/90m56
- *Strengthening Cyber Security and Building Trust in the Public Sector Act, 2024*, S.O.
  2024, c. 24 (Bill 194), Schedule 1, *Enhancing Digital Security and Trust Act, 2024*:
  lets the province require prescribed public sector entities that use artificial
  intelligence to inform the public, keep an accountability framework, manage risks and
  ensure human oversight, as set by regulation. Royal Assent 25 November 2024.
  https://www.ola.org/en/legislative-business/bills/parliament-43/session-1/bill-194 ;
  https://www.ontario.ca/page/enhancing-digital-security-and-trust-act
- *Accessibility for Ontarians with Disabilities Act, 2005*, and the Integrated
  Accessibility Standards, O. Reg. 191/11. https://www.ontario.ca/laws/regulation/110191
- Treasury Board of Canada Secretariat. *Directive on Automated Decision-Making* (federal;
  cited as good practice, not a municipal obligation).
  https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32592

## 7. Media

- Music in the demo video: "Bass Brain", Dresage x Hark Madley.
- Typeface: Inter, by Rasmus Andersson, SIL Open Font License 1.1. https://rsms.me/inter/
- Construction illustrations: generated with Google's `gemini-3.1-flash-image` from
  prompts stored in `data/renders/construction-renders.json`; labelled as illustrations.
