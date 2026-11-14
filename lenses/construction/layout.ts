// Lay out a twin-bore tunnel along a section: bore lines, depth from a stated cover
// rule, cross-passages, geotechnical boreholes and the long-section profile.
// Every rule is stated in RULES with its reference; the maths is pure and tested.

import fs from "node:fs";
import path from "node:path";
import { chainages, offsetLine, pointAt, roundPt, sliceLine, type LngLat } from "./geo.ts";

export const RULES = {
  /** Outside diameter of the boring machine (and so of the bore), metres. */
  diameterM: 6.5,
  /** Each bore's centre sits this far either side of the line: 15 m centre to centre. */
  boreOffsetM: 7.5,
  /** Cover over the crown: 2 diameters along the route. */
  coverDiameters: 2,
  /** Under the highway: 2.5 diameters below the pavement. */
  highwayCoverDiameters: 2.5,
  /** Under the river: 2 diameters below the riverbed, assumed 3 m below the water the elevation model shows. */
  riverCoverDiameters: 2,
  riverbedBelowSurfaceM: 3,
  /** How far either side of a crossing its cover rule applies, metres. */
  crossingInfluenceM: 40,
  /** Steepest grade the bores may take (assumption for light rail in tunnel). */
  maxGrade: 0.04,
  /** NFPA 130: cross-passages no more than 244 m (800 ft) apart. */
  crossPassageMaxM: 244,
  /** Geotechnical boreholes along the line, metres apart. */
  boreholeSpacingM: 75,
  /** Boreholes go at least this many diameters below the invert (FHWA-NHI-10-034, ch. 3). */
  boreholeBelowInvertDiameters: 1.5,
  /** Ground elevation sample spacing, metres. */
  sampleM: 50,
  /** Shaft boxes (assumed): launch long enough to assemble the machine and its first gantries. */
  launchShaft: { lengthM: 45, widthM: 24 },
  extractionShaft: { lengthM: 22, widthM: 24 },
  /** Shaft floor below the invert (base slab and sump), metres. */
  shaftBelowInvertM: 2,
} as const;

// ---------------------------------------------------------------------------
// Ground elevations: Natural Resources Canada, Canadian Digital Elevation Model (CDEM)
// altitude service, cached on disk.

export const CDEM_URL = "https://geogratis.gc.ca/services/elevation/cdem/altitude";

export async function groundElevations(points: LngLat[], cacheFile: string): Promise<number[]> {
  let cache: Record<string, number> = {};
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {}
  const key = (p: LngLat) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const todo = points.filter((p) => cache[key(p)] === undefined);
  let dirty = false;
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (p) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await fetch(`${CDEM_URL}?lat=${p[1].toFixed(6)}&lon=${p[0].toFixed(6)}`, { headers: { "User-Agent": "municipal-agents-construction-scout/0.1" } });
            const d = (await r.json()) as { altitude: number | null };
            if (typeof d.altitude === "number") {
              cache[key(p)] = d.altitude;
              dirty = true;
              return;
            }
          } catch {}
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
        }
      }),
    );
  }
  if (dirty) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return points.map((p) => {
    const v = cache[key(p)];
    if (v === undefined) throw new Error(`No CDEM elevation for ${key(p)}`);
    return v;
  });
}

// ---------------------------------------------------------------------------
// Depth.

export interface Crossing {
  name: string; // "Highway 401", "Speed River"
  kind: "highway" | "river" | "rail" | "road";
  chainageM: number; // along the section
}

/** Required crown elevation at a chainage: ground minus the cover the rule asks for. */
export function requiredCrown(ch: number, ground: number, crossings: Crossing[], r = RULES): number {
  let cover = r.coverDiameters * r.diameterM;
  let top = ground;
  for (const c of crossings) {
    if (Math.abs(c.chainageM - ch) > r.crossingInfluenceM) continue;
    if (c.kind === "highway") cover = Math.max(cover, r.highwayCoverDiameters * r.diameterM);
    if (c.kind === "river") {
      top = Math.min(top, ground - r.riverbedBelowSurfaceM);
      cover = Math.max(cover, r.riverCoverDiameters * r.diameterM);
    }
  }
  return top - cover;
}

