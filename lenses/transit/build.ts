// Build the transit lens for the region or for one decision's area.
//   node lenses/transit/build.ts                                  -> data/lenses/transit-region.json
//   node lenses/transit/build.ts --area data/decisions/<id>.json  -> data/lenses/transit-<id>.json
// Options: --radius <m> (circle around a point area, default 1500), --focus-label "<place name>"
// (for a point area), --weekday YYYY-MM-DD,
// --sunday YYYY-MM-DD, --cell <m> (grid size, default 400).

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Decision } from "../../shared/types.ts";
import { readFeedDir, parseFeed, activeServices } from "./gtfs.ts";
import type { Feed } from "./gtfs.ts";
import { areaMask } from "./geo.ts";
import type { LngLat } from "./geo.ts";
import { buildOrigins, buildTransitLens } from "./lens.ts";
import type { Scenario, Destination } from "./lens.ts";
import { CACHE, OPEN, ROOT, SOURCES, DEST_TYPES, fetchAll, loadDAs, retrievedDates } from "./fetch.ts";
import { transitSummary } from "./summary.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The first date after `from` with weekday `dow` (0 = Sunday) on which every feed runs. */
function nextServiceDate(feeds: Feed[], from: string, dow: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 1; i <= 120; i++) {
    const x = new Date(d.getTime() + i * 86_400_000);
    if (x.getUTCDay() !== dow) continue;
    const iso = x.toISOString().slice(0, 10);
    if (feeds.every((f) => activeServices(f, iso).size > 0)) return iso;
  }
  throw new Error(`no service date found after ${from}`);
}

export async function main(): Promise<void> {
  if (!existsSync(join(CACHE, "grt-gtfs", "stop_times.txt")) || !existsSync(join(OPEN, "destinations.geojson"))) await fetchAll();
  const retrieved = retrievedDates();
  const feeds = [parseFeed(readFeedDir(join(CACHE, "grt-gtfs"), "bus")), parseFeed(readFeedDir(join(CACHE, "ion-gtfs"), "ion"))];
  const today = new Date().toISOString().slice(0, 10);
  const from = today > "2026-11-14" ? today : "2026-11-14";
  const weekday = arg("weekday") ?? nextServiceDate(feeds, from, 2); // a Tuesday
  const sunday = arg("sunday") ?? nextServiceDate(feeds, from, 0);
  const scenarios: Scenario[] = [
    { id: "weekday-0800", short: "w8", label: "Weekday 8 am", date: weekday, dayLabel: dayLabel(weekday), time: 8 * 3600 },
    { id: "weekday-2200", short: "w22", label: "Weekday 10 pm", date: weekday, dayLabel: dayLabel(weekday), time: 22 * 3600 },
    { id: "sunday-0800", short: "s8", label: "Sunday 8 am", date: sunday, dayLabel: dayLabel(sunday), time: 8 * 3600 },
  ];

  const das = loadDAs();
  const cellM = Number(arg("cell") ?? 400);
  const origins = buildOrigins(das, cellM);
  const destFc = JSON.parse(readFileSync(join(OPEN, "destinations.geojson"), "utf8")) as GeoJSON.FeatureCollection & { retrieved?: string };
  const destinations: Destination[] = destFc.features.map((f) => ({
    type: String(f.properties?.type),
    name: String(f.properties?.name ?? ""),
    osm: String(f.properties?.osm ?? ""),
    p: (f.geometry as GeoJSON.Point).coordinates as LngLat,
  }));

  const areaPath = arg("area");
  let areaId = "region";
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
    mask = areaMask("region", "Waterloo Region (all 2021 census dissemination areas)", fc, 0);
  }

  const lens = buildTransitLens({
    feeds,
    feedInfo: {
      name: "Grand River Transit GTFS: buses (staticfeeds/1) and ION light rail (staticfeeds/2)",
      url: SOURCES.gtfsBus,
      retrieved: retrieved["gtfs-bus"] ?? today,
      serviceDate: weekday,
      licence: SOURCES.gtfsLicence,
    },
    scenarios,
    destinations,
    destTypes: DEST_TYPES,
    origins,
    area: mask,
    cellM,
    sources: {
      gtfs: `Grand River Transit GTFS from the Region of Waterloo (${SOURCES.gtfsIndex}): buses ${SOURCES.gtfsBus}, ION light rail ${SOURCES.gtfsIon}; retrieved ${retrieved["gtfs-bus"]}; ${SOURCES.gtfsLicence}. Contains information provided by the Regional Municipality of Waterloo under licence.`,
      population: `Statistics Canada, 2021 Census of Population, population by dissemination area (Census Profile API, ${SOURCES.censusPop}) and 2021 dissemination area boundaries (served by Esri Canada, ${SOURCES.daBoundaries}); retrieved ${retrieved["census-pop"]}; ${SOURCES.statcanLicence}. Adapted from Statistics Canada; this does not constitute an endorsement by Statistics Canada.`,
      destinations: `Destinations ${SOURCES.osmLicence}; one Overpass query, retrieved ${destFc.retrieved ?? retrieved.overpass}.`,
    },
    focus,
    log: (m) => console.log(m),
  });

  mkdirSync(join(ROOT, "data", "lenses"), { recursive: true });
  const out = join(ROOT, "data", "lenses", `transit-${areaId}.json`);
  writeFileSync(out, JSON.stringify(lens) + "\n");
  console.log(`wrote ${out} (${(statSync(out).size / 1e6).toFixed(2)} MB)`);
  console.log(transitSummary(lens));
}

await main();
