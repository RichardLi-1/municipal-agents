// Download the open data the transit lens needs into data/cache/transit/<city>/ (not
// committed), and write the small derived files to data/open/. Everything city-specific comes
// from the city file, cities/<id>.json (CityConfig): no code change for a new city.
//
//   node lenses/transit/fetch.ts [--city <id>] [--force]      (default: the first city file)
//
// 1. GTFS: every URL in `gtfsUrls` (or the one `gtfsUrl`); licence from the city's `openData`
//    entry that mentions GTFS or transit.
// 2. Essential destinations from OpenStreetMap through one Overpass query over the census
//    areas' bounding box, ODbL 1.0.
// 3. 2021 Census population by dissemination area (Statistics Canada Census Profile API) and
//    dissemination area boundaries (Statistics Canada 2021 boundary file, served by Esri
//    Canada), Statistics Canada Open Licence. The areas are those of the city's
//    `censusDivision`, or those touching its `bbox` (or a box around `center`).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CityConfig } from "../../shared/types.ts";
import { parseCsv } from "./csv.ts";
import { polygonsOf, ringCentroid, inPolygon, bboxOf, round5 } from "./geo.ts";
import type { LngLat } from "./geo.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = join(ROOT, "data", "cache");
export const OPEN = join(ROOT, "data", "open");
const CITIES_DIR = join(ROOT, "cities");

export const SOURCES = {
  overpass: "https://overpass-api.de/api/interpreter",
  osmLicence: "© OpenStreetMap contributors, Open Database Licence (ODbL) 1.0, https://www.openstreetmap.org/copyright",
  censusPop: "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5..1.1.1?startPeriod=2021",
  daBoundaries: "https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/DisseminationAreas/FeatureServer/0",
  statcanLicence: "Statistics Canada Open Licence (https://www.statcan.gc.ca/en/reference/licence)",
};

const UA = "municipal-agents-civic-hackathon/0.1";

// ---------------------------------------------------------------- the city file

