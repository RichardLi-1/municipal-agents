# Municipal Agents: trust and compliance

These are the questions a municipality's IT, privacy (MFIPPA coordinator), records,
accessibility and legal staff will ask, answered for this product as of 14 November 2026.
We separate **what is built today** (in the prototype at <https://municipal-agents.fly.dev>)
from **what is planned**. This is not legal advice. Each municipality should have its own
counsel and privacy office review it. Web sources were read on 14 November 2026.

## At a glance

| Question | Short answer |
|---|---|
| Do you collect personal information about residents? | No, by design. There are no resident accounts, sign-in or tracking scripts. Questions are logged with no identifier. IP addresses stay in memory for the rate-limit window only and are never written ([architecture §6](../architecture.md)). |
| What goes to the AI model? | Public documents about the decision, plus the text of residents' questions. Today that goes to Google's Gemini API in the US. City and Region tiers run the model in Canada or on the city's own infrastructure. |
| Where is data stored? | Today, Fly.io in Toronto (`yyz`): the public record, the briefs staff edited, and uploads. Source documents and lens results are built into the deployed image. |
| Who approves what residents see? | A named staff member approves each statement. Until then the brief is labelled a draft. Every approval goes into the public record. |
| Can the record be changed quietly? | No. It is append-only and hash-chained, and database triggers refuse UPDATE and DELETE. Anyone can verify the chain in their browser. The limit: whoever controls the server could rebuild the whole chain. Publishing the head hash outside the city's sole control fixes that and is planned. |
| Is AI use disclosed? | Yes. Every brief shows its review status, says it is not the official notice and links to the notice. AI drafting is disclosed. |
| Accessibility? | Built to WCAG 2.2 AA (keyboard, screen reader, contrast, text alternatives). A formal audit has not been done yet. |
| French? | Every tier includes French. Machine translations are labelled. Human review is available for municipalities with a French-language services by-law. |
| SOC 2 / ISO 27001? | Not yet. The plan and dates are in [section 11](#11-soc-2-and-iso-27001-roadmap); controls in place today are in [section 10](#10-security-controls-today-and-planned). |

## 1. What data the product handles

| Data | Personal? | Where | Retention today |
|---|---|---|---|
| Source documents (staff reports, budgets, agendas, notices) | No; public records | Built into the container; copies under `data/sources/` | For the life of the deployment |
| Decision metadata (timeline, area), briefs, lens results | No | `data/` files; edited briefs on the Toronto volume | Same |
| Resident questions (text, chosen audiences, language) | Not intended to be, but a resident may type personal details. The chat box asks them not to; automatic redaction is planned | The public record (SQLite on the Toronto volume) | Kept in the record; the text can be purged when the by-law's retention period ends, see [section 8](#8-records-retention) |
| IP addresses | Yes | In memory only, for rate limiting | Discarded when the window ends; never written |
| Staff reviewer names and actions | Staff names in their official capacity | The public record | Kept in the append-only record |
| Model-call metadata (tokens, cost, model) | No | The public record and the spend page | Kept |

## 2. MFIPPA (Municipal Freedom of Information and Protection of Privacy Act)

- **The municipality is the "institution"** and stays accountable. Under MFIPPA a
  municipality may collect personal information only when a statute authorizes it, for
  law enforcement, or when it is necessary to a lawfully authorized activity, and it must
  give notice (ss. 28(2) and 29(2) of
  [R.S.O. 1990, c. M.56](https://www.ontario.ca/laws/statute/90m56); see the
  [readiness report](../../report/readiness-report.html)). The product is designed so the
  city does not need to collect personal information to run it.
- **Staff names.** MFIPPA excludes from "personal information" the name, title and
  contact details of a person acting in a business, professional or official capacity
  (s. 2(2.1); to confirm with the city's MFIPPA coordinator). Reviewer names on
  approvals are recorded in that capacity.
- **Records in custody or under control.** Briefs, approvals and the record are the
  city's records and can be requested under MFIPPA access requests. We will export
  everything in open formats (JSON, CSV, PDF) within the time a request allows.
- **Third-party contracting.** In May 2024 the IPC published guidance for FIPPA and
  MFIPPA institutions on contracting with service providers. It says the institution
  stays accountable no matter who processes the data, and that contracts are necessary
  but not enough without oversight
  ([BLG summary](https://www.blg.com/en/insights/2024/06/new-outsourcing-guidance-by-ontario-public-sector-privacy-regulator);
  [Lerners summary](https://lerners.ca/insights/privacy-access-considerations-when-contracting-with-third-parties-ipc-new-guidance-public-sector)).
  For cloud services, see the IPC's
  [Thinking About Clouds?](https://ipc.on.ca/fr/node/2855). **We will sign:** the city
  keeps custody and control; we help with access requests; we notify breaches promptly
  (target: within 24 hours of discovery); we publish a subprocessor list; we state where
  data and processing are located; the city has audit rights; and data is returned or
  deleted at the end of the contract.
- **Privacy impact assessment (PIA).** Every pilot gets a PIA template that is already
  filled in for this product (data inventory, flows, subprocessors, risks). The city's
  privacy office finishes and approves it.

## 3. PIPEDA

PIPEDA applies to private-sector organizations collecting, using or disclosing personal
information in commercial activity. Municipalities are "generally covered by provincial
laws", though PIPEDA "may apply in certain situations"
([Office of the Privacy Commissioner](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/)).
So MFIPPA governs the city's use. **We, as a company, are subject to PIPEDA** for our own
commercial handling of personal information, such as staff user accounts, support
tickets and sales contacts. We will publish a company privacy policy and name a privacy
officer before the first paid pilot.

## 4. Bill 194 and AI obligations in Ontario

- **The law.** Bill 194, the *Strengthening Cyber Security and Building Trust in the
  Public Sector Act, 2024*, received Royal Assent as S.O. 2024, c. 24
  ([Legislative Assembly](https://ola.org/en/legislative-business/bills/parliament-43/session-1/bill-194)).
  Schedule 1 enacts the *Enhancing Digital Security and Trust Act, 2024* (EDSTA)
  ([e-Laws](https://www.ontario.ca/laws/statute/24e24)). Under EDSTA, the province may by
  regulation require prescribed public sector entities that use AI to inform the public,
  keep an accountability framework, manage risk and have a person oversee the system,
  and it may ban certain uses ([readiness report](../../report/readiness-report.html);
  [Blakes](https://www.blakes.com/insights/new-ontario-bill-194-to-regulate-public-sector-use-of-artificial-intelligence-systems/)).
  The definition reaches systems that third parties develop for a public sector entity,
  so vendors like us are affected indirectly.
- **Status today.** Two regulations took effect on 1 July 2026: O. Reg. 51/26 (cyber
  security) and O. Reg. 52/26 (digital technology affecting people under 18). The
  government's page names hospitals, colleges and universities, school boards and
  children's aid societies as the organizations regulated, and **does not mention
  municipalities**. **No AI-specific regulation has been made**
  ([Ontario EDSTA page, updated 22 Oct 2026](https://www.ontario.ca/page/enhancing-digital-security-and-trust-act);
  [L&E Global, Sep 2026](https://leglobal.law/2026/09/01/summary-of-regulations-under-enhancing-digital-security-and-trust-act/)).
  Ontario's separate Responsible Use of AI Directive covers ministries and provincial
  agencies, not municipalities (same page).
- **Regulators' expectations.** In January 2026 Ontario's Information and Privacy
  Commissioner and Human Rights Commission published joint principles for public sector
  AI. They are recommendations, not enforceable requirements
  ([Lerners](https://lerners.ca/insights/ai-governance-reimagined-ontarios-new-joint-principles-for-the-responsible-use-of-artificial-intelligence)).
  How the product maps to them:

| IPC/OHRC principle | How the product meets it today | Planned |
|---|---|---|
| Valid and reliable | Quotes checked on the cited page in code; an eval suite scored in code (6 of 12 cases passed in the latest run, all citations verified; `agents/evals/results.md`) | Publish eval results for each city; measure review time and accuracy in pilots |
| Safe | Agents can only read the decision's documents and write drafts; spend and run caps; no advice on voting | Prompt-injection test set; incident process |
| Privacy protective | No accounts, no identifiers, IPs never written | Automatic redaction of personal details in questions; Canadian or on-premises model |
| Human rights affirming | A fixed audience list that includes people with disabilities and newcomers; trade-offs must show both sides | Community review of the audience list and translations |
| Transparent | AI disclosure, review status, sources on every page; agent instructions are readable Markdown files; public spend page | A public "how this works" page for each city |
| Accountable | A named staff approver for each statement; a hash-chained public record | City single sign-on with roles; head hash published outside the city's sole control |

## 5. Accessibility: AODA and WCAG 2.2

- **The legal floor.** Under the Integrated Accessibility Standards Regulation (O. Reg.
  191/11, s. 14), designated public sector organizations and large organizations must
  make public websites and web content meet **WCAG 2.0 Level AA**, a requirement in force
  since 1 January 2021, except success criteria 1.2.4 (live captions) and 1.2.5
  (pre-recorded audio description)
  ([Ontario, How to make websites accessible](https://ontario.ca/page/how-make-websites-accessible)).
  A brief published for a municipality is that municipality's web content.
- **Our target is higher: WCAG 2.2 AA** ([spec](../spec.md); NFR-1 in
  [requirements](../requirements.md)). That means keyboard use, visible focus, 4.5:1
  text contrast, labelled controls, text alternatives for the map and charts, no
  information conveyed by colour alone, and respect for reduced motion. Every map view
  has a list equivalent.
- **Status.** The prototype was designed and checked against these targets during the
  hackathon. An automated axe-core audit of the live site (every decision tab and
  the main pages, at desktop and phone widths, light and dark) found 0 violations,
  and keyboard-only use was checked by hand (focus order, visible focus, the source
  viewer's focus trap and Esc). A screen-reader (VoiceOver/NVDA) audit has not been
  run yet. **Planned before the first paid go-live:** an independent audit, an
  Accessibility Conformance Report in VPAT format, and testing with residents who use
  assistive technology.
- **AI disclosures are accessible.** Disclosures and review status are plain text at the
  top of each brief, not an icon or tooltip. They are read by screen readers in reading
  order and written at or below the brief's reading grade. "Not the official notice" is
  a real link.
- **Accessible formats on request.** Briefs print cleanly as plain HTML. A city can
  provide a printed or alternate-format copy without our help.

## 6. French-language services

- The *French Language Services Act* places duties on the provincial government. It
  "does not require" municipalities to provide services in French
  ([Ontario, Government services in French](https://www.ontario.ca/page/government-services-french)).
  A municipality in a designated area may pass a by-law to run its administration in
  English and French (s. 14). Ottawa's Bilingualism By-law 2001-170 is one example
  ([City of Ottawa](https://ottawa.ca/en/bilingualism-law-no-2001-170)).
- O. Reg. 272/25 expands six designated areas to match current municipal boundaries.
  Provincial services in those areas start on 1 January 2029
  ([O. Reg. 272/25](https://www.ontario.ca/laws/regulation/250272)).
- **Product:** French is included in every tier. Translations are made from the
  staff-approved English brief, keep citations to the original page, and are labelled as
  machine translation. For municipalities with a French-language services by-law we
  support a review step: a French-speaking staff member or translator approves the
  French text before it is published. This step is planned; today translations are
  labelled but not separately reviewed.

## 7. Data residency options

| Option | Stored data | Model processing | Tier | Status |
|---|---|---|---|---|
| A. Default (prototype) | Toronto (Fly.io `yyz`) | Gemini API, US. Google says paid-tier prompts are not used to improve its products ([architecture D7](../architecture.md)) | Pilot (by agreement) | **Built** |
| B. Canadian model region | Canada | A Canadian-region model. Vertex AI Montréal (`northamerica-northeast1`) lists Gemini 3.5 and 3.8 Flash but not 3.6 ([architecture §4](../architecture.md); [Google data residency](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)) | Town, City | Planned: swap one client file (`agents/gemini.ts`) and re-run the evals |
| C. City cloud or on-premises | The city's infrastructure | An open-weight model on the city's hardware, or the city's own enterprise AI contract | Region / Enterprise | Planned: the container already runs anywhere Node 24 runs ([requirements NFR-12](../requirements.md)) |

The checks that decide what residents see (citation, rules, reading grade, answer
grounding) are code, not a model. So they work the same on every option
([architecture D3](../architecture.md)).

## 8. Records retention

- Under the *Municipal Act, 2001*, s. 254, a municipality must keep its records "in a
  secure and accessible manner". Under s. 255, it may destroy a record only after the
  retention period set under that section (usually in its records retention by-law) has
  expired ([e-Laws, S.O. 2001, c. 25](https://www.ontario.ca/laws/statute/01m25);
  exact wording to confirm with the clerk).
- **What counts as a record here:** published briefs and each version, staff reviews
  and approvals, resident questions and answers, and the source list. The city's
  retention by-law sets how long each is kept.
- **The tension, and how it is resolved (done, 14 November 2026):** the record is
  append-only, so an entry's content could not be deleted without breaking the chain.
  Now each entry's hash covers its payload's own SHA-256 rather than the payload, and the
  payload (for example a question's text) is stored separately. Staff purge a payload
  when its retention period ends under the by-law (`POST /api/staff/purge` with the entry
  and the reason): the content is removed, a `record.purged` entry naming the entry, its
  payload hash, the reason and the staff member is added to the chain, and the entry shows
  as "content purged under retention by-law" with the date. The chain still verifies;
  content removed without a purge entry fails verification. Existing entries were
  migrated: the old chain was verified end to end, each entry re-hashed with its payload
  hash and its old hash kept, and the migration recorded on the chain with the old and
  new head hashes.
- **Exports** for the city's records system (EDRMS): all entries as JSON or CSV, and
  briefs as PDF and HTML, on demand and on contract end.

## 9. Directive on Automated Decision-Making (federal), as a voluntary benchmark

The Treasury Board *Directive on Automated Decision-Making* applies to federal
institutions, not municipalities
([TBS](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32592)). Its Algorithmic Impact
Assessment (AIA) questionnaire sets one of four impact levels, and each level carries
required mitigations
([Canada.ca, AIA](https://www.canada.ca/en/government/system/digital-government/digital-government-innovations/responsible-use-ai/automated-decision-making/algorithmic-impact-assessment.html)).
We use it as a benchmark because Ontario has no municipal equivalent yet.

- **Our self-assessment (estimate, to be confirmed by completing the AIA):** the product
  makes **no administrative decision about any person**. It explains a council's
  pending decision, and staff approve every statement. We expect the lowest impact level.
- **What we do anyway:**
  - *Notice:* AI disclosure on every page.
  - *Explanation:* every statement links to its source page.
  - *Human in the loop:* a named approver for each statement.
  - *Quality assurance:* evals scored in code and published.
  - *Data quality:* public sources with publisher, date and licence listed.
  - *Recourse:* "Report an error" on every statement goes to the operator (in the demo, the team's GitHub issues); routing it to the clerk and logging it is planned.
  - *Peer review:* an external review of the method, invited through FCI.
- We will publish a completed AIA-style questionnaire with each city's go-live.

## 10. Security controls: today and planned

| Area | In place today (prototype) | Planned (by when) |
|---|---|---|
| Identity and access | Staff routes need a bearer passcode compared in constant time; reviewer name on every action | Individual staff accounts, roles (drafter, reviewer, publisher), MFA, SSO with SAML or OIDC (Q1 2027 for pilots; SSO by Q2 2027) |
| Least privilege for agents | Agent tools are read-only over the decision's own documents plus draft-writing tools; no browsing, email or file access | A prompt-injection test set added to the evals (Q1 2027) |
| Abuse and cost | Body size caps; questions capped at 1,000 characters; 30 model-backed questions per 10 minutes per IP (replays free); at most 4 concurrent runs; US$0.50 per run and US$5 per day caps | Rate limits per city, a WAF and bot protection (Q2 2027) |
| Secrets | Environment variables (Fly secrets), never committed; API key sent only in a header | A managed secrets store and rotation schedule (Q2 2027) |
| Integrity | Append-only hash-chained log; triggers refuse UPDATE and DELETE; chain verified on the server and in the browser | Head hash published on a schedule outside the city's control, e.g. a public Git repository, council minutes or a timestamping service (Q1 2027) |
| Supply chain | No runtime dependencies at the server root; three dev dependencies ([architecture D1](../architecture.md)) | Dependency and container scanning in CI (Q1 2027) |
| Privacy | No accounts, no tracking scripts, IPs never written; map tiles without an API key | Redaction of personal details in questions before they are logged or sent to the model (Q1 2027) |
| Availability and backup | Health check and automatic restart; daily Fly.io volume snapshots (retention to be set per contract) | Documented backups with tested restores, a 99.9% target for Region tier, status page (Q2 2027) |
| Encryption | HTTPS in transit | Fly.io volumes are encrypted at rest by default; document it for every store, customer-specific keys for Region tier (2027) |
| Monitoring and incidents | Every model call and action is logged in the record | Alerting, an incident response plan, breach notification (24 hours to the city), annual tabletop exercise (Q1 2027) |
| Testing | Unit tests with `node --test`; evals scored in code | An independent penetration test before the first annual contract (Q2 2027) |
| Vendors | Subprocessors: Fly.io (hosting), Google Gemini API (model); OpenFreeMap tiles load in the browser | A published subprocessor list and a data processing agreement template (Q1 2027) |

## 11. SOC 2 and ISO 27001 roadmap

| Phase | When (target) | What |
|---|---|---|
| 0. Foundations | Now to Q1 2027 | Security policies, asset and vendor inventory, access reviews, background checks, a security awareness course (for example the Canadian Centre for Cyber Security's free course for small and medium organizations). Consider **CyberSecure Canada** certification, now handled through the Standards Council of Canada ([ISED](https://ised-isde.canada.ca/site/cybersecure-canada/en)) |
| 1. SOC 2 Type I | Q2 to Q3 2027 | Readiness assessment, controls in place, an independent auditor's Type I report (Security and Confidentiality criteria). A penetration test report included in the procurement package |
| 2. SOC 2 Type II | 2028 | An observation period of 6 to 12 months, then the Type II report |
| 3. ISO/IEC 27001 | When customers ask (likely Region / Enterprise or outside Canada) | Certification of the information security management system; much of the SOC 2 evidence can be reused |

**Procurement-ready security package (target Q2 2027):** a completed security
questionnaire (one of the common standard formats), the architecture and data-flow
diagrams ([design.md](../design.md)), the subprocessor list, the PIA template, the
AIA-style assessment, the accessibility conformance report, the penetration test summary,
insurance certificates (cyber and errors and omissions), and the SOC 2 Type I report when
it is issued.
