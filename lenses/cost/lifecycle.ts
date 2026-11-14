// Lifecycle cost of an asset (challenge 3): the upfront price next to what it costs to run,
// maintain, renew and emit over its life. Pure functions; the agents fill the inputs from cited
// pages (or mark them as assumptions) and the display recomputes when a resident moves a slider.

import type { CostLens, Figure, Statement } from "../../shared/types.ts";

export interface LifecycleInputs {
  /** First calendar year of the horizon (usually the first year of construction). */
  startYear: number;
  /** Years counted, including construction (e.g. 25 or 40). */
  horizonYears: number;
  /** Capital cost: one total spread evenly over `buildYears`, or amounts by calendar year. */
  capital: number | { year: number; amount: number }[];
  /** Years of construction when `capital` is one total (default 1). Service starts after them. */
  buildYears?: number;
  /** First year of service; default: the year after the last capital year. */
  serviceStartYear?: number;
  /** Yearly operating cost while in service (today's dollars). */
  operatingPerYear: number;
  /**
   * Operating cost by calendar year where a plan gives it (e.g. today's and the build-out
   * year's). Years between two points are interpolated in a straight line; before the first
   * point the first value holds, after the last point the last value holds. Overrides
   * `operatingPerYear` when given.
   */
  operatingSchedule?: { year: number; amount: number }[];
  /** Yearly maintenance cost while in service (today's dollars). */
  maintenancePerYear: number;
  /** Major renewals, `afterYears` years after service starts (e.g. a roof at 20 years). */
  renewals?: { afterYears: number; amount: number; label?: string }[];
  /** A renewal that repeats every `years` years of service. */
  renewalEvery?: { years: number; amount: number; label?: string };
  /** Emissions in tonnes CO2e per year of service (positive adds cost, negative saves). */
  emissionsTPerYear?: number;
  /** Carbon price in dollars per tonne: one value, or by calendar year (the last given year's price holds after). */
  carbonPrice?: number | { year: number; price: number }[];
  /** Yearly cost growth for operating and maintenance in nominal terms (default 0: today's dollars). */
  escalation?: number;
  /** Discount rate for present value (default 0; e.g. 0.03). */
  discountRate?: number;
  /** Households sharing the cost, for a per-household figure. */
  households?: number;
}

export type SeriesRow = CostLens["series"][number];
export type Totals = CostLens["totals"];

export interface LifecycleResult {
  series: SeriesRow[];
  totals: Totals;
  /** Same totals without discounting, for "in today's dollars" text when a rate is used. */
  undiscounted: Totals;
  serviceStartYear: number;
}

