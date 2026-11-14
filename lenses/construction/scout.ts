// Scout candidate work sites for a tunnel launch shaft or portal, an extraction shaft
// and laydown along a line, from OpenStreetMap. Pure scoring lives here; the Overpass
// download is `fetchOsm`. Scenario only: the scout ranks, people choose.

import fs from "node:fs";
import path from "node:path";
import type { ConstructionSite } from "../../shared/types.ts";
import {
  distM, distToPolygon, polygonAreaM2, pointInPolygon, projectOnLine, ramp, ringCentroid, roundPt,
  type LngLat,
} from "./geo.ts";

// ---------------------------------------------------------------------------
// OpenStreetMap download (Overpass), cached.

export const OVERPASS_MIRRORS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];

/** One query: candidate land, places to keep away from, roads, rivers, buildings. */
export function overpassQuery(bbox: [number, number, number, number]): string {
  const [w, s, e, n] = bbox;
  const b = `(${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})`;
  return `[out:json][timeout:120];
(
  way["amenity"="parking"]${b};
  relation["amenity"="parking"]${b};
  way["landuse"~"^(industrial|brownfield|commercial|retail|railway|greenfield|construction|grass|residential|cemetery|forest|meadow)$"]${b};
  relation["landuse"~"^(industrial|brownfield|commercial|retail|residential)$"]${b};
  way["leisure"~"^(park|nature_reserve|playground|pitch|golf_course|garden)$"]${b};
  relation["leisure"~"^(park|nature_reserve)$"]${b};
  way["natural"~"^(wetland|water|wood)$"]${b};
  relation["natural"~"^(wetland|water)$"]${b};
  nwr["amenity"~"^(school|kindergarten|college|university|hospital|nursing_home|social_facility|childcare)$"]${b};
  nwr["healthcare"="hospital"]${b};
  way["waterway"~"^(river|stream)$"]${b};
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|motorway_link|trunk_link|primary_link)$"]${b};
  way["building"]${b};
);
out geom tags;`;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

export async function fetchOsm(bbox: [number, number, number, number], cacheFile: string): Promise<{ elements: OsmElement[]; retrieved: string; osmBase?: string }> {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (Array.isArray(c.elements)) return { elements: c.elements, retrieved: c.retrieved, osmBase: c.osmBase };
  } catch {}
  const q = overpassQuery(bbox);
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "municipal-agents-construction-scout/0.1" },
        body: new URLSearchParams({ data: q }),
      });
      const text = await r.text();
      if (!r.ok || !text.startsWith("{")) throw new Error(`HTTP ${r.status}: ${text.slice(0, 120)}`);
      const d = JSON.parse(text);
      const out = { elements: d.elements as OsmElement[], retrieved: new Date().toISOString(), osmBase: d.osm3s?.timestamp_osm_base, query: q };
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(out));
      return out;
    } catch (e) {
      lastErr = String(e);
      await new Promise((res) => setTimeout(res, 3000 * 2 ** attempt)); // polite backoff
    }
  }
  throw new Error(`Overpass failed: ${lastErr}`);
}

// ---------------------------------------------------------------------------
// Features from OSM elements.

export interface Feature {
  id: string; // "way/123"
  tags: Record<string, string>;
  /** Polygon rings (outer first) when the element is an area. */
  rings?: number[][][];
  /** Line vertices for roads and rivers. */
  line?: LngLat[];
  point?: LngLat;
}

function closed(g: { lat: number; lon: number }[] | undefined): boolean {
  return !!g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
}

export function toFeatures(elements: OsmElement[]): Feature[] {
  const out: Feature[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const id = `${e.type}/${e.id}`;
    if (e.type === "node" && e.lat != null && e.lon != null) out.push({ id, tags, point: [e.lon, e.lat] });
    else if (e.type === "way" && e.geometry) {
      const pts = e.geometry.map((g) => [g.lon, g.lat] as LngLat);
      if (closed(e.geometry) && !tags.highway && !tags.waterway) out.push({ id, tags, rings: [pts] });
      else out.push({ id, tags, line: pts });
    } else if (e.type === "relation" && e.members) {
      // Closed outer members only; good enough for parking lots and parks.
      const outers = e.members.filter((m) => m.role !== "inner" && closed(m.geometry)).map((m) => m.geometry!.map((g) => [g.lon, g.lat]));
      const inners = e.members.filter((m) => m.role === "inner" && closed(m.geometry)).map((m) => m.geometry!.map((g) => [g.lon, g.lat]));
      for (const o of outers) out.push({ id, tags, rings: [o, ...inners.filter((i) => pointInRing(i[0] as LngLat, o))] });
    }
  }
  return out;
}

