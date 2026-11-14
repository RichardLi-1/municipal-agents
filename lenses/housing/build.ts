// Builds the housing lens (challenge 5) from the cached public data.
// Usage: node lenses/housing/build.ts [--city kitchener|waterloo|cambridge|region]
// Reads data/cache/housing/ (run fetch.ts first), writes data/lenses/housing-<city>.json.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HousingLens } from "../../shared/types.ts";
import { CACHE_DIR } from "./fetch.ts";
import { CITIES, DATASETS, WINDOW_START, type CityId } from "./sources.ts";
import {
  HOUSING_WORDS,
  countStages,
  csvObjects,
  fmt,
  inWindow,
  medianAppliedToIssued,
  medianIssueToDone,
  parseMonDdYyyy,
  round5,
  toDate,
  type Permit,
} from "./lib.ts";

const OUT_DIR = join(import.meta.dirname, "..", "..", "data", "lenses");
type Stage = HousingLens["stages"][number];
type Between = HousingLens["timeBetween"][number];

async function readJson(file: string): Promise<any> {
  return JSON.parse(await readFile(join(CACHE_DIR, file), "utf8"));
}

interface Manifest {
  [id: string]: { url: string; retrieved: string; records?: number };
}

// ---------- normalising each city's permits ----------

export function kitchenerPermit(f: any): Permit {
  const a = f.attributes ?? {};
  const status = String(a.PERMIT_STATUS ?? "");
  const isDropped = /cancel|void|revoked/i.test(status);
  const occupancy = toDate(a.OCCUPANCY_PERMITTED_DT);
  const final = toDate(a.FINAL_DATE);
  const isDone = /^(closed|occupancy permitted)$/i.test(status) || occupancy != null;
  const issued = toDate(a.ISSUE_DATE);
  const units = Number(a.UNITS_CREATED);
  return {
    id: String(a.PERMITNO ?? a.OBJECTID),
    address: String(a.FOLDERNAME ?? "").trim(),
    kind: [a.PERMIT_TYPE, a.WORK_TYPE].filter(Boolean).join(" / "),
    status,
    applied: toDate(a.APPLICATION_DATE),
    issued,
    done: occupancy ?? (isDone ? final : null),
    isDone,
    isDropped,
    isOpen: !isDropped && !isDone && issued != null,
    units: Number.isFinite(units) && units > 0 ? units : 0,
    lng: f.geometry?.x,
    lat: f.geometry?.y,
  };
}

/** Waterloo's UNITS field is counted only on work that creates homes (new buildings, additional dwelling units). */
const WATERLOO_NEW_UNIT_WORK = /^(New|AdditionalDwellingUnits|AdditionwithAdditionalDwellingUnits)$/;

export function waterlooPermit(f: any): Permit {
  const a = f.attributes ?? {};
  const status = String(a.STATUS ?? "");
  const isDone = /^(complete|occupancy final)$/i.test(status);
  const issued = toDate(a.ISSUEDATE);
  const units = WATERLOO_NEW_UNIT_WORK.test(String(a.WORKDESC ?? "")) ? Number(a.UNITS) : 0;
  return {
    id: String(a.PERMIT_NUM ?? a.OBJECTID),
    address: String(a.ADDRESS ?? "").trim(),
    kind: [a.PERMITDESC, a.WORKDESC].filter(Boolean).join(" / "),
    status,
    applied: null,
    issued,
    done: null, // Waterloo publishes no completion date
    isDone,
    isDropped: false,
    isOpen: !isDone && issued != null && /^issued$/i.test(status),
    units: Number.isFinite(units) && units > 0 ? units : 0,
    lng: typeof a.LONGITUDE === "number" ? a.LONGITUDE : undefined,
    lat: typeof a.LATITUDE === "number" ? a.LATITUDE : undefined,
  };
}

/** Cambridge permit folders that repeat another permit's units (foundation-only permits) or don't build homes. */
const CAMBRIDGE_SKIP = /foundation|plumbing|demolition|mechanical|electrical/i;

