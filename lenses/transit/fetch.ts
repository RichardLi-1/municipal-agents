// Download the open data the transit lens needs into data/cache/ (not committed), and write
// the small derived files to data/open/. Run: node lenses/transit/fetch.ts [--force]
//
// 1. Grand River Transit GTFS: buses (staticfeeds/1) and ION light rail (staticfeeds/2),
//    Region of Waterloo Open Data Licence v.2.0.
// 2. Essential destinations from OpenStreetMap through one Overpass query, ODbL 1.0.
// 3. 2021 Census population by dissemination area (Statistics Canada Census Profile SDMX API)
//    and dissemination area boundaries (Statistics Canada 2021 boundary file, served by Esri
//    Canada), both under the Statistics Canada Open Licence.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.ts";
import { polygonsOf, ringCentroid, inPolygon, bboxOf, round5 } from "./geo.ts";
import type { LngLat } from "./geo.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = join(ROOT, "data", "cache");
export const OPEN = join(ROOT, "data", "open");

export const SOURCES = {
  gtfsIndex: "https://webapps.regionofwaterloo.ca/api/grt-routes/",
  gtfsBus: "https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/1",
  gtfsIon: "https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/2",
  gtfsLicence: "Region of Waterloo Open Data Licence v.2.0 (https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/open-data/)",
  overpass: "https://overpass-api.de/api/interpreter",
  osmLicence: "© OpenStreetMap contributors, Open Database Licence (ODbL) 1.0, https://www.openstreetmap.org/copyright",
  censusPop: "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5..1.1.1?startPeriod=2021",
  daBoundaries: "https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/DisseminationAreas/FeatureServer/0",
  statcanLicence: "Statistics Canada Open Licence (https://www.statcan.gc.ca/en/reference/licence)",
};

/** Waterloo Region's census division code: its DAs have DAUIDs starting with 3530. */
const CD = "3530";
const UA = "municipal-agents-civic-hackathon/0.1";

