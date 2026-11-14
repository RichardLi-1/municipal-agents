// Build a TransitLens: travel times from homes to essential destinations by transit and walking,
// service gaps at stops, first/last-mile gaps, and ranked fixes with their trade-offs.

import type { TransitLens } from "../../shared/types.ts";
import type { Feed, Day, StopSet } from "./gtfs.ts";
import { buildStops, buildDay } from "./gtfs.ts";
import { buildFootpaths, earliestArrival, makeScratch, walkSecs, INF, DEFAULT_WALK } from "./csa.ts";
import type { WalkModel, Footpaths } from "./csa.ts";
import { firstLast, stopHeadwayMin, routeHeadwaysMin, routeSpan } from "./service.ts";
import { distM, inPolygon, bboxOf, pointIndex, round5, roundPt, squareAround } from "./geo.ts";
import type { LngLat, AreaMask } from "./geo.ts";
import { hhmm } from "./csv.ts";

export interface Scenario {
  id: string; // "weekday-0800"
  short: string; // "w8", used in layer property keys
  label: string; // "Weekday 8 am"
  date: string; // service date "2026-11-17"
  dayLabel: string; // "Tuesday 17 November 2026"
  time: number; // seconds after midnight of the service day
}

export interface Destination {
  type: string;
  name: string;
  osm: string;
  p: LngLat;
}

export interface Origin {
  id: string;
  p: LngLat;
  pop: number;
  cell?: [number, number]; // grid indices for 400 m cells; absent for rural area centroids
}

export interface DAInput {
  dauid: string;
  pop: number;
  areaKm2: number;
  centroid: LngLat;
  polys: number[][][][];
}

export interface LensOptions {
  feeds: Feed[];
  feedInfo: TransitLens["feed"];
  scenarios: Scenario[];
  destinations: Destination[];
  destTypes: { id: string; label: string }[];
  origins: Origin[];
  area: AreaMask;
  cellM: number;
  minutesLimit?: number; // 45
  maxMinutes?: number; // 90: times beyond this count as "not reachable"
  departureOffsetsMin?: number[]; // [0, 5, ..., 25]
  walk?: WalkModel;
  sources: { population: string; destinations: string; gtfs: string };
  /** The agency's name for plain text ("Grand River Transit"); from the feed's agency.txt. */
  agency?: string;
  /** Mean latitude of the area, for grid maths (default: the area's middle). */
  lat0?: number;
  /** A place the decision is about (e.g. a new hub): who in the whole population can reach it. */
  focus?: { label: string; p: LngLat };
  log?: (msg: string) => void;
}

/**
 * Split the census population over a regular grid: each built-up dissemination area's people
 * are shared equally among the grid points inside it; a sparsely settled area (rural) keeps one
 * origin at its centroid. A small area with no grid point inside gives its people to the cell
 * holding its centroid.
 */
