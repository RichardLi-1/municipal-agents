// Compact text of a TransitLens for a model to read (the agents' transit tool).

import type { TransitLens } from "../../shared/types.ts";

export interface SummaryOptions {
  scenario?: string; // only this scenario's access and gaps
  maxGaps?: number; // default 10
  maxFixes?: number; // default 6
  types?: string[]; // destination types to list (default all)
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function transitSummary(lens: TransitLens, opts: SummaryOptions = {}): string {
  const x = lens as TransitLens & {
    area?: { id: string; label: string };
    population?: { total: number; origins: number };
    frequentService?: { peopleWithin800mOf10Min: number; peopleWithin800mOf15Min: number; peopleWithin800mOfAnyStop: number };
  };
  const scen = lens.scenarios.filter((s) => !opts.scenario || s.id === opts.scenario);
  const lines: string[] = [];
  lines.push(`TRANSIT ACCESS: ${x.area?.label ?? "area"}${x.population ? `, ${x.population.total.toLocaleString("en-CA")} people (2021 census)` : ""}`);
  lines.push(`Feed: ${lens.feed.name}, retrieved ${lens.feed.retrieved}. Scenarios: ${lens.scenarios.map((s) => `${s.id} = ${s.label}, ${s.day}`).join("; ")}.`);
  if (x.frequentService && x.population) {
    const f = x.frequentService, t = x.population.total || 1;
    lines.push(`Within 800 m (straight line) at weekday 8 am: any stop ${f.peopleWithin800mOfAnyStop.toLocaleString("en-CA")} (${pct(f.peopleWithin800mOfAnyStop / t)}); service every 15 min or better ${f.peopleWithin800mOf15Min.toLocaleString("en-CA")} (${pct(f.peopleWithin800mOf15Min / t)}); every 10 min or better ${f.peopleWithin800mOf10Min.toLocaleString("en-CA")} (${pct(f.peopleWithin800mOf10Min / t)}).`);
  }
  const fx = (lens as { focus?: { label: string; reach: { scenario: string; minutes: number; people: number; share: number }[] } }).focus;
  if (fx) {
    lines.push(`Who can reach ${fx.label} by transit and walking (whole region, 2021 census):`);
    for (const s of scen) lines.push(`- ${s.label}: ${fx.reach.filter((r) => r.scenario === s.id).map((r) => `${r.minutes} min ${r.people.toLocaleString("en-CA")} (${pct(r.share)})`).join(", ")}`);
  }
  lines.push("Share of people who reach the nearest destination of each type within the limit, by transit and walking:");
  const types = [...new Set(lens.access.map((a) => a.destinationType))].filter((t) => !opts.types || opts.types.includes(t));
  for (const t of types) {
    const row = scen.map((s) => {
      const a = lens.access.find((v) => v.scenario === s.id && v.destinationType === t);
      return a ? `${s.label} ${pct(a.shareReached)}` : "";
    });
    const lim = lens.access.find((v) => v.destinationType === t)?.minutesLimit ?? 45;
    lines.push(`- ${t} (${lim} min): ${row.filter(Boolean).join(", ")}`);
  }
  const gaps = lens.gaps.filter((g) => !opts.scenario || !g.scenario || g.scenario === opts.scenario).slice(0, opts.maxGaps ?? 10);
  lines.push(`Gaps (largest first, ${gaps.length} of ${lens.gaps.length}):`);
  for (const g of gaps) lines.push(`- [${g.id}] ${g.title}. ${g.detail}`);
  const fixes = lens.fixes.slice(0, opts.maxFixes ?? 6);
  lines.push("Candidate fixes, ranked by people helped (computed from the timetable; not GRT proposals):");
  for (const f of fixes) lines.push(`${f.rank}. [${f.id}] ${f.title}. Benefit: ${f.benefit} Trade-off: ${f.tradeoff}`);
  lines.push(`Method: ${lens.method}`);
  lines.push(`Limits: ${lens.limits.join(" ")}`);
  lines.push("These figures are computed by Municipal Agents from open data (kind: computed), not quoted from a city document; cite them as computed.");
  return lines.join("\n");
}
