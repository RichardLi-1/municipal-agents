import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorpus, search } from "./corpus.ts";
import { TOOLS, newFindings, numberBacked, displayValue, type ToolEnv } from "./tools.ts";
import { FIXTURES, DEMO } from "./testing.ts";
import type { AgentEvent } from "../shared/types.ts";

function env(): ToolEnv & { events: AgentEvent[]; logs: { kind: string; payload: any }[] } {
  const events: AgentEvent[] = [];
  const logs: { kind: string; payload: any }[] = [];
  return {
    corpus: loadCorpus(FIXTURES, DEMO),
    findings: newFindings(),
    specialist: "explainer",
    stepId: "s1",
    emit: (e) => events.push(e),
    log: (kind, payload) => logs.push({ kind, payload }),
    events,
    logs,
  };
}

const run = (name: string, args: unknown, e: ToolEnv) => TOOLS[name].run(args, e) as any;

test("search_pages finds the page that talks about parking", () => {
  const e = env();
  const hits = search(e.corpus, "parking spaces removed");
  assert.equal(hits[0].sourceId, "demo-report");
  assert.equal(hits[0].page, 2);
  const out = run("search_pages", { query: "register to speak" }, e);
  assert.equal(out.response.results[0].sourceId, "demo-notice");
  assert.match(out.summary, /Searched the documents/);
});

test("read_page shows columns with | and refuses pages that don't exist", () => {
  const e = env();
  const ok = run("read_page", { sourceId: "demo-report", page: 2 }, e);
  assert.match(ok.response.text, /BACKGROUND \| FINANCIAL IMPLICATIONS/);
  assert.match(run("read_page", { sourceId: "demo-report", page: 9 }, e).response.error, /pages 1 to 3/);
  assert.match(run("read_page", { sourceId: "nope", page: 1 }, e).response.error, /Unknown source/);
});

test("record_statement accepts a quote found on its page, even down a column", () => {
  const e = env();
  const out = run("record_statement", {
    text: "Phase 2 would cost $3.1 million.",
    kind: "fact",
    section: "summary",
    citations: [{ sourceId: "demo-report", page: 2, quote: "The total capital cost of Phase 2 is $3.1 million" }],
  }, e);
  assert.equal(out.response.accepted, true);
  assert.equal(e.findings.statements.length, 1);
  assert.equal(e.findings.statements[0].verified, true);
  assert.equal(e.events[0].type, "statement");
  assert.equal(e.logs[0].kind, "statement.recorded");
});

test("record_statement rejects a wrong page and says where the quote is", () => {
  const e = env();
  const out = run("record_statement", {
    text: "Upkeep may cost $85,000 a year.", kind: "estimate", section: "lens",
    citations: [{ sourceId: "demo-report", page: 2, quote: "estimated at $85,000 a year from 2028" }],
  }, e);
  assert.equal(out.response.accepted, false);
  assert.match(out.response.reasons[0], /on page 3 of demo-report, not page 2/);
  assert.equal(e.findings.statements.length, 0);
  assert.equal(e.findings.rejected, 1);
  assert.equal(e.logs[0].kind, "statement.rejected");
});

test("record_statement rejects a paraphrased quote and shows the closest text", () => {
  const e = env();
  const out = run("record_statement", {
    text: "The plan removes 64 parking spaces.", kind: "fact", section: "summary",
    citations: [{ sourceId: "demo-report", page: 2, quote: "The plan takes away 64 parking spots on the street" }],
  }, e);
  assert.equal(out.response.accepted, false);
  assert.match(out.response.reasons[0], /Quote not found .*Closest text/);
});

test("plain-language rules are enforced in code", () => {
  const e = env();
  const cite = [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }];
  const advocacy = run("record_statement", { text: "Residents should support the plan because it removes 64 spaces.", kind: "fact", section: "summary", citations: cite }, e);
  assert.match(advocacy.response.reasons.join(" "), /Never tell residents/);
  const certain = run("record_statement", { text: "Drivers will lose 64 parking spaces.", kind: "fact", section: "impact", audience: "driver", citations: cite }, e);
  assert.match(certain.response.reasons.join(" "), /"may"/);
  const noAudience = run("record_statement", { text: "Drivers may lose 64 parking spaces.", kind: "fact", section: "impact", citations: cite }, e);
  assert.match(noAudience.response.reasons.join(" "), /needs an audience/);
  const oneSided = run("record_tradeoff", { text: "The lanes remove 64 parking spaces.", citations: cite }, e);
  assert.match(oneSided.response.reasons.join(" "), /both sides/);
  const ok = run("record_statement", { text: "If you drive, you may find less parking: 64 spaces would go.", kind: "fact", section: "impact", audience: "driver", citations: cite }, e);
  assert.equal(ok.response.accepted, true);
});

