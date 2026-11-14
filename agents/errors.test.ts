import { test } from "node:test";
import assert from "node:assert/strict";
import { askWith, generateBriefWith } from "./lead.ts";
import { callGemini, GeminiError } from "./gemini.ts";
import { publicError } from "./loop.ts";
import { fakeDeps, fakeModel, recorder, DEMO } from "./testing.ts";

// What Google sends when the prepaid credit is gone (shape as seen on 14 Nov 2026).
const BODY_402 = JSON.stringify({ error: { code: 402, message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.", status: "FAILED_PRECONDITION" } });
const LEAKS = /ai\.studio|https?:\/\/|prepayment|FAILED_PRECONDITION|\{"error"/;

test("callGemini keeps the provider's body out of the error message", async () => {
  const fetchImpl = (async () => new Response(BODY_402, { status: 402 })) as typeof fetch;
  const err = (await callGemini({ model: "m", contents: [] }, { apiKey: "k", fetchImpl, retries: 0 }).catch((e) => e)) as GeminiError;
  assert.ok(err instanceof GeminiError);
  assert.equal(err.message, "Gemini 402");
  assert.equal(err.status, 402);
  assert.match(err.detail, /prepayment/, "kept for the server's log");
  for (const status of [429, 500, 503]) {
    const f = (async () => new Response('{"error":{"message":"see https://example.com"}}', { status })) as typeof fetch;
    const e = (await callGemini({ model: "m", contents: [] }, { apiKey: "k", fetchImpl: f, retries: 0, sleep: async () => {} }).catch((x) => x)) as GeminiError;
    assert.equal(e.message, `Gemini ${status}`);
  }
});

test("every provider failure becomes plain words", () => {
  const cases: [unknown, RegExp][] = [
    [new GeminiError("Gemini 402", 402, BODY_402), /prepaid credit is used up/],
    [new GeminiError("Gemini 429", 429), /rate-limiting/],
    [new GeminiError("Gemini 503", 503), /outage/],
    [new GeminiError("Gemini request failed", 0, "fetch failed"), /no connection/],
    [new GeminiError("GEMINI_API_KEY is not set", 0), /no API key is set/],
    [new GeminiError("Gemini 400", 400, BODY_402), /returned an error/],
    [Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), /stopped before it finished/],
    [new Error('Something odd {"error": "https://x.y"}'), /Something went wrong/],
  ];
  for (const [err, re] of cases) {
    const msg = publicError(err);
    assert.match(msg, re);
    assert.doesNotMatch(msg, LEAKS);
  }
});

test("no event a resident sees carries the provider's response, for asks or briefs", async () => {
  for (const status of [402, 429, 503, 400]) {
    const model = fakeModel(() => {
      throw new GeminiError(`Gemini ${status}`, status, BODY_402);
    });
    const r = recorder();
    await askWith(r.ctx, { decisionId: DEMO, question: "How many parking spaces go?" }, r.emit, fakeDeps(model));
    assert.doesNotMatch(JSON.stringify(r.events), LEAKS, `ask, status ${status}`);
    const answer = r.events.find((e) => e.type === "answer") as { offline?: boolean } | undefined;
    if (status !== 400) assert.equal(answer?.offline, true, `status ${status} answers offline`);
    else assert.ok(r.events.some((e) => e.type === "error"), "a bad request is an error, in plain words");

    const b = recorder();
    await generateBriefWith(b.ctx, { decisionId: DEMO }, b.emit, fakeDeps(model)).catch(() => {});
    assert.doesNotMatch(JSON.stringify(b.events), LEAKS, `brief, status ${status}`);
  }
});
