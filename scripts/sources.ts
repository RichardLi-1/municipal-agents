// Builds the page text the agents read from the source PDFs.
//
//   node scripts/sources.ts              # extract pages for every PDF in data/sources
//   node scripts/sources.ts --download   # first fetch any PDF that is missing locally
//
// For each source it writes data/sources/<id>.pages.json (string[]; index 0 is page 1)
// using `pdftotext -layout`, and writes data/sources/index.json (SourceDoc[]).
// No dependencies: Node 24 runs this file directly (type stripping).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceDoc } from "../shared/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "data", "sources");
const RETRIEVED = "2026-11-14";

/** Where each document came from. `printed: true` means an official web page saved as PDF
 *  (headless Chrome, print to PDF) on the retrieved date, because the page has no PDF of its own. */
type Entry = Omit<SourceDoc, "pages" | "retrieved"> & { printed?: boolean; note?: string };

const PUBLIC = "Public record";
const ROW = "Region of Waterloo";

export const MANIFEST: Entry[] = [
  // Region of Waterloo 2027 Plan and Budget (primary decision)
  {
    id: "row-2027-budget-page",
    title: "Our Plan and Budget: 2027 meeting schedule (web page)",
    publisher: ROW,
    url: "https://www.regionofwaterloo.ca/planandbudget",
    published: "2026-11-14",
    licence: PUBLIC,
    kind: "notice",
    printed: true,
  },
  {
    id: "engagewr-row-2027-budget",
    title: "EngageWR: Region of Waterloo 2027 Plan and Budget (web page)",
    publisher: ROW,
    url: "https://www.engagewr.ca/ROW-2027-budget",
    published: "2026-11-14",
    licence: PUBLIC,
    kind: "notice",
    printed: true,
  },
  {
    id: "row-2027-budget-contest-rules",
    title: "2027 Plan and Budget Gift Card Prize Draws: Contest Rules and Regulations (revised)",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/10833/4149",
    published: "2026-09-17",
    licence: PUBLIC,
    kind: "notice",
  },
  {
    id: "row-2026-budget-book",
    title: "2026 Final Budget Book",
    publisher: ROW,
    url: "https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/ynro4cd2/2026_final_budget_book.pdf",
    published: "2026-05-12",
    licence: PUBLIC,
    kind: "budget",
  },
  {
    id: "row-2026-budget-summary",
    title: "Growing with Care: 2026 Plan and Budget Summary Booklet",
    publisher: ROW,
    url: "https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/3two5ebp/2026-plan-and-budget-summary-booklet.pdf",
    published: "2026-06-03",
    licence: PUBLIC,
    kind: "budget",
  },
  {
    id: "row-asset-management-review-2026",
    title: "Annual Review of Asset Management Planning Progress (Report EES-SAM-26-001)",
    publisher: ROW,
    url: "https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/5jsmtow3/ees-sam-26-001-annual-review-of-asset-management-planning-progress.pdf",
    published: "2026-05-05",
    licence: PUBLIC,
    kind: "progress-report",
  },
  {
    id: "row-infrastructure-gap-2026",
    title: "Appendix B: Infrastructure Funding Gap Outputs (Report EES-SAM-26-001)",
    publisher: ROW,
    url: "https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/1ukon32u/ees-sam-26-001-appendix-b-infrastructure-funding-gap-outputs.pdf",
    published: "2026-05-05",
    licence: PUBLIC,
    kind: "progress-report",
  },
  {
    id: "grt-business-plan-2025",
    title: "Grand River Transit Business Plan (Report TSD-TRS-25-005)",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/5472/1766",
    published: "2025-04-08",
    licence: PUBLIC,
    kind: "plan",
  },
  {
    id: "grt-business-plan-2025-appendix-a",
    title: "GRT Business Plan Appendix A: Conventional Bus and Train Plan and Fares Strategy",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/5470/1766",
    published: "2025-03-28",
    licence: PUBLIC,
    kind: "plan",
  },
  {
    id: "wr-ghg-inventory-2022",
    title: "2022 Waterloo Region Community Greenhouse Gas Inventory Report",
    publisher: "ClimateActionWR (Region of Waterloo, Kitchener, Waterloo, Cambridge and partners)",
    url: "https://www.kitchener.ca/media/k1bhxdem/2022-waterloo-region-community-greenhouse-gas-inventory-report-published-june-2024.pdf",
    published: "2024-06-01",
    licence: PUBLIC,
    kind: "progress-report",
  },
  {
    id: "row-affordable-housing-plan-page",
    title: "Affordable Housing Plan: Building Better Futures (web page)",
    publisher: ROW,
    url: "https://www.regionofwaterloo.ca/programs-and-services/housing-and-shelter/housing-plans-and-research/affordable-housing-plan/",
    published: "2026-11-14",
    licence: PUBLIC,
    kind: "progress-report",
    printed: true,
  },
  {
    id: "row-delegation-guide",
    title: "Guide for Delegations",
    publisher: ROW,
    url: "https://www.regionofwaterloo.ca/media/hyynshdd/guide-for-delegations-october-2023.pdf",
    published: "2023-10-05",
    licence: PUBLIC,
    kind: "other",
  },
  // Strong-chair budget powers for the Region from 15 Nov 2026 (primary decision). e-Laws pages
  // are saved from a copy of the live page with scripts and the floating table of contents
  // removed (it overlapped the text in print); the law text itself is unchanged.
  {
    id: "oreg-530-22",
    title: "O. Reg. 530/22: Part VI.1 of the Act, under the Municipal Act, 2001 (e-Laws web page, consolidation June 22, 2026 to e-Laws currency date November 11, 2026)",
    publisher: "Government of Ontario (e-Laws)",
    url: "https://www.ontario.ca/laws/regulation/220530",
    published: "2026-06-22",
    licence: PUBLIC,
    kind: "other",
    printed: true,
  },
  {
    id: "municipal-act-part-vi1",
    title: "Municipal Act, 2001, Part VI.1: Special Powers and Duties of the Head of Council, ss. 284.2 to 284.17 (e-Laws web page excerpt, consolidation June 2, 2026 to November 11, 2026)",
    publisher: "Government of Ontario (e-Laws)",
    url: "https://www.ontario.ca/laws/statute/01m25",
    published: "2026-06-02",
    licence: PUBLIC,
    kind: "other",
    printed: true,
  },
  {
    id: "ontario-regional-head-of-council",
    title: "Regional Head of Council (web page)",
    publisher: "Government of Ontario, Ministry of Municipal Affairs and Housing",
    url: "https://www.ontario.ca/page/regional-head-council",
    published: "2026-07-14",
    licence: PUBLIC,
    kind: "notice",
    printed: true,
  },
  {
    id: "row-2026-election-page",
    title: "2026 Municipal Election (web page)",
    publisher: ROW,
    url: "https://www.regionofwaterloo.ca/government-and-council/elections/2026-municipal-election/",
    published: "2026-11-14",
    licence: PUBLIC,
    kind: "notice",
    printed: true,
  },
  // Region of Waterloo Water Supply Strategy Update (secondary decision)
  {
    id: "row-water-supply-notice-2",
    title: "Water Supply Strategy Update: Notice of Public Meeting No. 2",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/11199/1573",
    published: "2026-11-03",
    licence: PUBLIC,
    kind: "notice",
  },
  {
    id: "row-water-supply-charter",
    title: "Water Supply Strategy Update: Project Charter",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/2924/1573",
    published: "2022-03-04",
    licence: PUBLIC,
    kind: "plan",
  },
  {
    id: "row-water-supply-slides-2024",
    title: "Water Supply Strategy Update: Public Meeting No. 1 slides (December 4, 2024)",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/2930/1573",
    published: "2024-12-04",
    licence: PUBLIC,
    kind: "other",
  },
  // Kitchener Central Transit Hub minor variances (secondary decision)
  {
    id: "kitchener-cofa-2026-11-17",
    title: "Committee of Adjustment Meeting - Tuesday, November 17, 2026 (notice web page)",
    publisher: "City of Kitchener",
    url: "https://www.kitchener.ca/news/posts/committee-of-adjustment-meeting-tuesday-november-17-2026/",
    published: "2026-10-30",
    licence: PUBLIC,
    kind: "notice",
    printed: true,
  },
  {
    id: "row-kcth-update-2026",
    title: "Kitchener Central Transit Hub 2026 Project Update (Report EES-FFM-26-002)",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/9744/1865",
    published: "2026-05-05",
    licence: PUBLIC,
    kind: "staff-report",
  },
  {
    id: "row-kcth-update-2024",
    title: "Kitchener Central Update (Report EES-SAM-24-002)",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/5618/1865",
    published: "2024-12-03",
    licence: PUBLIC,
    kind: "staff-report",
  },
  {
    id: "planning-act-s45",
    title: "Planning Act, R.S.O. 1990, c. P.13: s. 1 (1) definition of “specified person” and s. 45, Powers of committee (e-Laws web page excerpt, consolidation July 1, 2026 to November 11, 2026)",
    publisher: "Government of Ontario (e-Laws)",
    url: "https://www.ontario.ca/laws/statute/90p13",
    published: "2026-07-01",
    licence: PUBLIC,
    kind: "other",
    printed: true,
  },
  {
    id: "oreg-200-96",
    title: "O. Reg. 200/96: Minor Variance Applications, under the Planning Act (e-Laws web page, consolidation July 1, 2024 to e-Laws currency date November 11, 2026)",
    publisher: "Government of Ontario (e-Laws)",
    url: "https://www.ontario.ca/laws/regulation/960200",
    published: "2024-07-01",
    licence: PUBLIC,
    kind: "other",
    printed: true,
  },
  {
    id: "row-kcth-rumpel-notice",
    title: "Construction notice: Rumpel Felt partial demolition",
    publisher: ROW,
    url: "https://www.engagewr.ca/download_file/view/11318/1865",
    published: "2026-11-09",
    licence: PUBLIC,
    kind: "notice",
  },
];