/**
 * The shallowest crown profile that is at or below every required crown and never
 * steeper than maxGrade: f(x) = min over j of (req_j + g·|x − x_j|).
 */
export function gradeLimitedCrown(xs: number[], req: number[], maxGrade: number): number[] {
  return xs.map((x) => {
    let best = Infinity;
    for (let j = 0; j < xs.length; j++) best = Math.min(best, req[j] + maxGrade * Math.abs(x - xs[j]));
    return best;
  });
}

// ---------------------------------------------------------------------------
// Cross-passages: evenly spaced, never more than the limit apart (shafts count as exits).

export function crossPassageChainages(lengthM: number, maxM = RULES.crossPassageMaxM): number[] {
  const n = Math.max(0, Math.ceil(lengthM / maxM) - 1);
  const step = lengthM / (n + 1);
  return Array.from({ length: n }, (_, i) => Math.round(step * (i + 1)));
}

/** Borehole chainages every `spacing` along the line, from the start to the end inclusive. */
export function boreholeChainages(lengthM: number, spacing = RULES.boreholeSpacingM): number[] {
  const n = Math.round(lengthM / spacing);
  const step = lengthM / n;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(step * i));
}

/** Borehole depth: down to the invert, then 1.5 diameters more, rounded up to the metre. */
export function boreholeDepth(groundM: number, invertM: number, r = RULES): number {
  return Math.ceil(groundM - invertM + r.boreholeBelowInvertDiameters * r.diameterM);
}

/** Interpolate y at x from sorted samples. */
export function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  return ys[ys.length - 1];
}

// ---------------------------------------------------------------------------

export interface LayoutInput {
  /** The tunnelled section, launch shaft first. */
  section: LngLat[];
  crossings: Crossing[];
  /** Ground elevation (m) for each sample chainage. */
  ground: (chainages: number[], points: LngLat[]) => Promise<number[]>;
}

export interface Layout {
  lengthM: number;
  samples: { chainageM: number; point: LngLat; groundM: number; crownM: number; invertM: number }[];
  bores: { id: string; label: string; line: LngLat[]; lengthM: number; depthM: { min: number; max: number } }[];
  crossPassages: { id: string; location: LngLat; chainageM: number }[];
  boreholes: { id: string; location: LngLat; chainageM: number; depthM: number; purpose: string }[];
  profile: { chainageM: number; groundM: number; crownM: number; invertM: number; feature?: string }[];
  /** Bored length (between the shafts' inner walls) and where the bores start and stop. */
  boredM: { from: number; to: number };
  shafts: { id: "launch" | "extraction"; chainageM: number; point: LngLat; bearing: number; depthM: number; lengthM: number; widthM: number }[];
  cover: { minM: number; maxM: number };
}

