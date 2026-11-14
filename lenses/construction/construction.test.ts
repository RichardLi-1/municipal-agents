import test from "node:test";
import assert from "node:assert/strict";
import { distM, offsetLine, polygonAreaM2, projectOnLine, rectangle, ringAreaM2, sliceLine, lineLengthM, type LngLat } from "./geo.ts";
import { areaFit, candidateUse, factorsFor, isExcluded, receptorKind, scoreOf, scoutSites, WEIGHTS, type Feature } from "./scout.ts";
import { boreholeChainages, boreholeDepth, crossPassageChainages, gradeLimitedCrown, layoutTunnel, requiredCrown, RULES, shaftBoreholeDepth } from "./layout.ts";
import { boreVolumeM3, spoilPlan } from "./steps.ts";
import { constructionSummary } from "./index.ts";
import { chainSegments } from "./build.ts";

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// A point near Preston, and steps of ~100 m east and north at that latitude.
const O: LngLat = [-80.38, 43.4];
const dLng = 100 / (111195 * Math.cos((43.4 * Math.PI) / 180));
const dLat = 100 / 111195;
const at = (x: number, y: number): LngLat => [O[0] + x * dLng, O[1] + y * dLat]; // x, y in hundreds of metres

test("distance: 100 m east and north are 100 m", () => {
  near(distM(O, at(1, 0)), 100, 0.2);
  near(distM(O, at(0, 1)), 100, 0.2);
  near(distM(O, at(3, 4)), 500, 1);
});

test("area: a 100 m square is one hectare; holes are subtracted", () => {
  const sq = [at(0, 0), at(1, 0), at(1, 1), at(0, 1), at(0, 0)];
  near(ringAreaM2(sq), 10000, 20);
  const hole = [at(0.25, 0.25), at(0.75, 0.25), at(0.75, 0.75), at(0.25, 0.75), at(0.25, 0.25)];
  near(polygonAreaM2([sq, hole]), 7500, 20);
  near(ringAreaM2(rectangle(O, 30, 45, 24)), 45 * 24, 3);
});

test("projection: chainage and offset along a line", () => {
  const line = [at(0, 0), at(10, 0)];
  const p = projectOnLine(at(4, 0.5), line);
  near(p.chainageM, 400, 1);
  near(p.distanceM, 50, 0.5);
  near(lineLengthM(sliceLine(line, 200, 700)), 500, 1);
  const left = offsetLine(line, -7.5); // heading east, left is north
  near(projectOnLine(left[0], line).distanceM, 7.5, 0.05);
  assert.ok(left[0][1] > O[1]);
});

test("chaining segments joins them end to end in order, flipping as needed", () => {
  const a = [at(0, 0), at(1, 0)], b = [at(2, 0), at(1, 0)], c = [at(2, 0), at(3, 0)];
  const line = chainSegments([c, a, b], at(0, 0));
  assert.equal(line.length, 4);
  near(lineLengthM(line), 300, 1);
});

test("classification: parking and brownfield are candidates; underground parking, parks and schools are not", () => {
  assert.equal(candidateUse({ amenity: "parking" }), "parking");
  assert.equal(candidateUse({ amenity: "parking", parking: "underground" }), null);
  assert.equal(candidateUse({ amenity: "parking", parking: "multi-storey" }), null);
  assert.equal(candidateUse({ landuse: "brownfield" }), "brownfield");
  assert.equal(candidateUse({ landuse: "construction" }), null);
  assert.equal(candidateUse({ leisure: "park" }), null);
  assert.ok(isExcluded({ leisure: "park" }) && isExcluded({ amenity: "school" }) && isExcluded({ landuse: "cemetery" }) && isExcluded({ natural: "wetland" }));
  assert.equal(receptorKind({ amenity: "nursing_home" }), "care home");
  assert.equal(receptorKind({ building: "house" }), "homes");
  assert.equal(receptorKind({ waterway: "river" }), "river or wetland");
});

test("scoring: weights sum to 100, factors ramp as stated", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.equal(areaFit("launch-shaft", 15000), 1);
  assert.equal(areaFit("launch-shaft", 4000), 0);
  near(areaFit("launch-shaft", 9500), 0.5, 0.001);
  assert.equal(scoreOf(factorsFor("launch-shaft", "brownfield", 20000, 0, 1000, 0)), 100);
  assert.equal(scoreOf(factorsFor("launch-shaft", "retail", 1000, 1000, 0, 5000)), Math.round(WEIGHTS.landUse * 0.35));
  const near_ = scoreOf(factorsFor("launch-shaft", "parking", 15000, 10, 300, 50));
  const far = scoreOf(factorsFor("launch-shaft", "parking", 15000, 300, 300, 50));
  assert.ok(near_ > far);
});