export function cambridgePermit(f: any): Permit {
  const a = f.attributes ?? {};
  const status = String(a.STATUSDESC ?? "");
  const isDropped = /cancel|revoked|test/i.test(status);
  const closed = /^closed$/i.test(status);
  const isDone = closed || /^occupancy permitted/i.test(status);
  const issued = toDate(a.ISSUEDATE);
  const units = CAMBRIDGE_SKIP.test(String(a.FOLDERDESC ?? "")) ? 0 : Number(a.PROP_NEW_UNITS);
  const folder = [a.FOLDERYEAR, a.FOLDERSEQUENCE, a.FOLDERSECTION, a.FOLDERREVISION].join(" ");
  return {
    id: folder,
    address: [a.HOUSE_NUMBER, a.STREET_NAME].filter(Boolean).join(" ").trim(),
    kind: [a.FOLDERDESC, a.WORKDESC].filter(Boolean).join(" / ").trim(),
    status,
    applied: null,
    issued,
    done: closed ? toDate(a.FINALDATE) : null, // cancelled permits also carry a FINALDATE, so only "Closed" counts
    isDone,
    isDropped,
    isOpen: !isDropped && !isDone && issued != null && !/dormant/i.test(status),
    units: Number.isFinite(units) && units > 0 ? units : 0,
    lng: f.centroid?.x,
    lat: f.centroid?.y,
  };
}

// ---------- the province's targets ----------

interface ProvincialTarget {
  municipality: string;
  target: number;
  progressSince2022: number | null;
  year: string;
  yearTarget: number | null;
  yearProgress: number | null;
  yearStatus: string;
  csvName: string;
  csvUrl: string;
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) && String(s).trim() !== "" ? n : null;
}

export function parseOntarioProgress(cache: any): Map<string, ProvincialTarget> {
  const out = new Map<string, ProvincialTarget>();
  // Use the newest year's file; older years only fill gaps.
  const csvs = [...(cache.csvs ?? [])]
    .map((c: any) => ({ ...c, year: (/(20\d\d)/.exec(c.name) ?? [])[1] ?? "0" }))
    .sort((a: any, b: any) => (a.year < b.year ? 1 : -1));
  for (const c of csvs) {
    const rows = csvObjects(c.text);
    for (const r of rows) {
      const keys = Object.keys(r);
      const k = (re: RegExp) => keys.find((x) => re.test(x));
      const muni = r[k(/^municipality/i) ?? ""]?.trim();
      const target = num(r[k(/ten-year housing target/i) ?? ""]);
      if (!muni || target == null || out.has(muni.toLowerCase())) continue;
      out.set(muni.toLowerCase(), {
        municipality: muni,
        target,
        progressSince2022: num(r[k(/since 2022/i) ?? ""]),
        year: c.year,
        yearTarget: num(r[k(new RegExp(`^target for ${c.year}`, "i")) ?? ""]),
        yearProgress: num(r[k(new RegExp(`^total ${c.year} housing progress`, "i")) ?? ""]),
        yearStatus: r[k(/status/i) ?? ""] ?? "",
        csvName: c.name,
        csvUrl: c.url,
      });
    }
  }
  return out;
}

function targetFor(name: string, t: ProvincialTarget | undefined): HousingLens["target"] {
  if (!t) return undefined;
  const parts = [
    `Ontario's housing target for ${name}: ${fmt(t.target)} new homes from 2022 to 2031.`,
    t.progressSince2022 != null
      ? `The province counts ${fmt(t.progressSince2022)} homes toward it from 2022 through ${t.year}.`
      : "",
    t.yearTarget != null && t.yearProgress != null
      ? `In ${t.year}: ${fmt(t.yearProgress)} against a ${t.year} target of ${fmt(t.yearTarget)} (${t.yearStatus || "status not given"}).`
      : "",
    `Source: "${t.csvName}", ${DATASETS.ontarioProgress.page} (${DATASETS.ontarioProgress.licence}).`,
  ];
  return { label: parts.filter(Boolean).join(" "), units: t.target, by: "2031" };
}

// ---------- development applications ----------

