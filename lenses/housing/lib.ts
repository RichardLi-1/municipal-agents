// Pure helpers for the housing lens: dates, medians and stage counts over a normalised
// permit list. No I/O here, so the tests can feed a tiny hand-made list.

/** One building permit that creates housing units, normalised across the three cities. */
export interface Permit {
  id: string;
  address: string;
  kind: string; // permit type and work type, as the city writes them
  status: string; // the city's status word
  applied: string | null; // YYYY-MM-DD
  issued: string | null;
  /** Date of final inspection or occupancy, when the city publishes one. */
  done: string | null;
  /** The city marks the work finished (final inspection, closed, occupancy permitted). */
  isDone: boolean;
  /** Cancelled, revoked, void or a test record: never counted. */
  isDropped: boolean;
  /** Issued, not finished and not dormant: still being built (or not yet started). */
  isOpen: boolean;
  units: number; // new units the permit creates
  lng?: number;
  lat?: number;
}

const DAY_MS = 86_400_000;

/** Epoch milliseconds to a YYYY-MM-DD date. Values at exact UTC midnight are date-only fields; others are local Toronto times. */
export function toDate(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms % DAY_MS === 0) return new Date(ms).toISOString().slice(0, 10);
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median days between two dates over pairs where both dates exist and the second is
 * not before the first. Returns the median (rounded to whole days) and how many pairs counted.
 */
export function medianDays(pairs: Array<[string | null | undefined, string | null | undefined]>): {
  medianDays: number | null;
  n: number;
} {
  const days: number[] = [];
  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    const d = daysBetween(a, b);
    if (d >= 0) days.push(d);
  }
  const m = median(days);
  return { medianDays: m == null ? null : Math.round(m), n: days.length };
}

export function inWindow(date: string | null, start: string, end: string): boolean {
  return date != null && date >= start && date <= end;
}

export interface Tally {
  units: number;
  projects: number; // permits
}

export interface StageCounts {
  /** Permits issued in the window (not cancelled). */
  issued: Tally;
  /** Permits issued in the window that are still open (no final inspection or occupancy yet). */
  open: Tally;
  /** Permits finished in the window: by their final/occupancy date, or, when the city gives no date, issued in the window and marked finished. */
  done: Tally;
  /** The part of `done` that has no finish date. */
  doneUndated: Tally;
  latestIssued: string | null;
  latestDone: string | null;
}

function add(t: Tally, p: Permit) {
  t.units += p.units;
  t.projects += 1;
}

/** Counts units and permits by stage over [start, end] (inclusive, YYYY-MM-DD). */
export function countStages(permits: Permit[], start: string, end: string): StageCounts {
  const out: StageCounts = {
    issued: { units: 0, projects: 0 },
    open: { units: 0, projects: 0 },
    done: { units: 0, projects: 0 },
    doneUndated: { units: 0, projects: 0 },
    latestIssued: null,
    latestDone: null,
  };
  for (const p of permits) {
    if (p.isDropped || !(p.units > 0)) continue;
    if (p.issued && (!out.latestIssued || p.issued > out.latestIssued)) out.latestIssued = p.issued;
    if (p.done && (!out.latestDone || p.done > out.latestDone)) out.latestDone = p.done;
    const issuedIn = inWindow(p.issued, start, end);
    if (issuedIn) add(out.issued, p);
    if (issuedIn && p.isOpen) add(out.open, p);
    if (p.isDone) {
      if (p.done) {
        if (inWindow(p.done, start, end)) add(out.done, p);
      } else if (issuedIn) {
        add(out.done, p);
        add(out.doneUndated, p);
      }
    }
  }
  return out;
}

/** Median days from issue to finish for permits finished (with a date) in the window, optionally only those with at least `minUnits` units. */
export function medianIssueToDone(permits: Permit[], start: string, end: string, minUnits = 1) {
  return medianDays(
    permits
      .filter((p) => !p.isDropped && p.isDone && p.units >= minUnits && inWindow(p.done, start, end))
      .map((p) => [p.issued, p.done] as [string | null, string | null]),
  );
}

/** Median days from application to issue for permits issued in the window. */
export function medianAppliedToIssued(permits: Permit[], start: string, end: string, minUnits = 1) {
  return medianDays(
    permits
      .filter((p) => !p.isDropped && p.units >= minUnits && inWindow(p.issued, start, end))
      .map((p) => [p.applied, p.issued] as [string | null, string | null]),
  );
}

/** Small CSV parser: commas, double-quoted fields, doubled quotes, CRLF. Returns rows of trimmed cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/** CSV text to objects keyed by trimmed header names. */
export function csvObjects(text: string): Record<string, string>[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

/** "Jun 28 2001" (Kitchener's AMANDA CSVs) to 2001-06-28. */
export function parseMonDdYyyy(s: string): string | null {
  const m = /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    m[1].toLowerCase(),
  );
  if (mon < 0) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Words that mark an application as being about homes. */
export const HOUSING_WORDS =
  /\b(residential|dwellings?|units?|apartments?|townhouses?|townhomes?|rowhouses?|housing|condominiums?|stacked|single detached|semi-detached|homes?)\b/i;

export function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

export function fmt(n: number): string {
  return n.toLocaleString("en-CA");
}
