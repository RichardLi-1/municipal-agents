import { test } from "node:test";
import assert from "node:assert/strict";
import { lifecycleCost, buildCostLens, costSummary } from "./lifecycle.ts";

test("capital spread over build years, then operating and maintenance each year of service", () => {
  const r = lifecycleCost({ startYear: 2027, horizonYears: 5, capital: 3_000_000, buildYears: 2, operatingPerYear: 100_000, maintenancePerYear: 50_000 });
  assert.equal(r.serviceStartYear, 2029);
  assert.deepEqual(r.series.map((s) => s.capital), [1_500_000, 1_500_000, 0, 0, 0]);
  assert.deepEqual(r.series.map((s) => s.operating), [0, 0, 100_000, 100_000, 100_000]);
  assert.equal(r.totals.capital, 3_000_000);
  assert.equal(r.totals.operating, 300_000);
  assert.equal(r.totals.maintenance, 150_000);
  assert.equal(r.totals.lifecycle, 3_450_000);
  assert.equal(r.totals.perHousehold, undefined);
});

test("renewals at stated years and repeating, emissions times a carbon price schedule", () => {
  const r = lifecycleCost({
    startYear: 2027, horizonYears: 30, capital: [{ year: 2027, amount: 10_000_000 }],
    operatingPerYear: 0, maintenancePerYear: 0,
    renewals: [{ afterYears: 20, amount: 2_000_000, label: "roof" }],
    renewalEvery: { years: 10, amount: 500_000 },
    emissionsTPerYear: 100,
    carbonPrice: [{ year: 2027, price: 110 }, { year: 2030, price: 170 }],
    households: 1000,
  });
  // Service from 2028; renewals at 2038, 2048 (+ roof), 2058 is past the horizon (last year 2056).
  const ren = r.series.filter((s) => s.renewal > 0).map((s) => [s.year, s.renewal]);
  assert.deepEqual(ren, [[2038, 500_000], [2048, 2_500_000]]);
  assert.equal(r.series.find((s) => s.year === 2028)!.environmental, 11_000);
  assert.equal(r.series.find((s) => s.year === 2031)!.environmental, 17_000);
  assert.equal(r.totals.environmental, 2 * 11_000 + 27 * 17_000);
  assert.equal(r.totals.perHousehold, r.totals.lifecycle / 1000);
});

test("discounting lowers later years; undiscounted totals are kept", () => {
  const r = lifecycleCost({ startYear: 2027, horizonYears: 3, capital: 0, buildYears: 1, serviceStartYear: 2027, operatingPerYear: 1000, maintenancePerYear: 0, discountRate: 0.03 });
  assert.equal(r.series[0].operating, 1000);
  assert.equal(r.series[1].operating, Math.round((1000 / 1.03) * 100) / 100);
  assert.equal(r.undiscounted.operating, 3000);
  assert.ok(r.totals.lifecycle < 3000 && r.totals.lifecycle > 2900);
});

test("buildCostLens and costSummary", () => {
  const inputs = { startYear: 2027, horizonYears: 25, capital: 25_000_000, buildYears: 2, operatingPerYear: 400_000, maintenancePerYear: 250_000, households: 230_000 };
  const lens = buildCostLens({ asset: "Test centre", inputs });
  assert.equal(lens.series.length, 25);
  assert.equal(lens.discountRate, 0);
  assert.equal(lens.totals.capital, 25_000_000);
  const text = costSummary(inputs);
  assert.match(text, /Capital \$25\.0 million/);
  assert.match(text, /Per household/);
});

test("index: recompute a built lens for another horizon and discount rate", async () => {
  const { lifecycleCost: tool, buildCostLens: build } = await import("./index.ts");
  const lens = build({ asset: "x", inputs: { startYear: 2027, horizonYears: 25, capital: 1_000_000, operatingPerYear: 10_000, maintenancePerYear: 5_000 } });
  const longer = tool(lens, { horizonYears: 40, discountRate: 0.03 });
  assert.equal(longer.horizonYears, 40);
  assert.equal(longer.series.length, 40);
  assert.ok(longer.totals.operating < 39 * 10_000);
  const plain = tool({ startYear: 2027, horizonYears: 2, capital: 10, operatingPerYear: 1, maintenancePerYear: 0 });
  assert.equal(plain.totals.lifecycle, 11);
});