export function buildOrigins(das: DAInput[], cellM: number, lat0 = Math.round((das.reduce((s, d) => s + d.centroid[1], 0) / Math.max(1, das.length)) * 20) / 20): Origin[] {
  const dLat = cellM / 111_320;
  const dLng = cellM / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  const cells = new Map<string, Origin>();
  const out: Origin[] = [];
  const addCell = (ix: number, iy: number, pop: number) => {
    const k = `${ix},${iy}`;
    let c = cells.get(k);
    if (!c) {
      c = { id: `c${ix}_${iy}`, p: [(ix + 0.5) * dLng, (iy + 0.5) * dLat], pop: 0, cell: [ix, iy] };
      cells.set(k, c);
    }
    c.pop += pop;
  };
  for (const da of das) {
    if (da.pop <= 0) continue;
    const rural = da.areaKm2 > 2 && da.pop / da.areaKm2 < 150;
    if (rural) {
      out.push({ id: `da${da.dauid}`, p: da.centroid, pop: da.pop });
      continue;
    }
    const hits: [number, number][] = [];
    for (const poly of da.polys) {
      const b = bboxOf([poly]);
      for (let ix = Math.floor(b[0] / dLng); ix <= Math.floor(b[2] / dLng); ix++)
        for (let iy = Math.floor(b[1] / dLat); iy <= Math.floor(b[3] / dLat); iy++) {
          const p: LngLat = [(ix + 0.5) * dLng, (iy + 0.5) * dLat];
          if (inPolygon(p, poly)) hits.push([ix, iy]);
        }
    }
    if (!hits.length) hits.push([Math.floor(da.centroid[0] / dLng), Math.floor(da.centroid[1] / dLat)]);
    for (const [ix, iy] of hits) addCell(ix, iy, da.pop / hits.length);
  }
  return [...cells.values(), ...out];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-CA");
/** Seconds after midnight -> "6:45 am", "12:10 am (after midnight)". */
export function clock(secs: number): string {
  if (secs < 0) return "none";
  const h24 = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  const h = h24 % 24;
  const t = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return h24 >= 24 ? `${t} (after midnight)` : t;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const min = (s: number) => Math.round(s / 60);

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return INF;
  if (n % 2) return a[(n - 1) / 2];
  const lo = a[n / 2 - 1], hi = a[n / 2];
  return hi >= INF ? INF : (lo + hi) / 2;
}

/** Group origins into blocks of about 2 km (5 x 5 cells of 400 m) so hot spots can be named. */
function blocks(origins: Origin[], idx: number[], cellM: number, lat0: number): number[][] {
  const k = Math.max(1, Math.round(2000 / cellM));
  const dLat = cellM / 111_320;
  const dLng = cellM / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  const groups = new Map<string, number[]>();
  for (const i of idx) {
    const x = origins[i];
    const cx = x.cell ? x.cell[0] : Math.floor(x.p[0] / dLng);
    const cy = x.cell ? x.cell[1] : Math.floor(x.p[1] / dLat);
    const key = `${Math.floor(cx / k)},${Math.floor(cy / k)}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  return [...groups.values()];
}

/** Groups of neighbouring grid cells (8-neighbour); rural origins are their own group. */
export function clusters(origins: Origin[], idx: number[]): number[][] {
  const byCell = new Map<string, number>();
  for (const i of idx) if (origins[i].cell) byCell.set(origins[i].cell!.join(","), i);
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const i of idx) {
    if (seen.has(i)) continue;
    seen.add(i);
    const g = [i];
    if (origins[i].cell) {
      for (let k = 0; k < g.length; k++) {
        const [x, y] = origins[g[k]].cell!;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const j = byCell.get(`${x + dx},${y + dy}`);
            if (j !== undefined && !seen.has(j)) { seen.add(j); g.push(j); }
          }
      }
    }
    groups.push(g);
  }
  return groups;
}

export function buildTransitLens(o: LensOptions): TransitLens & Record<string, unknown> {
  const log = o.log ?? (() => {});
  const walk = o.walk ?? DEFAULT_WALK;
  const LIMIT = (o.minutesLimit ?? 45) * 60;
  const MAX = (o.maxMinutes ?? 90) * 60;
  const offsets = (o.departureOffsetsMin ?? [0, 5, 10, 15, 20, 25]).map((m) => m * 60);
  const set: StopSet = buildStops(o.feeds);
  const stopPts: LngLat[] = set.stops.map((s) => [s.lng, s.lat]);
  const stopIdx = pointIndex(stopPts);
  const fp: Footpaths = buildFootpaths(set.stops, walk, stopIdx.near);

  // Origins in the area, with the stops (and destinations) within walking range.
  const origins = o.origins.filter((x) => o.area.contains(x.p));
  const totalPop = origins.reduce((s, x) => s + x.pop, 0);
  const originStops = origins.map((x) => stopIdx.near(x.p, walk.accessM).map((s) => ({ s, w: walkSecs(distM(x.p, stopPts[s]), walk) })));
  const destIdx = pointIndex(o.destinations.map((d) => d.p));
  const originDests = origins.map((x) => destIdx.near(x.p, walk.accessM).map((d) => ({ d, w: walkSecs(distM(x.p, o.destinations[d].p), walk) })));
  const destStops = o.destinations.map((d) => stopIdx.near(d.p, walk.accessM).map((s) => ({ s, w: walkSecs(distM(d.p, stopPts[s]), walk) })));
  const types = o.destTypes.map((t) => t.id);
  const typeOf = o.destinations.map((d) => types.indexOf(d.type));
  log(`${origins.length} origins (${fmt(totalPop)} people), ${set.stops.length} stops, ${o.destinations.length} destinations`);

  // Days and service levels.
  const days = new Map<string, Day>();
  for (const sc of o.scenarios) if (!days.has(sc.date)) days.set(sc.date, buildDay(o.feeds, set, sc.date));
  const routeName = (r: number) => {
    const rt = set.routes[r];
    return rt ? `${rt.shortName} ${rt.longName}`.trim() : "?";
  };

  // ---- Access by scenario (CSA from every origin, several departures, median travel time) ----
  const nO = origins.length, nT = types.length, nD = o.destinations.length;
  const minutes: Record<string, Float32Array> = {}; // scenario -> [origin * nT + type] minutes (Infinity = not within MAX)
  const destPeople: Record<string, Float64Array> = {}; // scenario -> people reaching each destination within LIMIT
  for (const sc of o.scenarios) {
    const day = days.get(sc.date)!;
    const scratch = makeScratch(set.stops.length, day.nTrips);
    const m = new Float32Array(nO * nT).fill(Infinity);
    const dp = new Float64Array(nD);
    const perDep = offsets.map(() => new Int32Array(nD));
    const t0 = Date.now();
    for (let i = 0; i < nO; i++) {
      for (let k = 0; k < offsets.length; k++) {
        const dep = sc.time + offsets[k];
        const best = perDep[k];
        best.fill(INF);
        if (originStops[i].length) {
          const arr = earliestArrival(day, fp, originStops[i].map(({ s, w }) => ({ stop: s, time: dep + w })), dep + MAX, walk, scratch);
          for (let d = 0; d < nD; d++) {
            let b = INF;
            for (const { s, w } of destStops[d]) {
              const a = arr[s];
              if (a < INF && a + w < b) b = a + w;
            }
            best[d] = b;
          }
        }
        for (const { d, w } of originDests[i]) if (dep + w < best[d]) best[d] = dep + w;
        for (let d = 0; d < nD; d++) best[d] = best[d] >= INF ? INF : best[d] - dep;
      }
      for (let d = 0; d < nD; d++) {
        const med = median(perDep.map((b) => b[d]));
        if (med <= LIMIT) dp[d] += origins[i].pop;
        const t = typeOf[d];
        if (t >= 0 && med <= MAX && med / 60 < m[i * nT + t]) m[i * nT + t] = med / 60;
      }
    }
    minutes[sc.id] = m;
    destPeople[sc.id] = dp;
    log(`${sc.id}: ${nO} origins x ${offsets.length} departures in ${Date.now() - t0} ms`);
  }

  // ---- Reach of the focus place from every origin (the whole population, not only the area) ----
  let focus: { label: string; point: LngLat; reach: { scenario: string; minutes: number; people: number; share: number }[]; note: string } | undefined;
  if (o.focus) {
    const fpStops = stopIdx.near(o.focus.p, walk.accessM).map((s) => ({ s, w: walkSecs(distM(o.focus!.p, stopPts[s]), walk) }));
    const all = o.origins;
    const allPop = all.reduce((s, x) => s + x.pop, 0);
    const reach: { scenario: string; minutes: number; people: number; share: number }[] = [];
    for (const sc of o.scenarios) {
      const day = days.get(sc.date)!;
      const scratch = makeScratch(set.stops.length, day.nTrips);
      const within = new Map<number, number>([[30, 0], [45, 0], [60, 0]]);
      for (const x of all) {
        const near = stopIdx.near(x.p, walk.accessM).map((s) => ({ s, w: walkSecs(distM(x.p, stopPts[s]), walk) }));
        const direct = distM(x.p, o.focus.p) <= walk.accessM ? walkSecs(distM(x.p, o.focus.p), walk) : INF;
        const times = offsets.map((off) => {
          const dep = sc.time + off;
          let best = direct;
          if (near.length) {
            const arr = earliestArrival(day, fp, near.map(({ s, w }) => ({ stop: s, time: dep + w })), dep + MAX, walk, scratch);
            for (const { s, w } of fpStops) if (arr[s] < INF && arr[s] + w - dep < best) best = arr[s] + w - dep;
          }
          return best;
        });
        const med = median(times);
        for (const m of within.keys()) if (med <= m * 60) within.set(m, within.get(m)! + x.pop);
      }
      for (const [m, p] of within) reach.push({ scenario: sc.id, minutes: m, people: Math.round(p), share: Math.round((p / allPop) * 1000) / 1000 });
    }
    focus = { label: o.focus.label, point: roundPt(o.focus.p), reach, note: `People in the whole region (${fmt(allPop)}, 2021 census) who can reach this place by today's transit and walking within each time, median over departures every 5 minutes for half an hour.` };
    log(`focus: ${reach.map((r) => `${r.scenario} ${r.minutes} min ${fmt(r.people)}`).join("; ")}`);
  }

  const access: (TransitLens["access"][number] & { peopleReached: number; peopleCounted: number })[] = [];
  for (const sc of o.scenarios)
    types.forEach((t, ti) => {
      let reached = 0;
      for (let i = 0; i < nO; i++) if (minutes[sc.id][i * nT + ti] <= LIMIT / 60) reached += origins[i].pop;
      access.push({ scenario: sc.id, destinationType: t, minutesLimit: LIMIT / 60, shareReached: totalPop ? Math.round((reached / totalPop) * 1000) / 1000 : 0, originsCounted: nO, peopleReached: Math.round(reached), peopleCounted: Math.round(totalPop) });
    });

  // ---- Stop service levels ----
  const nearAreaStop = set.stops.map((s) => o.area.contains([s.lng, s.lat]) || originsNear(s));
  function originsNear(s: { lng: number; lat: number }): boolean {
    const b = o.area.bbox;
    const m = 0.01;
    return s.lng > b[0] - m && s.lng < b[2] + m && s.lat > b[1] - m && s.lat < b[3] + m && origins.some((x) => distM(x.p, [s.lng, s.lat]) <= walk.accessM);
  }
  const weekday = o.scenarios.find((s) => s.id.startsWith("weekday"))!;
  const sunday = o.scenarios.find((s) => s.id.startsWith("sunday"));
  const dayStats = (sc: Scenario) => {
    const day = days.get(sc.date)!;
    return set.stops.map((_, s) => ({ ...firstLast(day, s), h: stopHeadwayMin(day, s, sc.time) }));
  };
  const statsBy: Record<string, { first: number; last: number; h: number }[]> = {};
  for (const sc of o.scenarios) statsBy[sc.id] = dayStats(sc);
  const stopRoutes = set.stops.map(() => new Set<number>());
  for (const day of days.values())
    day.stopDeps.forEach((d, s) => d.route.forEach((r) => stopRoutes[s].add(r)));

  // People near stops meeting a condition (within the access radius of at least one such stop).
  const peopleNear = (ok: (s: number) => boolean) => {
    const hit: number[] = [];
    for (let i = 0; i < nO; i++) if (originStops[i].some(({ s }) => ok(s))) hit.push(i);
    return hit;
  };
  const popOf = (idx: number[]) => idx.reduce((s, i) => s + origins[i].pop, 0);
  const complement = (idx: number[]) => {
    const h = new Set(idx);
    const out: number[] = [];
    for (let i = 0; i < nO; i++) if (!h.has(i)) out.push(i);
    return out;
  };
  const describeGroup = (g: number[]) => {
    const pop = popOf(g);
    const c: LngLat = [0, 0];
    for (const i of g) { c[0] += origins[i].p[0] * origins[i].pop; c[1] += origins[i].p[1] * origins[i].pop; }
    if (pop > 0) { c[0] /= pop; c[1] /= pop; } else { c[0] = origins[g[0]].p[0]; c[1] = origins[g[0]].p[1]; }
    const near = stopIdx.near(c, 3000).sort((a, b) => distM(c, stopPts[a]) - distM(c, stopPts[b]))[0];
    let where = `at ${round5(c[1])}, ${round5(c[0])}`;
    if (near !== undefined && distM(c, stopPts[near]) <= 1500) where = `around ${set.stops[near].name}`;
    else {
      const named = destIdx.near(c, 5000).filter((d) => o.destinations[d].name).sort((a, b) => distM(c, o.destinations[a].p) - distM(c, o.destinations[b].p))[0];
      if (named !== undefined) where = `near ${o.destinations[named].name}`;
      else if (near !== undefined) where = `around ${set.stops[near].name}`;
    }
    return { pop, c: roundPt(c), where, distToStop: near !== undefined ? Math.round(distM(c, stopPts[near])) : null };
  };
  const lat0 = o.lat0 ?? (o.area.bbox[1] + o.area.bbox[3]) / 2;
  const topGroups = (idx: number[], n: number) => blocks(origins, idx, o.cellM, lat0).map(describeGroup).sort((a, b) => b.pop - a.pop).slice(0, n);

  type Gap = TransitLens["gaps"][number] & { share?: number };
  const gaps: Gap[] = [];
  const gapPoints: GeoJSON.Feature[] = [];
  const addGap = (g: Gap, groups: ReturnType<typeof describeGroup>[]) => {
    if (!g.peopleAffected) return; // nothing to report here
    gaps.push(g);
    for (const gr of groups) gapPoints.push({ type: "Feature", properties: { gap: g.id, kind: g.kind, people: Math.round(gr.pop), where: gr.where }, geometry: { type: "Point", coordinates: gr.c } });
  };

  // No stop at all within walking range.
  const anyStop = peopleNear((s) => stopRoutes[s].size > 0);
  const noStop = complement(anyStop);
  if (popOf(noStop) > 0) {
    const groups = topGroups(noStop, 5);
    addGap({
      id: "no-stop-nearby",
      kind: "no-service",
      title: `${fmt(popOf(noStop))} people (${pct(popOf(noStop) / totalPop)}) live more than 800 m from any transit stop`,
      detail: `Largest groups: ${groups.map((g) => `${g.where} (${fmt(g.pop)} people)`).join("; ")}. Distances are straight-line from 400 m grid cells; rural areas count from their census area's centre.`,
      peopleAffected: Math.round(popOf(noStop)),
      location: groups[0]?.c,
      share: popOf(noStop) / totalPop,
    }, groups);
  }

  // First/last mile: no frequent stop within 800 m at the weekday morning peak.
  const frequent = (h: number) => peopleNear((s) => statsBy[weekday.id][s].h <= h);
  const freq15 = frequent(15), freq10 = frequent(10);
  const notFreq15 = complement(freq15);
  {
    const groups = topGroups(notFreq15, 5);
    addGap({
      id: "first-last-mile",
      kind: "first-last-mile",
      scenario: weekday.id,
      title: `${fmt(popOf(notFreq15))} people (${pct(popOf(notFreq15) / totalPop)}) live more than 800 m from a stop with a bus or train every 15 minutes at the weekday morning peak`,
      detail: `${fmt(popOf(freq15))} people live within 800 m of a stop with service every 15 minutes or better at ${clock(weekday.time)} on ${weekday.dayLabel}, and ${fmt(popOf(freq10))} within 800 m of service every 10 minutes or better (all routes at a stop counted together). Largest groups without it: ${groups.map((g) => `${g.where} (${fmt(g.pop)})`).join("; ")}.`,
      peopleAffected: Math.round(popOf(notFreq15)),
      location: groups[0]?.c,
      share: popOf(notFreq15) / totalPop,
    }, groups);
  }

  // Late start and early end, weekday and Sunday.
  const spanGap = (sc: Scenario, which: "late-start" | "early-end") => {
    const st = statsBy[sc.id];
    const okStop = (s: number) => (which === "late-start" ? st[s].first >= 0 && st[s].first <= 6.5 * 3600 : st[s].last >= 23 * 3600);
    const servedNear = peopleNear((s) => st[s].first >= 0);
    const ok = new Set(peopleNear(okStop));
    const affected = servedNear.filter((i) => !ok.has(i));
    const badStops = set.stops.map((_, s) => s).filter((s) => nearAreaStop[s] && st[s].first >= 0 && !okStop(s));
    if (!affected.length) return;
    const day = days.get(sc.date)!;
    const span = routeSpan(day);
    const routesBad = [...span.entries()]
      .filter(([r, v]) => (which === "late-start" ? v.first > 6.5 * 3600 : v.last < 23 * 3600) && badStops.some((s) => stopRoutes[s].has(r)))
      .sort((a, b) => (which === "late-start" ? b[1].first - a[1].first : a[1].last - b[1].last))
      .slice(0, 8)
      .map(([r, v]) => `${routeName(r)} (${which === "late-start" ? "first trip" : "last trip"} ${clock(which === "late-start" ? v.first : v.last)})`);
    const groups = topGroups(affected, 5);
    const dayWord = sc.id.startsWith("sunday") ? "Sundays" : "weekdays";
    addGap({
      id: `${which}-${sc.id.split("-")[0]}`,
      kind: which,
      scenario: sc.id,
      title:
        which === "late-start"
          ? `On ${dayWord}, ${fmt(popOf(affected))} people have no bus or train within 800 m before 6:30 am`
          : `On ${dayWord}, ${fmt(popOf(affected))} people have no bus or train within 800 m after 11 pm`,
      detail: `${badStops.length} stops ${which === "late-start" ? "get their first trip after 6:30 am" : "see their last trip before 11 pm"} on ${sc.dayLabel}. Routes: ${routesBad.join("; ") || "none"}. Largest groups: ${groups.map((g) => `${g.where} (${fmt(g.pop)})`).join("; ")}.`,
      peopleAffected: Math.round(popOf(affected)),
      location: groups[0]?.c,
      share: popOf(affected) / totalPop,
    }, groups);
  };
  spanGap(weekday, "late-start");
  spanGap(weekday, "early-end");
  if (sunday) { spanGap(sunday, "late-start"); spanGap(sunday, "early-end"); }

  // Low frequency at each scenario time.
  for (const sc of o.scenarios) {
    const st = statsBy[sc.id];
    const served = peopleNear((s) => st[s].h < Infinity);
    const ok = new Set(peopleNear((s) => st[s].h <= 30));
    const affected = served.filter((i) => !ok.has(i));
    const none = complement(served);
    const groups = topGroups(affected, 5);
    const routesH = routeHeadwaysMin(days.get(sc.date)!, sc.time);
    const slow = [...routesH.entries()].filter(([r, h]) => h > 30 && set.stops.some((_, s) => nearAreaStop[s] && stopRoutes[s].has(r))).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, h]) => `${routeName(r)} (about every ${Math.round(h)} min)`);
    addGap({
      id: `low-frequency-${sc.id}`,
      kind: "low-frequency",
      scenario: sc.id,
      title: `${sc.label}: ${fmt(popOf(affected) + popOf(none))} people (${pct((popOf(affected) + popOf(none)) / totalPop)}) have no stop within 800 m with a bus or train at least every 30 minutes`,
      detail: `Of them, ${fmt(popOf(none))} have no departure at all within 800 m in the hour around ${clock(sc.time)} on ${sc.dayLabel}, and ${fmt(popOf(affected))} have only service less often than every 30 minutes. Routes running less often than every 30 minutes then: ${slow.join("; ") || "none"}.`,
      peopleAffected: Math.round(popOf(affected) + popOf(none)),
      location: groups[0]?.c,
      share: (popOf(affected) + popOf(none)) / totalPop,
    }, groups);
  }

  // Destinations out of reach within the limit (only at the times each type matters).
  const RELEVANT: Record<string, string[]> = { school: ["weekday-0800"], college: ["weekday-0800", "weekday-2200"], library: ["weekday-0800", "sunday-0800"], "community-centre": ["weekday-0800", "sunday-0800"] };
  for (const sc of o.scenarios) {
    types.forEach((t, ti) => {
      if (RELEVANT[t] && !RELEVANT[t].includes(sc.id)) return;
      const notReached: number[] = [];
      for (let i = 0; i < nO; i++) if (!(minutes[sc.id][i * nT + ti] <= LIMIT / 60)) notReached.push(i);
      const p = popOf(notReached);
      if (p < 0.02 * totalPop || p < 50) return;
      const noStopHere = notReached.filter((i) => !originStops[i].length);
      const groups = topGroups(notReached, 5);
      const label = o.destTypes[ti].label;
      // Each destination of this type when there are few (hospitals): people reaching it.
      const each = o.destinations.map((d, di) => ({ d, di })).filter(({ d }) => d.type === t);
      const eachText = each.length <= 6 ? ` People reaching each one within ${LIMIT / 60} minutes: ${each.map(({ d, di }) => `${d.name || "unnamed"} ${fmt(destPeople[sc.id][di])} (${pct(destPeople[sc.id][di] / totalPop)})`).join("; ")}.` : "";
      addGap({
        id: `reach-${t}-${sc.id}`,
        kind: "long-trip",
        scenario: sc.id,
        title: `${sc.label}: ${fmt(p)} people (${pct(p / totalPop)}) can't reach a ${label} within ${LIMIT / 60} minutes by transit and walking`,
        detail: `Travel time is the median over departures from ${clock(sc.time)} to ${clock(sc.time + offsets[offsets.length - 1])} on ${sc.dayLabel}, including walking to and from stops. ${fmt(popOf(noStopHere))} of these people have no stop within 800 m. Largest groups: ${groups.map((g) => `${g.where} (${fmt(g.pop)})`).join("; ")}.${eachText}`,
        peopleAffected: Math.round(p),
        location: groups[0]?.c,
        share: p / totalPop,
      }, groups);
    });
  }

  // ---- Fixes: candidate changes ranked by the people they would help ----
  type Fix = TransitLens["fixes"][number] & { peopleHelped: number; kind: string };
  const fixes: Fix[] = [];
  const wkDay = days.get(weekday.date)!;
  const wkSpan = routeSpan(wkDay);
  const avgTripH = (span: Map<number, { trips: number; hours: number }>, r: number) => {
    const v = span.get(r);
    return v && v.trips ? v.hours / v.trips : 0;
  };
  const routeStops = (r: number) => set.stops.map((_, s) => s).filter((s) => stopRoutes[s].has(r));
  const routesInArea = [...new Set(set.stops.flatMap((_, s) => (nearAreaStop[s] ? [...stopRoutes[s]] : [])))];
  const dirsOf = (day: Day, r: number) => {
    const ds = new Set<number>();
    for (let t = 0; t < day.nTrips; t++) if (day.tripRoute[t] === r) ds.add(day.tripDirection[t]);
    return Math.max(1, ds.size);
  };
  const tripsBetween = (day: Day, r: number, from: number, to: number) => {
    let n = 0;
    for (let t = 0; t < day.nTrips; t++) if (day.tripRoute[t] === r && day.tripFirstDep[t] >= from && day.tripFirstDep[t] < to) n++;
    return n;
  };
  const agency = o.agency ?? "The transit agency";
  const tradeCommon = `${agency}'s cost per service hour would turn these hours into dollars; the buses and drivers have to come from new money or from other routes, which would then run less often.`;

  // 1. Frequency: run a route every 15 minutes, 6 am to 7 pm on weekdays.
  const hWk = routeHeadwaysMin(wkDay, weekday.time);
  for (const r of routesInArea) {
    const h = hWk.get(r);
    if (h !== undefined && h <= 15) continue;
    const rs = new Set(routeStops(r));
    const helped = notFreq15.filter((i) => originStops[i].some(({ s }) => rs.has(s)));
    const p = popOf(helped);
    if (p < 100) continue;
    const dirs = dirsOf(wkDay, r);
    const need = 13 * 4 * dirs;
    const have = tripsBetween(wkDay, r, 6 * 3600, 19 * 3600);
    const extra = Math.max(0, need - have);
    const hours = extra * avgTripH(wkSpan, r);
    fixes.push({
      id: `frequency-${set.routes[r].feed}-${set.routes[r].routeId}`,
      kind: "frequency",
      title: `Run route ${routeName(r)} every 15 minutes on weekdays, 6 am to 7 pm`,
      benefit: `${fmt(p)} people who now live more than 800 m from frequent service live within 800 m of this route's stops (now ${h === undefined ? "no trip in the 8 am hour" : `about every ${Math.round(h)} minutes at 8 am`}).`,
      tradeoff: `About ${extra} more trips and roughly ${Math.round(hours)} more bus-hours each weekday (trip time only; layovers and trips to and from the garage add more). ${tradeCommon} Frequency helps people near this route, not people beyond 800 m of any stop.`,
      rank: 0,
      estimate: `${extra} trips, about ${Math.round(hours)} bus-hours per weekday`,
      peopleHelped: Math.round(p),
    });
  }

  // 2. Later evenings and earlier starts (weekday and Sunday).
  const spanFix = (sc: Scenario, which: "late-start" | "early-end") => {
    const st = statsBy[sc.id];
    const day = days.get(sc.date)!;
    const span = routeSpan(day);
    const okStop = (s: number) => (which === "late-start" ? st[s].first >= 0 && st[s].first <= 6.5 * 3600 : st[s].last >= 23 * 3600);
    const ok = new Set(peopleNear(okStop));
    const dayWord = sc.id.startsWith("sunday") ? "Sundays" : "weekdays";
    for (const r of routesInArea) {
      const v = span.get(r);
      if (!v) continue;
      if (which === "late-start" ? v.first <= 6.5 * 3600 : v.last >= 23 * 3600) continue;
      const rs = new Set(routeStops(r).filter((s) => st[s].first >= 0));
      const helped: number[] = [];
      for (let i = 0; i < nO; i++) if (!ok.has(i) && originStops[i].some(({ s }) => rs.has(s))) helped.push(i);
      const p = popOf(helped);
      if (p < 100) continue;
      const hNow = routeHeadwaysMin(day, which === "late-start" ? v.first + 1800 : v.last - 1800).get(r) ?? 60;
      const gapS = which === "late-start" ? v.first - 6.5 * 3600 : 24 * 3600 - v.last;
      const extra = Math.max(1, Math.ceil(gapS / 60 / Math.max(hNow, 15))) * dirsOf(day, r);
      const hours = extra * avgTripH(span, r);
      fixes.push({
        id: `${which}-${sc.id.split("-")[0]}-${set.routes[r].routeId}`,
        kind: which,
        title: which === "late-start" ? `Start route ${routeName(r)} by 6:30 am on ${dayWord}` : `Run route ${routeName(r)} until midnight on ${dayWord}`,
        benefit: `${fmt(p)} people near this route have no other bus or train within 800 m ${which === "late-start" ? "before 6:30 am" : "after 11 pm"} (first trip now ${clock(v.first)}, last trip ${clock(v.last)}). Shift workers, early hospital and retail staff and people coming home late gain most.`,
        tradeoff: `About ${extra} more trips and roughly ${Math.round(hours)} more bus-hours each ${dayWord.slice(0, -1)} at ${which === "late-start" ? "early" : "late"} hours, when fewer people ride, so the cost per rider is higher. ${tradeCommon}`,
        rank: 0,
        estimate: `${extra} trips, about ${Math.round(hours)} bus-hours per ${dayWord.slice(0, -1)}`,
        peopleHelped: Math.round(p),
      });
    }
  };
  spanFix(weekday, "early-end");
  spanFix(weekday, "late-start");
  if (sunday) { spanFix(sunday, "late-start"); spanFix(sunday, "early-end"); }

  // 3. On-demand zones where people live beyond 800 m of any stop.
  for (const g of topGroups(noStop, 6)) {
    if (g.pop < 300) continue;
    fixes.push({
      id: `on-demand-${g.c.join("_")}`,
      kind: "on-demand",
      title: `Try an on-demand (book-a-ride) zone ${g.where}`,
      benefit: `${fmt(g.pop)} people here live more than 800 m from any stop${g.distToStop !== null ? `; the nearest stop is about ${fmt(g.distToStop)} m from the centre of this group` : ""}.`,
      tradeoff: `On-demand service covers a wide area with few riders, so each trip costs more than on a busy fixed route; riders must book ahead and trips can take longer. Money spent on coverage here is not spent on frequency where more people ride.`,
      rank: 0,
      peopleHelped: Math.round(g.pop),
    });
  }

  fixes.sort((a, b) => b.peopleHelped - a.peopleHelped);
  const perKind = new Map<string, number>();
  const chosen = fixes.filter((f) => {
    const n = perKind.get(f.kind) ?? 0;
    if (n >= 3) return false;
    perKind.set(f.kind, n + 1);
    return true;
  }).slice(0, 12);
  chosen.forEach((f, i) => (f.rank = i + 1));

  gaps.sort((a, b) => (b.peopleAffected ?? 0) - (a.peopleAffected ?? 0));

  // ---- Layers ----
  const sc8 = o.scenarios;
  const stopFeats: GeoJSON.Feature[] = [];
  set.stops.forEach((s, i) => {
    if (!nearAreaStop[i] || !stopRoutes[i].size) return;
    const props: Record<string, unknown> = {
      name: s.name,
      routes: [...stopRoutes[i]].map((r) => set.routes[r].shortName).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(" "),
    };
    for (const sc of sc8) {
      const st = statsBy[sc.id][i];
      props[`h_${sc.short}`] = Number.isFinite(st.h) ? Math.round(st.h) : null;
    }
    const wk = statsBy[weekday.id][i];
    props.first_wk = wk.first >= 0 ? hhmm(wk.first) : null;
    props.last_wk = wk.last >= 0 ? hhmm(wk.last) : null;
    if (sunday) {
      const su = statsBy[sunday.id][i];
      props.first_su = su.first >= 0 ? hhmm(su.first) : null;
      props.last_su = su.last >= 0 ? hhmm(su.last) : null;
    }
    const flags: string[] = [];
    if (wk.first > 6.5 * 3600 || (sunday && statsBy[sunday.id][i].first > 6.5 * 3600)) flags.push("late-start");
    if ((wk.last >= 0 && wk.last < 23 * 3600) || (sunday && statsBy[sunday.id][i].last >= 0 && statsBy[sunday.id][i].last < 23 * 3600)) flags.push("early-end");
    if (sc8.some((sc) => statsBy[sc.id][i].h > 30)) flags.push("low-frequency");
    if (flags.length) props.gaps = flags.join(" ");
    stopFeats.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: roundPt(stopPts[i]) } });
  });

  const b = o.area.bbox;
  const pad = 0.03;
  const destFeats: GeoJSON.Feature[] = o.destinations
    .map((d, di) => ({ d, di }))
    .filter(({ d }) => d.p[0] > b[0] - pad && d.p[0] < b[2] + pad && d.p[1] > b[1] - pad && d.p[1] < b[3] + pad)
    .map(({ d, di }) => {
      const props: Record<string, unknown> = { type: d.type, name: d.name };
      for (const sc of sc8) props[`people_${sc.short}`] = Math.round(destPeople[sc.id][di]);
      return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: roundPt(d.p) } };
    });

  const LAYER_TYPES = ["hospital", "grocery"];
  const accessFeats: GeoJSON.Feature[] = origins.map((x, i) => {
    const props: Record<string, unknown> = { pop: Math.round(x.pop) };
    for (const sc of sc8)
      types.forEach((t, ti) => {
        if (!LAYER_TYPES.includes(t)) return;
        const v = minutes[sc.id][i * nT + ti];
        props[`${t}_${sc.short}`] = Number.isFinite(v) ? Math.round(v) : null;
      });
    for (const sc of sc8) {
      let worst = 0;
      for (const t of ["grocery", "pharmacy", "clinic"]) {
        const v = props[`${t}_${sc.short}`];
        if (v === null || v === undefined) { worst = Infinity; break; }
        worst = Math.max(worst, Number(v));
      }
      props[`essentials_${sc.short}`] = Number.isFinite(worst) ? worst : null;
    }
    const geometry: GeoJSON.Geometry = x.cell ? { type: "Polygon", coordinates: squareAround(x.p, o.cellM) } : { type: "Point", coordinates: roundPt(x.p) };
    if (!x.cell) props.rural = true;
    return { type: "Feature", properties: props, geometry };
  });

  const legend = {
    access: `Each square is a ${o.cellM} m grid cell (a point is a rural census area's centre). pop = 2021 residents (census population shared evenly over the cells of each dissemination area). <type>_<scenario> (types: hospital, grocery) = median minutes by transit and walking to the nearest destination of that type (null = not within ${MAX / 60} minutes). essentials_<scenario> = minutes until a grocery store, a pharmacy and a clinic are all reachable. Scenarios: ${sc8.map((s) => `${s.short} = ${s.label}`).join(", ")}.`,
    stops: `name and routes from GTFS. h_<scenario> = minutes between departures in the hour around that time, all routes together (null = none). first_/last_ wk (weekday) and su (Sunday) = first and last departure. gaps (when present) = late-start (first trip after 06:30 on a weekday or Sunday), early-end (last trip before 23:00), low-frequency (h over 30 at a scenario time).`,
    destinations: `people_<scenario> = people in this area who reach it within ${LIMIT / 60} minutes. ${o.sources.destinations}`,
    gaps: "One point per largest group of affected people for each gap (gap = the gap id).",
  };

  const lens: TransitLens & Record<string, unknown> = {
    feed: o.feedInfo,
    scenarios: o.scenarios.map((s) => ({ id: s.id, label: s.label, departure: hhmm(s.time), day: `${s.date} (${s.dayLabel})` })),
    access,
    gaps: gaps.map(({ share: _s, ...g }) => g),
    fixes: chosen.map(({ kind: _k, ...f }) => f),
    layers: {
      stops: { type: "FeatureCollection", features: stopFeats },
      destinations: { type: "FeatureCollection", features: destFeats },
      gaps: { type: "FeatureCollection", features: gapPoints },
      access: { type: "FeatureCollection", features: accessFeats },
    },
    method:
      `Earliest arrival by the Connection Scan Algorithm (Dibbelt, Pajor, Strasser and Wagner, "Intriguingly Simple and Fast Transit Routing", SEA 2013; ACM JEA 2018) over one service day of ${o.feedInfo.name}, the published schedules. ` +
      `From each ${o.cellM} m grid cell of homes (2021 census population by dissemination area, shared evenly over the cells inside it), the rider walks at ${walk.speedKmh} km/h along ${walk.detour}x the straight-line distance to any stop within ${walk.accessM} m, rides, may change vehicles (${walk.transferBufferS} s at the same stop, or a walk to another stop within ${walk.transferM} m), and walks from a stop within ${walk.accessM} m to the destination (or walks directly if it is within ${walk.accessM} m). ` +
      `Travel time is the median over departures every 5 minutes for half an hour from each scenario time. A destination type counts as reached when its nearest one is within ${LIMIT / 60} minutes. Shares are of people, not places. ` +
      `Stop gaps come from the timetable: first departure after 6:30 am, last before 11 pm, and fewer than two departures in the hour around the scenario time (all routes at the stop together). Fixes are ranked by the people living within ${walk.accessM} m of the changed stops who lack that service today; trip and bus-hour estimates come from the timetable's own trip times.`,
    limits: [
      `Origins are ${o.cellM} m grid cells with 2021 census population shared evenly within each dissemination area; real homes cluster differently, and rural areas (under 150 people per km²) count from their area's centre. Population is 2021; newer housing is missing.`,
      "Walking uses straight-line distance times 1.3, not the street network: rivers, highways, rail lines and missing sidewalks can make real walks much longer. No allowance for winter, slopes or mobility devices.",
      `Schedules are the published timetable for one weekday (${weekday.dayLabel})${sunday ? ` and one Sunday (${sunday.dayLabel})` : ""}; delays, detours, crowding and missed connections are not modelled. Saturday is not computed.`,
      "Destinations come from OpenStreetMap and may be missing or out of date; a clinic or pharmacy may not serve everyone (walk-in hours, specialties). Hospital means an OSM hospital not tagged emergency=no (three sites in the region); a hospital's other services and specialties are not distinguished.",
      `Headway at a stop counts all routes together, so two routes going different ways can look like one frequent service. Routes outside the area that riders transfer to are included in travel times but not in fixes.`,
      `Fixes are candidates computed from the timetable, not ${agency} proposals. People helped counts residents near the changed stops, not expected riders. Bus-hour estimates count trip time only; layovers, deadheading and fleet limits are not included, and no dollar cost is given because no cost per hour was taken from a cited source.`,
      "Specialized (paratransit) service, on-demand zones and school buses are not counted unless they are in the GTFS.",
    ],
    area: { id: o.area.id, label: o.area.label },
    population: { total: Math.round(totalPop), origins: nO, source: o.sources.population },
    frequentService: {
      scenario: weekday.id,
      peopleWithin800mOf10Min: Math.round(popOf(freq10)),
      peopleWithin800mOf15Min: Math.round(popOf(freq15)),
      peopleWithin800mOfAnyStop: Math.round(popOf(anyStop)),
    },
    ...(focus ? { focus } : {}),
    legend,
    sources: o.sources,
  };
  return lens;
}
