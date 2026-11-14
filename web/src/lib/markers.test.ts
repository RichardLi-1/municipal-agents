// Run with: node --test src/lib/markers.test.ts (Node 24 strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkers } from "./markers.ts";

const refs = (text: string, ids?: string[]) => parseMarkers(text, new Set(ids)).filter((p) => typeof p !== "string");
const plain = (text: string, ids?: string[]) => parseMarkers(text, new Set(ids)).filter((p) => typeof p === "string").join("");

test("single markers", () => {
  assert.deepEqual(refs("Taxes rise [2]."), [{ ref: "statement", index: 2 }]);
  assert.deepEqual(refs("About $176 million [C1]."), [{ ref: "figure", index: 1 }]);
  assert.deepEqual(refs("By id [s12].", ["s12"]), [{ ref: "id", id: "s12" }]);
});

test("grouped markers become one ref each", () => {
  assert.deepEqual(refs("Both [2, 3]."), [{ ref: "statement", index: 2 }, { ref: "statement", index: 3 }]);
  assert.deepEqual(refs("Both [2,3]."), [{ ref: "statement", index: 2 }, { ref: "statement", index: 3 }]);
  assert.deepEqual(refs("Mixed [1, C2]."), [{ ref: "statement", index: 1 }, { ref: "figure", index: 2 }]);
});

test("ranges expand", () => {
  assert.deepEqual(refs("Range [2-4]."), [2, 3, 4].map((index) => ({ ref: "statement", index })));
  assert.deepEqual(refs("Range [2 – 3]."), [2, 3].map((index) => ({ ref: "statement", index })));
  assert.deepEqual(refs("Figures [C1-C2]."), [1, 2].map((index) => ({ ref: "figure", index })));
});

test("no bracket text is left for markers", () => {
  for (const s of ["A [2, 3].", "A [2,3].", "A [1, C2].", "A [2-4].", "A [C1]."]) assert.ok(!/[[\]]/.test(plain(s)), s);
  assert.equal(plain("Taxes rise [2]."), "Taxes rise.");
});

test("brackets that aren't markers stay as text", () => {
  assert.equal(plain("He said [sic] it."), "He said [sic] it.");
  assert.equal(plain("A [2, maybe]."), "A [2, maybe].");
  assert.deepEqual(refs("Backwards [4-2]."), []);
});
