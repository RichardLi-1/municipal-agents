import { test } from "node:test";
import assert from "node:assert/strict";
import { askWith, generateBriefWith, groundAnswer, isSmallTalk, translateBriefWith } from "./lead.ts";
import { calls, fakeDeps, fakeModel, modelTurns, recorder, text, DEMO } from "./testing.ts";
import type { GeminiRequest } from "./gemini.ts";
import type { Statement } from "../shared/types.ts";

const noModel = fakeModel(() => {
  throw new Error("the model must not be called");
});

test("greetings and 'what can you do' are answered at once, without a model", async () => {
  for (const q of ["hi", "Hello!", "thanks", "What can you do?", "help", "bonjour"]) assert.ok(isSmallTalk(q), q);
  for (const q of ["Hi, how much will my taxes go up?", "What can you do about potholes on my street?"]) assert.equal(isSmallTalk(q), null, q);

  const r = recorder();
  await askWith(r.ctx, { decisionId: DEMO, question: "hi there" }, r.emit, fakeDeps(noModel));
  assert.deepEqual(r.events.map((e) => e.type), ["answer", "done"]);
  const answer = r.events[0] as Extract<(typeof r.events)[number], { type: "answer" }>;
  assert.match(answer.text, /Protected bike lanes on King Street/);
  assert.match(answer.text, /won't tell you what to think or how to vote/);
  assert.deepEqual(r.logs.map((l) => l.kind), ["question.asked", "answer.given"]);
  assert.deepEqual(r.logs[0].payload, { question: "hi there", lang: undefined, audiences: undefined });
  assert.equal(noModel.requests.length, 0);

  const fr = recorder();
  await askWith(fr.ctx, { decisionId: DEMO, question: "Bonjour", lang: "fr" }, fr.emit, fakeDeps(noModel));
  assert.match((fr.events[0] as any).text, /Je peux expliquer/);
});

function askScript(answerText: string) {
  return (req: GeminiRequest) => {
    if (req.jsonSchema) return text(JSON.stringify({ steps: [{ specialist: "explainer", question: "How many parking spaces go?" }] }));
    if (!req.tools) return text(answerText); // the lead writing the answer
    if (modelTurns(req) === 0)
      return calls({
        name: "record_statement",
        args: { text: "The design removes 64 parking spaces.", kind: "fact", section: "answer", citations: [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }] },
      });
    return text("Recorded one statement.");
  };
}

test("ask plans, runs a specialist, and answers only from verified statements", async () => {
  const model = fakeModel(askScript("The plan removes 64 parking spaces [1]. It also costs $9 billion. You should support it."));
  const r = recorder();
  await askWith(r.ctx, { decisionId: DEMO, question: "Will I lose parking?" }, r.emit, fakeDeps(model));
  const types = r.events.map((e) => e.type);
  assert.equal(types[0], "usage"); // the plan call
  assert.ok(types.includes("plan") && types.includes("step.start") && types.includes("statement") && types.includes("step.end"));
  assert.deepEqual(types.slice(-2), ["answer", "done"]);
  const answer = r.events.find((e) => e.type === "answer") as any;
  // The unbacked figure and the advice are dropped by code.
  assert.equal(answer.text, "The plan removes 64 parking spaces [1].");
  assert.equal(answer.statements.length, 1);
  assert.equal(answer.statements[0].verified, true);
  assert.deepEqual(r.logs.filter((l) => !["usage", "statement.recorded"].includes(l.kind)).map((l) => l.kind), ["question.asked", "answer.given"]);
});