/** City ids in cities/, sorted; the first is the default. */
export function cityIds(): string[] {
  return readdirSync(CITIES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
}

export function loadCity(id?: string): CityConfig {
  const ids = cityIds();
  const want = id ?? ids[0];
  if (!want || !ids.includes(want)) throw new Error(`No city file cities/${want}.json (have: ${ids.join(", ") || "none"})`);
  return JSON.parse(readFileSync(join(CITIES_DIR, `${want}.json`), "utf8")) as CityConfig;
}

/** The city's GTFS feeds: `gtfsUrls`, else the single `gtfsUrl`. */
export function gtfsUrlsOf(city: CityConfig): string[] {
  const urls = city.gtfsUrls?.length ? city.gtfsUrls : city.gtfsUrl ? [city.gtfsUrl] : [];
  if (!urls.length) throw new Error(`cities/${city.id}.json has no gtfsUrls or gtfsUrl`);
  return urls;
}

/** Licence text for the GTFS: the openData entry that mentions GTFS (or transit), else the first. */
export function gtfsLicenceOf(city: CityConfig): string {
  const e = city.openData.find((d) => /gtfs/i.test(d.name)) ?? city.openData.find((d) => /transit/i.test(d.name)) ?? city.openData[0];
  return e ? `${e.licence} (${e.url})` : "See the feed publisher's terms";
}

/** The first city keeps the plain file names (transit-region.json, destinations.geojson); others get "-<id>". */
export function citySuffix(city: CityConfig): string {
  return city.id === cityIds()[0] ? "" : `-${city.id}`;
}

export interface CityPaths {
  dir: string; // data/cache/transit/<id>
  gtfsDirs: string[]; // one per feed
  da: string;
  overpass: string;
  retrieved: string;
  destinations: string; // data/open/destinations<suffix>.geojson
  population: string; // data/open/population-da-2021<suffix>.geojson
}

export function cityPaths(city: CityConfig): CityPaths {
  const dir = join(CACHE, "transit", city.id);
  const sfx = citySuffix(city);
  return {
    dir,
    gtfsDirs: gtfsUrlsOf(city).map((_, i) => join(dir, `gtfs-${i + 1}`)),
    da: join(dir, "da.geojson"),
    overpass: join(dir, "overpass.json"),
    retrieved: join(dir, "retrieved.json"),
    destinations: join(OPEN, `destinations${sfx}.geojson`),
    population: join(OPEN, `population-da-2021${sfx}.geojson`),
  };
}

/** The national census population file is shared by every city. */
const POP_CSV = join(CACHE, "statcan-da-pop-2021.csv");

// ---------------------------------------------------------------- downloads

async function download(url: string, dest: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Retrieved { [key: string]: string }

export function retrievedDates(city: CityConfig): Retrieved {
  const p = cityPaths(city).retrieved;
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

function saveRetrieved(city: CityConfig, r: Retrieved): void {
  writeFileSync(cityPaths(city).retrieved, JSON.stringify(r, null, 2));
}

export async function fetchGtfs(city: CityConfig, force = false): Promise<void> {
  const r = retrievedDates(city);
  const urls = gtfsUrlsOf(city);
  const paths = cityPaths(city);
  for (let i = 0; i < urls.length; i++) {
    const dir = paths.gtfsDirs[i];
    const key = `gtfs-${i + 1}`;
    if (force || !existsSync(join(dir, "stop_times.txt"))) {
      console.log(`downloading ${urls[i]}`);
      const zip = `${dir}.zip`;
      await download(urls[i], zip);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
      r[key] = today();
    }
    r[key] ??= today();
  }
  saveRetrieved(city, r);
}

/** The census areas to fetch: by census division code, else by bounding box. */
function daWhere(city: CityConfig): string {
  if (city.censusDivision) return `where=${encodeURIComponent(`DAUID LIKE '${city.censusDivision}%'`)}`;
  const b = city.bbox ?? [city.center[0] - 0.35, city.center[1] - 0.25, city.center[0] + 0.35, city.center[1] + 0.25];
  return `where=1%3D1&geometry=${b.join(",")}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
}

export async function fetchCensus(city: CityConfig, force = false): Promise<void> {
  const r = retrievedDates(city);
  if (force || !existsSync(POP_CSV)) {
    console.log("downloading 2021 census population by dissemination area (Statistics Canada, all of Canada)");
    await download(SOURCES.censusPop, POP_CSV, { headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" } });
    r["census-pop"] = today();
  }
  r["census-pop"] ??= today();
  const daFile = cityPaths(city).da;
  if (force || !existsSync(daFile)) {
    console.log("downloading dissemination area boundaries (Esri Canada, from Statistics Canada)");
    const features: GeoJSON.Feature[] = [];
    for (let offset = 0; ; offset += 2000) {
      const q = `${SOURCES.daBoundaries}/query?${daWhere(city)}&outFields=DAUID,LANDAREA&outSR=4326&geometryPrecision=5&maxAllowableOffset=0.0003&f=geojson&resultOffset=${offset}&resultRecordCount=2000&orderByFields=DAUID`;
      const res = await fetch(q, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
      const page = (await res.json()) as GeoJSON.FeatureCollection & { properties?: { exceededTransferLimit?: boolean }; exceededTransferLimit?: boolean };
      features.push(...page.features);
      if (!(page.properties?.exceededTransferLimit || page.exceededTransferLimit) || !page.features.length) break;
    }
    if (!features.length) throw new Error(`no census areas found for ${city.id}: set censusDivision or bbox in cities/${city.id}.json`);
    writeFileSync(daFile, JSON.stringify({ type: "FeatureCollection", features }));
    r["da-boundaries"] = today();
  }
  r["da-boundaries"] ??= today();
  saveRetrieved(city, r);
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

export function destType(t: Record<string, string>): string | null {
  const a = t.amenity, s = t.shop, h = t.healthcare;
  if (a === "hospital" || (!a && h === "hospital")) {
    // Mis-tagged dental and physiotherapy offices (two in Waterloo Region) count as clinics.
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

// ---------------------------------------------------------------- census areas

export interface DA {
  dauid: string;
  pop: number;
  areaKm2: number;
  centroid: LngLat;
  polys: number[][][][];
}

export function loadDAs(city: CityConfig): DA[] {
  const fc = JSON.parse(readFileSync(cityPaths(city).da, "utf8")) as GeoJSON.FeatureCollection;
  const ids = new Set(fc.features.map((f) => String(f.properties?.DAUID)));
  const rows = parseCsv(readFileSync(POP_CSV, "utf8"));
  const h = rows[0];
  const geo = h.indexOf("REF_AREA"), val = h.indexOf("OBS_VALUE"), ch = h.indexOf("CHARACTERISTIC");
  const pop = new Map<string, number>();
  for (const row of rows.slice(1)) {
    if (row[ch] !== "1") continue; // characteristic 1: Population, 2021
    const dauid = row[geo].slice(-8);
    if (ids.has(dauid)) pop.set(dauid, Number(row[val]) || 0);
  }
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

// ---------------------------------------------------------------- destinations

export async function fetchDestinations(city: CityConfig, force = false): Promise<void> {
  const r = retrievedDates(city);
  const raw = cityPaths(city).overpass;
  if (force || !existsSync(raw)) {
    const das = loadDAs(city);
    const b = bboxOf(das.flatMap((d) => d.polys));
    const bbox = [b[1], b[0], b[3], b[2]].map((x) => Math.round(x * 1e4) / 1e4);
    console.log("querying Overpass once for essential destinations");
    await download(SOURCES.overpass, raw, { method: "POST", body: new URLSearchParams({ data: OVERPASS_QUERY(bbox) }) });
    r.overpass = today();
  }
  r.overpass ??= today();
  saveRetrieved(city, r);
  writeDestinations(city, r.overpass);
}

/** Keep destinations inside the census areas and write data/open/destinations<suffix>.geojson. */
export function writeDestinations(city: CityConfig, retrieved: string): void {
  const das = loadDAs(city);
  const paths = cityPaths(city);
  const data = JSON.parse(readFileSync(paths.overpass, "utf8")) as {
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
  writeFileSync(paths.destinations, JSON.stringify(out) + "\n");
  console.log(`wrote ${paths.destinations}: ${feats.length} destinations`);
}

/** Write data/open/population-da-2021<suffix>.geojson: one point per DA with its 2021 population. */
export function writePopulation(city: CityConfig, retrieved: string): void {
  const das = loadDAs(city);
  const paths = cityPaths(city);
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
  writeFileSync(paths.population, JSON.stringify(out) + "\n");
  console.log(`wrote ${paths.population}: ${das.length} areas, ${das.reduce((s, d) => s + d.pop, 0)} people`);
}

/** Everything the build needs, downloading only what is missing (or all, with force). */
export async function fetchAll(city: CityConfig, force = false): Promise<void> {
  mkdirSync(cityPaths(city).dir, { recursive: true });
  mkdirSync(OPEN, { recursive: true });
  await fetchGtfs(city, force);
  await fetchCensus(city, force);
  await fetchDestinations(city, force);
  writePopulation(city, retrievedDates(city)["census-pop"]);
}

/** True when the build can run without the network. */
export function cached(city: CityConfig): boolean {
  const p = cityPaths(city);
  return p.gtfsDirs.every((d) => existsSync(join(d, "stop_times.txt"))) && existsSync(p.da) && existsSync(POP_CSV) && existsSync(p.overpass) && existsSync(p.destinations);
}

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await fetchAll(loadCity(argValue("city")), process.argv.includes("--force"));
}