test("scouting ranks a big empty lot by the line above a small one far away, and drops one inside a park", () => {
  const line = [at(0, 0), at(30, 0)];
  const box = (x: number, y: number, w: number, h: number): number[][] => [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h), at(x, y)];
  const features: Feature[] = [
    { id: "way/1", tags: { amenity: "parking" }, rings: [box(1, 0.2, 1.5, 1)] }, // 1.5 ha, 20 m from the line
    { id: "way/2", tags: { amenity: "parking" }, rings: [box(2, 3, 0.5, 0.5)] }, // 0.25 ha, 300 m away
    { id: "way/3", tags: { amenity: "parking" }, rings: [box(5, 0.5, 0.5, 0.5)] },
    { id: "way/4", tags: { leisure: "park" }, rings: [box(4.5, 0, 2, 2)] },
    { id: "way/5", tags: { highway: "primary", name: "King Street East" }, line: [at(0, -0.3), at(30, -0.3)] },
  ];
  const { sites } = scoutSites({ line, sectionM: [100, 2900], features });
  assert.equal(sites[0].id, "site-way-1");
  assert.equal(sites[0].role, "launch-shaft");
  assert.ok(!sites.some((s) => s.id === "site-way-3"), "a lot inside a park is excluded");
  assert.ok(sites[0].score > (sites.find((s) => s.id === "site-way-2")?.score ?? 0));
  assert.ok(sites[0].reasons.length && sites[0].concerns.length);
  near(sites[0].areaM2, 15000, 50);
});

test("cross-passages are never more than 244 m apart (NFPA 130)", () => {
  for (const L of [100, 244, 245, 1000, 2828]) {
    const cps = crossPassageChainages(L);
    const gaps = [0, ...cps, L].slice(1).map((x, i, arr) => x - (i === 0 ? 0 : arr[i - 1]));
    assert.ok(Math.max(...gaps) <= 244 + 1, `max gap ${Math.max(...gaps)} for ${L}`);
  }
  assert.equal(crossPassageChainages(2828).length, 11);
  assert.equal(crossPassageChainages(200).length, 0);
});

test("boreholes: every ~75 m, and 1.5 diameters below the invert", () => {
  const b = boreholeChainages(3000);
  assert.equal(b[0], 0);
  assert.equal(b[b.length - 1], 3000);
  near(b[1] - b[0], 75, 1);
  assert.equal(boreholeDepth(300, 280), Math.ceil(20 + 1.5 * RULES.diameterM));
  // At a shaft: at least 1.5 times the shaft depth (FHWA-NHI-10-034 s. 3.5.2.1).
  assert.equal(shaftBoreholeDepth(300, 280, 22), 33);
  assert.equal(shaftBoreholeDepth(300, 260, 10), boreholeDepth(300, 260));
});

test("depth: cover rule and grade-limited profile", () => {
  near(requiredCrown(0, 300, []), 300 - 2 * RULES.diameterM, 1e-9);
  near(requiredCrown(100, 300, [{ name: "Highway 401", kind: "highway", chainageM: 110 }]), 300 - 2.5 * RULES.diameterM, 1e-9);
  near(requiredCrown(100, 270, [{ name: "Speed River", kind: "river", chainageM: 100 }]), 270 - 3 - 2 * RULES.diameterM, 1e-9);
  const xs = [0, 100, 200, 300, 400];
  const req = [290, 290, 270, 290, 290];
  const crown = gradeLimitedCrown(xs, req, 0.04);
  crown.forEach((c, i) => assert.ok(c <= req[i] + 1e-9));
  for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(crown[i] - crown[i - 1]) / 100 <= 0.04 + 1e-9);
  assert.deepEqual(crown, [278, 274, 270, 274, 278]); // rises at 4% either side of the deep point
});

test("layout: flat ground gives two bores, cross-passages and boreholes", async () => {
  const section = [at(0, 0), at(20, 0)];
  const lay = await layoutTunnel({ section, crossings: [], ground: async (xs) => xs.map(() => 300) });
  assert.equal(lay.bores.length, 2);
  assert.equal(lay.lengthM, 2000);
  near(lay.cover.minM, 13, 0.01);
  assert.ok(lay.crossPassages.length >= Math.ceil((2000 - 67) / 244) - 1);
  assert.ok(lay.boreholes.length >= Math.round((2000 - 67) / 75) + 1 + 6);
  assert.equal(lay.shafts[0].depthM, Math.ceil(13 + 6.5 + 2));
});

test("spoil: bore volume, bulking and trucks per day", () => {
  near(boreVolumeM3(1000, 6.5), Math.PI * 3.25 ** 2 * 1000, 1e-6);
  const sp = spoilPlan(1000, 6.5);
  near(sp.inSituM3, 2 * Math.PI * 3.25 ** 2 * 1000, 1);
  near(sp.looseM3, sp.inSituM3 * 1.3, 1);
  near(sp.truckloads, sp.looseM3 / 10, 1);
  near(sp.trucksPerDay, (Math.PI * 3.25 ** 2 * 12 * 2 * 1.3) / 10, 0.5);
});

test("the agent summary always leads with the scenario label", () => {
  const lens = {
    decisionId: "x",
    scenario: { title: "T", label: "Illustrative scenario: not a Region plan", basis: "B" },
    method: "tbm-twin-bore",
    alignment: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
    alignmentSource: "S",
    sites: [],
    proposed: { launch: "", extraction: "" },
    weights: [{ label: "Area", weight: 100 }],
    bores: [],
    crossPassages: [],
    boreholes: [{ id: "bh-1", location: O, chainageM: 0, depthM: 30, purpose: "p" }],
    profile: [],
    steps: [],
    layers: {},
    limits: ["L"],
    references: ["R"],
  } as any;
  const t = constructionSummary(lens);
  assert.ok(t.startsWith("ILLUSTRATIVE SCENARIO: NOT A REGION PLAN."));
  assert.match(t, /people decide; none is chosen/);
});