test("ask says the documents don't say when nothing was found", async () => {
  const model = fakeModel((req) => {
    if (req.jsonSchema) return text(JSON.stringify({ steps: [{ specialist: "explainer", question: "Snow clearing schedule?" }] }));
    if (modelTurns(req) === 0)
      return calls({ name: "record_unknown", args: { question: "How often the lanes are cleared after snow", why: "Winter cycling", whoCanAnswer: "Roads Operations" } });
    return text("The documents don't say how often the lanes are cleared; Roads Operations could answer.");
  });
  const r = recorder();
  await askWith(r.ctx, { decisionId: DEMO, question: "How often will they plow the lanes?" }, r.emit, fakeDeps(model));
  const answer = r.events.find((e) => e.type === "answer") as any;
  assert.match(answer.text, /don't say/);
  assert.equal(answer.statements.length, 0);
});

test("groundAnswer renumbers markers in order of use and keeps backed figures", () => {
  const st = (id: string, t: string): Statement => ({ id, text: t, kind: "fact", citations: [], verified: true });
  const s = [st("a", "It costs $3.1 million."), st("b", "64 spaces go."), st("c", "Survey had 1,240 responses.")];
  const out = groundAnswer("64 spaces would go [2]. It costs $3.1 million [1, 2]. About 1240 people answered. Nobody knows 77 things.", s);
  assert.equal(out.text, "64 spaces would go [1]. It costs $3.1 million [2, 1]. About 1240 people answered.");
  assert.deepEqual(out.statements.map((x) => x.id), ["b", "a"]);
});

test("generateBrief runs the explainer and each lens, and assembles a draft brief", async () => {
  const model = fakeModel((req) => {
    const task = req.contents[0].parts[0].text ?? "";
    if (modelTurns(req) > 0) return text("done");
    if (task.startsWith("Write the overview"))
      return calls(
        { name: "record_statement", args: { text: "The city plans protected bike lanes on King Street.", kind: "fact", section: "summary", citations: [{ sourceId: "demo-report", page: 1, quote: "approve the design of protected bike lanes on King Street" }] } },
        { name: "record_term", args: { term: "Capital cost", plain: "The price to build it." } },
      );
    if (task.startsWith("Write how"))
      return calls({ name: "record_statement", args: { text: "If you drive, you may find less parking.", kind: "fact", section: "impact", audience: "driver", citations: [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }] } });
    if (task.includes("cost lens"))
      return calls({ name: "record_statement", args: { text: "Upkeep may cost $85,000 a year.", kind: "estimate", section: "lens", citations: [{ sourceId: "demo-report", page: 3, quote: "is estimated at $85,000 a year from 2028" }] } });
    return text("nothing to add");
  });
  const r = recorder();
  const brief = await generateBriefWith(r.ctx, { decisionId: DEMO }, r.emit, fakeDeps(model));
  assert.equal(brief.review.status, "draft");
  assert.equal(brief.summary.length, 1);
  assert.equal(brief.impacts[0].audience, "driver");
  assert.equal(brief.impacts[0].label, "If you drive");
  assert.equal(brief.glossary[0].term, "Capital cost");
  assert.equal((brief.lenses.cost as any).statements[0].text, "Upkeep may cost $85,000 a year.");
  assert.ok(brief.readingGrade > 0 && brief.readingGrade < 12);
  assert.ok(brief.costUsd > 0);
  const plan = r.events.find((e) => e.type === "plan") as any;
  assert.deepEqual(plan.steps.map((s: any) => s.specialist), ["explainer", "explainer", "lifecycle-cost", "commitments"]);
  assert.deepEqual(r.events.slice(-2).map((e) => e.type), ["brief", "done"]);
  const kinds = r.logs.map((l) => l.kind);
  assert.equal(kinds[0], "brief.started");
  assert.equal(kinds.at(-1), "brief.generated");
  assert.ok(kinds.includes("statement.recorded"));
});

