import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countStages,
  csvObjects,
  daysBetween,
  medianDays,
  medianIssueToDone,
  parseMonDdYyyy,
  toDate,
  type Permit,
} from "./lib.ts";
import { housingSummary } from "./summary.ts";
import type { HousingLens } from "../../shared/types.ts";

function permit(p: Partial<Permit> & { id: string }): Permit {
  return {
    address: "",
    kind: "test",
    status: "Issued",
    applied: null,
    issued: null,
    done: null,
    isDone: false,
    isDropped: false,
    isOpen: false,
    units: 1,
    ...p,
  };
}

// A tiny hand-made permit list.
const permits: Permit[] = [
  // Issued in the window, finished in the window: 400 days.
  permit({ id: "a", issued: "2023-01-01", done: "2024-02-05", isDone: true, status: "Closed", units: 10 }),
  // Issued before the window, finished in it: 600 days. Counts as completed, not as issued.
  permit({ id: "b", issued: "2021-05-10", done: "2022-12-31", isDone: true, status: "Closed", units: 2 }),
  // Issued in the window, still open.
  permit({ id: "c", issued: "2024-06-01", isOpen: true, units: 50 }),
  // Cancelled: never counted.
  permit({ id: "d", issued: "2024-07-01", isDropped: true, status: "Cancelled", units: 99 }),
  // Finished, no date (like Waterloo), issued in the window.
  permit({ id: "e", issued: "2023-03-01", isDone: true, status: "Complete", units: 3 }),
  // No new units: ignored.
  permit({ id: "f", issued: "2023-03-01", isOpen: true, units: 0 }),
  // Issued after the window end.
  permit({ id: "g", issued: "2026-01-02", isOpen: true, units: 7 }),
];

test("daysBetween counts whole days", () => {
  assert.equal(daysBetween("2024-01-01", "2024-01-31"), 30);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2); // leap year
});

test("medianDays ignores missing and backwards pairs", () => {
  assert.deepEqual(
    medianDays([
      ["2024-01-01", "2024-01-11"], // 10
      ["2024-01-01", "2024-01-31"], // 30
      ["2024-01-01", null],
      ["2024-02-01", "2024-01-01"], // backwards: dropped
      ["2024-01-01", "2024-01-21"], // 20
    ]),
    { medianDays: 20, n: 3 },
  );
  assert.deepEqual(medianDays([["2024-01-01", "2024-01-11"], ["2024-01-01", "2024-01-31"]]), { medianDays: 20, n: 2 });
  assert.deepEqual(medianDays([]), { medianDays: null, n: 0 });
});

test("countStages counts units and permits by stage within the window", () => {
  const c = countStages(permits, "2022-01-01", "2025-12-31");
  assert.deepEqual(c.issued, { units: 10 + 50 + 3, projects: 3 }); // a, c, e
  assert.deepEqual(c.open, { units: 50, projects: 1 }); // c
  assert.deepEqual(c.done, { units: 10 + 2 + 3, projects: 3 }); // a, b (by finish date), e (undated)
  assert.deepEqual(c.doneUndated, { units: 3, projects: 1 }); // e
  assert.equal(c.latestIssued, "2026-01-02");
  assert.equal(c.latestDone, "2024-02-05");
});

test("medianIssueToDone follows the same permit across both dates", () => {
  assert.deepEqual(medianIssueToDone(permits, "2022-01-01", "2025-12-31"), { medianDays: 500, n: 2 }); // 400 and 600
  assert.deepEqual(medianIssueToDone(permits, "2022-01-01", "2025-12-31", 10), { medianDays: 400, n: 1 });
});

test("toDate keeps date-only UTC midnights and converts timed values to Toronto", () => {
  assert.equal(toDate(Date.UTC(2026, 9, 15)), "2026-10-15");
  assert.equal(toDate(Date.UTC(2026, 9, 15, 3, 0)), "2026-10-14"); // 11 pm in Toronto
  assert.equal(toDate(null), null);
});