function pdftotext(): string {
  for (const p of ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"]) {
    if (existsSync(p)) return p;
  }
  return "pdftotext";
}

function pageCount(pdf: string): number {
  const info = execFileSync(pdftotext().replace(/pdftotext$/, "pdfinfo"), [pdf], { encoding: "utf8" });
  const m = info.match(/^Pages:\s+(\d+)/m);
  if (!m) throw new Error(`no page count for ${pdf}`);
  return Number(m[1]);
}

/** One string per page. pdftotext ends every page with a form feed. */
function extractPages(pdf: string, pages: number): string[] {
  const text = execFileSync(pdftotext(), ["-layout", "-enc", "UTF-8", pdf, "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const parts = text.split("\f");
  if (parts.length > pages && parts[parts.length - 1].trim() === "") parts.pop();
  if (parts.length === pages) return parts.map((p) => p.replace(/\s+$/, ""));
  // Fall back to page by page when the split doesn't line up.
  const out: string[] = [];
  for (let n = 1; n <= pages; n++) {
    const t = execFileSync(pdftotext(), ["-layout", "-enc", "UTF-8", "-f", String(n), "-l", String(n), pdf, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    out.push(t.replace(/\f/g, "").replace(/\s+$/, ""));
  }
  return out;
}

async function download(e: Entry, file: string): Promise<void> {
  if (e.printed) {
    console.warn(`  ${e.id}: a web page saved as PDF; open ${e.url} and print it to ${file}`);
    return;
  }
  const res = await fetch(e.url, { headers: { "user-agent": "Mozilla/5.0 (municipal-agents source fetcher)" } });
  if (!res.ok) throw new Error(`${e.id}: HTTP ${res.status} from ${e.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error(`${e.id}: ${e.url} did not return a PDF`);
  writeFileSync(file, buf);
  console.log(`  downloaded ${e.id} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

async function main() {
  const wantDownload = process.argv.includes("--download");
  mkdirSync(dir, { recursive: true });
  const index: SourceDoc[] = [];
  for (const e of MANIFEST) {
    const file = join(dir, `${e.id}.pdf`);
    if (!existsSync(file) && wantDownload) await download(e, file);
    const pagesFile = join(dir, `${e.id}.pages.json`);
    let pages: string[];
    if (existsSync(file)) {
      pages = extractPages(file, pageCount(file));
      writeFileSync(pagesFile, JSON.stringify(pages, null, 0) + "\n");
    } else if (existsSync(pagesFile)) {
      pages = JSON.parse(readFileSync(pagesFile, "utf8"));
      console.warn(`  ${e.id}: no PDF here, kept the existing page text (run with --download)`);
    } else {
      console.warn(`  ${e.id}: missing, skipped (run with --download)`);
      continue;
    }
    const { printed, note, ...doc } = e;
    index.push({ ...doc, title: doc.title, retrieved: RETRIEVED, pages: pages.length });
    console.log(`${e.id}: ${pages.length} pages`);
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`index.json: ${index.length} sources`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
