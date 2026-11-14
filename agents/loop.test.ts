import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorpus } from "./corpus.ts";
import { Budget, runStep, type Run } from "./loop.ts";
import { newFindings } from "./tools.ts";
import { calls, fakeModel, modelTurns, recorder, text, FIXTURES, DEMO } from "./testing.ts";
import type { CallModel } from "./gemini.ts";

function makeRun(callModel: CallModel, budget = new Budget()) {
  const r = recorder();
  const run: Run = { ctx: r.ctx, corpus: loadCorpus(FIXTURES, DEMO), findings: newFindings(), budget, emit: r.emit, callModel, model: "gemini-3.6-flash" };
  return { run, ...r };
}

const step = { id: "s1", specialist: "explainer", question: "What does it cost?", task: "Find the cost.", maxCalls: 6 };

test("a specialist searches, records a checked statement, then stops", async () => {
  const model = fakeModel((req) => {
    switch (modelTurns(req)) {
      case 0: return calls({ name: "search_pages", args: { query: "capital cost" } });
      case 1: return calls({
        name: "record_statement",
        args: { text: "Phase 2 would cost $3.1 million.", kind: "fact", section: "answer", citations: [{ sourceId: "demo-report", page: 2, quote: "The total capital cost of Phase 2 is $3.1 million" }] },
      });
      default: return text("Recorded the cost.");
    }
  });
  const { run, events, logs } = makeRun(model);
  const result = await runStep(run, step);

  assert.equal(result.status, "done");
  assert.equal(result.calls, 3);
  assert.equal(run.findings.statements.length, 1);
  assert.deepEqual(events.map((e) => e.type), ["step.start", "usage", "tool", "usage", "statement", "tool", "usage", "step.end"]);
  assert.equal(logs.filter((l) => l.kind === "usage").length, 3);
  assert.equal(run.budget.calls, 3);
  assert.ok(run.budget.usd > 0);

  // The skill and the decision are in the system prompt; tool results go back with the call's id.
  const sys = model.requests[0].system ?? "";
  assert.match(sys, /Rules for every Municipal Agents specialist/);
  assert.match(sys, /# Your skill: explainer/);
  assert.match(sys, /demo-report: "DSD-2026-101/);
  const back = model.requests[1].contents.at(-1)!.parts[0].functionResponse!;
  assert.equal(back.name, "search_pages");
  assert.equal(back.id, "c0");
});

test("a rejected statement goes back to the model with the reason, and it can fix it", async () => {
  const bad = { sourceId: "demo-report", page: 3, quote: "The design removes 64 on-street parking spaces" };
  const good = { ...bad, page: 2 };
  const model = fakeModel((req) => {
    const t = modelTurns(req);
    if (t === 0) return calls({ name: "record_statement", args: { text: "The plan removes 64 parking spaces.", kind: "fact", section: "answer", citations: [bad] } });
    if (t === 1) {
      const reason = JSON.stringify(req.contents.at(-1)!.parts[0].functionResponse!.response);
      assert.match(reason, /on page 2 of demo-report, not page 3/);
      return calls({ name: "record_statement", args: { text: "The plan removes 64 parking spaces.", kind: "fact", section: "answer", citations: [good] } });
    }
    return text("done");
  });
  const { run, logs } = makeRun(model);
  await runStep(run, step);
  assert.equal(run.findings.rejected, 1);
  assert.equal(run.findings.statements.length, 1);
  assert.deepEqual(logs.filter((l) => l.kind.startsWith("statement.")).map((l) => l.kind), ["statement.rejected", "statement.recorded"]);
});

test("the loop stops at the step's call limit and at the run's budget", async () => {
  const forever = fakeModel(() => calls({ name: "search_pages", args: { query: "parking" } }));
  const a = makeRun(forever);
  const r1 = await runStep(a.run, { ...step, maxCalls: 2 });
  assert.equal(r1.calls, 2);
  assert.match(r1.summary, /call limit/);
  assert.equal(r1.status, "failed"); // stopped with nothing recorded

  const b = makeRun(forever, new Budget(3, 0.5));
  const r2 = await runStep(b.run, { ...step, maxCalls: 10 });
  assert.equal(r2.calls, 3);
  assert.match(r2.summary, /budget/);

  const c = makeRun(forever, new Budget(40, 0.000001));
  const r3 = await runStep(c.run, { ...step, maxCalls: 10 });
  assert.equal(r3.calls, 1, "one call spends past a tiny dollar budget, then it stops");
});

test("an unknown tool or a model error does not crash the run", async () => {
  const model = fakeModel((req) => (modelTurns(req) === 0 ? calls({ name: "delete_everything", args: {} }) : text("ok")));
  const { run, events } = makeRun(model);
  const r = await runStep(run, step);
  assert.equal(r.status, "done");
  assert.ok(events.some((e) => e.type === "tool" && /doesn't have/.test(e.summary)));

  const broken = fakeModel(() => {
    throw new Error("Gemini 500: boom");
  });
  const x = makeRun(broken);
  const r2 = await runStep(x.run, step);
  assert.equal(r2.status, "failed");
  assert.ok(x.events.some((e) => e.type === "step.end" && e.status === "failed"));
});

test("old page texts are trimmed from the history to keep calls cheap", async () => {
  const model = fakeModel((req) => (modelTurns(req) < 4 ? calls({ name: "read_page", args: { sourceId: "demo-report", page: 1 } }) : text("done")));
  const { run } = makeRun(model);
  await runStep(run, step);
  const last = model.requests.at(-1)!;
  const responses = last.contents.flatMap((c) => c.parts).filter((p) => p.functionResponse).map((p) => p.functionResponse!.response);
  assert.equal(responses[0].trimmed, true);
  assert.ok(typeof responses.at(-1)!.text === "string");
});

test("budget pools keep calls for one group of steps", () => {
  const b = new Budget(10, 1);
  b.pools = { explainer: { max: 6, used: 0 }, lens: { max: 4, used: 0 } };
  let lens = 0;
  while (b.reserve(false, "lens")) lens++;
  assert.equal(lens, 4);
  let explainer = 0;
  while (b.reserve(false, "explainer")) explainer++;
  assert.equal(explainer, 6);
});
