import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { AgentEvent, Statement } from "../shared/types.ts";
import { findCachedAnswer, questionKey, readRun, replayLabel, replayRun, RunWriter, sameQuestion, type RunHeader } from "./runfiles.ts";

const st: Statement = { id: "s1", text: "The levy rises 4.9%.", kind: "fact", verified: true, citations: [{ sourceId: "src", page: 3, quote: "the levy rises by 4.9 per cent" }] };

function seed(dir: string, name: string, header: Partial<RunHeader>, events: [number, AgentEvent][]): void {
  fs.mkdirSync(path.join(dir, "runs"), { recursive: true });
  const h: RunHeader = { type: "run", runId: name, kind: "ask", decisionId: "d1", question: "How much will taxes go up?", startedAt: "2026-11-14T06:55:01Z", model: "gemini-3.6-flash", source: "test", ...header };
  fs.writeFileSync(path.join(dir, "runs", `${name}.jsonl`), [h, ...events.map(([t, event]) => ({ t, event }))].map((x) => JSON.stringify(x)).join("\n") + "\n");
}

const answer = (extra: Record<string, unknown> = {}): AgentEvent => ({ type: "answer", text: "The levy rises 4.9% [1].", statements: [st], ...extra });

test("questions match after normalising, or when nearly all words and every number agree", () => {
  assert.equal(questionKey("  How much will TAXES go up?! "), "how much will taxes go up");
  assert.ok(sameQuestion("How much will taxes go up?", "how much will taxes go up"));
  assert.ok(sameQuestion("How much will my regional taxes go up in 2027?", "How much will regional taxes go up in 2027"));
  assert.ok(!sameQuestion("How much will taxes go up in 2027?", "How much will taxes go up in 2026?"), "different numbers");
  assert.ok(!sameQuestion("How much will taxes go up?", "When can I speak to council?"));
  assert.ok(!sameQuestion("Is the region on track for its climate target?", "Is the region on track for its housing target?"));
});

test("the cache picks the newest real answer for the same decision, language and audiences", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ma-runs-"));
  seed(dir, "old", { startedAt: "2026-11-14T05:00:00Z" }, [[10, answer()]]);
  seed(dir, "new", { startedAt: "2026-11-14T06:00:00Z" }, [[10, answer()]]);
  seed(dir, "offline", { startedAt: "2026-11-14T07:00:00Z" }, [[10, answer({ offline: true })]]);
  seed(dir, "errored", { startedAt: "2026-11-14T07:30:00Z" }, [[10, answer()], [20, { type: "error", message: "x" }]]);
  seed(dir, "nothing", { startedAt: "2026-11-14T08:00:00Z" }, [[10, { type: "answer", text: "I couldn't find this.", statements: [] }]]);
  seed(dir, "french", { startedAt: "2026-11-14T09:00:00Z", lang: "fr" }, [[10, answer()]]);
  seed(dir, "renters", { startedAt: "2026-11-14T09:00:00Z", audiences: ["renter"] }, [[10, answer()]]);
  fs.writeFileSync(path.join(dir, "runs", "broken.jsonl"), "{not json");
  const q = { decisionId: "d1", question: "how much will taxes go up" };
  assert.equal(findCachedAnswer(dir, q)?.header.runId, "new");
  assert.equal(findCachedAnswer(dir, { ...q, lang: "fr" })?.header.runId, "french");
  assert.equal(findCachedAnswer(dir, { ...q, audiences: ["renter"] })?.header.runId, "renters");
  assert.equal(findCachedAnswer(dir, { ...q, decisionId: "d2" }), undefined);
  assert.equal(findCachedAnswer(dir, { ...q, question: "What is the levy?" }), undefined);
  // A run whose steps were saved is preferred to a newer one that kept only its answer.
  seed(dir, "with-steps", { startedAt: "2026-11-14T04:00:00Z" }, [[0, { type: "plan", agent: "lead", steps: [] }], [10, answer()]]);
  assert.equal(findCachedAnswer(dir, q)?.header.runId, "with-steps");
});

test("a replay sends the steps, then the answer labelled with when it was answered, and leaves out spend", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ma-runs-"));
  seed(dir, "r1", {}, [
    [0, { type: "plan", agent: "lead", steps: [{ id: "1", specialist: "explainer", question: "q" }] }],
    [2000, { type: "tool", id: "1", specialist: "explainer", tool: "search_pages", summary: "Searched the documents" }],
    [3000, { type: "usage", calls: 2, inputTokens: 100, outputTokens: 10, costUsd: 0.04 }],
    [4000, { type: "statement", id: "1", statement: st }],
    [8000, answer()],
    [8001, { type: "done" }],
  ]);
  const run = readRun(path.join(dir, "runs", "r1.jsonl"))!;
  const sent: AgentEvent[] = [];
  const t0 = Date.now();
  const out = await replayRun(run, (e) => sent.push(e), { speed: 4, minMs: 50, maxMs: 120 });
  const took = Date.now() - t0;
  assert.ok(took >= 100 && took < 1000, `took ${took} ms`);
  assert.deepEqual(sent.map((e) => e.type), ["plan", "tool", "statement", "answer"]);
  assert.equal(out.replay?.runId, "r1");
  assert.equal(out.replay?.costUsd, 0.04);
  assert.equal(out.replay?.label, replayLabel("2026-11-14T06:55:01Z"));
  assert.match(out.replay!.label, /^Answered by the agents on Sat, Nov 14, 1:55 AM ET · replayed from the record$/);
  assert.ok(out.text.endsWith(out.replay!.label));
  assert.ok(out.text.startsWith("The levy rises 4.9% [1]."), "markers still index the same statements");
});

test("a live run is written as a header and one line per event", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ma-runs-"));
  const w = new RunWriter(dir, { kind: "ask", decisionId: "d1", question: "Q?", model: "m" });
  w.write({ type: "plan", agent: "lead", steps: [] });
  w.write(answer());
  const run = readRun(w.file)!;
  assert.equal(run.header.runId, w.runId);
  assert.equal(run.header.source, "live");
  assert.deepEqual(run.lines.map((l) => l.event.type), ["plan", "answer"]);
  assert.match(w.runId, /^\d{8}T\d{6}Z-ask-[0-9a-f]{6}$/);
});

test("provider error text never reaches a visitor", async () => {
  const { failureMessage, safeEvent } = await import("./runs.ts");
  const run = { signal: new AbortController().signal } as Parameters<typeof failureMessage>[1];
  const raw = 'Gemini 402: {"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects"}}';
  const leaks = /ai\.studio|https?:|prepayment|\{/;
  assert.doesNotMatch(failureMessage(Object.assign(new Error("Gemini 402"), { status: 402, detail: raw }), run), leaks);
  assert.equal(failureMessage(Object.assign(new Error("Gemini 402"), { status: 402 }), run), "The AI model can't be reached right now.");
  assert.doesNotMatch(failureMessage(new Error(`rate limit: ${raw}`), run), leaks, "a 'limit' message with provider text is hidden");
  assert.match(failureMessage(new Error("The AI model can't be reached right now: no API key is set."), run), /no API key/);
  assert.doesNotMatch((safeEvent({ type: "error", message: raw }) as { message: string }).message, leaks);
  assert.doesNotMatch((safeEvent({ type: "step.end", id: "1", specialist: "explainer", status: "failed", summary: `Stopped: ${raw}` }) as { summary: string }).summary, leaks);
  const answer = { type: "answer" as const, text: "See https://www.regionofwaterloo.ca/planandbudget", statements: [] };
  assert.deepEqual(safeEvent(answer), answer, "answers may cite the official notice");
});