/** Epoch ms, or "MM/DD/YYYY" text (Kitchener's planning list), to YYYY-MM-DD. */
function anyDate(v: unknown): string | null {
  if (typeof v === "number") return toDate(v);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** Kitchener: active zoning by-law amendments passed by council and subdivisions draft-approved, about homes, approved since the window start. */
function kitchenerApproved(cache: any[]) {
  const apps = cache.map((f) => f.attributes ?? {});
  const approved = apps.filter(
    (a) =>
      ((a.FOLDERTYPE === "Zoning By-Law Amendment" && a.STATUS === "Passed") ||
        (a.FOLDERTYPE === "Subdivision Approval" && a.STATUS === "Draft Approved")) &&
      HOUSING_WORDS.test(String(a.DESCRIPTION ?? "")) &&
      (anyDate(a.COUNCIL_MEETING_DATE ?? a.DRAFT_APPROVAL_DATE) ?? "") >= WINDOW_START,
  );
  const dated = approved
    .map((a) => anyDate(a.COUNCIL_MEETING_DATE ?? a.DRAFT_APPROVAL_DATE))
    .filter((d): d is string => d != null)
    .sort();
  const unitFields = apps.reduce(
    (s, a) => s + (Number(a.PROP_MAX_RES_UNITS_DA) || 0) + (Number(a.PROP_MAX_RES_UNITS_INCIR) || 0),
    0,
  );
  return { projects: approved.length, first: dated[0] ?? null, last: dated.at(-1) ?? null, unitFields, total: apps.length };
}

/** Kitchener site plans received since the window start, about homes, now in an approved status but not yet marked "Construction". */
function kitchenerSitePlans(csv: string) {
  const rows = csvObjects(csv);
  const byApp = new Map<string, Record<string, string>>();
  for (const r of rows) if (r.APPLICATION_NO && !byApp.has(r.APPLICATION_NO)) byApp.set(r.APPLICATION_NO, r);
  const approvedStatus = /^(Approved|Conditional Approval|Ready for Final Approval|Pre-Permit)$/;
  let projects = 0;
  let latest: string | null = null;
  for (const r of byApp.values()) {
    const indate = parseMonDdYyyy(r.INDATE ?? "");
    if (indate && (!latest || indate > latest)) latest = indate;
    if (!indate || indate < WINDOW_START) continue;
    if (approvedStatus.test(r.STATUS ?? "") && HOUSING_WORDS.test(r.DESCRIPTION ?? "")) projects++;
  }
  return { projects, latest };
}

/** Cambridge site plans (residential or mixed residential) received since the window start and now approved. */
function cambridgeSitePlans(cache: any[]) {
  const rows = cache.map((f) => f.attributes ?? {});
  let projects = 0;
  let latest: string | null = null;
  for (const a of rows) {
    const indate = toDate(a.INDATE);
    if (indate && (!latest || indate > latest)) latest = indate;
    if (!indate || indate < WINDOW_START) continue;
    if (/^residential/i.test(String(a.WORKDESC ?? "")) && /^approved$/i.test(String(a.STATUSDESC ?? ""))) projects++;
  }
  return { projects, latest };
}

// ---------- CMHC (Statistics Canada 34-10-0154) ----------

interface Cmhc {
  starts: { refPer: string; value: number }[];
  underConstruction: { refPer: string; value: number }[];
  completions: { refPer: string; value: number }[];
}

export function parseCmhc(cache: any[]): Cmhc {
  const pick = (coord: string) => {
    const hit = cache.find((x) => x?.object?.coordinate === coord);
    return (hit?.object?.vectorDataPoint ?? [])
      .filter((p: any) => typeof p.value === "number")
      .map((p: any) => ({ refPer: String(p.refPer).slice(0, 10), value: p.value as number }))
      .sort((a: any, b: any) => (a.refPer < b.refPer ? -1 : 1));
  };
  return {
    starts: pick("7.1.1.0.0.0.0.0.0.0"),
    underConstruction: pick("7.2.1.0.0.0.0.0.0.0"),
    completions: pick("7.3.1.0.0.0.0.0.0.0"),
  };
}

const month = (d: string) => d.slice(0, 7);

// ---------- lens assembly ----------

const LABELS: Record<Stage["id"], string> = {
  approved: "Approved by council (zoning or subdivision)",
  "site-plan": "Site plan approved",
  "permit-issued": "Building permit issued",
  "under-construction": "Under construction",
  completed: "Completed",
};

const NAMES: Record<CityId | "region", string> = {
  kitchener: "Kitchener",
  waterloo: "Waterloo",
  cambridge: "Cambridge",
  region: "Kitchener, Waterloo and Cambridge",
};

const COMMON_HARD = [
  "Approved but no building permit yet: no city publishes a list that links a council approval (zoning, subdivision or site plan) to the building permits that follow, so nobody outside city hall can count the homes waiting between approval and permit.",
  "Construction start: permits show the day a permit was issued, not the day work began. Here 'under construction' means a permit issued since 2022 with no final inspection or occupancy yet; some of those may not have started, and some may have lapsed.",
  "Units in permits vs units built: a permit's unit count is what was proposed. The cities don't publish how many units were finally built, so completed units here are the permit's units on permits marked finished.",
  "One building, several permits: big projects can be split into phases or permits (and townhouse blocks into one permit per unit), so 'projects' counts permits, not buildings.",
  "Who the homes are for: permits don't say whether units are rentals, condos or affordable homes.",
  "Finish dates: a permit's final inspection or closing date can come months or years after people moved in, so permits 'completed' in a period are not the same as CMHC's completions for that period.",
];

function permitStages(
  name: string,
  permits: Permit[],
  dsName: string,
  end: string,
  opts: { doneWord: string; openNote: string; doneNote: string },
) {
  const c = countStages(permits, WINDOW_START, end);
  const issuedWindow = `issued ${WINDOW_START} to ${c.latestIssued ?? end}`;
  const stages: Stage[] = [
    {
      id: "permit-issued",
      label: LABELS["permit-issued"],
      units: c.issued.units,
      projects: c.issued.projects,
      source: `${dsName}: new units on residential permits ${issuedWindow} (cancelled or revoked permits left out).`,
      tracked: true,
    },
    {
      id: "under-construction",
      label: LABELS["under-construction"],
      units: c.open.units,
      projects: c.open.projects,
      source: `${dsName}: permits ${issuedWindow} that are still open. ${opts.openNote}`,
      tracked: true,
    },
    {
      id: "completed",
      label: LABELS.completed,
      units: c.done.units,
      projects: c.done.projects,
      source: `${dsName}: ${opts.doneWord} (${WINDOW_START} to ${c.latestDone ?? c.latestIssued ?? end}). ${opts.doneNote}${
        c.doneUndated.projects > 0
          ? ` Includes ${fmt(c.doneUndated.units)} units on ${fmt(c.doneUndated.projects)} permits issued since ${WINDOW_START} that are marked finished but carry no finish date.`
          : ""
      }`,
      tracked: true,
    },
  ];
  return { stages, counts: c };
}

function medianEntries(permits: Permit[], end: string, withApplied: boolean): Between[] {
  const out: Between[] = [];
  if (withApplied) {
    const all = medianAppliedToIssued(permits, WINDOW_START, end);
    const big = medianAppliedToIssued(permits, WINDOW_START, end, 10);
    out.push({
      from: "permit-applied",
      to: "permit-issued",
      medianDays: all.medianDays,
      note: `Median days from permit application to permit issued, over ${fmt(all.n)} residential permits issued ${WINDOW_START} to ${end}. For permits with 10 or more new units: ${big.medianDays ?? "n/a"} days (${fmt(big.n)} permits).`,
    });
  }
  const all = medianIssueToDone(permits, WINDOW_START, end);
  const big = medianIssueToDone(permits, WINDOW_START, end, 10);
  out.push({
    from: "permit-issued",
    to: "completed",
    medianDays: all.medianDays,
    note: `Median days from permit issued to final inspection or occupancy, over ${fmt(all.n)} residential permits finished ${WINDOW_START} to ${end} (the same permit followed across both dates). For permits with 10 or more new units: ${big.medianDays ?? "n/a"} days (${fmt(big.n)} permits). Only finished permits count, so slow projects still under way are not in it yet; most permits are single homes and basement units, which finish fastest.`,
  });
  return out;
}

const NO_LINK: Between = {
  from: "approved",
  to: "permit-issued",
  medianDays: null,
  note: "Not measurable from public data: planning approvals and building permits are published in separate lists with no shared file number, so the same project can't be followed from approval to permit.",
};

function permitLayer(permits: Permit[], latest: string | null, cityName: string): HousingLens["layers"] {
  if (!latest) return undefined;
  // The last 12 months of permits with new units, as points.
  const from = new Date(Date.parse(latest + "T00:00:00Z") - 365 * 86_400_000).toISOString().slice(0, 10);
  const features: GeoJSON.Feature[] = [];
  for (const p of permits) {
    if (p.isDropped || !(p.units > 0) || !inWindow(p.issued, from, latest)) continue;
    if (typeof p.lng !== "number" || typeof p.lat !== "number" || !Number.isFinite(p.lng) || !Number.isFinite(p.lat))
      continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [round5(p.lng), round5(p.lat)] },
      properties: {
        id: p.id,
        address: p.address,
        issued: p.issued,
        units: p.units,
        status: p.status,
        kind: p.kind,
        stage: p.isDone ? "completed" : p.isOpen ? "under-construction" : "permit-issued",
      },
    });
  }
  return {
    "recent-residential-permits": {
      type: "FeatureCollection",
      // A foreign member describing the layer (allowed by RFC 7946).
      ...({ name: `${cityName}: residential permits with new units issued ${from} to ${latest}` } as object),
      features,
    } as GeoJSON.FeatureCollection,
  };
}

