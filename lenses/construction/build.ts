// Build the construction scout lens for a decision.
//   node --env-file=.env lenses/construction/build.ts row-2027-budget
// Reads the ION Stage 2 alignment from Region of Waterloo Open Data, candidate land
// from OpenStreetMap and ground levels from NRCan's CDEM; writes
// data/lenses/construction-<decision>.json. Renders are made separately by render.ts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConstructionLens, ConstructionSite } from "../../shared/types.ts";
import {
  chainages, distM, lineLengthM, offsetLine, pointAt, projectOnLine, rectangle, ringCentroid, roundGeometry, roundPt, simplify, sliceLine,
  type LngLat,
} from "./geo.ts";
import { fetchOsm, numberDuplicateNames, publicName, sitePhrase, receptorKind, scoutSites, toFeatures, WEIGHT_LABELS, WEIGHTS, type Feature } from "./scout.ts";
import { CDEM_URL, groundElevations, layoutTunnel, RULES, type Crossing } from "./layout.ts";
import { buildSteps, spoilPlan, SPOIL, NOISE_RULES } from "./steps.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = path.join(ROOT, "data/cache/construction");

export const ROW_ION_ROUTES =
  "https://utility.arcgis.com/usrsvcs/servers/1aea43272d854f59a4d5d710fc8e2c17/rest/services/OpenData/OpenData/MapServer/6";
export const ROW_ION_STOPS =
  "https://utility.arcgis.com/usrsvcs/servers/f063d1fb147847f796ce8c024e117419/rest/services/OpenData/OpenData/MapServer/5";
const ROW_LICENCE = "Region of Waterloo Open Data Licence v.2.0";

async function cachedJson(url: string, file: string): Promise<any> {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const d = await r.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(d));
  return d;
}

const query = (layer: string) => `${layer}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson`;

/** Join the planned Stage 2 LRT segments into one line, starting nearest `start`. */
export function chainSegments(segs: LngLat[][], start: LngLat, tolM = 5): LngLat[] {
  const left = segs.map((s) => s.slice());
  let i = left.reduce((bi, s, k) => (Math.min(distM(s[0], start), distM(s[s.length - 1], start)) < Math.min(distM(left[bi][0], start), distM(left[bi][left[bi].length - 1], start)) ? k : bi), 0);
  let line = left.splice(i, 1)[0];
  if (distM(line[line.length - 1], start) < distM(line[0], start)) line.reverse();
  for (;;) {
    const end = line[line.length - 1];
    i = left.findIndex((s) => distM(s[0], end) < tolM || distM(s[s.length - 1], end) < tolM);
    if (i < 0) break;
    const s = left.splice(i, 1)[0];
    if (distM(s[0], end) >= tolM) s.reverse();
    line = line.concat(s.slice(1));
  }
  return line;
}

function segmentHit(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat): number | null {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3, [x4, y4] = p4;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Where named highways and rivers cross the line, by chainage (one per name, the first). */
export function findCrossings(line: LngLat[], features: Feature[]): (Crossing & { at: LngLat })[] {
  const ch = chainages(line);
  const out: (Crossing & { at: LngLat })[] = [];
  for (const f of features) {
    if (!f.line) continue;
    const t = f.tags;
    const kind = t.highway === "motorway" ? "highway" : t.waterway === "river" ? "river" : null;
    if (!kind) continue;
    const name = kind === "highway" ? (t.ref ? `Highway ${t.ref}` : t.name ?? "Highway") : t.name ?? "River";
    for (let i = 0; i < line.length - 1; i++)
      for (let j = 0; j < f.line.length - 1; j++) {
        const r = segmentHit(line[i], line[i + 1], f.line[j], f.line[j + 1]);
        if (r === null) continue;
        const c = ch[i] + r * (ch[i + 1] - ch[i]);
        const prev = out.find((o) => o.name === name);
        if (prev) prev.chainageM = Math.min(prev.chainageM, c); // first carriageway
        else out.push({ name, kind, chainageM: c, at: pointAt(line, c).point });
      }
  }
  for (const o of out) o.at = pointAt(line, o.chainageM).point;
  return out.sort((a, b) => a.chainageM - b.chainageM);
}

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: features.map((f) => ({ ...f, geometry: roundGeometry(f.geometry) })),
});
const pt = (p: LngLat, props: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: roundPt(p) } });
const ln = (l: LngLat[], props: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: l.map((p) => roundPt(p)) } });