function pointInRing(p: LngLat, ring: number[][]): boolean {
  return pointInPolygon(p, [ring]);
}

// ---------------------------------------------------------------------------
// Classification.

export type Candidate = "parking" | "brownfield" | "industrial" | "commercial" | "retail" | "railway" | "greenfield" | "construction" | "grass";

export function candidateUse(t: Record<string, string>): Candidate | null {
  if (t.building) return null;
  if (t.amenity === "parking") {
    if (/underground|multi-storey|rooftop|sheds|carports|garage_boxes/.test(t.parking ?? "")) return null;
    return "parking";
  }
  const lu = t.landuse;
  // landuse=construction is left out: it is usually someone else's project (often road works).
  if (lu && ["brownfield", "industrial", "commercial", "retail", "railway", "greenfield", "grass"].includes(lu)) return lu as Candidate;
  return null;
}

/** Places a work site must not be on (its centre inside one rules it out). */
export function isExcluded(t: Record<string, string>): boolean {
  return (
    /^(park|nature_reserve|playground|pitch|golf_course|garden)$/.test(t.leisure ?? "") ||
    /^(wetland|water|wood)$/.test(t.natural ?? "") ||
    /^(cemetery|residential|forest|meadow)$/.test(t.landuse ?? "") ||
    /^(school|kindergarten|college|university|hospital|nursing_home|social_facility|childcare)$/.test(t.amenity ?? "") ||
    t.healthcare === "hospital"
  );
}

/** A sensitive receptor: what kind, or null. */
export function receptorKind(t: Record<string, string>): string | null {
  if (/^(school|kindergarten|childcare|college|university)$/.test(t.amenity ?? "")) return "school";
  if (t.amenity === "hospital" || t.healthcare === "hospital") return "hospital";
  if (t.amenity === "nursing_home" || (t.amenity === "social_facility" && /nursing|assisted|group_home/.test(t["social_facility"] ?? ""))) return "care home";
  if (t.landuse === "residential" || /^(house|residential|apartments|detached|semidetached_house|terrace|dormitory)$/.test(t.building ?? "")) return "homes";
  if (/^(park|nature_reserve|playground|garden)$/.test(t.leisure ?? "")) return "park";
  if (t.waterway === "river" || t.waterway === "stream" || t.natural === "water" || t.natural === "wetland") return "river or wetland";
  return null;
}

export const TRUCK_ROADS = /^(motorway|trunk|primary)$/;

/** Generic words for each kind of candidate land: sites are never named after a business or owner. */
export const USE_WORDS: Record<Candidate, string> = {
  parking: "Surface parking lot",
  brownfield: "Vacant former industrial land",
  industrial: "Industrial land",
  commercial: "Commercial land",
  retail: "Retail land",
  railway: "Railway land",
  greenfield: "Undeveloped land",
  grass: "Open grassed land",
  construction: "Land under construction",
};

/** Same generic name twice in a list: number the lots in list order ("(lot 1)", "(lot 2)"). */
export function numberDuplicateNames(sites: ConstructionSite[]): ConstructionSite[] {
  const count = new Map<string, number>();
  for (const s of sites) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return sites.map((s) => {
    if ((count.get(s.name) ?? 0) < 2) return s;
    const k = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, k);
    return { ...s, name: `${s.name} (lot ${k})` };
  });
}

/** A site's generic name as a phrase inside a sentence: "a surface parking lot off ...". */
export function sitePhrase(name: string): string {
  const base = name.replace(/ \(lot \d+\)$/, "");
  const lower = base[0].toLowerCase() + base.slice(1);
  return /^(surface parking lot)/.test(lower) ? `a ${lower}` : lower;
}

/** A receptor's name only when it is a public place (a park or a river); otherwise none. */
export function publicName(kind: string, t: Record<string, string>): string | undefined {
  return kind === "park" || kind === "river or wetland" ? t.name : undefined;
}

const STREET_ABBR: [RegExp, string][] = [
  [/\bStreet\b/g, "St"], [/\bRoad\b/g, "Rd"], [/\bDrive\b/g, "Dr"], [/\bAvenue\b/g, "Ave"], [/\bBoulevard\b/g, "Blvd"],
  [/\bParkway\b/g, "Pkwy"], [/\bCrescent\b/g, "Cres"], [/\bCourt\b/g, "Crt"], [/\bPlace\b/g, "Pl"], [/\bLane\b/g, "Lane"],
  [/\bEast$/, "E"], [/\bWest$/, "W"], [/\bNorth$/, "N"], [/\bSouth$/, "S"],
];