interface Loaded {
  manifest: Manifest;
  permits: Record<CityId, Permit[]>;
  targets: Map<string, ProvincialTarget>;
  cmhc: Cmhc;
  kitchenerApps: any[];
  kitchenerSitePlanCsv: string;
  cambridgeSitePlans: any[];
}

async function load(): Promise<Loaded> {
  const [manifest, k, w, c, on, cm, ka, ksp, csp] = await Promise.all([
    readJson("manifest.json"),
    readJson(DATASETS.kitchenerPermits.file),
    readJson(DATASETS.waterlooPermits.file),
    readJson(DATASETS.cambridgePermits.file),
    readJson(DATASETS.ontarioProgress.file),
    readJson(DATASETS.cmhc.file),
    readJson(DATASETS.kitchenerPlanningApps.file),
    readFile(join(CACHE_DIR, DATASETS.kitchenerSitePlans.file), "utf8"),
    readJson(DATASETS.cambridgeSitePlans.file),
  ]);
  return {
    manifest,
    permits: { kitchener: k.map(kitchenerPermit), waterloo: w.map(waterlooPermit), cambridge: c.map(cambridgePermit) },
    targets: parseOntarioProgress(on),
    cmhc: parseCmhc(cm),
    kitchenerApps: ka,
    kitchenerSitePlanCsv: ksp,
    cambridgeSitePlans: csp,
  };
}

