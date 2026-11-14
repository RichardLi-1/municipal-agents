import assert from "node:assert/strict";
import { test } from "node:test";
import type { Brief, Statement } from "../shared/types.ts";
import { allStatements, publicBrief, unreviewed } from "./statements.ts";

const st = (id: string, action?: "approved" | "edited" | "rejected"): Statement => ({
  id,
  text: id,
  kind: "fact",
  citations: [],
  verified: false,
  ...(action ? { review: { action, by: "Ana", at: "2026-11-14T07:00:00Z" } } : {}),
});

const brief = (status: Brief["review"]["status"]): Brief =>
  ({
    decisionId: "d",
    lang: "en",
    summary: [st("a", "approved"), st("b", "rejected")],
    impacts: [{ audience: "renter", label: "If you rent", statements: [st("c", "rejected")] }],
    lenses: {
      commitments: { commitments: [{ id: "k", progress: [st("d")] }] },
      // A lens the code doesn't name is still searched.
      future: { notes: [st("e", "edited")] },
    },
    review: { status },
  }) as unknown as Brief;

test("statements are found in every section, including lenses added later", () => {
  assert.deepEqual(allStatements(brief("draft")).map((s) => s.id).sort(), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(unreviewed(brief("draft")).map((s) => s.id), ["d"]);
});

test("a published brief leaves out rejected statements and empty audience groups", () => {
  const pub = publicBrief(brief("published"));
  assert.deepEqual(pub.summary.map((s) => s.id), ["a"]);
  assert.deepEqual(pub.impacts, []);
  assert.equal(allStatements(pub).length, 3);
  assert.deepEqual(publicBrief(brief("draft")).summary.map((s) => s.id), ["a", "b"]);
});

test("a translation follows the review of the brief it came from", () => {
  const source = brief("published");
  const fr = { ...brief("draft"), lang: "fr", summary: [st("a"), st("b")] };
  assert.deepEqual(publicBrief(fr, source).summary.map((s) => s.id), ["a"]);
});

test("a draft hides statements the Municipal Agents team withdrew, and nothing else", () => {
  const b = brief("draft");
  b.summary[0].review = { action: "rejected", by: "Municipal Agents team (not Region staff)", at: "2026-11-14T09:00:00-05:00", note: "Unsupported." };
  assert.deepEqual(publicBrief(b).summary.map((s) => s.id), ["b"]);
});

test("only a staff review counts before publishing, and lens statements from lens files count too", async () => {
  const { withLenses } = await import("./routes/public.ts");
  const b = brief("draft");
  b.summary[0].review = { action: "edited", by: "Municipal Agents team (not Region staff)", at: "2026-11-14T08:30:00-05:00", note: "fixed" };
  b.summary[1].review = { action: "rejected", by: "Municipal Agents team (not Region staff)", at: "2026-11-14T08:30:00-05:00", note: "withdrawn" };
  const merged = withLenses(b, { housing: { statements: [st("lens-1")] } } as never)!;
  // "a" was only corrected by the team; "b" was withdrawn (residents never see it); "lens-1" comes from the lens file.
  assert.deepEqual(unreviewed(merged).map((s) => s.id).sort(), ["a", "d", "lens-1"]);
});
