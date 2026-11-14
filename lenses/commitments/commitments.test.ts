import { test } from "node:test";
import assert from "node:assert/strict";
import { commitmentStatus } from "./status.ts";

test("a cut that is ahead of the straight line is on track", () => {
  const r = commitmentStatus({ baselineYear: 2010, baselineValue: 100, targetYear: 2030, targetValue: 50, latestYear: 2020, latestValue: 70 });
  assert.equal(r.status, "on-track");
  assert.equal(r.expected, 75);
  assert.equal(r.timeShare, 0.5);
  assert.equal(r.progressShare, 0.6);
  assert.equal(r.neededPerYear, -2);
  assert.match(r.explanation, /on track/);
});

test("a cut that lags the line is behind", () => {
  const r = commitmentStatus({ baselineYear: 2010, baselineValue: 100, targetYear: 2030, targetValue: 50, latestYear: 2020, latestValue: 90, unit: "kt CO2e" });
  assert.equal(r.status, "behind");
  assert.equal(r.expected, 75);
  assert.match(r.explanation, /20% of the way there with 50% of the time gone/);
  assert.match(r.explanation, /fall by about 4 kt CO2e a year/);
});

test("a rising target (homes) reached early is done; a passed deadline unmet is behind", () => {
  assert.equal(commitmentStatus({ baselineYear: 2022, baselineValue: 0, targetYear: 2031, targetValue: 35000, latestYear: 2031, latestValue: 36000 }).status, "done");
  const missed = commitmentStatus({ baselineYear: 2022, baselineValue: 0, targetYear: 2024, targetValue: 1000, latestYear: 2025, latestValue: 800 });
  assert.equal(missed.status, "behind");
  assert.match(missed.explanation, /target year has passed/);
  // Within the 5-point tolerance counts as on track.
  assert.equal(commitmentStatus({ baselineYear: 2022, baselineValue: 0, targetYear: 2032, targetValue: 1000, latestYear: 2027, latestValue: 460 }).status, "on-track");
});

test("missing or inconsistent numbers are unclear", () => {
  assert.equal(commitmentStatus({ baselineYear: 2010, baselineValue: NaN, targetYear: 2030, targetValue: 50, latestYear: 2020, latestValue: 70 }).status, "unclear");
  assert.equal(commitmentStatus({ baselineYear: 2030, baselineValue: 1, targetYear: 2020, targetValue: 2, latestYear: 2025, latestValue: 1 }).status, "unclear");
  assert.equal(commitmentStatus({ baselineYear: 2010, baselineValue: 5, targetYear: 2030, targetValue: 5, latestYear: 2020, latestValue: 5 }).status, "unclear");
});