export function abbreviateStreet(name: string): string {
  return STREET_ABBR.reduce((s, [re, to]) => s.replace(re, to), name);
}

// ---------------------------------------------------------------------------
// The scoring rule: weights sum to 100, each factor runs 0..1 and is stated in words.

export const WEIGHTS = {
  area: 25,
  alignment: 25,
  receptors: 20,
  trucks: 15,
  landUse: 15,
} as const;

export const WEIGHT_LABELS: { key: keyof typeof WEIGHTS; label: string }[] = [
  { key: "area", label: "Open area fits the role (launch about 1 to 2 ha; extraction about 0.4 ha; laydown about 0.3 ha)" },
  { key: "alignment", label: "Close to the line (full marks within 30 m, none beyond 400 m)" },
  { key: "receptors", label: "Buffer from homes, schools, care homes, hospitals, parks and the river (none within 30 m, full marks beyond 250 m)" },
  { key: "trucks", label: "Truck access: distance to a highway or main road (full marks within 100 m, none beyond 1 km)" },
  { key: "landUse", label: "How hard it is to take over the land (paved parking or vacant land easiest; active businesses hardest)" },
];

export type Role = "launch-shaft" | "extraction-shaft" | "laydown";

/** Open area (m²) each role needs: [nothing below, full marks from]. */
export const AREA_NEED: Record<Role, [number, number]> = {
  "launch-shaft": [4000, 15000],
  "extraction-shaft": [1500, 4500],
  laydown: [1000, 3000],
};

/** How easy the land is to use for a few years, 0..1, and why. */
export const LAND_USE_EASE: Record<Candidate, [number, string]> = {
  brownfield: [1, "vacant former industrial land"],
  parking: [0.85, "paved surface parking with no building on it"],
  construction: [0.8, "land already under construction"],
  greenfield: [0.65, "undeveloped land"],
  grass: [0.6, "open grassed land"],
  railway: [0.6, "railway land: needs the rail owner's agreement"],
  industrial: [0.45, "industrial land that may hold an active business"],
  commercial: [0.35, "commercial land with active businesses"],
  retail: [0.35, "retail land with active stores"],
};

export interface Factors {
  area: number;
  alignment: number;
  receptors: number;
  trucks: number;
  landUse: number;
}

export function areaFit(role: Role, openAreaM2: number): number {
  const [zero, one] = AREA_NEED[role];
  return ramp(openAreaM2, zero, one);
}

export function scoreOf(f: Factors): number {
  const s = WEIGHTS.area * f.area + WEIGHTS.alignment * f.alignment + WEIGHTS.receptors * f.receptors + WEIGHTS.trucks * f.trucks + WEIGHTS.landUse * f.landUse;
  return Math.round(s);
}

export function factorsFor(role: Role, use: Candidate, openAreaM2: number, alignmentM: number, receptorM: number, truckM: number): Factors {
  return {
    area: areaFit(role, openAreaM2),
    alignment: ramp(alignmentM, 400, 30),
    receptors: ramp(receptorM, 30, 250),
    trucks: ramp(truckM, 1000, 100),
    landUse: LAND_USE_EASE[use][0],
  };
}

// ---------------------------------------------------------------------------
// Scouting.

export interface ScoutInput {
  /** The full line (for distance) and the tunnelled section's chainage range on it. */
  line: LngLat[];
  sectionM: [number, number];
  features: Feature[];
  /** How far from the line to look, metres. */
  bufferM?: number;
}

function ringDist(a: number[][], f: Feature): number {
  if (f.point) return distToPolygon(f.point, [a]);
  if (f.rings) {
    let d = Infinity;
    // vertex-to-polygon both ways: exact enough at these scales
    for (const p of a) d = Math.min(d, distToPolygon(p as LngLat, f.rings));
    for (const p of f.rings[0]) d = Math.min(d, distToPolygon(p as LngLat, [a]));
    return d;
  }
  if (f.line) {
    let d = Infinity;
    for (const p of f.line) d = Math.min(d, distToPolygon(p, [a]));
    for (const p of a) d = Math.min(d, projectOnLine(p as LngLat, f.line).distanceM);
    return d;
  }
  return Infinity;
}