function retrievedOn(m: Manifest, id: string): string {
  return (m[id]?.retrieved ?? "").slice(0, 10) || "unknown date";
}

function cite(m: Manifest, d: { name: string; publisher: string; page: string; licence: string; id: string }) {
  return `${d.name}, ${d.publisher}, ${d.page}, retrieved ${retrievedOn(m, d.id)}, ${d.licence}`;
}

export function buildCity(city: CityId, L: Loaded): HousingLens {
  const name = NAMES[city];
  const permits = L.permits[city];
  const ds =
    city === "kitchener" ? DATASETS.kitchenerPermits : city === "waterloo" ? DATASETS.waterlooPermits : DATASETS.cambridgePermits;
  const end = retrievedOn(L.manifest, ds.id);
  const dsName = cite(L.manifest, ds);

  const opts =
    city === "kitchener"
      ? {
          doneWord: `new units on permits whose occupancy was permitted or final inspection passed in the window`,
          openNote: "Status Issued, Ready to Final or Violation, with no occupancy date.",
          doneNote: "Date used: occupancy permitted, or the final inspection date if there is no occupancy date.",
        }
      : city === "cambridge"
        ? {
            doneWord: `new units on permits closed after final inspection in the window, plus permits marked 'Occupancy Permitted - Not Closed'`,
            openNote: "Status Issued or similar, not dormant, not closed, no occupancy yet. Foundation-only permits are left out because their units repeat on the full permit.",
            doneNote: "Date used: FINALDATE on closed permits (cancelled permits also carry a FINALDATE and are left out).",
          }
        : {
            doneWord: `new units on permits issued ${WINDOW_START} or later whose status is now Complete or Occupancy Final`,
            openNote: "Status Issued.",
            doneNote: "Waterloo publishes no completion date, so this counts by issue date, not by completion date.",
          };
  const { stages: permitSt, counts } = permitStages(name, permits, dsName, end, opts);

  // Approval and site-plan stages.
  let approved: Stage = {
    id: "approved",
    label: LABELS.approved,
    units: null,
    projects: null,
    tracked: false,
    source:
      city === "waterloo"
        ? "The City of Waterloo publishes no planning (zoning, subdivision, site plan) application data on its open data portal."
        : "The City of Cambridge publishes no zoning or subdivision application data on its open data portal.",
  };
  let sitePlan: Stage = {
    id: "site-plan",
    label: LABELS["site-plan"],
    units: null,
    projects: null,
    tracked: false,
    source: "The City of Waterloo publishes no site plan application data on its open data portal.",
  };
  const hard = [...COMMON_HARD];
  if (city === "kitchener") {
    const a = kitchenerApproved(L.kitchenerApps);
    approved = {
      id: "approved",
      label: LABELS.approved,
      units: null,
      projects: a.projects,
      tracked: true,
      source: `${cite(L.manifest, DATASETS.kitchenerPlanningApps)}: applications on the city's active list that are zoning by-law amendments passed by council or subdivisions draft-approved, and whose description is about homes, with a council meeting or draft approval date ${WINDOW_START} to ${a.last ?? "?"} (first in window: ${a.first ?? "?"}). Unit counts are not given: the list's unit fields are empty.`,
    };
    const s = kitchenerSitePlans(L.kitchenerSitePlanCsv);
    sitePlan = {
      id: "site-plan",
      label: LABELS["site-plan"],
      units: null,
      projects: s.projects,
      tracked: true,
      source: `${cite(L.manifest, DATASETS.kitchenerSitePlans)}: site plan applications received ${WINDOW_START} to ${s.latest ?? "?"} whose status is Approved, Conditional Approval, Ready for Final Approval or Pre-Permit (not yet 'Construction') and whose description is about homes. The file gives no unit counts.`,
    };
    hard.push(
      `Units at approval: Kitchener's planning applications list has fields for residential units, but they are empty for all ${a.total} applications, and the site plan status file has no unit field, so approved units can only be read from staff reports one by one.`,
    );
  } else if (city === "cambridge") {
    const s = cambridgeSitePlans(L.cambridgeSitePlans);
    sitePlan = {
      id: "site-plan",
      label: LABELS["site-plan"],
      units: null,
      projects: s.projects,
      tracked: true,
      source: `${cite(L.manifest, DATASETS.cambridgeSitePlans)}: residential or mixed residential/commercial site plans received ${WINDOW_START} to ${s.latest ?? "?"} with status Approved. The data give no unit counts.`,
    };
    hard.push(
      "Council approvals: Cambridge publishes site plans (without unit counts) but no zoning or subdivision applications as open data.",
    );
  } else {
    hard.push(
      "Council approvals and site plans: the City of Waterloo publishes no planning application data as open data.",
      "Completion dates: Waterloo marks permits 'Complete' but publishes no completion or occupancy date, so the time from permit to completion can't be measured.",
    );
  }
  hard.push(
    "Starts and completions by city: CMHC counts housing starts and completions for the whole Kitchener-Cambridge-Waterloo area (including Woolwich and North Dumfries), not for each city.",
  );

  const timeBetween: Between[] = [NO_LINK];
  if (city === "waterloo") {
    timeBetween.push({
      from: "permit-issued",
      to: "completed",
      medianDays: null,
      note: "Not measurable: Waterloo's permit data has an issue date but no completion or occupancy date.",
    });
  } else {
    timeBetween.push(...medianEntries(permits, counts.latestIssued ?? end, city === "kitchener"));
  }

  return {
    city,
    stages: [approved, sitePlan, ...permitSt],
    timeBetween,
    target: targetFor(name, L.targets.get(city)),
    statements: [],
    hardToTrack: hard,
    layers: permitLayer(permits, counts.latestIssued, name),
  };
}