test("every number in a statement must be in its quotes", () => {
  const e = env();
  const out = run("record_statement", {
    text: "The plan removes 64 parking spaces and costs $3.1 million.", kind: "fact", section: "summary",
    citations: [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }],
  }, e);
  assert.equal(out.response.accepted, false);
  assert.match(out.response.reasons[0], /3\.1 is not/);
  // Numbers from "$ thousands" tables may be shown in millions.
  assert.ok(numberBacked("80.5", ["80483"]));
  assert.ok(numberBacked("1.8", ["1801"]));
  assert.ok(numberBacked("142", ["142.18"]));
  assert.ok(!numberBacked("14.2", ["142.18"]));
});

test("record_figure checks the quote has the number and the value matches the display", () => {
  const e = env();
  const citation = { sourceId: "demo-report", page: 2, quote: "The total capital cost of Phase 2 is $3.1 million" };
  const wrongValue = run("record_figure", { label: "Cost to build", value: 310000, unit: "CAD", display: "$3.1 million", citation }, e);
  assert.match(wrongValue.response.reasons.join(" "), /doesn't match display/);
  const wrongNumber = run("record_figure", { label: "Cost to build", value: 4100000, unit: "CAD", display: "$4.1 million", citation }, e);
  assert.match(wrongNumber.response.reasons.join(" "), /must contain the number/);
  const ok = run("record_figure", { label: "Cost to build", value: 3100000, unit: "CAD", display: "$3.1 million", citation }, e);
  assert.equal(ok.response.accepted, true);
  assert.equal(e.findings.figures[0].kind, "cited");
  assert.equal(displayValue("$87.6 million"), 87_600_000);
  assert.equal(displayValue("182 m3"), 182);
});

test("record_unknown and record_term skip near-duplicates", () => {
  const e = env();
  run("record_unknown", { question: "Where drivers will park during construction", why: "Shops need parking", whoCanAnswer: "Transportation Services" }, e);
  run("record_unknown", { question: "Where will drivers park during the construction?", why: "x", whoCanAnswer: "y" }, e);
  assert.equal(e.findings.unknowns.length, 1);
  run("record_term", { term: "Capital cost", plain: "The price to build it." }, e);
  run("record_term", { term: "capital cost", plain: "Again." }, e);
  assert.equal(e.findings.terms.length, 1);
});

test("record_commitment needs cited target and progress before claiming a status", async () => {
  const e = env();
  const target = { text: "The plan aims for 25 kilometres of protected bike lanes by 2030.", citations: [{ sourceId: "demo-report", page: 3, quote: "target of 25 kilometres of protected bike lanes by 2030" }] };
  const progress = { text: "By the end of 2025, 11.4 kilometres were built.", citations: [{ sourceId: "demo-report", page: 3, quote: "At the end of 2025 the city had built 11.4" }] };
  const base = { title: "25 km of protected bike lanes by 2030", madeBy: "Council", target: "25 km by 2030", relation: "Phase 2 adds lanes on King Street." };
  const tooSure = await run("record_commitment", { ...base, status: "behind", progress: [target] }, e);
  assert.equal(tooSure.response.accepted, false);
  const ok = await run("record_commitment", { ...base, status: "behind", progress: [target, progress], unclear: ["No yearly target"] }, e);
  assert.equal(ok.response.accepted, true);
  assert.equal(e.findings.commitments[0].progress.every((s) => s.verified), true);
});

test("with numbers from its quotes, a commitment's status is computed by code", async () => {
  const e = env();
  const progress = [
    { text: "The plan aims for 25 kilometres of protected bike lanes by 2030.", citations: [{ sourceId: "demo-report", page: 3, quote: "target of 25 kilometres of protected bike lanes by 2030" }] },
    { text: "By the end of 2025, 11.4 kilometres were built.", citations: [{ sourceId: "demo-report", page: 3, quote: "At the end of 2025 the city had built 11.4" }] },
  ];
  const base = { title: "25 km of protected bike lanes by 2030", madeBy: "Council", target: "25 km by 2030", relation: "Adds lanes.", progress };
  const invented = await run("record_commitment", { ...base, status: "on-track", numbers: { baselineYear: 2019, baselineValue: 3, targetYear: 2030, targetValue: 25, latestYear: 2025, latestValue: 11.4 } }, e);
  assert.match(invented.response.reasons.join(" "), /baselineYear, baselineValue must be numbers found/);
  const out = await run("record_commitment", { ...base, status: "on-track", numbers: { baselineYear: 2025, baselineValue: 0, targetYear: 2030, targetValue: 25, latestYear: 2025, latestValue: 11.4, unit: "km" } }, e);
  assert.equal(out.response.accepted, true);
  assert.equal(e.findings.commitments[0].status, "on-track"); // 46% of the way with 0% of the time gone
  assert.match((e.findings.commitments[0] as any).computed.explanation, /straight line/);
});

test("computed figures must come from a lens result seen in this run", async () => {
  const e = env();
  const fig = { lens: "transit", label: "People who reach a hospital in 45 min, Sunday 8 am", value: 48, unit: "%", display: "48%", method: "Median trip time from GTFS" };
  const early = run("record_computed_figure", fig, e);
  assert.match(early.response.reasons[0], /Look up the transit lens first/);
  e.findings.lensOutputs.transit = "- hospital (45 min): Weekday 8 am 64%, Sunday 8 am 48%";
  const wrong = run("record_computed_figure", { ...fig, value: 52, display: "52%" }, e);
  assert.match(wrong.response.reasons[0], /52 is not in the transit result/);
  const ok = run("record_computed_figure", fig, e);
  assert.equal(ok.response.accepted, true);
  assert.equal(e.findings.figures[0].kind, "computed");
  assert.match(e.findings.figures[0].formula!, /Median trip time/);
});

test("the lifecycle cost is built only from cited figures or stated assumptions", async () => {
  const e = env();
  run("record_figure", { label: "Cost to build", value: 3100000, unit: "CAD", display: "$3.1 million", citation: { sourceId: "demo-report", page: 2, quote: "The total capital cost of Phase 2 is $3.1 million" } }, e);
  run("record_figure", { label: "Upkeep", value: 85000, unit: "CAD", display: "$85,000 a year", citation: { sourceId: "demo-report", page: 3, quote: "is estimated at $85,000 a year from 2028" } }, e);
  const [cap, upkeep] = e.findings.figures;
  const args = { asset: "King Street lanes", startYear: 2027, horizonYears: 25, capital: 3100000, operatingPerYear: 0, maintenancePerYear: 85000 };
  const unsourced = await run("build_lifecycle_cost", { ...args, sources: [{ input: "capital", figureId: cap.id }] }, e);
  assert.match(unsourced.response.reasons.join(" "), /operatingPerYear needs a source/);
  const out = await run("build_lifecycle_cost", {
    ...args,
    sources: [{ input: "capital", figureId: cap.id }, { input: "maintenancePerYear", figureId: upkeep.id }, { input: "operatingPerYear", assumption: "No separate operating cost is given." }],
  }, e);
  assert.equal(out.response.accepted, true, JSON.stringify(out.response));
  assert.equal(e.findings.costLens!.totals.capital, 3100000);
  assert.equal(e.findings.costLens!.assumptions[0].id, "operatingPerYear");
  assert.match(out.response.summary, /LIFECYCLE COST over 25 years/);
});

test("lens tools say plainly when nothing is computed", async () => {
  const e = env();
  const out = await run("transit_gaps", {}, e);
  assert.equal(out.response.available, false);
});

test("a sentence must share words with its quotes, and placeholders are refused", () => {
  const e = env();
  const cite = [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }];
  const unrelated = run("record_statement", { text: "Council meets every month in the chambers.", kind: "fact", section: "summary", citations: cite }, e);
  assert.match(unrelated.response.reasons.join(" "), /shares no words/);
  const placeholder = run("record_statement", { text: "processing plain sentence 1", kind: "fact", section: "summary", citations: cite }, e);
  assert.match(placeholder.response.reasons.join(" "), /placeholder/);
  const paraphrase = run("record_statement", { text: "About 64 places to park on the street would go.", kind: "fact", section: "summary", citations: cite }, e);
  assert.equal(paraphrase.response.accepted, true, "a shared number counts");
});

test("dates from the hand-checked timeline may be stated; other dates need a quote", () => {
  const e = env();
  const cite = [{ sourceId: "demo-notice", page: 1, quote: "To speak at the meeting, register with the Clerk by noon on Friday" }];
  const ok = run("record_statement", { text: "To speak on November 23, register by noon on November 20.", kind: "fact", section: "haveYourSay", citations: cite }, e);
  assert.equal(ok.response.accepted, true, JSON.stringify(ok.response));
  const off = run("record_statement", { text: "To speak on November 30, register by noon on November 27.", kind: "fact", section: "haveYourSay", citations: cite }, e);
  assert.match(off.response.reasons.join(" "), /30, 27 are not/);
});