test("CSV and Kitchener dates parse", () => {
  const rows = csvObjects('A,B ,C\n1,"x, ""y""",Jun 28 2001\r\n2,,\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].B, 'x, "y"');
  assert.equal(parseMonDdYyyy(rows[0].C), "2001-06-28");
  assert.equal(parseMonDdYyyy("nope"), null);
});

test("housingSummary is plain text with stages, medians, target and gaps", () => {
  const lens: HousingLens = {
    city: "testville",
    stages: [
      { id: "approved", label: "Approved", units: null, projects: null, tracked: false, source: "No list." },
      { id: "permit-issued", label: "Permit issued", units: 63, projects: 3, tracked: true, source: "Test permits 2022-2025." },
    ],
    timeBetween: [{ from: "permit-issued", to: "completed", medianDays: 500, note: "Two permits." }],
    target: { label: "Test target", units: 1000, by: "2031" },
    statements: [],
    hardToTrack: ["Approved but not permitted."],
  };
  const s = housingSummary(lens);
  assert.match(s, /Permit issued: 63 units, 3 projects/);
  assert.match(s, /Approved: no public data/);
  assert.match(s, /500 days/);
  assert.match(s, /1,000 units by 2031/);
  assert.match(s, /Approved but not permitted/);
  assert.match(s, /Test permits 2022-2025/);
});

test("city normalisers read each city's fields the way the lens counts them", async () => {
  const { kitchenerPermit, waterlooPermit, cambridgePermit } = await import("./build.ts");
  const k = kitchenerPermit({
    attributes: {
      PERMITNO: "1", PERMIT_STATUS: "Occupancy Permitted", UNITS_CREATED: "12",
      ISSUE_DATE: Date.UTC(2023, 0, 10), OCCUPANCY_PERMITTED_DT: Date.UTC(2024, 0, 10), FINAL_DATE: null,
    },
    geometry: { x: -80.5, y: 43.4 },
  });
  assert.equal(k.units, 12);
  assert.equal(k.isDone, true);
  assert.equal(k.done, "2024-01-10");
  assert.equal(k.isOpen, false);

  // Waterloo: units on interior work are not new homes; no completion date.
  const w1 = waterlooPermit({ attributes: { STATUS: "Issued", WORKDESC: "InteriorWork", UNITS: 1, ISSUEDATE: Date.UTC(2024, 5, 1, 15) } });
  const w2 = waterlooPermit({ attributes: { STATUS: "Complete", WORKDESC: "AdditionalDwellingUnits", UNITS: 1, ISSUEDATE: Date.UTC(2024, 5, 1, 15) } });
  assert.equal(w1.units, 0);
  assert.equal(w2.units, 1);
  assert.equal(w2.isDone, true);
  assert.equal(w2.done, null);

  // Cambridge: cancelled permits carry a FINALDATE but are not completions; foundation permits repeat units.
  const c1 = cambridgePermit({ attributes: { STATUSDESC: "Cancelled", FOLDERDESC: "Residential Building Permit", PROP_NEW_UNITS: "1", ISSUEDATE: Date.UTC(2023, 1, 1, 15), FINALDATE: Date.UTC(2024, 1, 1, 15) } });
  const c2 = cambridgePermit({ attributes: { STATUSDESC: "Issued", FOLDERDESC: "Foundation Permit Residential", PROP_NEW_UNITS: "147", ISSUEDATE: Date.UTC(2025, 1, 1, 15) } });
  const c3 = cambridgePermit({ attributes: { STATUSDESC: "Closed", FOLDERDESC: "Residential Building Permit", PROP_NEW_UNITS: "2", ISSUEDATE: Date.UTC(2023, 1, 1, 15), FINALDATE: Date.UTC(2024, 1, 1, 15) } });
  assert.equal(c1.isDropped, true);
  assert.equal(c2.units, 0);
  assert.equal(c3.isDone, true);
  assert.equal(c3.done, "2024-02-01");
});

test("target progress comes from the province's own count, summed for the region", async () => {
  const { parseOntarioProgress, provinceProgress, targetFor } = await import("./build.ts");
  const csv = [
    "Municipality,Ten-year housing target ,Total housing progress since 2022,Target for 2024,Total 2024 housing progress,Progress % for 2024,Housing target status",
    "Cambridge,19000,3023,1583,741,46.81%,Not met",
    "Kitchener,35000,9594,2917,3067,105.14%,Exceeded",
    "Waterloo,16000,3285,1333,1722,129.18%,Exceeded",
  ].join("\n");
  const old = csv.replace(/2024/g, "2023").replace("9594", "6527");
  const t = parseOntarioProgress({ csvs: [{ name: "Ontario housing supply: January - December 2023", url: "u23", text: old }, { name: "Ontario housing supply: January - December 2024", url: "u24", text: csv }] });
  const k = targetFor("Kitchener", t.get("kitchener"))!;
  assert.equal(k.units, 35000);
  assert.deepEqual({ units: k.progress!.units, asOf: k.progress!.asOf, url: k.progress!.url }, { units: 9594, asOf: "2024-12-31", url: "u24" }); // newest file wins
  const region = provinceProgress(["kitchener", "waterloo", "cambridge"].map((c) => t.get(c)!))!;
  assert.equal(region.units, 15902);
  assert.match(region.source, /not permits or CMHC completions/);
  const text = housingSummary({ city: "kitchener", stages: [], timeBetween: [], target: k, statements: [], hardToTrack: [] });
  assert.match(text, /as the province counts it: 9,594 homes as of 2024-12-31 \(27% of the target\)/);
});
