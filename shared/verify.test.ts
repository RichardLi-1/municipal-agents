import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, quoteOnPage, verifyCitation, verifyStatement, findQuotePages } from "./verify.ts";

test("normalise folds case, spacing, quotes, dashes, ligatures and break hyphens", () => {
  assert.equal(normalise("  The  City’s\n“Plan”  "), `the city's "plan"`);
  assert.equal(normalise("2026–2030 — final"), "2026-2030 - final");
  assert.equal(normalise("ﬁnancial ﬂow"), "financial flow");
  assert.equal(normalise("infra-\n   structure renewal"), "infrastructure renewal");
  assert.equal(normalise("non breaking"), "non breaking");
  assert.equal(normalise("Phase 1-\nPhase 2"), "phase 1- phase 2");
});

test("a quote is found on its page after normalising", () => {
  const pages = ["Intro page", "The total capital cost is\n$12.4 million, funded by the\nCanada Housing Infrastructure Fund."];
  assert.ok(verifyCitation(pages, { sourceId: "r", page: 2, quote: "The total capital cost is $12.4 million" }));
  assert.ok(verifyCitation(pages, { sourceId: "r", page: 2, quote: "“the total capital cost is $12.4 million.”" }));
  assert.ok(!verifyCitation(pages, { sourceId: "r", page: 1, quote: "The total capital cost is $12.4 million" }));
  assert.ok(!verifyCitation(pages, { sourceId: "r", page: 3, quote: "The total capital cost" }), "page out of range");
  assert.ok(!verifyCitation(pages, { sourceId: "r", page: 2, quote: "The total capital cost is $14.2 million" }), "changed figure");
});

test("very short quotes prove nothing", () => {
  assert.ok(!quoteOnPage("Budget 2027", "2027"));
});

test("a quote spanning a hyphenated line break or odd spacing still matches", () => {
  const page = "Council approved the long-\nterm financial plan and the infra-\nstructure levy.";
  assert.ok(quoteOnPage(page, "approved the long-term financial plan"));
  assert.ok(quoteOnPage(page, "the infrastructure levy"));
  assert.ok(quoteOnPage("T otal operating cost", "Total operating cost"));
});

test("a quote running down one column of a two-column layout matches", () => {
  const page = [
    "Staff recommend that council approve        The consultation ran from June",
    "the new bus lanes on King Street, at a      to August 2026 and heard from",
    "cost of $3.1 million over two years.        1,240 residents online.",
  ].join("\n");
  assert.ok(quoteOnPage(page, "Staff recommend that council approve the new bus lanes on King Street"));
  assert.ok(quoteOnPage(page, "The consultation ran from June to August 2026 and heard from 1,240 residents"));
  assert.ok(quoteOnPage(page, "at a cost of $3.1 million over two years"));
  // Words skipped mid-line, or out of order, do not match.
  assert.ok(!quoteOnPage(page, "the new bus lanes to August 2026"));
  assert.ok(!quoteOnPage(page, "approve council the new bus lanes"));
});

test("a word hyphenated at the end of a column line matches", () => {
  const page = [
    "The plan replaces aging infra-           Other column text here",
    "structure on Weber Street.               More other column text",
  ].join("\n");
  assert.ok(quoteOnPage(page, "replaces aging infrastructure on Weber Street"));
});

test("findQuotePages says where a quote really is", () => {
  const pages = ["a page about parks", "the levy rises by 1.5 per cent", "nothing"];
  assert.deepEqual(findQuotePages(pages, "the levy rises by 1.5 per cent"), [2]);
});

test("verifyStatement needs at least one citation and all of them found", () => {
  const src: Record<string, string[]> = { a: ["the levy rises by 1.5 per cent"], b: ["parks open in May each year"] };
  const of = (id: string) => src[id];
  assert.deepEqual(verifyStatement(of, { citations: [] }), { verified: false, problems: ["no citations"] });
  assert.ok(verifyStatement(of, { citations: [{ sourceId: "a", page: 1, quote: "the levy rises by 1.5 per cent" }] }).verified);
  const mixed = verifyStatement(of, {
    citations: [
      { sourceId: "a", page: 1, quote: "the levy rises by 1.5 per cent" },
      { sourceId: "b", page: 1, quote: "parks close in May each year" },
    ],
  });
  assert.equal(mixed.verified, false);
  assert.match(mixed.problems[0], /not found on b page 1/);
  assert.match(verifyStatement(of, { citations: [{ sourceId: "zzz", page: 1, quote: "anything at all" }] }).problems[0], /unknown source/);
});
