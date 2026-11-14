import { test } from "node:test";
import assert from "node:assert/strict";
import { glossaryPass, jargonUsed, plainAnswer, plainPass, rewriteProblem, type PlainItem } from "./plain.ts";
import { fakeModel, text } from "./testing.ts";
import type { GeminiRequest } from "./gemini.ts";
import { fleschKincaidGrade } from "../shared/readability.ts";

const hard: PlainItem = {
  id: "s1",
  text: "The Region's comprehensive infrastructure rehabilitation strategy anticipates an annual funding shortfall of $87.6 million.",
  section: "summary",
  kind: "fact",
  quotes: ["the Region's infrastructure funding gap has grown from $82.8M per year to $87.6M per year"],
};

test("a rewrite is kept only if it is easier, keeps every number, and still matches its quotes", () => {
  assert.equal(rewriteProblem(hard, "The Region is short $87.6 million a year to fix its roads and pipes."), null);
  assert.match(rewriteProblem(hard, "The Region is short $88 million a year for repairs.")!, /numbers changed/);
  const roads: PlainItem = { ...hard, text: "The Region keeps regional roads working safely through pothole repairs and grass cutting.", quotes: ["We keep local roads working safely through pothole repairs, grass cutting"] };
  assert.match(rewriteProblem(roads, "Crews mend holes and mow.")!, /no longer uses any words/);
  const impact: PlainItem = { ...hard, section: "impact", text: "Homeowners may see regional property taxes increase as the Region addresses its $87.6 million shortfall." };
  assert.match(rewriteProblem(impact, "Your tax will go up to close a $87.6 million gap.")!, /"may"/);
});

test("plainPass rewrites hard sentences in a batch and keeps the original when a rewrite breaks a rule", async () => {
  const easy: PlainItem = { ...hard, id: "s2", text: "The gap is $87.6 million a year." };
  const other: PlainItem = { ...hard, id: "s3" };
  const model = fakeModel((req: GeminiRequest) => {
    const items = JSON.parse(req.contents[0].parts[0].text!) as { id: string }[];
    assert.deepEqual(items.map((i) => i.id), ["s1", "s3"], "only sentences above grade 8 are sent");
    return text(JSON.stringify([
      { id: "s1", text: "The Region is short $87.6 million a year to fix its roads and pipes." },
      { id: "s3", text: "The Region is short $90 million a year." },
    ]));
  });
  const out = await plainPass(async (req) => model({ ...req, model: "fake" }), [hard, easy, other], { rounds: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "s1");
  assert.ok(out[0].after < out[0].before && out[0].after <= 8);
});

test("plainAnswer keeps markers and numbers, or keeps the original", async () => {
  const answer = "The Region's comprehensive infrastructure rehabilitation strategy anticipates an annual funding shortfall of $87.6 million [1].";
  const good = await plainAnswer(async () => (await fakeModel(() => text("The Region is short $87.6 million a year for repairs [1]."))({ model: "f", contents: [] })), answer);
  assert.equal(good.text, "The Region is short $87.6 million a year for repairs [1].");
  const lostMarker = await plainAnswer(async () => (await fakeModel(() => text("The Region is short $87.6 million a year."))({ model: "f", contents: [] })), answer);
  assert.equal(lostMarker.text, answer);
  assert.ok(fleschKincaidGrade(good.text) < fleschKincaidGrade(answer));
});

test("jargon the brief uses gets explained once", async () => {
  const texts = ["The tax levy pays for the capital budget.", "Register as a delegation to speak."];
  assert.deepEqual(jargonUsed(texts, [{ term: "Delegation", plain: "x" }]).sort(), ["capital budget", "tax levy"]);
  const model = fakeModel(() => text(JSON.stringify([{ term: "tax levy", plain: "The total money raised from property taxes." }, { term: "capital budget", plain: "Money for 10 big projects." }])));
  const terms = await glossaryPass(async (req) => model({ ...req, model: "f" }), texts, [], "demo");
  assert.deepEqual(terms, [{ term: "tax levy", plain: "The total money raised from property taxes." }], "a definition with a number is refused");
});
