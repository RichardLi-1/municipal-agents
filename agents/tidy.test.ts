import { test } from "node:test";
import assert from "node:assert/strict";
import type { Brief, Statement } from "../shared/types.ts";
import { repairText, textArtifacts, tidyBrief } from "./tidy.ts";
import { rewriteProblem } from "./plain.ts";
import { TOOLS, newFindings } from "./tools.ts";
import { loadCorpus } from "./corpus.ts";
import { FIXTURES, DEMO } from "./testing.ts";

const st = (id: string, text: string, kind: Statement["kind"] = "fact"): Statement => ({ id, text, kind, verified: true, citations: [{ sourceId: "demo-report", page: 2, quote: "The design removes 64 on-street parking spaces" }] });

test("a stray word before the sentence is caught and repaired (the 'reached The Region…' glitch)", () => {
  assert.equal(textArtifacts("reached The Region is planning where to get tap water through to 2051.").length, 1);
  assert.equal(repairText("reached The Region is planning where to get tap water through to 2051."), "The Region is planning where to get tap water through to 2051.");
  assert.deepEqual(textArtifacts("The Region is planning where to get tap water."), []);
  assert.deepEqual(textArtifacts("iXpress buses may run more often."), [], "a word with a capital inside isn't stray");
  assert.match(textArtifacts("The the plan adds lanes.")[0], /repeated/);
});

test("record_statement refuses a stray leading word; the plain pass refuses a rewrite that has one", () => {
  const env = { corpus: loadCorpus(FIXTURES, DEMO), findings: newFindings(), specialist: "explainer", stepId: "s", emit: () => {}, log: () => {} };
  const out = TOOLS.record_statement.run({ text: "reached The design removes 64 parking spaces.", kind: "fact", section: "summary", citations: st("x", "").citations }, env) as unknown as { response: { accepted: boolean; reasons: string[] } };
  assert.equal(out.response.accepted, false);
  assert.match(out.response.reasons[0], /stray word/);
  const item = { id: "s1", text: "The comprehensive design eliminates 64 on-street parking spaces.", section: "summary" as const, kind: "fact" as const, quotes: ["The design removes 64 on-street parking spaces"] };
  assert.match(rewriteProblem(item, "removes The design takes away 64 parking spaces.")!, /stray word/);
  assert.match(rewriteProblem(item, "the design takes away 64 parking spaces.")!, /middle of a sentence/);
});

test("hedged statements are estimates, never facts", () => {
  const env = { corpus: loadCorpus(FIXTURES, DEMO), findings: newFindings(), specialist: "explainer", stepId: "s", emit: () => {}, log: () => {} };
  TOOLS.record_statement.run({ text: "If you drive, you may find less parking: 64 spaces would go.", kind: "fact", section: "impact", audience: "driver", citations: st("x", "").citations }, env);
  assert.equal(env.findings.statements[0].kind, "estimate");
});

test("tidyBrief drops repeated trade-offs and unknowns, repairs glitches, and re-measures the grade", () => {
  const brief = {
    decisionId: "d", lang: "en", generatedAt: "", models: [], costUsd: 0, readingGrade: 0, glossary: [], figures: [], lenses: {}, review: { status: "draft" },
    summary: [st("a", "reached The design removes 64 parking spaces.")],
    whyNow: [], haveYourSay: [],
    impacts: [{ audience: "driver", label: "If you drive", statements: [st("b", "Drivers may lose 64 parking spaces.")] }],
    tradeoffs: [
      st("t1", "Adding bus service helps riders, but it raises regional property taxes.", "tradeoff"),
      st("t2", "More bus service helps riders but raises regional property taxes.", "tradeoff"),
      st("t3", "Lower taxes keep bills down, but the repair gap grows.", "tradeoff"),
    ],
    unknowns: [
      { question: "How much ION Stage 2 will cost to run each year", why: "", whoCanAnswer: "" },
      { question: "What will ION Stage 2 cost to run each year once built?", why: "", whoCanAnswer: "" },
      { question: "When the survey results will be published", why: "", whoCanAnswer: "" },
    ],
  } as unknown as Brief;
  const { brief: out, report } = tidyBrief(brief);
  assert.equal(out.summary[0].text, "The design removes 64 parking spaces.");
  assert.deepEqual(out.tradeoffs.map((s) => s.id), ["t1", "t3"]);
  assert.equal(out.unknowns.length, 2);
  assert.equal(out.impacts[0].statements[0].kind, "estimate");
  assert.equal(report.repaired.length, 1);
  assert.ok(out.readingGrade > 0);
  assert.equal(brief.summary[0].text, "reached The design removes 64 parking spaces.", "the input is not changed");
});
