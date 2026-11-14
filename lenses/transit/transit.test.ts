import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, gtfsTime, hhmm } from "./csv.ts";
import { parseFeed, buildStops, buildDay, activeServices } from "./gtfs.ts";
import { buildFootpaths, earliestArrival, makeScratch, DEFAULT_WALK, INF, walkSecs } from "./csa.ts";
import { firstLast, stopHeadwayMin, routeHeadwaysMin, departuresBetween } from "./service.ts";
import { pointIndex, distM, areaMask } from "./geo.ts";
import type { LngLat } from "./geo.ts";

// A tiny network on a line of latitude 43.45. 0.001 deg of longitude is about 81 m here.
//   A ---route 1---> B ---route 1---> C ---route 2---> D
//                    B ~ E are 160 m apart (walk transfer), E ---route 3---> F
const stops = `stop_id,stop_name,stop_lat,stop_lon
A,Stop A,43.45,-80.50
B,Stop B,43.45,-80.49
C,Stop C,43.45,-80.48
D,Stop D,43.45,-80.47
E,Stop E,43.45,-80.488
F,Stop F,43.46,-80.488
`;
const routes = `route_id,route_short_name,route_long_name,route_type
1,1,One,3
2,2,Two,3
3,3,Three,3
`;
const trips = `route_id,service_id,trip_id,direction_id
1,WK,t1a,0
1,WK,t1b,0
1,WK,t1c,0
2,WK,t2a,0
2,WK,t2b,0
3,WK,t3a,0
3,WK,t3b,0
1,SU,t1s,0
`;
// t2a leaves C at 08:20, exactly when t1a arrives: too tight with a 60 s change buffer.
// t3a leaves E at 08:12: reachable from B (arrive 08:10) by a 2-3 minute walk? Walk is about
// 160 m * 1.3 / 1.333 m/s = 156 s, plus 60 s buffer = 08:13:36 > 08:12, so missed; t3b at 08:20 is caught.
const stopTimes = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
t1a,08:00:00,08:00:00,A,1,0,0
t1a,08:10:00,08:10:00,B,2,0,0
t1a,08:20:00,08:20:00,C,3,0,0
t1b,08:15:00,08:15:00,A,1,0,0
t1b,08:25:00,08:25:00,B,2,0,0
t1b,08:35:00,08:35:00,C,3,0,0
t1c,23:30:00,23:30:00,A,1,0,0
t1c,23:40:00,23:40:00,B,2,0,0
t1c,24:50:00,24:50:00,C,3,0,0
t2a,08:20:00,08:20:00,C,1,0,0
t2a,08:30:00,08:30:00,D,2,0,0
t2b,08:40:00,08:40:00,C,1,0,0
t2b,08:50:00,08:50:00,D,2,0,0
t3a,08:12:00,08:12:00,E,1,0,0
t3a,08:22:00,08:22:00,F,2,0,0
t3b,08:20:00,08:20:00,E,1,0,0
t3b,08:30:00,08:30:00,F,2,0,0
t1s,09:00:00,09:00:00,A,1,0,0
t1s,09:10:00,09:10:00,B,2,0,0
`;
const calendar = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,1,1,1,1,1,0,0,20261101,20261231
SU,0,0,0,0,0,0,1,20261101,20261231
`;
const calendarDates = `service_id,date,exception_type
WK,20261111,2
SU,20261111,1
`;

const feed = parseFeed({ id: "t", files: { "stops.txt": stops, "routes.txt": routes, "trips.txt": trips, "stop_times.txt": stopTimes, "calendar.txt": calendar, "calendar_dates.txt": calendarDates } });
const set = buildStops([feed]);
const S = (id: string) => set.index.get(`t:${id}`)!;
const pts: LngLat[] = set.stops.map((s) => [s.lng, s.lat]);
const fp = buildFootpaths(set.stops, DEFAULT_WALK, pointIndex(pts).near);
const T = (s: string) => gtfsTime(s);

test("CSV parser handles quotes, doubled quotes, CRLF and a BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",3\r\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'he said "hi"', "3"]]);
  assert.equal(gtfsTime("25:10:30"), 25 * 3600 + 630);
  assert.equal(hhmm(T("24:05:00")), "24:05");
});

test("calendar and calendar_dates choose the services of a day", () => {
  assert.deepEqual([...activeServices(feed, "2026-11-17")], ["WK"]); // Tuesday
  assert.deepEqual([...activeServices(feed, "2026-11-15")], ["SU"]); // Sunday
  assert.deepEqual([...activeServices(feed, "2026-11-11")], ["SU"]); // holiday exception
});

test("CSA finds earliest arrivals with a ride, a missed tight transfer and a walk transfer", () => {
  const day = buildDay([feed], set, "2026-11-17");
  const scratch = makeScratch(set.stops.length, day.nTrips);
  const arr = earliestArrival(day, fp, [{ stop: S("A"), time: T("07:58:00") }], T("10:00:00"), DEFAULT_WALK, scratch);
  assert.equal(arr[S("B")], T("08:10:00"));
  assert.equal(arr[S("C")], T("08:20:00"));
  // 08:20 transfer at C is missed (60 s buffer), so the 08:40 trip gets to D at 08:50.
  assert.equal(arr[S("D")], T("08:50:00"));
  // Walk B -> E, miss t3a (08:12), take t3b (08:20) to F at 08:30.
  const walk = walkSecs(distM(pts[S("B")], pts[S("E")]), DEFAULT_WALK);
  assert.ok(walk > 120 && walk < 200, `walk ${walk}s`);
  assert.equal(arr[S("E")], T("08:10:00") + walk);
  assert.equal(arr[S("F")], T("08:30:00"));
});