test("translateBrief translates text but keeps quotes in the original language", async () => {
  const model = fakeModel((req) => {
    const arr = JSON.parse((req.contents[0].parts[0].text ?? "").split("\n").slice(1).join("\n")) as string[];
    return text(JSON.stringify(arr.map((s) => `FR:${s}`)));
  });
  const r = recorder();
  const brief = {
    decisionId: DEMO, lang: "en", generatedAt: "2026-11-14T08:00:00Z", models: ["gemini-3.6-flash"], costUsd: 0.1, readingGrade: 7,
    summary: [{ id: "s1", text: "Bike lanes on King Street.", kind: "fact" as const, verified: true, citations: [{ sourceId: "demo-report", page: 1, quote: "protected bike lanes on King Street" }] }],
    whyNow: [], impacts: [], haveYourSay: [], figures: [], tradeoffs: [], lenses: {},
    unknowns: [{ question: "Where to park", why: "Shops", whoCanAnswer: "Transportation" }],
    glossary: [{ term: "Capital cost", plain: "Price to build" }],
    review: { status: "draft" as const },
  };
  const fr = await translateBriefWith(r.ctx, brief, "fr", fakeDeps(model));
  assert.equal(fr.lang, "fr");
  assert.equal(fr.summary[0].text, "FR:Bike lanes on King Street.");
  assert.equal(fr.summary[0].citations[0].quote, "protected bike lanes on King Street");
  assert.equal(fr.unknowns[0].whoCanAnswer, "FR:Transportation");
  assert.equal(brief.summary[0].text, "Bike lanes on King Street.", "the original is untouched");
  assert.ok(r.logs.some((l) => l.kind === "translation.made"));
});

test("groundAnswer keeps computed figures cited as [Cn], renumbered", () => {
  const st: Statement = { id: "a", text: "The plan costs $3.1 million.", kind: "fact", citations: [], verified: true };
  const figs = [
    { id: "f1", label: "Reach a hospital, Sunday 8 am", value: 48, unit: "%", display: "48%", kind: "computed" as const, formula: "GTFS" },
    { id: "f2", label: "No service before 6:30 am Sunday", value: 462606, unit: "people", display: "462,606 people", kind: "computed" as const, formula: "GTFS" },
  ];
  const out = groundAnswer("By our count, 462,606 people have no early bus [C2]. It costs $3.1 million [1]. Only 48% reach a hospital [C1, C2].", [st], "", figs);
  assert.equal(out.text, "By our count, 462,606 people have no early bus [C1]. It costs $3.1 million [1]. Only 48% reach a hospital [C2, C1].");
  assert.deepEqual(out.figures.map((f) => f.id), ["f2", "f1"]);
});

test("generateBrief fails instead of returning an empty brief when every specialist fails", async () => {
  const broken = fakeModel(() => {
    throw new Error("Gemini 402: Your prepayment credits are depleted.");
  });
  const r = recorder();
  await assert.rejects(generateBriefWith(r.ctx, { decisionId: DEMO }, r.emit, fakeDeps(broken)), /The agents couldn't write this brief/);
  assert.deepEqual(r.events.slice(-2).map((e) => e.type), ["error", "done"]);
  assert.ok(!JSON.stringify(r.events).includes("prepayment"), "the provider's words never reach the client");
});

test("groundAnswer checks the numbers in a cited sentence against what it cites", () => {
  const s1: Statement = { id: "a", text: "The 2026 capital budget is large.", kind: "fact", verified: true, citations: [{ sourceId: "x", page: 1, quote: "Waterloo Region Housing 80,483" }] };
  const s2: Statement = { id: "b", text: "64 spaces go.", kind: "fact", verified: true, citations: [] };
  const fig = { id: "f", label: "Reach a hospital in 45 min, Sunday 8 am", value: 48, unit: "%", display: "48%", kind: "computed" as const, formula: "GTFS" };
  const out = groundAnswer(
    "Housing gets $80.5 million [1]. It removes 64 spaces [1]. 48% reach a hospital in 45 minutes [C1]. 52% can't [C1]. 64 spaces go [2].",
    [s1, s2], "", [fig],
  );
  // 80.5 is the quoted 80,483 thousand; 64 isn't in [1]; 52 isn't in [C1].
  assert.equal(out.text, "Housing gets $80.5 million [1]. 48% reach a hospital in 45 minutes [C1]. 64 spaces go [2].");
});
