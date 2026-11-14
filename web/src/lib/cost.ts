import type { CostLens } from "../../../shared/types.ts";

export type Row = CostLens["series"][number];
export const PARTS = ["capital", "operating", "maintenance", "renewal", "environmental"] as const;
export type Part = (typeof PARTS)[number];

/**
 * The lifecycle formula, in the browser: capital + yearly costs × years, each future year
 * optionally discounted: cost_t / (1 + r)^t, t counted from the first year.
 *
 * Assumption ids we understand (others are shown but don't change the sums):
 *   horizonYears, discountRate (%), operatingPerYear, maintenancePerYear,
 *   renewalScale (%), capitalOverrun (%), capitalCost, carbonPrice (CAD/t), households
 */
export function recompute(lens: CostLens, values: Record<string, number>) {
  const base = lens.series;
  const first = base[0]?.year ?? new Date().getFullYear();
  const horizon = Math.round(values.horizonYears ?? lens.horizonYears ?? base.length);
  const r = (values.discountRate ?? lens.discountRate * 100) / 100;
  const def = Object.fromEntries((lens.assumptions ?? []).map((a) => [a.id, a.value]));
  const ratio = (id: string) => (values[id] !== undefined && def[id] ? values[id] / def[id] : 1);

  // Steady yearly amounts, from the report's series (the median of non-zero years).
  const steady = (k: Part) => {
    const v = base.map((s) => s[k]).filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  const opStart = base.find((s) => s.operating > 0 || s.maintenance > 0)?.year ?? first;
  const operating = values.operatingPerYear ?? steady("operating");
  const maintenance = values.maintenancePerYear ?? steady("maintenance");
  const environmental = steady("environmental") * ratio("carbonPrice");
  const capitalScale =
    (values.capitalCost !== undefined && lens.totals.capital ? values.capitalCost / lens.totals.capital : 1) *
    (1 + (values.capitalOverrun ?? 0) / 100);
  const renewalScale = (values.renewalScale ?? 100) / 100;

  const series: Row[] = [];
  for (let i = 0; i < horizon; i++) {
    const year = first + i;
    const b = base.find((s) => s.year === year);
    const live = year >= opStart;
    const d = Math.pow(1 + r, i);
    series.push({
      year,
      capital: ((b?.capital ?? 0) * capitalScale) / d,
      operating: (live ? operating : 0) / d,
      maintenance: (live ? maintenance : 0) / d,
      renewal: ((b?.renewal ?? 0) * renewalScale) / d,
      environmental: (live ? environmental : 0) / d,
    });
  }
  return { series, totals: totalsOf(series, values.households ?? lens.households) };
}

export function totalsOf(series: Row[], households?: number) {
  const t = { capital: 0, operating: 0, maintenance: 0, renewal: 0, environmental: 0, lifecycle: 0, perHousehold: undefined as number | undefined };
  for (const s of series) for (const k of PARTS) t[k] += s[k];
  t.lifecycle = PARTS.reduce((a, k) => a + t[k], 0);
  if (households) t.perHousehold = t.lifecycle / households;
  return t;
}
