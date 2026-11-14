// Load GTFS feeds (one or more) and turn one service day into sorted connections.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseTable, gtfsTime } from "./csv.ts";
import type { Table } from "./csv.ts";

export interface FeedFiles {
  id: string; // short key, e.g. "bus" or "ion"
  files: Record<string, string>; // "stops.txt" -> text
}

export interface Stop {
  key: string; // `${feed}:${stop_id}`
  feed: string;
  stopId: string;
  name: string;
  lng: number;
  lat: number;
}

export interface Route {
  key: string;
  feed: string;
  routeId: string;
  shortName: string;
  longName: string;
  type: number;
}

export interface Feed {
  id: string;
  stops: Table;
  routes: Table;
  trips: Table;
  stopTimes: Table;
  calendar?: Table;
  calendarDates?: Table;
}

const NEEDED = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"];

export function readFeedDir(dir: string, id: string): FeedFiles {
  const files: Record<string, string> = {};
  for (const name of [...NEEDED, "calendar.txt", "calendar_dates.txt"]) {
    const p = join(dir, name);
    if (existsSync(p)) files[name] = readFileSync(p, "utf8");
  }
  return { id, files };
}

export function parseFeed(ff: FeedFiles): Feed {
  for (const n of NEEDED) if (!(n in ff.files)) throw new Error(`GTFS feed ${ff.id} lacks ${n}`);
  return {
    id: ff.id,
    stops: parseTable(ff.files["stops.txt"]),
    routes: parseTable(ff.files["routes.txt"]),
    trips: parseTable(ff.files["trips.txt"]),
    stopTimes: parseTable(ff.files["stop_times.txt"]),
    calendar: ff.files["calendar.txt"] ? parseTable(ff.files["calendar.txt"]) : undefined,
    calendarDates: ff.files["calendar_dates.txt"] ? parseTable(ff.files["calendar_dates.txt"]) : undefined,
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Service ids running on date "YYYY-MM-DD" (calendar.txt, then calendar_dates.txt exceptions). */
export function activeServices(feed: Feed, date: string): Set<string> {
  const ymd = date.replaceAll("-", "");
  const dow = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const on = new Set<string>();
  const cal = feed.calendar;
  if (cal) {
    const sid = cal.col("service_id"), s = cal.col("start_date"), e = cal.col("end_date"), d = cal.col(dow);
    for (const r of cal.rows) if (r[s] <= ymd && ymd <= r[e] && r[d] === "1") on.add(r[sid]);
  }
  const cd = feed.calendarDates;
  if (cd) {
    const sid = cd.col("service_id"), dt = cd.col("date"), ex = cd.col("exception_type");
    for (const r of cd.rows) {
      if (r[dt] !== ymd) continue;
      if (r[ex] === "1") on.add(r[sid]);
      else if (r[ex] === "2") on.delete(r[sid]);
    }
  }
  return on;
}

/** Dates (YYYY-MM-DD) with any service in the feed, from calendar_dates and calendar ranges. */
export function serviceDateRange(feed: Feed): { first: string; last: string } | null {
  let first = "99999999", last = "00000000";
  const cd = feed.calendarDates;
  if (cd) {
    const dt = cd.col("date"), ex = cd.col("exception_type");
    for (const r of cd.rows) if (r[ex] === "1") { if (r[dt] < first) first = r[dt]; if (r[dt] > last) last = r[dt]; }
  }
  const cal = feed.calendar;
  if (cal) {
    const s = cal.col("start_date"), e = cal.col("end_date");
    for (const r of cal.rows) { if (r[s] < first) first = r[s]; if (r[e] > last) last = r[e]; }
  }
  if (first === "99999999") return null;
  const f = (x: string) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
  return { first: f(first), last: f(last) };
}

export interface StopSet {
  stops: Stop[];
  index: Map<string, number>;
  routes: Route[];
  routeIndex: Map<string, number>;
}

export function buildStops(feeds: Feed[]): StopSet {
  const stops: Stop[] = [];
  const index = new Map<string, number>();
  const routes: Route[] = [];
  const routeIndex = new Map<string, number>();
  for (const f of feeds) {
    const t = f.stops;
    const id = t.col("stop_id"), nm = t.col("stop_name"), la = t.col("stop_lat"), lo = t.col("stop_lon"), lt = t.col("location_type");
    for (const r of t.rows) {
      if (lt >= 0 && r[lt] && r[lt] !== "0") continue; // stations, entrances: not boarding points
      const key = `${f.id}:${r[id]}`;
      index.set(key, stops.length);
      stops.push({ key, feed: f.id, stopId: r[id], name: r[nm] ?? r[id], lat: Number(r[la]), lng: Number(r[lo]) });
    }
    const rt = f.routes;
    const rid = rt.col("route_id"), sn = rt.col("route_short_name"), ln = rt.col("route_long_name"), ty = rt.col("route_type");
    for (const r of rt.rows) {
      const key = `${f.id}:${r[rid]}`;
      routeIndex.set(key, routes.length);
      routes.push({ key, feed: f.id, routeId: r[rid], shortName: r[sn] ?? "", longName: r[ln] ?? "", type: Number(r[ty] ?? 3) });
    }
  }
  return { stops, index, routes, routeIndex };
}

/** One service day: elementary connections sorted by departure, and each stop's boardable departures. */
export interface Day {
  date: string;
  nConn: number;
  depStop: Int32Array;
  arrStop: Int32Array;
  depTime: Int32Array;
  arrTime: Int32Array;
  trip: Int32Array;
  noBoard: Uint8Array; // 1 when pickup_type = 1 at the departure stop
  noAlight: Uint8Array; // 1 when drop_off_type = 1 at the arrival stop
  tripRoute: Int32Array; // trip index -> route index
  tripDirection: Int8Array;
  tripFirstDep: Int32Array;
  tripLastArr: Int32Array;
  nTrips: number;
  /** Per stop: boardable departure times (sorted) and the route of each. */
  stopDeps: { time: Int32Array; route: Int32Array; dir: Int8Array }[];
}

export function buildDay(feeds: Feed[], set: StopSet, date: string): Day {
  type C = [number, number, number, number, number, number, number];
  const conns: C[] = [];
  const tripRoute: number[] = [];
  const tripDir: number[] = [];
  const tripFirst: number[] = [];
  const tripLast: number[] = [];
  const deps: { t: number; r: number; d: number }[][] = set.stops.map(() => []);
  for (const f of feeds) {
    const services = activeServices(f, date);
    const tt = f.trips;
    const tid = tt.col("trip_id"), sid = tt.col("service_id"), rid = tt.col("route_id"), did = tt.col("direction_id");
    const tripIdx = new Map<string, number>();
    for (const r of tt.rows) {
      if (!services.has(r[sid])) continue;
      tripIdx.set(r[tid], tripRoute.length);
      tripRoute.push(set.routeIndex.get(`${f.id}:${r[rid]}`) ?? -1);
      tripDir.push(did >= 0 && r[did] !== "" ? Number(r[did]) : -1);
      tripFirst.push(Infinity);
      tripLast.push(-1);
    }
    const st = f.stopTimes;
    const c = { trip: st.col("trip_id"), arr: st.col("arrival_time"), dep: st.col("departure_time"), stop: st.col("stop_id"), seq: st.col("stop_sequence"), pu: st.col("pickup_type"), do: st.col("drop_off_type") };
    const byTrip = new Map<number, { seq: number; s: number; a: number; d: number; pu: boolean; dr: boolean }[]>();
    for (const r of st.rows) {
      const ti = tripIdx.get(r[c.trip]);
      if (ti === undefined) continue;
      const si = set.index.get(`${f.id}:${r[c.stop]}`);
      if (si === undefined) continue;
      let a = gtfsTime(r[c.arr]);
      let d = gtfsTime(r[c.dep]);
      if (a < 0) a = d;
      if (d < 0) d = a;
      let arr = byTrip.get(ti);
      if (!arr) byTrip.set(ti, (arr = []));
      arr.push({ seq: Number(r[c.seq]), s: si, a, d, pu: c.pu >= 0 && r[c.pu] === "1", dr: c.do >= 0 && r[c.do] === "1" });
    }
    for (const [ti, evs] of byTrip) {
      evs.sort((x, y) => x.seq - y.seq);
      // Interpolate missing times (untimed stops) linearly between timed ones.
      for (let i = 0; i < evs.length; i++) {
        if (evs[i].d >= 0) continue;
        let j = i + 1;
        while (j < evs.length && evs[j].d < 0) j++;
        const p = evs[i - 1], q = evs[j];
        if (!p || !q) continue;
        for (let k = i; k < j; k++) evs[k].a = evs[k].d = Math.round(p.d + ((q.a - p.d) * (k - i + 1)) / (j - i + 1));
      }
      for (let i = 0; i + 1 < evs.length; i++) {
        const x = evs[i], y = evs[i + 1];
        if (x.d < 0 || y.a < 0) continue;
        conns.push([x.s, y.s, x.d, Math.max(y.a, x.d), ti, x.pu ? 1 : 0, y.dr ? 1 : 0]);
        if (!x.pu) deps[x.s].push({ t: x.d, r: tripRoute[ti], d: tripDir[ti] });
      }
      tripFirst[ti] = evs[0]?.d ?? -1;
      tripLast[ti] = evs[evs.length - 1]?.a ?? -1;
    }
  }
  conns.sort((x, y) => x[2] - y[2] || x[3] - y[3]);
  const n = conns.length;
  const day: Day = {
    date,
    nConn: n,
    depStop: new Int32Array(n),
    arrStop: new Int32Array(n),
    depTime: new Int32Array(n),
    arrTime: new Int32Array(n),
    trip: new Int32Array(n),
    noBoard: new Uint8Array(n),
    noAlight: new Uint8Array(n),
    tripRoute: Int32Array.from(tripRoute),
    tripDirection: Int8Array.from(tripDir),
    tripFirstDep: Int32Array.from(tripFirst.map((x) => (Number.isFinite(x) ? x : -1))),
    tripLastArr: Int32Array.from(tripLast),
    nTrips: tripRoute.length,
    stopDeps: deps.map((list) => {
      list.sort((a, b) => a.t - b.t);
      return { time: Int32Array.from(list.map((x) => x.t)), route: Int32Array.from(list.map((x) => x.r)), dir: Int8Array.from(list.map((x) => x.d)) };
    }),
  };
  for (let i = 0; i < n; i++) {
    const x = conns[i];
    day.depStop[i] = x[0];
    day.arrStop[i] = x[1];
    day.depTime[i] = x[2];
    day.arrTime[i] = x[3];
    day.trip[i] = x[4];
    day.noBoard[i] = x[5];
    day.noAlight[i] = x[6];
  }
  return day;
}
