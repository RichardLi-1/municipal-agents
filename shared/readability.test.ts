import { test } from "node:test";
import assert from "node:assert/strict";
import { countSyllables, fleschKincaidGrade, readability, readingGrade } from "./readability.ts";

test("syllable heuristic on common words", () => {
  const cases: [string, number][] = [
    ["the", 1], ["bus", 1], ["make", 1], ["rates", 1], ["table", 2], ["budget", 2], ["transit", 2],
    ["council", 2], ["residents", 3], ["community", 4], ["infrastructure", 4], ["funded", 2], ["planned", 1],
    ["2027", 2], ["", 0],
  ];
  for (const [w, n] of cases) assert.equal(countSyllables(w), n, w);
});

test("plain text grades low, dense text grades high", () => {
  const plain = "The city wants to add bike lanes on King Street. Some parking spots may go. You can speak at council on May 5.";
  const dense =
    "The municipality's comprehensive infrastructure rehabilitation strategy necessitates substantial intergovernmental financial contributions, notwithstanding considerable uncertainty regarding the anticipated operational expenditures associated with the implementation.";
  assert.ok(fleschKincaidGrade(plain) < 6, `plain was ${fleschKincaidGrade(plain)}`);
  assert.ok(fleschKincaidGrade(dense) > 16, `dense was ${fleschKincaidGrade(dense)}`);
});

test("decimal points do not end sentences", () => {
  const r = readability("The plan costs $4.2 million over ten years.");
  assert.equal(r.sentences, 1);
  assert.equal(r.words, 8);
});

test("readingGrade treats each text as a sentence, empty is 0", () => {
  assert.equal(readingGrade([]), 0);
  const g = readingGrade(["Rent may rise", "Buses may come more often"]);
  assert.equal(readability("Rent may rise. Buses may come more often.").grade, g);
});