function nearRef(f: Feature): LngLat {
  return f.point ?? (f.rings ? (f.rings[0][0] as LngLat) : f.line![0]);
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
const fmtHa = (m2: number) => `${(m2 / 10000).toFixed(1)} ha`;

export interface ScoutResult {
  sites: ConstructionSite[];
}

/** Rank candidate sites along the section. Deterministic for the same input. */
export function scoutSites(input: ScoutInput): ScoutResult {
  const { line, features } = input;
  const [s0, s1] = input.sectionM;
  const buffer = input.bufferM ?? 400;
  const excluded = features.filter((f) => f.rings && isExcluded(f.tags));
  const receptors = features.filter((f) => receptorKind(f.tags));
  const trucks = features.filter((f) => f.line && TRUCK_ROADS.test(f.tags.highway ?? ""));
  const named = features.filter((f) => f.line && f.tags.highway && f.tags.name);
  const buildings = features.filter((f) => f.rings && f.tags.building);
  const rivers = features.filter((f) => f.line && f.tags.waterway === "river");

  const raw = features
    .map((f) => ({ f, use: f.rings ? candidateUse(f.tags) : null }))
    .filter((x): x is { f: Feature; use: Candidate } => !!x.use);

  // Retail/commercial land that contains a parking lot: the lot stands for the usable part.
  const lots = raw.filter((x) => x.use === "parking").map((x) => ringCentroid(x.f.rings![0]));
  const cands = raw.filter((x) => !(["retail", "commercial"].includes(x.use) && lots.some((c) => pointInPolygon(c, x.f.rings!))));

  const sites: ConstructionSite[] = [];
  const seen = new Set<string>();
  for (const { f, use } of cands) {
    if (seen.has(f.id)) continue;
    const ring = f.rings![0];
    const area = polygonAreaM2(f.rings!);
    if (area < 1500) continue;
    const c = ringCentroid(ring);
    if (excluded.some((x) => x.id !== f.id && pointInPolygon(c, x.rings!))) continue;
    // Distance to the line: nearest vertex, or 0 when the line crosses the site.
    let toLine = Infinity;
    for (const p of ring) toLine = Math.min(toLine, projectOnLine(p as LngLat, line).distanceM);
    for (const p of line) if (pointInPolygon(p, f.rings!)) toLine = 0;
    if (toLine > buffer) continue;
    const proj = projectOnLine(c, line);
    // Role by where along the line the site sits.
    let role: Role;
    if (proj.chainageM >= s0 - 450 && proj.chainageM <= s0 + 650) role = "launch-shaft";
    else if (proj.chainageM >= s1 - 650 && proj.chainageM <= s1 + 450) role = "extraction-shaft";
    else if (proj.chainageM > s0 && proj.chainageM < s1) role = "laydown";
    else continue;
    seen.add(f.id);

    // Open area: the polygon minus building footprints inside it.
    const built = buildings.filter((b) => pointInPolygon(ringCentroid(b.rings![0]), f.rings!)).reduce((a, b) => a + polygonAreaM2(b.rings!), 0);
    const open = Math.max(0, area - built);

    // Nearest sensitive receptor (prefilter by a cheap distance).
    let rec: { kind: string; name?: string; distanceM: number } | undefined;
    for (const r of receptors) {
      if (r.id === f.id) continue;
      if (distM(c, nearRef(r)) > 1500) continue;
      const d = ringDist(ring, r);
      const kind = receptorKind(r.tags)!;
      if (!rec || d < rec.distanceM) rec = { kind, name: publicName(kind, r.tags), distanceM: Math.round(d) };
    }
    let truck: { road: string; distanceM: number } | undefined;
    for (const t of trucks) {
      if (distM(c, nearRef(t)) > 4000) continue;
      const d = ringDist(ring, t);
      if (!truck || d < truck.distanceM) truck = { road: t.tags.name || (t.tags.ref ? `Highway ${t.tags.ref}` : t.tags.highway!), distanceM: Math.round(d) };
    }
    // Named by land use and the nearest public streets only: never a business or owner name.
    const streets = new Map<string, number>();
    for (const r of named) {
      if (distM(c, nearRef(r)) > 2500) continue;
      const d = ringDist(ring, r);
      const n = abbreviateStreet(r.tags.name!);
      if (d <= 400 && d < (streets.get(n) ?? Infinity)) streets.set(n, d);
    }
    const [street, cross] = [...streets.entries()].sort((p, q) => p[1] - q[1]).map(([n]) => n);

    const fac = factorsFor(role, use, open, toLine, rec?.distanceM ?? 1000, truck?.distanceM ?? 5000);
    const score = scoreOf(fac);
    const name = `${USE_WORDS[use]}${street ? ` off ${street}` : ""}${cross ? ` near ${cross}` : ""}`;

    const reasons: string[] = [];
    const concerns: string[] = [];
    const [lo, hi] = AREA_NEED[role];
    const what = role === "launch-shaft" ? "a launch site (shaft, segment storage, spoil bays, gantry crane)" : role === "extraction-shaft" ? "an extraction shaft" : "a laydown yard";
    if (fac.area >= 1) reasons.push(`About ${fmtHa(open)} of open ground: enough for ${what}.`);
    else if (open >= (lo + hi) / 2) concerns.push(`About ${fmtHa(open)} of open ground: tight for ${what}, which usually needs ${fmtHa(hi)} or more. Staging would need care or a second yard.`);
    else concerns.push(`Only about ${fmtHa(open)} of open ground: too small on its own for ${what} (about ${fmtHa(hi)}). Would need a second yard.`);
    if (toLine <= 30) reasons.push("Touches the line, so the shaft can sit right beside it.");
    else if (toLine <= 150) reasons.push(`${fmtM(toLine)} from the line: the shaft would sit on the line next to this yard, with a short haul between.`);
    else concerns.push(`${fmtM(toLine)} from the line: the shaft would need its own space on the line, with this land as a yard.`);
    if (rec) {
      const who = rec.kind === "homes" ? "homes" : `${rec.kind}${rec.name ? ` (${rec.name})` : ""}`;
      const near = rec.kind === "homes" ? `The nearest homes are ${fmtM(rec.distanceM)} away` : `The nearest ${who} is ${fmtM(rec.distanceM)} away`;
      const fix =
        rec.kind === "river or wetland"
          ? "silt fences, spill control and treated discharge of pumped water"
          : rec.kind === "park"
            ? "noise and dust control, and keeping paths open"
            : "noise walls, limits on work hours, and vibration monitoring";
      if (rec.distanceM >= 250) reasons.push(`${near}.`);
      else if (rec.kind !== "river or wetland") concerns.push(`${near}: ${fix}.`);
    }
    if (truck && truck.distanceM <= 300) reasons.push(`${fmtM(truck.distanceM)} to ${truck.road} for trucks.`);
    else if (truck) concerns.push(`${fmtM(truck.distanceM)} to the nearest highway or main road (${truck.road}): trucks would use smaller streets for that stretch.`);
    reasons.push(`Land use: ${LAND_USE_EASE[use][1]}.`);
    if (use === "parking") concerns.push("Parking used by businesses: needs the owner's agreement and a plan for the lost spaces for several years.");
    if (use === "industrial" || use === "brownfield" || use === "railway") concerns.push("Past industrial or rail use: test the soil for contamination (Phase I and II environmental site assessment).");
    if (use === "commercial" || use === "retail" || use === "industrial") concerns.push("Active businesses may be on site: the land would have to be leased or bought.");
    let river: { name: string; d: number } | undefined;
    for (const w of rivers) {
      if (distM(c, nearRef(w)) > 3000) continue;
      const d = ringDist(ring, w);
      if (d < 300 && (!river || d < river.d)) river = { name: w.tags.name ?? "river", d };
    }
    if (river)
      concerns.push(
        `${river.d < 15 ? `Right beside the ${river.name}` : `${fmtM(river.d)} from the ${river.name}`}: may be in the regulated floodplain, so a Grand River Conservation Authority permit (Ontario Regulation 41/24), flood-proofed shaft walls, careful dewatering, silt fences and treated discharge of pumped water.`,
      );
    else if (rec && rec.kind === "river or wetland" && rec.distanceM < 250)
      concerns.push(`Water or a wetland ${fmtM(rec.distanceM)} away: silt fences, spill control and treated discharge of pumped water.`);
    concerns.push("Check buried utilities, who owns the land, and the soil and groundwater from boreholes before relying on this site.");

    sites.push({
      id: `site-${f.id.replace("/", "-")}`,
      name,
      role,
      location: roundPt(c),
      footprint: { type: "Feature", properties: { osm: f.id }, geometry: { type: "Polygon", coordinates: f.rings!.map((r) => r.map((p) => roundPt(p))) } },
      areaM2: Math.round(open),
      landUse: use,
      distanceToAlignmentM: Math.round(toLine),
      nearestSensitive: rec,
      truckAccess: truck,
      score,
      reasons,
      concerns,
    });
  }
  // Ranked within each role: launch candidates, then extraction, then laydown.
  const order: Record<string, number> = { "launch-shaft": 0, "extraction-shaft": 1, laydown: 2 };
  sites.sort((a, b) => order[a.role] - order[b.role] || b.score - a.score || a.id.localeCompare(b.id));

  return { sites };
}
