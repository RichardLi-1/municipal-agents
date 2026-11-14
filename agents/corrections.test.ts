import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Brief } from "../shared/types.ts";
import { applyCorrections, correctionKey, OPERATOR, type Correction } from "../shared/corrections.ts";
import { supportOf } from "./tidy.ts";
import { FIXTURES, DEMO } from "./testing.ts";

const brief = JSON.parse(fs.readFileSync(path.join(FIXTURES, "briefs", `${DEMO}.json`), "utf8")) as Brief;
const pagesOf = (id: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES, "sources", `${id}.pages.json`), "utf8")) as string[];
  } catch {
    return undefined;
  }
};
const base = { by: OPERATOR, at: "2026-11-14T08:30:00-05:00" };

test("a correction edits text, citations and kind, marks it edited by the team (not staff), and keeps the brief a draft", () => {
  const c: Correction = {
    ...base, statementId: "s1", note: "More exact.", kind: "fact",
    text: "Council is asked to approve protected bike lanes on King Street.",
    citations: [{ sourceId: "demo-report", page: 1, quote: "That council approve the design of protected bike lanes on King Street" }],
  };
  const { brief: out, applied, refused } = applyCorrections(brief, [c], pagesOf, { support: (t, q) => supportOf(t, q) });
  assert.equal(refused.length, 0);
  assert.equal(applied[0].key, correctionKey(DEMO, c));
  const s = out.summary[0];
  assert.equal(s.text, c.text);
  assert.equal(s.verified, true);
  assert.equal(s.support, "strong");
  assert.deepEqual(s.review, { action: "edited", by: "Municipal Agents team (not Region staff)", at: base.at, note: "More exact.", originalText: brief.summary[0].text });
  assert.equal(out.review.status, "draft");
  // Applying the same file again changes nothing (the server applies it on every load).
  const again = applyCorrections(out, [c], pagesOf);
  assert.equal(again.brief.summary[0].text, c.text);
  assert.equal(again.brief.summary[0].review?.originalText, brief.summary[0].text);
});

test("a correction whose quote isn't on the page is refused", () => {
  const c: Correction = { ...base, statementId: "s1", note: "x", text: "Phase 2 costs $9 million.", citations: [{ sourceId: "demo-report", page: 2, quote: "The total capital cost of Phase 2 is $9 million" }] };
  const { brief: out, refused } = applyCorrections(brief, [c], pagesOf);
  assert.match(refused[0].reason, /quote not found: demo-report p\.2/);
  assert.equal(out.summary[0].text, brief.summary[0].text);
  assert.match(applyCorrections(brief, [{ ...c, statementId: "nope" }], pagesOf).refused[0].reason, /no statement nope/);
  assert.match(applyCorrections(brief, [{ ...c, note: "" }], pagesOf).refused[0].reason, /needs a note/);
});

test("a statement can be withdrawn (rejected) with a note, and a staff review is never overridden", () => {
  const { brief: out } = applyCorrections(brief, [{ ...base, statementId: "s2", action: "rejected", note: "Not supported by its quote." }], pagesOf);
  assert.equal(out.impacts[0].statements[0].review?.action, "rejected");
  const staffReviewed = structuredClone(brief);
  staffReviewed.summary[0].review = { action: "approved", by: "Ana Silva", at: "2026-11-14T09:00:00-05:00" };
  const { brief: kept } = applyCorrections(staffReviewed, [{ ...base, statementId: "s1", note: "x", text: "Changed." }], pagesOf);
  assert.equal(kept.summary[0].text, brief.summary[0].text);
  assert.equal(kept.summary[0].review?.by, "Ana Silva");
});