function carbonPriceFor(year: number, p: LifecycleInputs["carbonPrice"]): number {
  if (p === undefined) return 0;
  if (typeof p === "number") return p;
  const sorted = [...p].sort((a, b) => a.year - b.year);
  let price = 0;
  for (const s of sorted) if (s.year <= year) price = s.price;
  if (sorted.length && year < sorted[0].year) price = sorted[0].price;
  return price;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Straight-line value between the schedule's points; flat before the first and after the last. */
export function scheduleValue(points: { year: number; amount: number }[], year: number): number {
  const p = [...points].sort((a, b) => a.year - b.year);
  if (!p.length) return 0;
  if (year <= p[0].year) return p[0].amount;
  for (let i = 1; i < p.length; i++)
    if (year <= p[i].year) return p[i - 1].amount + ((p[i].amount - p[i - 1].amount) * (year - p[i - 1].year)) / (p[i].year - p[i - 1].year);
  return p[p.length - 1].amount;
}

export function lifecycleCost(inp: LifecycleInputs): LifecycleResult {
  if (!(inp.horizonYears > 0)) throw new Error("horizonYears must be positive");
  const r = inp.discountRate ?? 0;
  const g = inp.escalation ?? 0;
  const capitalByYear = new Map<number, number>();
  if (typeof inp.capital === "number") {
    const n = Math.max(1, Math.round(inp.buildYears ?? 1));
    for (let k = 0; k < n; k++) capitalByYear.set(inp.startYear + k, inp.capital / n);
  } else {
    for (const c of inp.capital) capitalByYear.set(c.year, (capitalByYear.get(c.year) ?? 0) + c.amount);
  }
  const lastCapitalYear = capitalByYear.size ? Math.max(...capitalByYear.keys()) : inp.startYear - 1;
  const serviceStart = inp.serviceStartYear ?? lastCapitalYear + 1;
  const renewalByYear = new Map<number, number>();
  for (const rn of inp.renewals ?? []) {
    const y = serviceStart + rn.afterYears;
    renewalByYear.set(y, (renewalByYear.get(y) ?? 0) + rn.amount);
  }
  if (inp.renewalEvery && inp.renewalEvery.years > 0)
    for (let a = inp.renewalEvery.years; serviceStart + a < inp.startYear + inp.horizonYears; a += inp.renewalEvery.years) {
      const y = serviceStart + a;
      renewalByYear.set(y, (renewalByYear.get(y) ?? 0) + inp.renewalEvery.amount);
    }

  const series: SeriesRow[] = [];
  const zero = (): Totals => ({ capital: 0, operating: 0, maintenance: 0, renewal: 0, environmental: 0, lifecycle: 0 });
  const totals = zero();
  const undiscounted = zero();
  for (let k = 0; k < inp.horizonYears; k++) {
    const year = inp.startYear + k;
    const inService = year >= serviceStart;
    const grow = Math.pow(1 + g, k);
    const raw = {
      capital: capitalByYear.get(year) ?? 0,
      operating: inService ? (inp.operatingSchedule?.length ? scheduleValue(inp.operatingSchedule, year) : inp.operatingPerYear) * grow : 0,
      maintenance: inService ? inp.maintenancePerYear * grow : 0,
      renewal: renewalByYear.get(year) ?? 0,
      environmental: inService ? (inp.emissionsTPerYear ?? 0) * carbonPriceFor(year, inp.carbonPrice) : 0,
    };
    const f = 1 / Math.pow(1 + r, k);
    const row: SeriesRow = {
      year,
      capital: round2(raw.capital * f),
      operating: round2(raw.operating * f),
      maintenance: round2(raw.maintenance * f),
      renewal: round2(raw.renewal * f),
      environmental: round2(raw.environmental * f),
    };
    series.push(row);
    for (const key of ["capital", "operating", "maintenance", "renewal", "environmental"] as const) {
      totals[key] += raw[key] * f;
      undiscounted[key] += raw[key];
    }
  }
  for (const t of [totals, undiscounted]) {
    t.lifecycle = t.capital + t.operating + t.maintenance + t.renewal + t.environmental;
    for (const key of ["capital", "operating", "maintenance", "renewal", "environmental", "lifecycle"] as const) t[key] = round2(t[key]);
    if (inp.households && inp.households > 0) t.perHousehold = round2(t.lifecycle / inp.households);
  }
  return { series, totals, undiscounted, serviceStartYear: serviceStart };
}

/** Assemble a CostLens: computed series and totals plus the agents' cited figures and statements. */
export function buildCostLens(args: {
  asset: string;
  inputs: LifecycleInputs;
  figures?: Figure[];
  statements?: Statement[];
  assumptions?: CostLens["assumptions"];
}): CostLens & { inputs: LifecycleInputs } {
  const res = lifecycleCost(args.inputs);
  return {
    inputs: args.inputs, // kept so the lens can be recomputed for another horizon or discount rate
    asset: args.asset,
    horizonYears: args.inputs.horizonYears,
    discountRate: args.inputs.discountRate ?? 0,
    households: args.inputs.households,
    figures: args.figures ?? [],
    series: res.series,
    totals: res.totals,
    statements: args.statements ?? [],
    assumptions: args.assumptions ?? [],
  };
}

const money = (x: number) =>
  Math.abs(x) >= 1e9 ? `$${(x / 1e9).toFixed(2)} billion` : Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)} million` : `$${Math.round(x).toLocaleString("en-CA")}`;

/** Compact text of a lifecycle result for a model to read. */
export function costSummary(inp: LifecycleInputs, res: LifecycleResult = lifecycleCost(inp)): string {
  const t = res.totals;
  const share = (x: number) => (t.lifecycle ? `${Math.round((x / t.lifecycle) * 100)}%` : "0%");
  const lines = [
    `LIFECYCLE COST over ${inp.horizonYears} years (${inp.startYear}-${inp.startYear + inp.horizonYears - 1}), service from ${res.serviceStartYear}, discount rate ${((inp.discountRate ?? 0) * 100).toFixed(1)}%${inp.escalation ? `, cost growth ${(inp.escalation * 100).toFixed(1)}%/yr` : ", today's dollars"}:`,
    `- Capital ${money(t.capital)} (${share(t.capital)})`,
    `- Operating ${money(t.operating)} (${share(t.operating)})`,
    `- Maintenance ${money(t.maintenance)} (${share(t.maintenance)})`,
    `- Renewal ${money(t.renewal)} (${share(t.renewal)})`,
    `- Environmental (emissions x carbon price) ${money(t.environmental)} (${share(t.environmental)})`,
    `- Lifecycle total ${money(t.lifecycle)}; the upfront price is ${share(t.capital)} of it.`,
  ];
  if (t.perHousehold !== undefined) lines.push(`- Per household (${inp.households?.toLocaleString("en-CA")} households): ${money(t.perHousehold)} over the period, about ${money(t.perHousehold / inp.horizonYears)} a year.`);
  if (inp.discountRate) lines.push(`- Without discounting the lifecycle total is ${money(res.undiscounted.lifecycle)}.`);
  lines.push("Computed by lenses/cost from the inputs given; each input must be cited or marked as an assumption.");
  return lines.join("\n");
}
