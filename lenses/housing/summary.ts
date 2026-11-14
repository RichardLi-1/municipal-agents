// A compact plain-text view of a HousingLens, for a model to read as a tool result.

import type { HousingLens } from "../../shared/types.ts";

function n(x: number | null | undefined): string {
  return x == null ? "not published" : x.toLocaleString("en-CA");
}

/** Stages with units, medians, target and progress, hard-to-track list and sources, as plain text. */
export function housingSummary(lens: HousingLens): string {
  const lines: string[] = [];
  lines.push(`Housing pipeline: ${lens.city}`);
  lines.push("");
  lines.push("Stages (units / projects; projects are permits or applications):");
  for (const s of lens.stages) {
    if (!s.tracked) {
      lines.push(`- ${s.label}: no public data. ${s.source ?? ""}`.trim());
      continue;
    }
    const units = s.units == null ? "units not published" : `${n(s.units)} units`;
    const projects = s.projects == null ? "projects not counted" : `${n(s.projects)} projects`;
    lines.push(`- ${s.label}: ${units}, ${projects}.`);
  }
  lines.push("");
  lines.push("Time between stages (median days):");
  for (const t of lens.timeBetween) {
    lines.push(`- ${t.from} -> ${t.to}: ${t.medianDays == null ? "not measurable" : `${t.medianDays} days`}. ${t.note}`);
  }
  if (lens.target) {
    lines.push("");
    lines.push(`Target (${n(lens.target.units)} units by ${lens.target.by}): ${lens.target.label}`);
    const p = lens.target.progress;
    if (p) {
      const share = lens.target.units ? ` (${Math.round((p.units / lens.target.units) * 100)}% of the target)` : "";
      lines.push(`Progress toward the target, as the province counts it: ${n(p.units)} homes as of ${p.asOf}${share}. Source: ${p.source}${p.url ? ` ${p.url}` : ""}`);
      lines.push("Compare the target with this progress figure, not with the completed stage (a different measure).");
    }
  }
  const context = (lens as HousingLens & { context?: { label: string; units: number; source: string }[] }).context;
  if (context?.length) {
    lines.push("");
    lines.push("Context (different geography; not progress toward the target):");
    for (const c of context) lines.push(`- ${c.label}: ${n(c.units)}. ${c.source}`);
  }
  if (lens.hardToTrack.length) {
    lines.push("");
    lines.push("Hard to track (no public data):");
    for (const h of lens.hardToTrack) lines.push(`- ${h}`);
  }
  const sources = lens.stages.filter((s) => s.source && s.tracked).map((s) => `- ${s.id}: ${s.source}`);
  if (sources.length) {
    lines.push("");
    lines.push("Sources and time windows:");
    lines.push(...sources);
  }
  if (lens.statements.length) {
    lines.push("");
    lines.push("Recorded statements:");
    for (const st of lens.statements) lines.push(`- [${st.kind}${st.verified ? ", verified" : ""}] ${st.text}`);
  }
  return lines.join("\n");
}