export interface RenderManifest {
  [stepId: string]: { file: string; prompt: string; model: string };
}

export async function buildLens(decisionId: string): Promise<ConstructionLens> {
  // 1. The ION Stage 2 alignment (Region of Waterloo Open Data).
  const routes = await cachedJson(query(ROW_ION_ROUTES), "row-ion-routes.geojson");
  const stops = await cachedJson(query(ROW_ION_STOPS), "row-ion-stops.geojson");
  const stop = (name: string): LngLat => {
    const f = stops.features.find((s: any) => s.properties.StopName === name);
    if (!f) throw new Error(`No ION stop "${name}"`);
    return f.geometry.coordinates as LngLat;
  };
  const planned = routes.features.filter((f: any) => f.properties.Stage2 === "LRT" && f.properties.RouteStatus === "Planned" && f.geometry?.type === "LineString");
  const stage2 = chainSegments(planned.map((f: any) => f.geometry.coordinates as LngLat[]), stop("Fairway"));
  const stage2Len = lineLengthM(stage2);
  const sportsworld = projectOnLine(stop("Sportsworld (LRT)"), stage2).chainageM;
  const preston = projectOnLine(stop("Preston (LRT)"), stage2).chainageM;

  // 2. OpenStreetMap around the stretch between the two stations.
  const mid = pointAt(stage2, (sportsworld + preston) / 2).point;
  const bboxPts = [pointAt(stage2, sportsworld - 600).point, pointAt(stage2, preston + 600).point];
  const pad = 0.0075;
  const bbox: [number, number, number, number] = [
    Math.min(bboxPts[0][0], bboxPts[1][0]) - pad, Math.min(bboxPts[0][1], bboxPts[1][1]) - pad * 0.72,
    Math.max(bboxPts[0][0], bboxPts[1][0]) + pad, Math.max(bboxPts[0][1], bboxPts[1][1]) + pad * 0.72,
  ];
  const osm = await fetchOsm([-80.409, 43.391, -80.348, 43.417], path.join(CACHE, "osm-sites.json"));
  void bbox;
  const features = toFeatures(osm.elements);
  const crossingsAll = findCrossings(stage2, features).filter((c) => c.chainageM > sportsworld && c.chainageM < preston);

  // 3. Scout. Section: from just east of Sportsworld station to just west of Preston station.
  const s0 = sportsworld + 120, s1 = preston - 100;
  const { sites } = scoutSites({ line: stage2, sectionM: [s0, s1], features });
  const best = (role: ConstructionSite["role"]) => sites.find((s) => s.role === role);
  const launch = best("launch-shaft");
  const extraction = best("extraction-shaft");
  if (!launch || !extraction) throw new Error("No launch or extraction candidate found");
  // The shafts sit on the line at the stretch's ends, beside the top-ranked sites.
  const launchCh = Math.max(s0, Math.min(s0 + 400, projectOnLine(launch.location, stage2).chainageM));
  const extractionCh = Math.min(s1, Math.max(s1 - 400, projectOnLine(extraction.location, stage2).chainageM));

  // 4. Lay out the bores.
  const section = sliceLine(stage2, launchCh, extractionCh);
  const crossings: Crossing[] = crossingsAll.map((c) => ({ name: c.name, kind: c.kind, chainageM: c.chainageM - launchCh }));
  const layout = await layoutTunnel({
    section,
    crossings,
    ground: (_xs, pts) => groundElevations(pts, path.join(CACHE, "cdem.json")),
  });

  // 5. Steps.
  const at = (name: string) => crossingsAll.find((c) => c.name.includes(name))?.at ?? mid;
  const steps = buildSteps({
    launchName: sitePhrase(launch.name),
    extractionName: sitePhrase(extraction.name),
    launch: layout.shafts[0].point,
    extraction: layout.shafts[1].point,
    middle: pointAt(section, layout.lengthM / 2).point,
    highway: at("401"),
    river: at("River"),
    bearing: pointAt(section, layout.lengthM / 2).bearing,
    boredLengthM: layout.boredM.to - layout.boredM.from,
    diameterM: RULES.diameterM,
    launchDepthM: layout.shafts[0].depthM,
    extractionDepthM: layout.shafts[1].depthM,
    boreholes: layout.boreholes.length,
    crossPassages: layout.crossPassages.length,
    coverM: { min: layout.cover.minM, max: layout.cover.maxM },
    crossings: crossings.map((c) => c.name),
  });
  let manifest: RenderManifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/renders/construction-renders.json"), "utf8"));
  } catch {}
  for (const s of steps) {
    const m = manifest[s.id];
    if (m && fs.existsSync(path.join(ROOT, "data/renders", m.file))) s.render = { url: `/api/renders/${m.file}`, prompt: m.prompt, model: m.model, illustrative: true };
  }

  // 6. Map layers.
  // Shown and stored: the best few per role, ranked within the role.
  const cap: Record<string, number> = { "launch-shaft": 5, "extraction-shaft": 5, laydown: 3 };
  const top = numberDuplicateNames(sites.filter((s) => (cap[s.role] = (cap[s.role] ?? 0) - 1) >= 0));
  const shaftPolys = layout.shafts.map((s) =>
    ({
      type: "Feature",
      properties: { id: s.id, label: s.id === "launch" ? "Launch shaft" : "Extraction shaft", depthM: s.depthM, heightM: s.id === "launch" ? 14 : 10, lengthM: s.lengthM, widthM: s.widthM },
      geometry: { type: "Polygon", coordinates: [rectangle(s.point, s.bearing, s.lengthM, s.widthM)] },
    }) as GeoJSON.Feature,
  );
  const bored = sliceLine(section, layout.boredM.from, layout.boredM.to);
  const leftLine = offsetLine(bored, -RULES.boreOffsetM), rightLine = offsetLine(bored, RULES.boreOffsetM);
  const cpLines = layout.crossPassages.map((c) => {
    const x = c.chainageM - layout.boredM.from;
    return ln([pointAt(leftLine, x).point, pointAt(rightLine, x).point], { id: c.id, chainageM: c.chainageM });
  });
  const receptors = features
    .filter((f) => {
      const k = receptorKind(f.tags);
      return k && k !== "homes" && k !== "river or wetland" && (f.rings || f.point);
    })
    .map((f) => ({ f, c: f.point ?? ringCentroid(f.rings![0]) }))
    .filter(({ c }) => {
      const p = projectOnLine(c, section);
      return p.distanceM < 350;
    })
    .map(({ f, c }) => {
      const kind = receptorKind(f.tags)!;
      return pt(c, { kind, name: publicName(kind, f.tags) ?? null });
    });
  const layers: Record<string, GeoJSON.FeatureCollection> = {
    stage2: fc([ln(simplify(stage2, 2), { name: "ION Stage 2 (approved route, Region of Waterloo Open Data)" })]),
    alignment: fc([ln(simplify(section, 1), { name: "What-if tunnel section", lengthM: layout.lengthM })]),
    bores: fc(layout.bores.map((b) => ln(simplify(b.line as LngLat[], 1), { id: b.id, label: b.label, diameterM: RULES.diameterM }))),
    shafts: fc(shaftPolys),
    sites: fc(top.map((s, i) => ({ ...s.footprint!, properties: { id: s.id, rank: i + 1, name: s.name, role: s.role, score: s.score, proposed: s.id === launch.id || s.id === extraction.id } }))),
    boreholes: fc(layout.boreholes.map((b) => pt(b.location, { id: b.id, chainageM: b.chainageM, depthM: b.depthM, purpose: b.purpose }))),
    "cross-passages": fc(cpLines),
    sensitive: fc(receptors),
    crossings: fc(crossingsAll.map((c) => pt(c.at, { name: c.name, kind: c.kind, chainageM: Math.round(c.chainageM - launchCh) }))),
  };

  const sp = spoilPlan(layout.boredM.to - layout.boredM.from, RULES.diameterM);
  const today = new Date().toISOString().slice(0, 10);
  const lens: ConstructionLens = {
    decisionId,
    scenario: {
      title: `What if ION Stage 2 went under Highway 401 and the Speed River? A ${(layout.lengthM / 1000).toFixed(1)} km twin-bore tunnel between Sportsworld and Preston`,
      label: "Illustrative scenario: not a Region plan",
      basis:
        `The Region's 10-year capital forecast includes project 68030 "RT to Cambridge" (ION Stage 2): $85.0 million in 2027 and $2.05 billion over 10 years (2026 Budget Book, p. 43). ` +
        `The Region's approved Stage 2 route is mostly at street level. Between Sportsworld and Preston stations it must cross Highway 401 and the Speed River and its floodplain, and approach Preston's older core. ` +
        `This scenario asks what it would take to put that ${(layout.lengthM / 1000).toFixed(1)} km stretch underground instead, so engineers, staff and residents can weigh it. The Region has not proposed this, and the agents do not choose a site.`,
    },
    method: "tbm-twin-bore",
    alignment: ln(simplify(section, 1), {
      name: "What-if tunnel section of ION Stage 2",
      stage2ChainageFromM: Math.round(launchCh),
      stage2ChainageToM: Math.round(extractionCh),
      stage2LengthM: Math.round(stage2Len),
    }) as GeoJSON.Feature<GeoJSON.LineString>,
    alignmentSource:
      `Region of Waterloo Open Data, "ION Routes" (OpenData MapServer layer 6, segments with Stage2 = LRT and RouteStatus = Planned) and "ION Stops" (layer 5) for Sportsworld and Preston stations, retrieved ${today}. Licence: ${ROW_LICENCE}. ` +
      `Crossings and candidate land from OpenStreetMap via Overpass (OpenStreetMap data as of ${(osm.osmBase ?? osm.retrieved).slice(0, 10)}, retrieved ${osm.retrieved.slice(0, 10)}), © OpenStreetMap contributors, ODbL 1.0. ` +
      `Ground levels from Natural Resources Canada, Canadian Digital Elevation Model (CDEM) altitude service, Open Government Licence – Canada.`,
    sites: top,
    proposed: { launch: launch.id, extraction: extraction.id },
    weights: WEIGHT_LABELS.map((w) => ({ label: w.label, weight: WEIGHTS[w.key] })),
    bores: layout.bores.map((b) => ({ id: b.id, label: b.label, line: ln(simplify(b.line as LngLat[], 1), { id: b.id }) as GeoJSON.Feature<GeoJSON.LineString>, lengthM: b.lengthM, diameterM: RULES.diameterM, depthM: b.depthM })),
    crossPassages: layout.crossPassages,
    boreholes: layout.boreholes,
    profile: layout.profile.map((p) => ({ ...p, groundM: +p.groundM.toFixed(1), crownM: +p.crownM.toFixed(1), invertM: +p.invertM.toFixed(1) })),
    steps,
    layers,
    limits: [
      "Illustrative scenario only: the Region of Waterloo's approved ION Stage 2 route runs mostly at street level. Nobody has proposed this tunnel.",
      "No geotechnical data: soil, rock and groundwater are unknown until boreholes are drilled. Glacial soils and high groundwater near the Speed River could change the method, the depth or whether a tunnel is practical at all.",
      "No utilities data: buried pipes, cables and the Highway 401 bridge and culvert foundations are not mapped here.",
      "Candidate sites are described by land use; ownership was not checked and no owner has been contacted.",
      "No property data: the scout does not know who owns each site or whether it is for sale or lease. Sites come from OpenStreetMap tags, which can be out of date.",
      "Distances are straight lines, not truck routes. Truck access is the distance to the nearest highway or main road.",
      `Ground levels are from a national elevation model (CDEM, about 20 m cells, rounded to 1 m). The river bed is assumed ${RULES.riverbedBelowSurfaceM} m below the water surface.`,
      `Durations, advance rate (${SPOIL.advanceMPerDay} m a day per machine), bulking (${SPOIL.bulking}) and truck size (${SPOIL.truckM3} m³) are typical assumptions, not a schedule. Cost is not estimated: tunnels usually cost several times more per kilometre than street-level track.`,
      "Near Preston the line follows the Speed River valley: the extraction shaft as placed would likely sit in the river's regulated floodplain, which could move it east, deepen the dewatering effort or change the method.",
      "A tunnel would change the Stage 2 project the Region assessed under the Transit Project Assessment Process, with its Environmental Project Report completed in 2021. A change that is inconsistent with that report needs an addendum under O. Reg. 231/08 s. 15 (1), and if significant a public notice of addendum with 30 days for written objections to the Minister (s. 15 (3) and (12)). That adds time and consultation the scenario does not count.",
      "Borehole spacing (every 75 m) is a planning assumption: FHWA's guide gives 15 to 30 m in adverse soft ground and 90 to 150 m in favourable ground, and a geotechnical engineer would set the real spacing.",
      "Stations: the scenario keeps Sportsworld and Preston stations where the Region placed them and does not design the portals or ramps that would connect the tunnel to them.",
      "Renders are illustrative pictures made by an image model. They show the kind of work, not a design.",
    ],
    references: [
      "Region of Waterloo, 2026 Plan and Budget (Budget Book), p. 43: project 68030 RT to Cambridge (ION Stage 2).",
      `Region of Waterloo Open Data, ION Routes and ION Stops (${ROW_ION_ROUTES}, ${ROW_ION_STOPS}). ${ROW_LICENCE}.`,
      "NFPA 130, Standard for Fixed Guideway Transit and Passenger Rail Systems (National Fire Protection Association): cross-passages between twin bores no more than 244 m (800 ft) apart, in place of exit stairs.",
      "FHWA-NHI-10-034, Technical Manual for Design and Construction of Road Tunnels: Civil Elements (US Federal Highway Administration, 2009), s. 3.5.2.1, p. 3-16: \"In general, borings should be extended to at least 1.5 tunnel diameters below the proposed tunnel invert\" and \"Borings at shafts should extend at least 1.5 times the depth of the shaft\". Its Table 3-4 (after AASHTO, 1988) gives typical spacing for soft-ground tunnels of 50 to 100 ft (15 to 30 m) in adverse ground and 300 to 500 ft (90 to 150 m) in favourable ground; the 75 m used here is a planning assumption between them.",
      NOISE_RULES.kitchener.source,
      NOISE_RULES.cambridge.source,
      "Ontario Regulation 231/08, Transit and Rail Project Assessment Process (Environmental Assessment Act), s. 15: a change after the statement of completion that is inconsistent with the environmental project report needs an addendum (s. 15 (1)); a significant change needs a public notice of addendum (s. 15 (3)), and the Minister considers written objections received within 30 days (s. 15 (12)).",
      "Region of Waterloo, Notice of Completion of Environmental Project Report, Stage 2 ION: LRT from Kitchener to Cambridge, Transit Project Assessment Process (30-day public review April 6 to May 6, 2021).",
      `Natural Resources Canada, Canadian Digital Elevation Model, altitude service (${CDEM_URL}). Open Government Licence – Canada.`,
      "OpenStreetMap contributors, via the Overpass API. Open Database Licence (ODbL) 1.0.",
      "Ontario Regulation 41/24 (Conservation Authorities Act): permits for development in regulated floodplains, administered here by the Grand River Conservation Authority.",
      "Typical light rail TBM diameter: Metrolinx's Eglinton Crosstown LRT tunnels were bored with machines about 6.5 m across.",
    ],
  };
  // Not in the shared type, but useful to the agents and the panel: the numbers behind the steps.
  (lens as ConstructionLens & { numbers: unknown }).numbers = {
    stage2LengthM: Math.round(stage2Len),
    sectionLengthM: layout.lengthM,
    boredLengthM: layout.boredM.to - layout.boredM.from,
    diameterM: RULES.diameterM,
    boreOffsetM: RULES.boreOffsetM,
    coverM: layout.cover,
    shafts: layout.shafts.map(({ id, chainageM, depthM, lengthM, widthM }) => ({ id, chainageM, depthM, lengthM, widthM })),
    crossings: crossings.map((c) => ({ name: c.name, kind: c.kind, chainageM: Math.round(c.chainageM) })),
    spoil: { ...sp, assumptions: SPOIL },
    rules: RULES,
  };
  return lens;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] ?? "row-2027-budget";
  const lens = await buildLens(id);
  const out = path.join(ROOT, "data/lenses", `construction-${id}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const text = JSON.stringify(lens);
  fs.writeFileSync(out, text + "\n");
  const n = (lens as any).numbers;
  console.log(`Wrote ${path.relative(ROOT, out)} (${(text.length / 1024).toFixed(0)} KB)`);
  console.log(`Section ${n.sectionLengthM} m (bored ${n.boredLengthM} m), cover ${n.coverM.minM}-${n.coverM.maxM} m, crossings`, n.crossings);
  console.log(`Sites: ${lens.sites.length}; launch ${lens.proposed.launch}, extraction ${lens.proposed.extraction}`);
  for (const s of lens.sites.slice(0, 8)) console.log(` ${s.score} ${s.role} ${s.name} ${(s.areaM2 / 1e4).toFixed(1)} ha, ${s.distanceToAlignmentM} m`);
  console.log(`Boreholes ${lens.boreholes.length}, cross-passages ${lens.crossPassages.length}, shafts`, n.shafts, "spoil", n.spoil.truckloads, "loads,", n.spoil.trucksPerDay, "/day");
  console.log(`Renders: ${lens.steps.filter((s) => s.render).length}/${lens.steps.length}`);
}
