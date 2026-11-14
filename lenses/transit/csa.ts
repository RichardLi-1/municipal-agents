// Connection Scan Algorithm (earliest arrival), after Dibbelt, Pajor, Strasser and Wagner,
// "Intriguingly Simple and Fast Transit Routing", SEA 2013 (LNCS 7933), extended in
// "Connection Scan Algorithm", ACM JEA 23 (2018). Connections are scanned once in order of
// departure; a connection is usable if its trip is already boarded or the rider can be at its
// departure stop in time. Walking transfers between nearby stops are relaxed after each arrival.

import type { Day, Stop } from "./gtfs.ts";
import { distM } from "./geo.ts";
import type { LngLat } from "./geo.ts";

export const INF = 0x3fffffff;

/** Walking: speed and the detour factor over straight-line distance. */
export interface WalkModel {
  speedKmh: number; // 4.8
  detour: number; // 1.3
  accessM: number; // straight-line radius to reach a stop from home or a destination (800)
  transferM: number; // straight-line radius for walking transfers between stops (300)
  transferBufferS: number; // time to change vehicles at the same stop (60)
}

export const DEFAULT_WALK: WalkModel = { speedKmh: 4.8, detour: 1.3, accessM: 800, transferM: 300, transferBufferS: 60 };

export function walkSecs(straightM: number, w: WalkModel): number {
  return Math.round((straightM * w.detour) / ((w.speedKmh * 1000) / 3600));
}

/** Compressed lists of walking transfers between stops (CSR layout). */
export interface Footpaths {
  start: Int32Array; // stop i's paths are [start[i], start[i+1])
  to: Int32Array;
  secs: Int32Array;
}

export function buildFootpaths(stops: Stop[], w: WalkModel, near: (p: LngLat, r: number) => number[]): Footpaths {
  const start = new Int32Array(stops.length + 1);
  const to: number[] = [];
  const secs: number[] = [];
  for (let i = 0; i < stops.length; i++) {
    start[i] = to.length;
    const p: LngLat = [stops[i].lng, stops[i].lat];
    for (const j of near(p, w.transferM)) {
      if (j === i) continue;
      to.push(j);
      secs.push(walkSecs(distM(p, [stops[j].lng, stops[j].lat]), w));
    }
  }
  start[stops.length] = to.length;
  return { start, to: Int32Array.from(to), secs: Int32Array.from(secs) };
}

/** Reusable work arrays so repeated queries don't allocate. */
export interface Scratch {
  arrive: Int32Array; // earliest time physically at the stop
  ready: Int32Array; // earliest time ready to board a new trip at the stop
  boarded: Uint8Array;
}

export function makeScratch(nStops: number, nTrips: number): Scratch {
  return { arrive: new Int32Array(nStops), ready: new Int32Array(nStops), boarded: new Uint8Array(nTrips) };
}

function firstAtOrAfter(arr: Int32Array, t: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Earliest arrival at every stop, starting from `sources` (stop, time ready to board) and
 * scanning connections that depart up to `tMax`. Returns scratch.arrive (INF = not reached).
 */
export function earliestArrival(
  day: Day,
  fp: Footpaths,
  sources: { stop: number; time: number }[],
  tMax: number,
  w: WalkModel,
  scratch: Scratch,
): Int32Array {
  const { arrive, ready, boarded } = scratch;
  arrive.fill(INF);
  ready.fill(INF);
  boarded.fill(0);
  let t0 = INF;
  for (const s of sources) {
    if (s.time < arrive[s.stop]) arrive[s.stop] = s.time;
    if (s.time < ready[s.stop]) ready[s.stop] = s.time;
    if (s.time < t0) t0 = s.time;
  }
  const { depStop, arrStop, depTime, arrTime, trip, noBoard, noAlight } = day;
  const { start, to, secs } = fp;
  const buf = w.transferBufferS;
  for (let i = firstAtOrAfter(depTime, t0); i < day.nConn; i++) {
    const dt = depTime[i];
    if (dt > tMax) break;
    const tr = trip[i];
    if (boarded[tr] === 0) {
      if (noBoard[i] === 1 || ready[depStop[i]] > dt) continue;
      boarded[tr] = 1;
    }
    if (noAlight[i] === 1) continue;
    const s = arrStop[i];
    const at = arrTime[i];
    if (at < arrive[s]) {
      arrive[s] = at;
      if (at + buf < ready[s]) ready[s] = at + buf;
      for (let k = start[s]; k < start[s + 1]; k++) {
        const s2 = to[k];
        const a2 = at + secs[k];
        if (a2 < arrive[s2]) arrive[s2] = a2;
        if (a2 + buf < ready[s2]) ready[s2] = a2 + buf;
      }
    }
  }
  return arrive;
}