async function download(url: string, dest: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Retrieved { [key: string]: string }

function loadRetrieved(): Retrieved {
  const p = join(CACHE, "retrieved.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

function saveRetrieved(r: Retrieved): void {
  writeFileSync(join(CACHE, "retrieved.json"), JSON.stringify(r, null, 2));
}

export async function fetchGtfs(force = false): Promise<void> {
  const r = loadRetrieved();
  for (const [key, url, dir] of [["bus", SOURCES.gtfsBus, "grt-gtfs"], ["ion", SOURCES.gtfsIon, "ion-gtfs"]] as const) {
    const zip = join(CACHE, `${dir}.zip`);
    if (force || !existsSync(join(CACHE, dir, "stop_times.txt"))) {
      console.log(`downloading ${url}`);
      await download(url, zip);
      rmSync(join(CACHE, dir), { recursive: true, force: true });
      mkdirSync(join(CACHE, dir), { recursive: true });
      execFileSync("unzip", ["-o", "-q", zip, "-d", join(CACHE, dir)]);
      r[`gtfs-${key}`] = today();
    }
    r[`gtfs-${key}`] ??= today();
  }
  saveRetrieved(r);
}

const OVERPASS_QUERY = (b: number[]) => `[out:json][timeout:180];
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|school|college|university|library|community_centre)$"](${b.join(",")});
  nwr["shop"~"^(supermarket|grocery|greengrocer)$"](${b.join(",")});
  nwr["healthcare"~"^(hospital|clinic|pharmacy)$"](${b.join(",")});
);
out center tags;`;

/** Destination types the lens reports, with the OSM tags behind each. */
export const DEST_TYPES: { id: string; label: string; tags: string }[] = [
  { id: "hospital", label: "hospital", tags: "amenity=hospital or healthcare=hospital, except emergency=no (kept as hospital-other, not counted)" },
  { id: "clinic", label: "clinic or doctor's office", tags: "amenity=clinic|doctors, healthcare=clinic" },
  { id: "pharmacy", label: "pharmacy", tags: "amenity=pharmacy, healthcare=pharmacy" },
  { id: "grocery", label: "grocery store", tags: "shop=supermarket|grocery|greengrocer" },
  { id: "school", label: "school", tags: "amenity=school" },
  { id: "college", label: "college or university", tags: "amenity=college|university" },
  { id: "library", label: "library", tags: "amenity=library" },
  { id: "community-centre", label: "community centre", tags: "amenity=community_centre" },
];

function destType(t: Record<string, string>): string | null {
  const a = t.amenity, s = t.shop, h = t.healthcare;
  // Two OSM features in the region tagged as hospitals are a dental office and a physiotherapy
  // clinic; count such names as clinics.
  if (a === "hospital" || (!a && h === "hospital")) {
    if (/dental|physio/i.test(t.name ?? "")) return "clinic";
    // Only hospitals with an emergency department count as "hospital"; others are kept apart.
    return t.emergency === "no" ? "hospital-other" : "hospital";
  }
  if (a === "pharmacy" || (!a && h === "pharmacy")) return "pharmacy";
  if (a === "clinic" || a === "doctors" || (!a && h === "clinic")) return "clinic";
  if (s === "supermarket" || s === "grocery" || s === "greengrocer") return "grocery";
  if (a === "school") return "school";
  if (a === "college" || a === "university") return "college";
  if (a === "library") return "library";
  if (a === "community_centre") return "community-centre";
  return null;
}

/** DA polygons of the region, from the cache (downloaded when missing). */
export async function fetchCensus(force = false): Promise<void> {
  const r = loadRetrieved();
  const popCsv = join(CACHE, "statcan-da-pop-2021.csv");
  if (force || !existsSync(popCsv)) {
    console.log("downloading 2021 census population by dissemination area (Statistics Canada SDMX)");
    await download(SOURCES.censusPop, popCsv, { headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" } });
    r["census-pop"] = today();
  }
  r["census-pop"] ??= today();
  const daFile = join(CACHE, `da-${CD}.geojson`);
  if (force || !existsSync(daFile)) {
    console.log("downloading dissemination area boundaries (Esri Canada, from Statistics Canada)");
    const q = `${SOURCES.daBoundaries}/query?where=${encodeURIComponent(`DAUID LIKE '${CD}%'`)}&outFields=DAUID,LANDAREA&outSR=4326&geometryPrecision=5&maxAllowableOffset=0.0003&f=geojson&resultRecordCount=2000`;
    await download(q, daFile);
    r["da-boundaries"] = today();
  }
  r["da-boundaries"] ??= today();
  saveRetrieved(r);
}

export interface DA {
  dauid: string;
  pop: number;
  areaKm2: number;
  centroid: LngLat;
  polys: number[][][][];
}

export function loadDAs(): DA[] {
  const rows = parseCsv(readFileSync(join(CACHE, "statcan-da-pop-2021.csv"), "utf8"));
  const h = rows[0];
  const geo = h.indexOf("REF_AREA"), val = h.indexOf("OBS_VALUE"), ch = h.indexOf("CHARACTERISTIC");
  const pop = new Map<string, number>();
  for (const row of rows.slice(1)) {
    if (row[ch] !== "1") continue; // characteristic 1: Population, 2021
    const dauid = row[geo].slice(-8);
    if (dauid.startsWith(CD)) pop.set(dauid, Number(row[val]) || 0);
  }
  const fc = JSON.parse(readFileSync(join(CACHE, `da-${CD}.geojson`), "utf8")) as GeoJSON.FeatureCollection;
  return fc.features.map((f) => {
    const polys = polygonsOf(f.geometry);
    // Centroid of the largest part; if it falls outside (odd shapes), use its first vertex.
    let big = polys[0];
    let bigArea = 0;
    for (const p of polys) {
      const b = bboxOf([p]);
      const a = (b[2] - b[0]) * (b[3] - b[1]);
      if (a > bigArea) { bigArea = a; big = p; }
    }
    let c = ringCentroid(big[0]);
    if (!inPolygon(c, big)) c = big[0][0] as LngLat;
    const id = String(f.properties?.DAUID);
    return { dauid: id, pop: pop.get(id) ?? 0, areaKm2: Number(f.properties?.LANDAREA ?? 0), centroid: c, polys };
  });
}

export async function fetchDestinations(force = false): Promise<void> {
  const r = loadRetrieved();
  const raw = join(CACHE, "overpass-destinations.json");
  if (force || !existsSync(raw)) {
    const das = loadDAs();
    const b = bboxOf(das.flatMap((d) => d.polys));
    const bbox = [b[1], b[0], b[3], b[2]].map((x) => Math.round(x * 1e4) / 1e4);
    console.log("querying Overpass once for essential destinations");
    await download(SOURCES.overpass, raw, { method: "POST", body: new URLSearchParams({ data: OVERPASS_QUERY(bbox) }) });
    r.overpass = today();
  }
  r.overpass ??= today();
  saveRetrieved(r);
  writeDestinations(r.overpass);
}

/** Keep destinations inside the region (any DA polygon) and write data/open/destinations.geojson. */
export function writeDestinations(retrieved: string): void {
  const das = loadDAs();
  const data = JSON.parse(readFileSync(join(CACHE, "overpass-destinations.json"), "utf8")) as {
    osm3s?: { timestamp_osm_base?: string };
    elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  };
  const feats: GeoJSON.Feature[] = [];
  for (const e of data.elements) {
    const tags = e.tags ?? {};
    const type = destType(tags);
    if (!type) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const p: LngLat = [lon, lat];
    if (!das.some((d) => d.polys.some((poly) => inPolygon(p, poly)))) continue;
    feats.push({
      type: "Feature",
      properties: { type, name: tags.name ?? tags.brand ?? tags.operator ?? "", osm: `${e.type}/${e.id}` },
      geometry: { type: "Point", coordinates: [round5(lon), round5(lat)] },
    });
  }
  feats.sort((a, b) => String(a.properties!.osm).localeCompare(String(b.properties!.osm)));
  const out = {
    type: "FeatureCollection",
    attribution: SOURCES.osmLicence,
    source: `OpenStreetMap via the Overpass API (${SOURCES.overpass}), one query, data as of ${data.osm3s?.timestamp_osm_base ?? retrieved}`,
    retrieved,
    types: DEST_TYPES,
    features: feats,
  };
  writeFileSync(join(OPEN, "destinations.geojson"), JSON.stringify(out) + "\n");
  console.log(`wrote data/open/destinations.geojson: ${feats.length} destinations`);
}

/** Write data/open/population-da-2021.geojson: one point per DA with its 2021 population. */
export function writePopulation(retrieved: string): void {
  const das = loadDAs();
  const out = {
    type: "FeatureCollection",
    attribution: `Statistics Canada, 2021 Census of Population (Census Profile) and 2021 dissemination area boundary file; ${SOURCES.statcanLicence}. Boundaries served by Esri Canada (${SOURCES.daBoundaries}).`,
    retrieved,
    note: "One point per dissemination area (area centroid of its largest part, inside the area) with its 2021 population and land area.",
    features: das.map((d) => ({
      type: "Feature",
      properties: { dauid: d.dauid, pop: d.pop, km2: Math.round(d.areaKm2 * 1000) / 1000 },
      geometry: { type: "Point", coordinates: [round5(d.centroid[0]), round5(d.centroid[1])] },
    })),
  };
  writeFileSync(join(OPEN, "population-da-2021.geojson"), JSON.stringify(out) + "\n");
  console.log(`wrote data/open/population-da-2021.geojson: ${das.length} areas, ${das.reduce((s, d) => s + d.pop, 0)} people`);
}

export async function fetchAll(force = false): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OPEN, { recursive: true });
  await fetchGtfs(force);
  await fetchCensus(force);
  await fetchDestinations(force);
  writePopulation(loadRetrieved()["census-pop"]);
}

export function retrievedDates(): Retrieved {
  return loadRetrieved();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await fetchAll(process.argv.includes("--force"));
}
