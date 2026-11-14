// Service levels at a stop or on a route: first and last trip, departures and headway around a time.

import type { Day } from "./gtfs.ts";

function lowerBound(arr: Int32Array, t: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First and last boardable departure at a stop on this day (seconds), or -1 when none. */
export function firstLast(day: Day, stop: number): { first: number; last: number } {
  const t = day.stopDeps[stop].time;
  return t.length ? { first: t[0], last: t[t.length - 1] } : { first: -1, last: -1 };
}

/** Departures at a stop in [from, to). */
export function departuresBetween(day: Day, stop: number, from: number, to: number): number {
  const t = day.stopDeps[stop].time;
  return lowerBound(t, to) - lowerBound(t, from);
}

/**
 * Headway in minutes at a stop around time t: 60 / departures in the hour centred on t
 * (all routes together). Infinity when nothing departs in that hour.
 */
export function stopHeadwayMin(day: Day, stop: number, t: number): number {
  const n = departuresBetween(day, stop, t - 1800, t + 1800);
  return n ? 60 / n : Infinity;
}

/**
 * Headway in minutes for each route around time t: for every route and direction, the
 * busiest stop's departures in the hour centred on t; the route's headway is 60 / that count
 * (the better of its directions). Routes with no departures in that hour are absent.
 */
export function routeHeadwaysMin(day: Day, t: number): Map<number, number> {
  const best = new Map<string, number>();
  for (let s = 0; s < day.stopDeps.length; s++) {
    const d = day.stopDeps[s];
    const from = lowerBound(d.time, t - 1800), to = lowerBound(d.time, t + 1800);
    if (from === to) continue;
    const counts = new Map<string, number>();
    for (let i = from; i < to; i++) {
      const k = `${d.route[i]}|${d.dir[i]}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) if (n > (best.get(k) ?? 0)) best.set(k, n);
  }
  const out = new Map<number, number>();
  for (const [k, n] of best) {
    const r = Number(k.split("|")[0]);
    const h = 60 / n;
    if (h < (out.get(r) ?? Infinity)) out.set(r, h);
  }
  return out;
}

/** First and last departure of each route on the day, over all its stops (seconds). */
export function routeSpan(day: Day): Map<number, { first: number; last: number; trips: number; hours: number }> {
  const out = new Map<number, { first: number; last: number; trips: number; hours: number }>();
  for (let ti = 0; ti < day.nTrips; ti++) {
    const r = day.tripRoute[ti];
    const f = day.tripFirstDep[ti], l = day.tripLastArr[ti];
    if (f < 0 || l < 0) continue;
    const cur = out.get(r) ?? { first: Infinity, last: -1, trips: 0, hours: 0 };
    cur.first = Math.min(cur.first, f);
    cur.last = Math.max(cur.last, f);
    cur.trips++;
    cur.hours += (l - f) / 3600;
    out.set(r, cur);
  }
  return out;
}
