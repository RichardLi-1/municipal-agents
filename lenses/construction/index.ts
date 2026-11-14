// The construction scout lens: what agents and the service import.
//   constructionSummary(lens): compact text an agent reads (scenario, sites, layout, steps, limits)
//   scoutSites(...): rank candidate sites live from OpenStreetMap features

import type { ConstructionLens } from "../../shared/types.ts";

export { scoutSites, toFeatures, fetchOsm, WEIGHTS, WEIGHT_LABELS, scoreOf, factorsFor, areaFit } from "./scout.ts";
export { RULES, crossPassageChainages, boreholeChainages, boreholeDepth, gradeLimitedCrown, requiredCrown } from "./layout.ts";
export { SPOIL, spoilPlan, boreVolumeM3 } from "./steps.ts";

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const ha = (m2: number) => `${(m2 / 10000).toFixed(1)} ha`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-CA");

/** Compact plain text for an agent: always says it is a scenario, never a plan. */
export function constructionSummary(lens: ConstructionLens): string {
  const L = lens as ConstructionLens & { numbers?: any };
  const n = L.numbers ?? {};
  const out: string[] = [];
  out.push(`${lens.scenario.label.toUpperCase()}.`);
  out.push(`Scenario: ${lens.scenario.title}.`);
  out.push(`Basis: ${lens.scenario.basis}`);
  out.push(`Method: ${lens.method === "tbm-twin-bore" ? "two parallel bored tunnels (twin bores) dug by tunnel boring machines (TBMs)" : lens.method}.`);
  out.push(`Line source: ${lens.alignmentSource}`);

  const bore = lens.bores[0];
  if (bore) {
    out.push(
      `Layout: ${lens.bores.length} bores, each ${n0(bore.lengthM)} m long and ${bore.diameterM} m across, ${n.boreOffsetM ? `${n.boreOffsetM * 2} m apart centre to centre` : "side by side"}; ` +
        `top of tunnel ${n.coverM ? `${n.coverM.minM}-${n.coverM.maxM} m` : "?"} below ground, bottom ${bore.depthM.min}-${bore.depthM.max} m below ground. ` +
        `Depth rule: top of tunnel at least 2 diameters (13 m) below ground, 2.5 diameters under Highway 401, 2 diameters below the riverbed; grades no steeper than 4% (assumption).`,
    );
  }
  for (const s of n.shafts ?? []) out.push(`${s.id === "launch" ? "Launch" : "Extraction"} shaft: about ${s.lengthM} by ${s.widthM} m, about ${s.depthM} m deep, at chainage ${n0(s.chainageM)} m.`);
  if (n.crossings?.length) out.push(`Crossings: ${n.crossings.map((c: any) => `${c.name} at ${n0(c.chainageM)} m`).join("; ")}.`);
  out.push(
    `Cross-passages: ${lens.crossPassages.length}, no more than 244 m apart (NFPA 130). Geotechnical boreholes: ${lens.boreholes.length} (every 75 m, 3 per shaft, 2 each side of each crossing), each at least 1.5 tunnel diameters below the tunnel bottom, and at shafts at least 1.5 times the shaft depth (FHWA-NHI-10-034, s. 3.5.2.1), so ${Math.min(...lens.boreholes.map((b) => b.depthM))}-${Math.max(...lens.boreholes.map((b) => b.depthM))} m deep.`,
  );
  if (n.spoil) {
    const sp = n.spoil;
    out.push(
      `Spoil (estimate): ${n0(sp.inSituM3)} m3 in the ground, ${n0(sp.looseM3)} m3 loose (bulking ${sp.assumptions.bulking}), about ${n0(sp.truckloads)} truckloads at ${sp.assumptions.truckM3} m3 each; ` +
        `about ${sp.trucksPerDay} trucks a day (${sp.trucksPerHour} an hour over ${sp.assumptions.haulHours} hours) while both machines bore at ${sp.assumptions.advanceMPerDay} m a day each; about ${sp.boringMonths} months of boring.`,
    );
  }

  out.push(`Scoring rule (weights out of 100): ${lens.weights.map((w) => `${w.label}: ${w.weight}`).join("; ")}.`);
  out.push("Candidate sites (ranked within each role; the scout ranks, people decide; none is chosen):");
  for (const s of lens.sites.slice(0, 9)) {
    const flag = s.id === lens.proposed.launch ? " [top launch candidate]" : s.id === lens.proposed.extraction ? " [top extraction candidate]" : "";
    out.push(
      `- ${s.name} (${s.role}, score ${s.score}/100${flag}): ${ha(s.areaM2)} open, ${n0(s.distanceToAlignmentM)} m from the line, land use ${s.landUse}` +
        `${s.nearestSensitive ? `, nearest ${s.nearestSensitive.kind}${s.nearestSensitive.name ? ` (${s.nearestSensitive.name})` : ""} ${n0(s.nearestSensitive.distanceM)} m` : ""}` +
        `${s.truckAccess ? `, ${n0(s.truckAccess.distanceM)} m to ${s.truckAccess.road}` : ""}. Good: ${s.reasons.join(" ")} Check: ${s.concerns.join(" ")}`,
    );
  }
  out.push("Steps (durations are assumptions):");
  for (const s of lens.steps) out.push(`${s.n}. ${s.title} (${s.duration}). ${s.plain} What residents would notice: ${s.whatResidentsNotice}`);
  out.push(`Limits: ${lens.limits.join(" ")}`);
  out.push(`References: ${lens.references.join(" | ")}`);
  out.push(`Section length ${km(n.sectionLengthM ?? bore?.lengthM ?? 0)} of ION Stage 2's ${km(n.stage2LengthM ?? 0)}.`);
  return out.join("\n");
}
