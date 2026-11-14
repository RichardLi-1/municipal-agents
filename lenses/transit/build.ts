// Build the transit lens for a city, or for one decision's area. Everything city-specific
// comes from cities/<id>.json (see fetch.ts), so a new city needs no code change.
//   node lenses/transit/build.ts [--city <id>]                          -> data/lenses/transit-region.json
//   node lenses/transit/build.ts --area data/decisions/<id>.json        -> data/lenses/transit-<id>.json
// The first city file (alphabetical) writes transit-region.json; any other city writes
// transit-<cityId>.json for its whole area. Options: --radius <m> (circle around a point area,
// default 1500), --focus-label "<place name>" (for a point area), --weekday YYYY-MM-DD,
// --sunday YYYY-MM-DD (default: the next ones on which every feed runs), --from YYYY-MM-DD
// (look for those days after this date; default today), --cell <m> (grid size, default 400),
// --out-dir <dir> (default data/lenses).

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Decision } from "../../shared/types.ts";
import { readFeedDir, parseFeed, activeServices } from "./gtfs.ts";
import type { Feed } from "./gtfs.ts";
import { parseTable } from "./csv.ts";
import { areaMask } from "./geo.ts";
import type { LngLat } from "./geo.ts";
import { buildOrigins, buildTransitLens } from "./lens.ts";
import type { Scenario, Destination } from "./lens.ts";
import { ROOT, SOURCES, DEST_TYPES, fetchAll, loadDAs, retrievedDates, loadCity, gtfsUrlsOf, gtfsLicenceOf, cityPaths, citySuffix, cached, argValue as arg } from "./fetch.ts";
import { transitSummary } from "./summary.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The first date after `from` with weekday `dow` (0 = Sunday) on which every feed runs. */
export function nextServiceDate(feeds: Feed[], from: string, dow: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 1; i <= 120; i++) {
    const x = new Date(d.getTime() + i * 86_400_000);
    if (x.getUTCDay() !== dow) continue;
    const iso = x.toISOString().slice(0, 10);
    if (feeds.every((f) => activeServices(f, iso).size > 0)) return iso;
  }
  throw new Error(`no service date found after ${from}`);
}

/** The agency names in a feed's agency.txt, for plain labels ("Grand River Transit"). */
function agencyNames(dir: string): string[] {
  const p = join(dir, "agency.txt");
  if (!existsSync(p)) return [];
  const t = parseTable(readFileSync(p, "utf8"));
  const c = t.col("agency_name");
  return c < 0 ? [] : t.rows.map((r) => r[c]).filter(Boolean);
}

export async function main(): Promise<void> {
  const city = loadCity(arg("city"));
  if (!cached(city)) await fetchAll(city);
  const paths = cityPaths(city);
  const retrieved = retrievedDates(city);
  const urls = gtfsUrlsOf(city);
  const feeds = paths.gtfsDirs.map((dir, i) => parseFeed(readFeedDir(dir, `f${i + 1}`)));
  const agency = [...new Set(paths.gtfsDirs.flatMap(agencyNames))].join(", ") || "the transit agency";
  const today = new Date().toISOString().slice(0, 10);
  const from = arg("from") ?? today;
  const weekday = arg("weekday") ?? nextServiceDate(feeds, from, 2); // a Tuesday
  const sunday = arg("sunday") ?? nextServiceDate(feeds, from, 0);
  const scenarios: Scenario[] = [
    { id: "weekday-0800", short: "w8", label: "Weekday 8 am", date: weekday, dayLabel: dayLabel(weekday), time: 8 * 3600 },
    { id: "weekday-2200", short: "w22", label: "Weekday 10 pm", date: weekday, dayLabel: dayLabel(weekday), time: 22 * 3600 },
    { id: "sunday-0800", short: "s8", label: "Sunday 8 am", date: sunday, dayLabel: dayLabel(sunday), time: 8 * 3600 },
  ];

  const das = loadDAs(city);
  // Grid latitude: the census areas' mean, rounded to 0.05° so the grid stays put when the
  // areas change slightly (Waterloo Region: 43.45).
  const lat0 = Math.round((das.reduce((s, d) => s + d.centroid[1], 0) / Math.max(1, das.length)) * 20) / 20;
  const cellM = Number(arg("cell") ?? 400);
  const origins = buildOrigins(das, cellM, lat0);
  const destFc = JSON.parse(readFileSync(paths.destinations, "utf8")) as GeoJSON.FeatureCollection & { retrieved?: string };
  const destinations: Destination[] = destFc.features.map((f) => ({
    type: String(f.properties?.type),
    name: String(f.properties?.name ?? ""),
    osm: String(f.properties?.osm ?? ""),
    p: (f.geometry as GeoJSON.Point).coordinates as LngLat,
  }));

  const areaPath = arg("area");
  let areaId = citySuffix(city) ? city.id : "region";
  let mask;
  let focus: { label: string; p: LngLat } | undefined;
  if (areaPath) {
    const decision = JSON.parse(readFileSync(areaPath, "utf8")) as Decision;
    if (!decision.area) throw new Error(`${areaPath} has no area`);
    areaId = decision.id;
    const radius = Number(arg("radius") ?? 1500);
    const isPoint = JSON.stringify(decision.area).includes('"Point"');
    mask = areaMask(decision.id, isPoint ? `${radius} m around ${arg("focus-label") ?? "the decision's site"}` : decision.plainTitle, decision.area, radius);
    if (isPoint) {
      const feats = decision.area.type === "FeatureCollection" ? decision.area.features : [decision.area];
      const pt = feats.map((f) => f.geometry).find((g) => g?.type === "Point") as GeoJSON.Point | undefined;
      if (pt) focus = { label: arg("focus-label") ?? `the site of this decision (${decision.title})`, p: pt.coordinates as LngLat };
    }
  } else {
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: das.map((d) => ({ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: d.polys } })) };
    mask = areaMask(areaId, `${city.name} (all 2021 census dissemination areas)`, fc, 0);
  }

  const lens = buildTransitLens({
    feeds,
    feedInfo: {
      name: `${agency} GTFS (${urls.length === 1 ? "1 feed" : `${urls.length} feeds`})`,
      url: urls[0],
      retrieved: retrieved["gtfs-1"] ?? today,
      serviceDate: weekday,
      licence: gtfsLicenceOf(city),
    },
    agency,
    scenarios,
    destinations,
    destTypes: DEST_TYPES,
    origins,
    area: mask,
    cellM,
    lat0,
    sources: {
      gtfs: `${agency} GTFS (${urls.join(", ")}), retrieved ${retrieved["gtfs-1"]}; ${gtfsLicenceOf(city)}.`,
      population: `Statistics Canada, 2021 Census of Population, population by dissemination area (Census Profile API, ${SOURCES.censusPop}) and 2021 dissemination area boundaries (served by Esri Canada, ${SOURCES.daBoundaries}); retrieved ${retrieved["census-pop"]}; ${SOURCES.statcanLicence}. Adapted from Statistics Canada; this does not constitute an endorsement by Statistics Canada.`,
      destinations: `Destinations ${SOURCES.osmLicence}; one Overpass query, retrieved ${destFc.retrieved ?? retrieved.overpass}.`,
    },
    focus,
    log: (m) => console.log(m),
  });

  const outDir = arg("out-dir") ?? join(ROOT, "data", "lenses");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `transit-${areaId}.json`);
  writeFileSync(out, JSON.stringify(lens) + "\n");
  console.log(`wrote ${out} (${(statSync(out).size / 1e6).toFixed(2)} MB)`);
  console.log(transitSummary(lens));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
