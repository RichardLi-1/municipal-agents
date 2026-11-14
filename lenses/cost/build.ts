// Cost lenses built in code from cited figures, one per decision (no model calls).
//   node lenses/cost/build.ts <decisionId>   -> data/lenses/cost-<decisionId>.json
//   node lenses/cost/build.ts --all
// Every input is either a figure whose quote is checked on its page by shared/verify.ts, or
// an assumption with a slider range and a plain reason. The build stops if a quote fails.

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CostLens, Figure, Statement, Citation } from "../../shared/types.ts";
import { verifyCitation } from "../../shared/verify.ts";
import { buildCostLens, lifecycleCost, costSummary } from "./lifecycle.ts";
import type { LifecycleInputs } from "./lifecycle.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const pagesCache = new Map<string, string[]>();
export function pagesOf(sourceId: string): string[] {
  let p = pagesCache.get(sourceId);
  if (!p) {
    p = JSON.parse(readFileSync(join(ROOT, "data", "sources", `${sourceId}.pages.json`), "utf8")) as string[];
    pagesCache.set(sourceId, p);
  }
  return p;
}

export function citationOk(c: Citation): boolean {
  try {
    return verifyCitation(pagesOf(c.sourceId), c);
  } catch {
    return false;
  }
}

const c = (sourceId: string, page: number, quote: string): Citation => ({ sourceId, page, quote });
const M = 1e6;
const money = (x: number) => (Math.abs(x) >= 1e9 ? `$${(x / 1e9).toFixed(2)} billion` : Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)} million` : `$${Math.round(x).toLocaleString("en-CA")}`);
const cited = (id: string, label: string, value: number, unit: string, display: string, citation: Citation): Figure => ({ id, label, value, unit, display, citation, kind: "cited" });
const computed = (id: string, label: string, value: number, unit: string, display: string, formula: string, inputs: string[] = []): Figure => ({ id, label, value, unit, display, kind: "computed", formula, inputs });
const st = (id: string, kind: Statement["kind"], text: string, citations: Citation[]): Statement => ({ id, kind, text, citations, verified: false });

/**
 * 2021 Census: private dwellings occupied by usual residents (= private households) in Waterloo
 * Region, the sum over its 766 dissemination areas, from the Statistics Canada Census Profile
 * API (characteristic 5), Statistics Canada Open Licence. Fetched 2026-11-14 alongside the
 * population used by the transit lens.
 */
export const HOUSEHOLDS_2021 = 222_426;
const householdsFigure = computed(
  "households-2021",
  "Households in Waterloo Region (2021 Census)",
  HOUSEHOLDS_2021,
  "households",
  "222,426 households",
  "Statistics Canada, 2021 Census of Population: private dwellings occupied by usual residents, summed over Waterloo Region's 766 dissemination areas (Census Profile API, characteristic 5; Statistics Canada Open Licence). Not from a city document.",
);
const householdsAssumption = {
  id: "households",
  label: "Households sharing the cost",
  value: HOUSEHOLDS_2021,
  unit: "households",
  min: 150_000,
  max: 350_000,
  step: 1_000,
  why: "222,426 households lived in Waterloo Region at the 2021 Census (Statistics Canada). There are more now. Businesses pay too, so this is a rough share per home, not a bill.",
};
const discountAssumption = {
  id: "discountRate",
  label: "Discount rate",
  value: 0,
  unit: "%",
  min: 0,
  max: 7,
  step: 0.5,
  why: "At 0% every year's dollar counts the same. A higher rate counts future dollars for less, as many public-sector cost studies do (3% is common).",
};
const overrunAssumption = (why: string) => ({ id: "capitalOverrun", label: "Capital cost overrun", value: 0, unit: "%", min: 0, max: 50, step: 5, why });

export interface CostSpec {
  decisionId: string;
  asset: string;
  inputs: LifecycleInputs;
  figures: Figure[];
  statements: Statement[];
  assumptions: CostLens["assumptions"];
  /** How each input was set: the figure or assumption behind it. */
  inputNotes: string[];
  unknowns: string[];
}

// ---------------------------------------------------------------- Region 2027 budget: GRT Business Plan

function grtPlan(): CostSpec {
  const G = "grt-business-plan-2025", B = "row-2026-budget-book";
  const opQuote = c(G, 5, "Operating Expenditures 195 67 262");
  const capQuote = c(G, 6, "The GRT Business Plan identifies $798 million in major transit capital projects over the 2025–2035 timeframe");
  const fleetQuote = c(G, 6, "Bus Fleet / Support Vehicles $487 No Change** $487");
  const capital = 798 * M;
  const fleetPerYear = (487 * M) / 10;
  const renewals = Array.from({ length: 15 }, (_, k) => ({ afterYears: 10 + k, amount: fleetPerYear, label: "bus fleet replacement" }));
  const inputs: LifecycleInputs = {
    startYear: 2025,
    horizonYears: 25,
    capital: Array.from({ length: 10 }, (_, k) => ({ year: 2025 + k, amount: capital / 10 })),
    serviceStartYear: 2025,
    operatingPerYear: 262 * M,
    operatingSchedule: [{ year: 2025, amount: 195 * M }, { year: 2034, amount: 262 * M }],
    maintenancePerYear: 0,
    renewals,
    households: HOUSEHOLDS_2021,
  };
  return {
    decisionId: "row-2027-budget",
    asset: "Grand River Transit's Business Plan: building and running the bus and ION network to 2034 and beyond (GRT's own estimates in 2025 dollars; leaves out ION Stage 2 and Kitchener Central Station)",
    inputs,
    figures: [
      cited("grt-capital", "Major transit capital projects, 2025–2035", capital, "CAD", "$798 million", capQuote),
      cited("grt-capital-new", "New capital the plan adds to the approved program", 254 * M, "CAD", "$254 million", c(G, 7, "Total $544 $254 $798")),
      cited("grt-fleet", "Bus fleet and support vehicles in the 10-year capital plan", 487 * M, "CAD", "$487 million", fleetQuote),
      cited("grt-operating-2025", "Operating spending in 2025 (operations, maintenance, fuel, wages)", 195 * M, "CAD", "$195 million a year", opQuote),
      cited("grt-operating-2034", "Operating spending by 2034 with the full plan (2025 dollars)", 262 * M, "CAD", "$262 million a year", opQuote),
      cited("grt-operating-total-2034", "Total operating cost by 2034, including debt payments and reserves", 314 * M, "CAD", "$314 million a year", c(G, 5, "Total Operating Cost 234 80 314")),
      cited("grt-net-2034", "Net operating cost by 2034, after fares and other revenue", 199 * M, "CAD", "$199 million a year", c(G, 5, "Net Operating Cost 149 50 199")),
      cited("ion-stage2-capital", "ION Stage 2 (light rail to Cambridge) capital, 2026–2035", 2_045.6 * M, "CAD", "$2.05 billion", c(B, 43, "68030 RT to Cambridge-Project Development 85,000 72,000 78,000 78,000 313,000 1,732,600 2,045,600")),
      cited("transit-per-household-2026", "Transit's share of the 2026 regional tax for an average household", 516, "CAD", "$516 a year", c(B, 12, "Public Transit(2) 231,203 156,402 17.6 $516")),
      householdsFigure,
      computed("grt-fleet-per-year", "Bus fleet replacement after 2034 (assumed to continue at the plan's pace)", fleetPerYear, "CAD", "$48.7 million a year", "$487 million of fleet over ten years ÷ 10", ["grt-fleet"]),
    ],
    statements: [
      st("grt-op", "estimate", "Grand River Transit estimates that running its buses and trains (operations, maintenance, fuel and wages) would cost $262 million a year by 2034 to deliver its whole Business Plan, up from $195 million in 2025, in 2025 dollars.", [opQuote]),
      st("grt-cap", "estimate", "The plan lists $798 million of major transit capital projects for 2025 to 2035; about $544 million of it was already in the approved capital program.", [capQuote, c(G, 6, "approximately $544 million is currently accommodated within the approved 2025-2034 Transit Capital Program")]),
      st("grt-excludes", "fact", "These estimates leave out ION Stage 2 and Kitchener Central Station.", [c(G, 5, "Excludes ION Stage 2 and Kitchener Central Station")]),
      st("grt-budget", "fact", "Each year's budget decides how much of the plan goes ahead.", [c(G, 7, "subject to Regional Council’s annual Plan and Budget process")]),
      st("grt-net", "estimate", "After fares and other revenue, GRT expects the net operating cost to reach $199 million a year by 2034, up from $149 million.", [c(G, 5, "Net Operating Cost 149 50 199")]),
      st("ion2", "fact", "Separately, the Region's 10-year capital plan sets aside $2.05 billion for light rail to Cambridge (ION Stage 2), starting with $85 million in 2027.", [c(B, 43, "68030 RT to Cambridge-Project Development 85,000 72,000 78,000 78,000 313,000 1,732,600 2,045,600")]),
      st("transit-hh", "fact", "In 2026, transit took $516 of an average household's regional property tax.", [c(B, 12, "Public Transit(2) 231,203 156,402 17.6 $516")]),
    ],
    assumptions: [
      { id: "horizonYears", label: "Years counted", value: 25, unit: "years", min: 10, max: 50, step: 5, why: "The plan runs to 2034. Counting 25 years (2025–2049) also shows the 15 years after it is built out, when the bigger network keeps costing money to run." },
      discountAssumption,
      { id: "operatingPerYear", label: "Yearly operating spending once the plan is built", value: 262 * M, unit: "CAD", min: 150 * M, max: 400 * M, step: 5 * M, why: "GRT's 2034 estimate for the full plan, in 2025 dollars, without debt payments (those pay for the capital already counted). The chart climbs in a straight line from $195 million in 2025 because the plan gives only the start and the end; moving this slider sets every year to one amount." },
      { id: "renewalScale", label: "Bus replacement after 2034", value: 100, unit: "%", min: 0, max: 200, step: 10, why: "After 2034 we assume buses keep being replaced at the plan's pace: $487 million of fleet over ten years, about $48.7 million a year. No document gives spending after 2034." },
      overrunAssumption("Large transit projects often cost more than first estimated, and GRT calls these figures demonstrative. Slide to see what an overrun adds."),
      householdsAssumption,
    ],
    inputNotes: [
      "Capital: $798 million (cited) spread evenly over 2025–2034, the ten years of the plan's capital table (assumption: the plan gives no year-by-year split).",
      "Operating: $195 million in 2025 and $262 million in 2034 (cited), straight line in between (assumption), then held at $262 million in 2025 dollars.",
      "Maintenance is inside GRT's operating line (operations, maintenance, fuel, wages), so it is not counted twice.",
      "Debt payments and transfers to reserves ($39 million rising to $52 million) are left out because they pay for capital that is already counted.",
      "Renewal: bus replacement after 2034 at $48.7 million a year, the plan's fleet budget divided by ten (assumption).",
      "Emissions are not counted: no document gives Grand River Transit's own emissions, so no carbon cost is added.",
      "Revenue (fares, gas tax, advertising) is not subtracted: this is the cost of the service, not what taxpayers pay after fares.",
    ],
    unknowns: [
      "What ION Stage 2 (light rail to Cambridge) will cost to run each year: no operating estimate is in these documents.",
      "What the 2027 budget will fund of the plan: the draft budget is not public until December 2026.",
      "Bus replacement and garage costs after 2035.",
    ],
  };
}

// ---------------------------------------------------------------- Water Supply Strategy

function waterSupply(): CostSpec {
  const B = "row-2026-budget-book", I = "row-infrastructure-gap-2026";
  const totalQuote = c(B, 63, "Total Expenditure 32,829 34,443 67,272 73,470 78,996 101,738 111,037 432,513 415,059 847,572");
  const opQuote = c(B, 62, "Subtotal - Operating 45,447 47,878 2,431 5.3%");
  const needQuote = c(I, 1, "Water *Optimal Renewal Investment Needs $54.7M");
  const gapQuote = c(I, 1, "Infrastructure Funding Gap $23.2M");
  const plannedQuote = c(I, 1, "The annual average level of investment in $31.5M");
  const later = 415_059_000 / 5;
  const capital = [
    { year: 2026, amount: 67_272_000 },
    { year: 2027, amount: 73_470_000 },
    { year: 2028, amount: 78_996_000 },
    { year: 2029, amount: 101_738_000 },
    { year: 2030, amount: 111_037_000 },
    ...[2031, 2032, 2033, 2034, 2035].map((year) => ({ year, amount: later })),
  ];
  const renewals = [
    ...Array.from({ length: 10 }, (_, k) => ({ afterYears: k, amount: 23.2 * M, label: "renewal not yet funded" })),
    ...Array.from({ length: 15 }, (_, k) => ({ afterYears: 10 + k, amount: 54.7 * M, label: "renewal need after the capital plan" })),
  ];
  const inputs: LifecycleInputs = {
    startYear: 2026,
    horizonYears: 25,
    capital,
    serviceStartYear: 2026,
    operatingPerYear: 47_878_000,
    maintenancePerYear: 0,
    renewals,
    households: HOUSEHOLDS_2021,
  };
  return {
    decisionId: "row-water-supply-2051",
    asset: "The Region's water supply system: its 2026–2035 capital program, running costs and renewal, before the new strategy's choices are added",
    inputs,
    figures: [
      cited("water-capital", "Water supply capital program, 2026–2035", 847_572_000, "CAD", "$847.6 million", totalQuote),
      cited("water-growth", "Of which upgrades, expansion and new facilities", 487_917_000, "CAD", "$487.9 million", c(B, 63, "Upgrades, Expansion & New Facilities 12,003 7,398 19,401 24,448 38,478 63,083 66,559 211,969 275,948 487,917")),
      cited("water-dc", "Paid by water development charges", 311_904_000, "CAD", "$311.9 million", c(B, 63, "Development Charge - Water 13,664 14,342 28,006 32,666 29,530 40,427 41,895 172,524 139,379 311,904")),
      cited("water-rates", "Paid from the Water Capital Reserve (water rates)", 525_407_000, "CAD", "$525.4 million", c(B, 63, "Water Capital Reserve 18,887 18,517 37,404 39,996 48,764 60,296 67,739 254,200 271,207 525,407")),
      cited("water-operating", "Water supply operating spending, 2026 (before capital financing)", 47_878_000, "CAD", "$47.9 million a year", opQuote),
      cited("water-renewal-need", "Water renewal the Region says is needed each year", 54.7 * M, "CAD", "$54.7 million a year", needQuote),
      cited("water-renewal-planned", "Water renewal the 10-year plan pays for each year (average)", 31.5 * M, "CAD", "$31.5 million a year", plannedQuote),
      cited("water-renewal-gap", "Water renewal funding gap", 23.2 * M, "CAD", "$23.2 million a year", gapQuote),
      cited("water-bill", "Average household's water supply cost, 2026", 243.63, "CAD", "$243.63 a year", c(B, 11, "Water $230.05 $243.63 $13.58 5.90%")),
      householdsFigure,
      computed("water-capital-later", "Capital each year 2031–2035 (five-year subtotal spread evenly)", later, "CAD", "$83.0 million a year", "$415.1 million for 2031–2035 ÷ 5 (the budget book gives only the five-year subtotal)", ["water-capital"]),
    ],
    statements: [
      st("w-cap", "fact", "The Region plans $847.6 million of water supply capital work from 2026 to 2035, with $73.5 million in 2027.", [totalQuote]),
      st("w-growth", "fact", "$487.9 million of that is for upgrades, expansion and new facilities.", [c(B, 63, "Upgrades, Expansion & New Facilities 12,003 7,398 19,401 24,448 38,478 63,083 66,559 211,969 275,948 487,917")]),
      st("w-fund", "fact", "Development charges on new building pay $311.9 million of it, and water rates pay $525.4 million through the Water Capital Reserve.", [c(B, 63, "Development Charge - Water 13,664 14,342 28,006 32,666 29,530 40,427 41,895 172,524 139,379 311,904"), c(B, 63, "Water Capital Reserve 18,887 18,517 37,404 39,996 48,764 60,296 67,739 254,200 271,207 525,407")]),
      st("w-op", "fact", "Running the water supply system costs $47.9 million in 2026, before paying for capital.", [opQuote]),
      st("w-gap", "fact", "The Region says its water assets need $54.7 million a year of renewal, but the 10-year plan invests $31.5 million a year, a gap of $23.2 million a year.", [needQuote, plannedQuote, gapQuote]),
      st("w-bill", "fact", "Water supply costs the average household $243.63 in 2026, up 5.9%.", [c(B, 11, "Water $230.05 $243.63 $13.58 5.90%")]),
    ],
    assumptions: [
      { id: "horizonYears", label: "Years counted", value: 25, unit: "years", min: 10, max: 50, step: 5, why: "25 years (2026–2050) runs close to the strategy's 2051 horizon. Pipes, wells and plants last longer, so their renewal keeps going after that." },
      discountAssumption,
      { id: "operatingPerYear", label: "Yearly running cost", value: 47_878_000, unit: "CAD", min: 30 * M, max: 90 * M, step: 1 * M, why: "The 2026 operating budget, held flat in today's dollars. New wells or sources chosen by the strategy will add running costs that are not published yet." },
      { id: "renewalScale", label: "Renewal counted", value: 100, unit: "%", min: 0, max: 200, step: 10, why: "2026–2035: the $23.2 million a year the Region says is missing from renewal. After 2035: the full $54.7 million a year need, assuming it stays at today's level. Slide to 0 to count only what is budgeted." },
      overrunAssumption("Construction prices can rise faster than budgets. Slide to see what an overrun on the capital program adds."),
      householdsAssumption,
    ],
    inputNotes: [
      "Capital: the budget book's yearly totals for 2026–2030 (cited) and its 2031–2035 subtotal spread evenly (assumption). 2026 includes earlier approvals not yet spent.",
      "No capital after 2035 is counted: the strategy's new sources will add to it, and their costs are not published.",
      "Operating: the 2026 operating subtotal (cited), held flat in today's dollars (assumption). Maintenance is inside it.",
      "Renewal: the unfunded gap ($23.2 million a year, cited) for 2026–2035, then the full need ($54.7 million a year, cited) after the 10-year plan ends (assumption). The gap report's 'Water' line covers the Region's water assets, which may include more than water supply.",
      "Emissions are not counted: no document gives the water system's emissions.",
    ],
    unknowns: [
      "The cost of each shortlisted water source option: not published until the strategy's evaluation is released.",
      "How water rates would change to pay for the preferred option.",
    ],
  };
}

// ---------------------------------------------------------------- Kitchener Central Transit Hub

function transitHub(): CostSpec {
  const K = "row-kcth-update-2026", B = "row-2026-budget-book";
  const p1Quote = c(K, 5, "includes a budget of $35 million for the Kitchener Central Transit Hub Project Phase 1");
  const p2Quote = c(K, 5, "includes a budget of $129 million for the Kitchener Central Transit Hub Project Phase 2");
  const early = c(B, 87, "90170 KCTH Early Works 2,090 140 2,230 4,810 19,000 8,886 34,926 34,926");
  const hub = c(B, 87, "90179 Kitchener Central Transit Hub 563 2,710 3,273 22,991 59,425 26,575 16,302 128,566 128,566");
  const byYear = [
    { year: 2026, amount: (2_230 + 3_273) * 1000 },
    { year: 2027, amount: (4_810 + 22_991) * 1000 },
    { year: 2028, amount: (19_000 + 59_425) * 1000 },
    { year: 2029, amount: (8_886 + 26_575) * 1000 },
    { year: 2030, amount: 16_302 * 1000 },
  ];
  const capitalTotal = byYear.reduce((s, x) => s + x.amount, 0);
  const upkeep = Math.round(capitalTotal * 0.02);
  const inputs: LifecycleInputs = {
    startYear: 2026,
    horizonYears: 40,
    capital: byYear,
    serviceStartYear: 2031,
    operatingPerYear: 0,
    maintenancePerYear: upkeep,
    households: HOUSEHOLDS_2021,
  };
  return {
    decisionId: "kitchener-transit-hub-variances",
    asset: "Kitchener Central Transit Hub (Phases 1 and 2): the Region's capital budget, with upkeep and running costs as assumptions because none are published",
    inputs,
    figures: [
      cited("kcth-phase1", "Phase 1 budget (early works, pedestrian bridge and ramp)", 35 * M, "CAD", "$35 million", p1Quote),
      cited("kcth-phase2", "Phase 2 budget (the hub)", 129 * M, "CAD", "$129 million", p2Quote),
      cited("kcth-early-years", "Project 90170 KCTH Early Works by year (2026–2029)", 34_926_000, "CAD", "$34.9 million", early),
      cited("kcth-hub-years", "Project 90179 Kitchener Central Transit Hub by year (2026–2030)", 128_566_000, "CAD", "$128.6 million", hub),
      cited("kcth-phase2-federal", "Federal funding for Phase 2", 52 * M, "CAD", "$52 million", c(K, 5, "$52 million from the Federal government")),
      cited("kcth-done", "Hub and site works targeted for completion", 2031, "year", "end of 2031", c(K, 3, "The transit hub and related site works are targeted for completion by the end of 2031")),
      householdsFigure,
      computed("kcth-capital-total", "Capital by year, both projects", capitalTotal, "CAD", money(capitalTotal), "90170 + 90179, each year 2026–2030, from the 2026 budget book (2026 includes earlier approvals not yet spent)", ["kcth-early-years", "kcth-hub-years"]),
      { id: "kcth-upkeep", label: "Upkeep each year (assumption: 2% of capital)", value: upkeep, unit: "CAD", display: `${money(upkeep)} a year`, kind: "assumption", formula: "2% × capital", inputs: ["kcth-capital-total"] },
    ],
    statements: [
      st("k-budget", "fact", "The Region budgets $35 million for Phase 1 and $129 million for Phase 2 of the Kitchener Central Transit Hub.", [p1Quote, p2Quote]),
      st("k-funding1", "fact", "For Phase 1, the province pays $33 million; the Region borrows the rest through debentures.", [c(K, 5, "$33 million from the Provincial government (MTO) and regionally through $0.8 million RDC debenture and $1.2 million levy supported debentures")]),
      st("k-funding2", "fact", "For Phase 2, the province pays $42 million and the federal government $52 million; the Region borrows $14 million against development charges and $21 million against property taxes.", [c(K, 5, "$42 million from the Provincial government (MTO), $52 million from the Federal government and regionally through $14 million RDC debenture, $21 million through levy supported debentures")]),
      st("k-peak", "fact", "Spending on the hub itself peaks in 2028, at $59.4 million.", [hub]),
      st("k-when", "fact", "Substantial completion is expected in 2030, and the hub and site works are targeted for completion by the end of 2031.", [c(K, 2, "Substantial completion of Kitchener Central Transit Hub is currently expected in 2030"), c(K, 3, "The transit hub and related site works are targeted for completion by the end of 2031")]),
      st("k-om", "unknown", "Operations and maintenance arrangements with Metrolinx are still to be agreed.", [c("row-kcth-update-2024", 5, "The MOU agreement provides for future licence, operations and maintenance agreements")]),
      st("k-grt", "fact", "GRT's Business Plan operating estimates leave out Kitchener Central Station.", [c("grt-business-plan-2025", 5, "Excludes ION Stage 2 and Kitchener Central Station")]),
    ],
    assumptions: [
      { id: "horizonYears", label: "Years counted", value: 40, unit: "years", min: 20, max: 60, step: 5, why: "Transit buildings usually serve 40 years or more. The Region has not published the hub's design life." },
      discountAssumption,
      { id: "maintenancePerYear", label: "Yearly upkeep (maintenance and repair)", value: upkeep, unit: "CAD", min: 0, max: Math.round(capitalTotal * 0.04), step: 100_000, why: "No upkeep figure is published. A common rule of thumb for public buildings is 2 to 4% of their value a year for maintenance and repair (US National Research Council, 1990). We start at 2% of the capital budget." },
      { id: "operatingPerYear", label: "Yearly running cost (staff, cleaning, security, utilities)", value: 0, unit: "CAD", min: 0, max: 10 * M, step: 250_000, why: "No running cost is published, and the operations agreements are still to come. It starts at $0 so the chart shows only what is known; move it to test an amount." },
      overrunAssumption("Large building projects often cost more than first budgeted. Slide to see what an overrun adds."),
      householdsAssumption,
    ],
    inputNotes: [
      "Capital: projects 90170 (early works) and 90179 (the hub) by year from the 2026 budget book (cited), $163.5 million in all. This matches the report's $35 million and $129 million.",
      "Service starts in 2031, between substantial completion (2030) and the end-2031 target (both cited).",
      "Upkeep: 2% of capital a year (assumption, slider 0–4%). Running cost: $0 by default (unknown, slider).",
      "No separate renewal is counted. The upkeep rule of thumb is meant to cover repairs and replacing parts.",
      "Emissions are not counted: no document gives the hub's emissions.",
      "The minor variances being decided don't change these costs; the costs show what the hub they enable commits the Region to.",
    ],
    unknowns: [
      "What the hub will cost to run and maintain each year, and how that is shared with Metrolinx and GO Transit.",
      "What the Region will earn or spend on the leftover land after the hub is built.",
    ],
  };
}

export const SPECS: Record<string, () => CostSpec> = {
  "row-2027-budget": grtPlan,
  "row-water-supply-2051": waterSupply,
  "kitchener-transit-hub-variances": transitHub,
};

/** Build one decision's cost lens; throws if any quote is not found on its page. */
export function buildDecisionCost(decisionId: string): CostLens & Record<string, unknown> {
  const make = SPECS[decisionId];
  if (!make) throw new Error(`No cost spec for ${decisionId}. Known: ${Object.keys(SPECS).join(", ")}`);
  const spec = make();
  const bad: string[] = [];
  for (const f of spec.figures) if (f.kind === "cited" && (!f.citation || !citationOk(f.citation))) bad.push(`figure ${f.id}: ${f.citation?.sourceId} p${f.citation?.page} "${f.citation?.quote}"`);
  for (const s of spec.statements) {
    s.verified = s.citations.length > 0 && s.citations.every(citationOk);
    if (!s.verified) bad.push(`statement ${s.id}: ${s.citations.map((x) => `${x.sourceId} p${x.page} "${x.quote}"`).join("; ")}`);
  }
  if (bad.length) throw new Error(`Quotes not found on their pages:\n${bad.join("\n")}`);
  for (const a of spec.assumptions) if (a.value < a.min || a.value > a.max) throw new Error(`assumption ${a.id} default outside its range`);
  const lens = buildCostLens({ asset: spec.asset, inputs: spec.inputs, figures: spec.figures, statements: spec.statements, assumptions: spec.assumptions });
  const res = lifecycleCost(spec.inputs);
  return {
    ...lens,
    decisionId,
    method:
      "Lifecycle cost = capital in the years it is spent + operating and maintenance in each year of service + renewals in the years they fall + emissions × carbon price (none counted here), over the years shown, in today's dollars, undiscounted unless a discount rate is set. Built in code by lenses/cost from figures whose quotes were checked on their pages; everything else is a labelled assumption.",
    inputNotes: spec.inputNotes,
    unknowns: spec.unknowns,
    summary: costSummary(spec.inputs, res),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const ids = args.includes("--all") || !args.length ? Object.keys(SPECS) : args.filter((a) => !a.startsWith("--"));
  mkdirSync(join(ROOT, "data", "lenses"), { recursive: true });
  for (const id of ids) {
    const lens = buildDecisionCost(id);
    const out = join(ROOT, "data", "lenses", `cost-${id}.json`);
    writeFileSync(out, JSON.stringify(lens, null, 1) + "\n");
    console.log(`wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
    console.log(lens.summary);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