export function buildRegion(L: Loaded, cities: Record<CityId, HousingLens>): HousingLens {
  const m = L.manifest;
  const issued = CITIES.map((c) => cities[c].stages.find((s) => s.id === "permit-issued")!);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  const cm = L.cmhc;
  const lastUc = cm.underConstruction.at(-1);
  const comp = cm.completions.filter((p) => p.refPer >= WINDOW_START);
  const starts = cm.starts.filter((p) => p.refPer >= WINDOW_START);
  const cmhcCite = cite(m, DATASETS.cmhc);
  const lastMonth = comp.at(-1)?.refPer;
  const targets = CITIES.map((c) => L.targets.get(c)).filter((t): t is ProvincialTarget => t != null);

  const stages: Stage[] = [
    {
      id: "approved",
      label: LABELS.approved,
      units: null,
      projects: null,
      tracked: false,
      source: "No region-wide list: only Kitchener publishes zoning and subdivision applications, without unit counts. See the Kitchener lens.",
    },
    {
      id: "site-plan",
      label: LABELS["site-plan"],
      units: null,
      projects: null,
      tracked: false,
      source: "No region-wide list: Kitchener and Cambridge publish site plan statuses without unit counts; Waterloo publishes none. See the city lenses.",
    },
    {
      id: "permit-issued",
      label: LABELS["permit-issued"],
      units: sum(issued.map((s) => s.units)),
      projects: sum(issued.map((s) => s.projects)),
      source: `Sum of the three cities' building permit data (Kitchener, Waterloo, Cambridge; not the townships), new units on residential permits issued ${WINDOW_START} to each city's latest date: ${CITIES.map(
        (c, i) => `${NAMES[c]} ${fmt(issued[i].units ?? 0)}`,
      ).join(", ")}. See each city lens for its dataset and licence.`,
      tracked: true,
    },
    {
      id: "under-construction",
      label: LABELS["under-construction"],
      units: lastUc ? lastUc.value : null,
      projects: null,
      source: lastUc
        ? `${cmhcCite}: housing units under construction (all types) in the Kitchener-Cambridge-Waterloo census metropolitan area at the end of ${month(lastUc.refPer)}. CMHC housing starts over ${month(starts[0]?.refPer ?? WINDOW_START)} to ${month(starts.at(-1)?.refPer ?? "")}: ${fmt(sum(starts.map((p) => p.value)))} units.`
        : "CMHC data not available in the cache.",
      tracked: lastUc != null,
    },
    {
      id: "completed",
      label: LABELS.completed,
      units: comp.length ? sum(comp.map((p) => p.value)) : null,
      projects: null,
      source: comp.length
        ? `${cmhcCite}: housing completions (all types) in the Kitchener-Cambridge-Waterloo census metropolitan area, ${month(comp[0].refPer)} to ${month(lastMonth!)}, summed by month.`
        : "CMHC data not available in the cache.",
      tracked: comp.length > 0,
    },
  ];

  const target: HousingLens["target"] =
    targets.length === 3
      ? {
          label: `Sum of Ontario's housing targets for Kitchener (${fmt(targets[0].target)}), Waterloo (${fmt(targets[1].target)}) and Cambridge (${fmt(targets[2].target)}): ${fmt(sum(targets.map((t) => t.target)))} new homes from 2022 to 2031. The province counts ${fmt(sum(targets.map((t) => t.progressSince2022)))} homes toward them from 2022 through ${targets[0].year}. The townships have no provincial target. Source: ${DATASETS.ontarioProgress.page} (${DATASETS.ontarioProgress.licence}).`,
          units: sum(targets.map((t) => t.target)),
          by: "2031",
        }
      : undefined;

  return {
    city: "region",
    stages,
    timeBetween: [
      NO_LINK,
      {
        from: "permit-issued",
        to: "completed",
        medianDays: null,
        note: "Not computed for the region: CMHC counts starts and completions in aggregate and doesn't follow individual projects. See the Kitchener and Cambridge lenses for permit-level medians.",
      },
    ],
    target,
    statements: [],
    hardToTrack: [
      ...COMMON_HARD,
      "Mixed geographies: permits here cover the three cities only, while CMHC's under-construction and completion counts cover the Kitchener-Cambridge-Waterloo census metropolitan area, which also includes Woolwich and North Dumfries. The two can't be subtracted from each other.",
      "Approval and site plan stages: only Kitchener (zoning, subdivision, site plans) and Cambridge (site plans) publish application data, and neither gives unit counts.",
    ],
  };
}

async function main() {
  const arg = process.argv.indexOf("--city");
  const want = arg >= 0 ? process.argv[arg + 1] : "all";
  const valid = [...CITIES, "region", "all"];
  if (!valid.includes(want)) {
    console.error(`--city must be one of ${valid.join(", ")}`);
    process.exit(2);
  }
  const L = await load();
  await mkdir(OUT_DIR, { recursive: true });
  const lenses = Object.fromEntries(CITIES.map((c) => [c, buildCity(c, L)])) as Record<CityId, HousingLens>;
  const out: Record<string, HousingLens> = { ...lenses, region: buildRegion(L, lenses) };
  for (const [id, lens] of Object.entries(out)) {
    if (want !== "all" && want !== id) continue;
    const file = join(OUT_DIR, `housing-${id}.json`);
    const text = JSON.stringify(lens, null, 1);
    await writeFile(file, text + "\n");
    console.log(
      `${file} (${(text.length / 1024).toFixed(0)} KB): ` +
        lens.stages.map((s) => `${s.id}=${s.units ?? "—"}u/${s.projects ?? "—"}p`).join(" "),
    );
  }
}

if (import.meta.main) {
  await main();
}
