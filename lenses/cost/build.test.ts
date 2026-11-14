import { test } from "node:test";
import assert from "node:assert/strict";
import { SPECS, buildDecisionCost, citationOk } from "./build.ts";

// The slider ids the web's Costs tab recomputes with (web/README.md, web/src/lib/cost.ts).
const WEB_IDS = new Set(["horizonYears", "discountRate", "operatingPerYear", "maintenancePerYear", "renewalScale", "capitalOverrun", "capitalCost", "carbonPrice", "households"]);

for (const id of Object.keys(SPECS)) {
  test(`cost lens for ${id}: every quote is on its page, every assumption is a working slider`, () => {
    const lens = buildDecisionCost(id);
    for (const f of lens.figures) {
      if (f.kind === "cited") assert.ok(f.citation && citationOk(f.citation), `figure ${f.id}`);
      else assert.ok(f.formula, `figure ${f.id} needs a formula`);
    }
    assert.ok(lens.statements.length >= 3);
    for (const s of lens.statements) assert.equal(s.verified, true, s.id);
    for (const a of lens.assumptions) {
      assert.ok(WEB_IDS.has(a.id), `assumption ${a.id} is not one the web recomputes`);
      assert.ok(a.value >= a.min && a.value <= a.max && a.step > 0, a.id);
      assert.ok(a.why.length > 30, `${a.id} needs a plain why`);
    }
    assert.equal(lens.series.length, lens.horizonYears);
    assert.equal(lens.discountRate, 0); // the web discounts the stored series itself
    const sum = lens.series.reduce((s, r) => s + r.capital + r.operating + r.maintenance + r.renewal + r.environmental, 0);
    assert.ok(Math.abs(sum - lens.totals.lifecycle) < 1, "totals match the series");
    assert.ok(lens.totals.perHousehold! > 0);
  });
}

test("capital totals match the cited budgets", () => {
  assert.equal(buildDecisionCost("kitchener-transit-hub-variances").totals.capital, 163_492_000); // $34.9M + $128.6M
  assert.equal(buildDecisionCost("row-water-supply-2051").totals.capital, 847_572_000);
  assert.equal(buildDecisionCost("row-2027-budget").totals.capital, 798_000_000);
});

test("GRT operating climbs in a straight line from $195M (2025) to $262M (2034), then holds", () => {
  const s = buildDecisionCost("row-2027-budget").series;
  assert.equal(s[0].operating, 195_000_000);
  assert.equal(s.find((r) => r.year === 2034)!.operating, 262_000_000);
  assert.equal(s.find((r) => r.year === 2040)!.operating, 262_000_000);
  assert.ok(Math.abs(s.find((r) => r.year === 2029)!.operating - (195 + (67 * 4) / 9) * 1e6) < 1);
});

test("a quote that is not on the page fails the check", () => {
  assert.equal(citationOk({ sourceId: "grt-business-plan-2025", page: 5, quote: "Operating Expenditures 195 67 999" }), false);
  assert.equal(citationOk({ sourceId: "grt-business-plan-2025", page: 6, quote: "Operating Expenditures 195 67 262" }), false); // right quote, wrong page
});