export async function layoutTunnel(input: LayoutInput, r = RULES): Promise<Layout> {
  const { section, crossings } = input;
  const ch = chainages(section);
  const L = ch[ch.length - 1];
  // Samples every 50 m plus each crossing and the far end.
  const xsSet = new Set<number>();
  for (let x = 0; x < L; x += r.sampleM) xsSet.add(Math.round(x));
  xsSet.add(Math.round(L));
  for (const c of crossings) xsSet.add(Math.round(c.chainageM));
  const xs = [...xsSet].sort((a, b) => a - b);
  const pts = xs.map((x) => pointAt(section, x).point);
  const ground = await input.ground(xs, pts);
  const req = xs.map((x, i) => requiredCrown(x, ground[i], crossings, r));
  const crown = gradeLimitedCrown(xs, req, r.maxGrade);
  const invert = crown.map((c) => c - r.diameterM);
  const samples = xs.map((x, i) => ({ chainageM: x, point: roundPt(pts[i]), groundM: ground[i], crownM: +crown[i].toFixed(2), invertM: +invert[i].toFixed(2) }));
  const covers = samples.map((s) => s.groundM - s.crownM);
  const depths = samples.map((s) => s.groundM - s.invertM);

  // The launch shaft spans chainage 0 to its length; the machines start at its far wall
  // and stop at the extraction shaft's near wall. Bored length excludes both boxes.
  const a = r.launchShaft.lengthM, b = L - r.extractionShaft.lengthM;
  const bored = sliceLine(section, a, b);
  const left = offsetLine(bored, -r.boreOffsetM);
  const right = offsetLine(bored, r.boreOffsetM);
  const depth = { min: +Math.min(...depths).toFixed(1), max: +Math.max(...depths).toFixed(1) };
  const boredLen = Math.round(b - a);
  const bores = [
    { id: "bore-north", label: "Northbound bore (left of the line, heading east)", line: left.map((p) => roundPt(p)), lengthM: boredLen, depthM: depth },
    { id: "bore-south", label: "Southbound bore (right of the line, heading east)", line: right.map((p) => roundPt(p)), lengthM: boredLen, depthM: depth },
  ];

  const crossPassages = crossPassageChainages(b - a, r.crossPassageMaxM).map((c, i) => ({ id: `cp-${i + 1}`, location: roundPt(pointAt(section, a + c).point), chainageM: Math.round(a + c) }));

  const at = (x: number) => ({ g: interp(xs, ground, x), inv: interp(xs, invert, x) });
  const boreholes: Layout["boreholes"] = [];
  const add = (x: number, purpose: string, sideM = 0) => {
    const xc = Math.max(0, Math.min(L, x));
    const p = sideM ? pointAt(offsetLine(section, sideM), xc).point : pointAt(section, xc).point;
    const { g, inv } = at(xc);
    boreholes.push({ id: "", location: roundPt(p), chainageM: Math.round(xc), depthM: boreholeDepth(g, inv, r), purpose });
  };
  for (const x of boreholeChainages(b - a, r.boreholeSpacingM)) add(a + x, "Along the line, between the two bores, every 75 m");

  const shaftDepth = (x: number) => Math.ceil(interp(xs, ground, x) - interp(xs, invert, x) + r.shaftBelowInvertM);
  const c0 = pointAt(section, a / 2), c1 = pointAt(section, (b + L) / 2);
  const shafts: Layout["shafts"] = [
    { id: "launch", chainageM: Math.round(a / 2), point: roundPt(c0.point), bearing: c0.bearing, depthM: shaftDepth(a / 2), ...r.launchShaft },
    { id: "extraction", chainageM: Math.round((b + L) / 2), point: roundPt(c1.point), bearing: c1.bearing, depthM: shaftDepth((b + L) / 2), ...r.extractionShaft },
  ];
  // Each shaft: three holes, at two opposite corners and the middle of the box.
  for (const s of shafts) {
    const name = s.id === "launch" ? "Launch shaft" : "Extraction shaft";
    const half = s.lengthM / 2 - 3;
    add(s.chainageM - half, `${name}, corner`, -(s.widthM / 2 - 2));
    add(s.chainageM, `${name}, centre`);
    add(s.chainageM + half, `${name}, corner`, s.widthM / 2 - 2);
  }
  for (const c of crossings) {
    add(c.chainageM - 30, `${c.name} crossing, west side`, -r.boreOffsetM * 2);
    add(c.chainageM + 30, `${c.name} crossing, east side`, r.boreOffsetM * 2);
  }
  boreholes.sort((p, q) => p.chainageM - q.chainageM);
  boreholes.forEach((h, i) => (h.id = `bh-${i + 1}`));

  const profile: Layout["profile"] = samples.map((s) => ({ chainageM: s.chainageM, groundM: s.groundM, crownM: s.crownM, invertM: s.invertM }));
  const nearest = (x: number) => profile.reduce((best, q) => (Math.abs(q.chainageM - x) < Math.abs(best.chainageM - x) ? q : best), profile[0]);
  nearest(shafts[0].chainageM).feature = "Launch shaft";
  nearest(shafts[1].chainageM).feature = "Extraction shaft";
  for (const c of crossings) {
    const p = profile.find((q) => q.chainageM === Math.round(c.chainageM));
    if (p) p.feature = c.name;
  }

  return {
    lengthM: Math.round(L),
    samples,
    bores,
    crossPassages,
    boreholes,
    profile,
    boredM: { from: a, to: Math.round(b) },
    shafts,
    cover: { minM: +Math.min(...covers).toFixed(1), maxM: +Math.max(...covers).toFixed(1) },
  };
}

export { sliceLine };
