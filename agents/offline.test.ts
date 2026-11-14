import { test } from "node:test";
import assert from "node:assert/strict";
import { askWith, generateBriefWith } from "./lead.ts";
import { checkedStatements, offlineAnswer, OFFLINE_INTRO } from "./offline.ts";
import { GeminiError } from "./gemini.ts";
import { fakeDeps, fakeModel, recorder, FIXTURES, DEMO } from "./testing.ts";
import fs from "node:fs";
import path from "node:path";

const noCredit = () => fakeModel(() => {
  throw new GeminiError('Gemini 402: {"error":{"code":402,"message":"Your prepayment credits are depleted."}}', 402);
});

test("checked statements leave out unverified ones and those staff rejected", () => {
  const brief = JSON.parse(fs.readFileSync(path.join(FIXTURES, "briefs", `${DEMO}.json`), "utf8"));
  const ids = checkedStatements(brief).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["s1", "s2", "s3", "s5"]);
});

test("offline answers rank the brief's checked statements against the question", () => {
  const a = offlineAnswer(FIXTURES, DEMO, "How many parking spaces will be lost?");
  assert.equal(a.offline, true);
  assert.ok(a.text.startsWith(OFFLINE_INTRO));
  assert.equal(a.statements[0].id, "s2");
  assert.match(a.text, /64 spaces would go\. \[1\]/);
  assert.match(a.text, /draft/);
  assert.ok(!a.statements.some((s) => s.id === "s4"), "a rejected statement is never shown");
  const none = offlineAnswer(FIXTURES, DEMO, "zebra crossing helicopter");
  assert.equal(none.statements.length, 0);
  assert.match(none.text, /doesn't cover that question/);
});

test("ask answers offline, without error, when the model has no credit (402)", async () => {
  const r = recorder();
  await askWith(r.ctx, { decisionId: DEMO, question: "When can I register to speak?" }, r.emit, fakeDeps(noCredit()));
  assert.deepEqual(r.events.map((e) => e.type).filter((t) => t !== "usage"), ["answer", "done"]);
  const a = r.events.find((e) => e.type === "answer") as any;
  assert.equal(a.offline, true);
  assert.match(a.text, /prepaid credit is used up/);
  assert.equal(a.statements[0].id, "s3");
  const given = r.logs.find((l) => l.kind === "answer.given")!.payload as any;
  assert.equal(given.offline, true);
});

test("generateBrief says plainly that the model can't be reached", async () => {
  const r = recorder();
  await assert.rejects(generateBriefWith(r.ctx, { decisionId: DEMO }, r.emit, fakeDeps(noCredit())), /can't be reached right now: the model service's prepaid credit is used up/);
});

// The questions that showed the old ranking's faults, against the real committed data.
const DATA = path.join(import.meta.dirname, "..", "data");
const lines = (t: string) => t.split("\n").filter((l) => l.startsWith("•"));

test("offline: generic verbs don't match ('Will my garbage pickup change?' gets no bus statement)", () => {
  const a = offlineAnswer(DATA, "row-2027-budget", "Will my garbage pickup change?");
  assert.doesNotMatch(a.text, /\bbus\b/i);
  for (const l of lines(a.text)) assert.match(l, /garbage|waste|collection/i);
});

test("offline: 'Who proposes the budget?' finds the Chair's deadline in the hand-checked timeline, with its citation", () => {
  const a = offlineAnswer(DATA, "row-2027-budget", "Who proposes the budget?");
  const chair = a.statements.find((s) => s.id === "timeline-chair-proposes");
  assert.ok(chair, a.text);
  assert.equal(chair.verified, true);
  assert.equal(chair.citations[0].sourceId, "oreg-530-22");
});

test("offline: appeal rights come from the timeline (who can appeal, 20 days)", () => {
  const a = offlineAnswer(DATA, "kitchener-transit-hub-variances", "Can I appeal the decision?");
  assert.match(a.text, /appeal/i);
  assert.match(a.text, /20 days/);
  assert.ok(a.statements.every((s) => s.verified));
});

test("offline: Sunday transit gaps come from the computed transit lens, marked as computed", () => {
  const a = offlineAnswer(DATA, "row-2027-budget", "Can I get a bus early on Sunday morning?");
  assert.ok(a.figures?.some((f) => f.kind === "computed" && /Sunday/i.test(f.label)), a.text);
  assert.match(a.text, /\(computed from open data\) \[C1\]/);
});

test("offline: the construction scenario only answers construction questions, and is always labelled", () => {
  const police = offlineAnswer(DATA, "row-2027-budget", "How much does the Region spend on police?");
  assert.doesNotMatch(police.text, /scenario/i);
  const tunnel = offlineAnswer(DATA, "row-2027-budget", "What would trucks be like if ION went in a tunnel?");
  for (const l of lines(tunnel.text)) assert.match(l, /Illustrative scenario, not a Region plan/);
});

test("offline: nothing relevant means saying so and naming the Clerk", () => {
  const a = offlineAnswer(DATA, "row-2027-budget", "What is the weather tomorrow?");
  assert.equal(a.statements.length, 0);
  assert.match(a.text, /doesn't cover that question\. You can ask the Clerk: Regional Clerk/);
});