test("CSA respects the departure time and the scan limit", () => {
  const day = buildDay([feed], set, "2026-11-17");
  const scratch = makeScratch(set.stops.length, day.nTrips);
  const late = earliestArrival(day, fp, [{ stop: S("A"), time: T("08:01:00") }], T("10:00:00"), DEFAULT_WALK, scratch);
  assert.equal(late[S("B")], T("08:25:00"));
  const capped = earliestArrival(day, fp, [{ stop: S("A"), time: T("08:01:00") }], T("08:30:00"), DEFAULT_WALK, scratch);
  assert.equal(capped[S("D")], INF);
  // No service on Sunday from C.
  const sun = buildDay([feed], set, "2026-11-15");
  const s2 = makeScratch(set.stops.length, sun.nTrips);
  const a = earliestArrival(sun, fp, [{ stop: S("A"), time: T("08:00:00") }], T("12:00:00"), DEFAULT_WALK, s2);
  assert.equal(a[S("B")], T("09:10:00"));
  assert.equal(a[S("D")], INF);
});

test("first and last trips, after-midnight times included", () => {
  const day = buildDay([feed], set, "2026-11-17");
  assert.deepEqual(firstLast(day, S("A")), { first: T("08:00:00"), last: T("23:30:00") });
  assert.deepEqual(firstLast(day, S("B")), { first: T("08:10:00"), last: T("23:40:00") });
  // C's last boardable departure is route 2 at 08:40 (t1c ends at C at 24:50, no departure there).
  assert.deepEqual(firstLast(day, S("C")), { first: T("08:20:00"), last: T("08:40:00") });
  assert.deepEqual(firstLast(day, S("D")), { first: -1, last: -1 });
});

test("headway around a time", () => {
  const day = buildDay([feed], set, "2026-11-17");
  // A: departures 08:00 and 08:15 in 07:45-08:45 -> 2 an hour -> 30 min.
  assert.equal(departuresBetween(day, S("A"), T("07:45:00"), T("08:45:00")), 2);
  assert.equal(stopHeadwayMin(day, S("A"), T("08:15:00")), 30);
  assert.equal(stopHeadwayMin(day, S("A"), T("12:00:00")), Infinity);
  const routesH = routeHeadwaysMin(day, T("08:15:00"));
  assert.equal(routesH.get(set.routeIndex.get("t:1")!), 30);
  assert.equal(routesH.get(set.routeIndex.get("t:3")!), 30);
});

test("area masks: polygons and circles around points", () => {
  const poly = areaMask("p", "Square", { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-80.5, 43.4], [-80.4, 43.4], [-80.4, 43.5], [-80.5, 43.5], [-80.5, 43.4]]] } }, 0);
  assert.ok(poly.contains([-80.45, 43.45]));
  assert.ok(!poly.contains([-80.35, 43.45]));
  const circle = areaMask("c", "Hub", { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-80.5, 43.45] } }, 1500);
  assert.ok(circle.contains([-80.49, 43.45])); // about 810 m
  assert.ok(!circle.contains([-80.47, 43.45])); // about 2.4 km
});

test("buildTransitLens: access shares, a no-stop gap and a summary on the tiny network", async () => {
  const { buildTransitLens } = await import("./lens.ts");
  const { transitSummary } = await import("./summary.ts");
  const lens = buildTransitLens({
    feeds: [feed],
    feedInfo: { name: "tiny", url: "x", retrieved: "2026-11-14", serviceDate: "2026-11-17", licence: "test" },
    scenarios: [
      { id: "weekday-0800", short: "w8", label: "Weekday 8 am", date: "2026-11-17", dayLabel: "Tuesday", time: T("08:00:00") },
      { id: "sunday-0800", short: "s8", label: "Sunday 8 am", date: "2026-11-15", dayLabel: "Sunday", time: T("08:00:00") },
    ],
    destinations: [{ type: "grocery", name: "Shop at F", osm: "node/1", p: pts[S("F")] }],
    destTypes: [{ id: "grocery", label: "grocery store" }],
    origins: [
      { id: "a", p: pts[S("A")], pop: 100, cell: [0, 0] },
      { id: "far", p: [-80.40, 43.45], pop: 50, cell: [20, 0] },
    ],
    area: areaMask("t", "Test", { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-80.6, 43.4], [-80.3, 43.4], [-80.3, 43.5], [-80.6, 43.5], [-80.6, 43.4]]] } }, 0),
    cellM: 400,
    departureOffsetsMin: [0],
    sources: { population: "p", destinations: "d", gtfs: "g" },
  });
  // From A at 08:00: ride to B, walk to E, ride to F, arrive 08:30 -> 30 minutes.
  const sq = lens.layers.access.features[0].properties as Record<string, number | null>;
  assert.equal(sq["grocery_w8"], 30);
  assert.equal(sq["grocery_s8"], null); // no route 3 on Sundays
  const wk = lens.access.find((a) => a.scenario === "weekday-0800" && a.destinationType === "grocery")!;
  assert.equal(wk.shareReached, 0.667);
  const noStop = lens.gaps.find((g) => g.id === "no-stop-nearby")!;
  assert.equal(noStop.peopleAffected, 50);
  assert.match(transitSummary(lens), /grocery \(45 min\): Weekday 8 am 67%, Sunday 8 am 0%/);
});
