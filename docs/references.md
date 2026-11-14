# References

Everything Municipal Agents builds on: software, data, services, algorithms, standards,
law and policy, and AI assistance. The short version for the repository root is
[CREDITS.md](../CREDITS.md). Versions are the exact ones in the lockfiles
(`package-lock.json`, `web/package-lock.json`, `video/package-lock.json`) on 14 November
2026. Items marked `TODO(verify)` were still being added by other builders.

## 1. AI assistance

Code, data pipelines and documents were drafted with **Claude Code** (Anthropic, model
**Claude Opus 5.5**) directed and reviewed by the team; the product's runtime agents
use **Google's Gemini API (`gemini-3.6-flash`)**.

What that means in practice, and how we checked the output, is in
[code-tour.md, "How AI was used and how we checked it"](code-tour.md#how-ai-was-used-and-how-we-checked-it).

- Anthropic. Claude Code. https://docs.anthropic.com/en/docs/claude-code
- Google. Gemini API, `generateContent` with function calling.
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
| Poppler `pdftotext` | as packaged by Debian (`poppler-utils`) and Homebrew | GPL-2.0-or-later | Turns PDFs into page text (`-layout`), run as a separate program at build time and for staff uploads | https://poppler.freedesktop.org |

### Web app (`web/package.json`)

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| Preact | 10.29.8 | MIT | User interface | https://preactjs.com |
| Vite | 7.3.8 | MIT | Build and dev server | https://vite.dev |
| @preact/preset-vite | 2.10.6 | MIT | Preact support for Vite | https://github.com/preactjs/preset-vite |
| MapLibre GL JS | 5.24.1 | BSD-3-Clause | Vector map | https://maplibre.org |
| PDF.js (`pdfjs-dist`) | 5.7.284 | Apache-2.0 | Renders the cited PDF page and highlights the quote | https://mozilla.github.io/pdf.js/ |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (font), MIT (package) | Inter typeface, self-hosted | https://fontsource.org/fonts/inter |
| playwright-core | 1.65.1 | Apache-2.0 | Screenshots for docs and the video (dev only) | https://playwright.dev |
| TypeScript, @types/geojson | 5.9.3, 7946.0.16 | Apache-2.0, MIT | Types (dev only) | as above |

The web lockfile resolves 178 packages in total, all build-time tools of the above;
`TODO(verify)`: re-list if the web builder adds direct dependencies.

### Demo video (`video/package.json`)

| Software | Version | Licence | Use | Link |
|---|---|---|---|---|
| Remotion (`remotion`, `@remotion/cli`, `@remotion/google-fonts`) | 4.0.541 | Remotion License: free for individuals, non-profits and companies of up to three people; larger companies need a company licence | Video made in React | https://www.remotion.dev/license |
| React, React DOM | 19.2.0 | MIT | Remotion's rendering | https://react.dev |
| @types/react | 19.2.2 | MIT | Types (dev only) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| playwright-core | 1.65.1 | Apache-2.0 | Recording app footage | https://playwright.dev |

### Documentation tools

| Software | Version | Licence | Use |
|---|---|---|---|
| Mermaid CLI (`@mermaid-js/mermaid-cli`) | 11 | MIT | Renders the UML diagrams in `docs/uml/` |
| Google Chrome (headless) | installed version | Proprietary (Chromium is BSD-3-Clause) | Renders diagrams and the readiness report PDF |
| @fontsource/inter static files | 5.1.0 | OFL-1.1 | Inter embedded in the readiness report (`report/fonts/`) |

### Hosting and services

| Service | Use | Terms |
|---|---|---|
| Fly.io | One machine in Toronto (`yyz`) with a 1 GB volume | https://fly.io/legal/terms-of-service ; pricing https://fly.io/docs/about/pricing/ |
| Google Gemini API | The agents' model calls | https://ai.google.dev/gemini-api/terms |
| OpenFreeMap | Map tiles and styles (Positron, Dark), no key, no tracking | https://openfreemap.org |
| OpenMapTiles | Vector tile schema used by OpenFreeMap | https://openmaptiles.org (© OpenMapTiles) |

## 3. Data

Every document the agents read is a public record published by the government named.
The full list with titles, dates, page counts and download URLs is
`data/sources/index.json`; how each lens dataset was obtained is `data/open/README.md`.

### Documents (`data/sources/`)

| Publisher | Documents | Licence or status |
|---|---|---|
| Region of Waterloo | 2027 Plan and Budget page; EngageWR 2027 budget survey page; budget contest rules; delegation guide; 2026 budget book (191 pages); 2026 budget summary; 2026 asset management review; 2026 infrastructure gap report; affordable housing plan page; water supply strategy charter, public notice and 2024 slides | Public record |
| Region of Waterloo (Grand River Transit) | GRT 2025 business plan and Appendix A | Public record |
| ClimateActionWR (Region of Waterloo, Kitchener, Waterloo, Cambridge and partners) | Waterloo Region 2022 community greenhouse gas inventory | Public record |
| City of Kitchener | Committee of Adjustment documents for the Kitchener Central Transit Hub | Public record, `TODO(verify)` file names |

"Public record" means a document a municipality published for the public; we keep each
one as published, link to the original, and do not claim any licence over it.

### Open data (lenses and map)

| Dataset | Publisher | Licence | Use |
|---|---|---|---|
| Grand River Transit GTFS (bus and ION light rail) | Region of Waterloo | Region of Waterloo Open Data Licence v.2.0 | Transit lens: schedules, stops |
| Regional boundary | Region of Waterloo Open Data | Region of Waterloo Open Data Licence v.2.0 | Decision area on the map |
| Building Permits; Planning Applications Active; Application Status Report Site Plan | City of Kitchener | Open Government Licence – City of Kitchener | Housing lens |
| Building Permits | City of Waterloo | City of Waterloo open data terms (data.waterloo.ca; the item names no licence) | Housing lens |
| Building Permits; Site Plans | City of Cambridge GeoHub | City of Cambridge Open Data Licence v2.1 | Housing lens |
| Housing starts, completions and units under construction (CMHC data) | Statistics Canada | Statistics Canada Open Licence | Housing lens |
| Ontario's housing supply progress | Government of Ontario, Ministry of Municipal Affairs and Housing | Open Government Licence – Ontario | Housing lens: provincial target and progress |
| Essential destinations (hospitals, grocery stores, pharmacies, schools, libraries, community centres) | OpenStreetMap contributors | Open Database Licence (ODbL) 1.0 | Transit lens `TODO(verify)` |
| Base map data | OpenStreetMap contributors, via OpenFreeMap | ODbL 1.0 | Map |
| 2021 Census: languages spoken at home, Kitchener-Cambridge-Waterloo CMA (11-627-M2022051) | Statistics Canada | Statistics Canada Open Licence | Choice of languages in `cities/waterloo-region.json` |
| 2016 Census Bulletin #4, Language | Region of Waterloo | Public record | Choice of languages |

Licence texts:
- Region of Waterloo Open Data Licence: https://rowopendata-rmw.opendata.arcgis.com/
- Open Government Licence – City of Kitchener: https://open-kitchenergis.opendata.arcgis.com/
- City of Cambridge Open Data Licence v2.1: https://www.cambridge.ca/mayor-city-council-government/open-data/
- Statistics Canada Open Licence: https://www.statcan.gc.ca/en/reference/licence
- Open Government Licence – Ontario: https://www.ontario.ca/page/open-government-licence-ontario
- Open Database Licence: https://opendatacommons.org/licenses/odbl/1-0/ ; attribution
  https://www.openstreetmap.org/copyright

## 4. Algorithms and methods

| Method | Where | Reference |
|---|---|---|
| Connection Scan Algorithm (earliest arrival over one service day) | Transit lens, `lenses/transit/` `TODO(verify)` | Dibbelt, J., Pajor, T., Strasser, B., and Wagner, D. (2013). Intriguingly Simple and Fast Transit Routing. *Experimental Algorithms (SEA 2013)*, LNCS 7933, 43–54. Springer. https://doi.org/10.1007/978-3-642-38527-8_6 ; and Dibbelt, J., Pajor, T., Strasser, B., and Wagner, D. (2018). Connection Scan Algorithm. *ACM Journal of Experimental Algorithmics* 23, 1.7. https://doi.org/10.1145/3274661 |
| BM25 ranking (k1 = 1.2, b = 0.75, with the non-negative idf log(1 + (N − df + 0.5)/(df + 0.5)) used by Lucene) | `agents/corpus.ts` (`search`) | Robertson, S., and Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. *Foundations and Trends in Information Retrieval* 3(4), 333–389. https://doi.org/10.1561/1500000019 |
| Flesch-Kincaid grade level: 0.39 × words per sentence + 11.8 × syllables per word − 15.59 | `shared/readability.ts` | Kincaid, J. P., Fishburne, R. P., Rogers, R. L., and Chissom, B. S. (1975). *Derivation of New Readability Formulas (Automated Readability Index, Fog Count and Flesch Reading Ease Formula) for Navy Enlisted Personnel*. Research Branch Report 8-75. Naval Technical Training Command, Millington, TN. Our syllable count is a vowel-group heuristic, about ±0.5 grade. |
| SHA-256 | `server/log.ts`, `web/src/lib/hash.ts` | National Institute of Standards and Technology (2015). *Secure Hash Standard (SHS)*, FIPS PUB 180-4. https://doi.org/10.6028/NIST.FIPS.180-4 |
| Hash-chained, append-only record | `server/log.ts`, `server/canonical.ts` | Haber, S., and Stornetta, W. S. (1991). How to Time-Stamp a Digital Document. *Journal of Cryptology* 3(2), 99–111. https://doi.org/10.1007/BF00196791 |
| Canonical JSON (sorted keys, no whitespace) | `server/canonical.ts` | A simpler form in the spirit of RFC 8785, JSON Canonicalization Scheme (Rundgren, Jordan and Erdtman, 2020), https://www.rfc-editor.org/rfc/rfc8785 . We do not claim RFC 8785 conformance (number formatting differs for some values). |
| Citation matching (normalised exact match, column-aware word order) | `shared/verify.ts` | Our own method; described in the file header and in [code-tour.md](code-tour.md). |
| Lifecycle cost (capital, operating, maintenance, renewal, environmental over the asset's life) | Cost lens, `lenses/cost/` `TODO(verify)` | Ontario Regulation 588/17, *Asset Management Planning for Municipal Infrastructure*, under the Infrastructure for Jobs and Prosperity Act, 2015 (lifecycle activities and their costs). https://www.ontario.ca/laws/regulation/170588 ; Region of Waterloo, *Asset Management Plan 2025*. https://www.regionofwaterloo.ca/media/pvxp1jgw/asset-management-plan_2025_access.pdf ; ISO 15686-5:2017, *Buildings and constructed assets – Service life planning – Part 5: Life-cycle costing*. |
| Discounting (default 0%, option 3%) | Cost lens `TODO(verify)` | Treasury Board of Canada Secretariat, *Policy on Cost-Benefit Analysis* (2018) and *Canadian Cost-Benefit Analysis Guide: Regulatory Proposals* (2007). https://www.canada.ca/en/treasury-board-secretariat/services/federal-regulatory-management/guidelines-tools/policy-cost-benefit-analysis.html . `TODO(verify)`: the guide's exact wording on the 3% social discount rate. |
| Carbon price for the environmental cost | Cost lens `TODO(verify)` | Environment and Climate Change Canada, *Update to the Pan-Canadian Approach to Carbon Pollution Pricing 2023–2030*: minimum national price C$65 per tonne CO2e in 2023, rising C$15 a year to C$170 in 2030 (C$125 in 2027). https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/carbon-pollution-pricing-federal-benchmark-information/federal-benchmark-2023-2030.html . Note: the federal consumer fuel charge was set to zero from 1 April 2025; we use the benchmark as a value for emissions, not as a charge the Region pays. |
| Energy and CO2e estimate for model calls | `server/usage.ts` | Google (2025). *Measuring the environmental impact of delivering AI at Google scale* (median Gemini Apps text prompt 0.24 Wh). Epoch AI (2025), estimate of energy per ChatGPT query (about 0.3 Wh). Ontario grid intensity about 30 g CO2e per kWh: IESO annual planning outlooks; Canada Energy Regulator, *Provincial and Territorial Energy Profiles: Ontario*. These anchor an assumption; they are not measurements of our calls. |

## 5. Standards

- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. W3C Recommendation.
  https://www.w3.org/TR/WCAG22/
- Desruisseaux, B., ed. (2009). *Internet Calendaring and Scheduling Core Object
  Specification (iCalendar)*. RFC 5545. https://www.rfc-editor.org/rfc/rfc5545
- Butler, H., et al. (2016). *The GeoJSON Format*. RFC 7946.
  https://www.rfc-editor.org/rfc/rfc7946
- Jones, M., and Hardt, D. (2012). *The OAuth 2.0 Authorization Framework: Bearer
  Token Usage*. RFC 6750 (the `Authorization: Bearer` header for staff routes).
  https://www.rfc-editor.org/rfc/rfc6750
- WHATWG. *HTML Living Standard*, section 9.2, Server-sent events.
  https://html.spec.whatwg.org/multipage/server-sent-events.html
- MobilityData. *GTFS Schedule Reference*. https://gtfs.org/documentation/schedule/reference/

## 6. Law and policy (Ontario and Canada)

- *Municipal Freedom of Information and Protection of Privacy Act*, R.S.O. 1990, c.
  M.56 (MFIPPA). https://www.ontario.ca/laws/statute/90m56
- *Strengthening Cyber Security and Building Trust in the Public Sector Act, 2024*,
  S.O. 2024, c. 24 (Bill 194), Schedule 1, *Enhancing Digital Security and Trust Act,
  2024*: lets the province require prescribed public sector entities that use
  artificial intelligence to inform the public, keep an accountability framework,
  manage risks and ensure human oversight, as set by regulation. Royal Assent 25
  November 2024. https://www.ola.org/en/legislative-business/bills/parliament-43/session-1/bill-194 ;
  Government of Ontario, *Enhancing Digital Security and Trust Act* overview.
  https://www.ontario.ca/page/enhancing-digital-security-and-trust-act
- *Accessibility for Ontarians with Disabilities Act, 2005*, S.O. 2005, c. 11, and the
  Integrated Accessibility Standards, O. Reg. 191/11 (website accessibility).
  https://www.ontario.ca/laws/regulation/110191
- Treasury Board of Canada Secretariat. *Directive on Automated Decision-Making* and
  the Algorithmic Impact Assessment tool (federal; cited as good practice, not as a
  municipal obligation). https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32592

## 7. Media

- Music in the demo video: "Bass Brain", Dresage x Hark Madley. `TODO(verify)`: where
  the track was obtained and its licence terms.
- Typeface: Inter, by Rasmus Andersson, SIL Open Font License 1.1. https://rsms.me/inter/
