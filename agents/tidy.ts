// A last pass over a brief before it's saved, done in code: no model, no new content.
//   - Near-duplicates go: two specialists often record the same trade-off or unknown in
//     slightly different words. The first one recorded is kept.
//   - Anything hedged ("may", "could", "might") is an estimate, never a fact.
//   - A stray word at the start of a sentence ("reached The Region is…", a model glitch)
//     is removed; the rest of the sentence and its citations are unchanged.
//   - The reading grade is measured again on what remains.

import type { Brief, GlossaryTerm, Statement, Unknown } from "../shared/types.ts";
import { readingGrade } from "../shared/readability.ts";
import { normalise } from "../shared/verify.ts";
import { terms } from "./corpus.ts";
import { numberBacked, numbersIn } from "./tools.ts";

const HEDGE = /\b(may|might|could)\b/i;
const STRAY_START = /^\p{Ll}[\p{Ll}'-]*\s+(?=\p{Lu})/u;

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
/** The text with dates ("December 16, 2026", "16 December") and years (1900-2099) removed. */
export function withoutDates(text: string): string {
  return text
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s*\\d{4})?`, "gi"), " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b(?:,?\\s*\\d{4})?`, "gi"), " ")
    .replace(/\b(19|20)\d{2}\b/g, " ");
}

/**
 * How well a statement's quotes back it: "weak" when they share fewer than 2 meaningful
 * word stems and no number. Words that name the decision itself (its title and plain
 * title, e.g. "budget", "taxes") don't count: every quote about it has them.
 */
export function supportOf(text: string, quotes: string[], decisionWords: string[] = []): "strong" | "weak" {
  const ignore = new Set(decisionWords.flatMap((w) => terms(w)).map(stem));
  const A = new Set(terms(text).map(stem).filter((w) => !ignore.has(w) && !/^\d/.test(w)));
  const B = new Set(terms(quotes.join(" ")).map(stem).filter((w) => !ignore.has(w)));
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  // A date or a year ("December 16", "2027") alone doesn't show the quote backs the sentence.
  const quoted = quotes.flatMap(numbersIn);
  const sharesNumber = numbersIn(withoutDates(text)).some((n) => numberBacked(n, quoted));
  return shared < 2 && !sharesNumber ? "weak" : "strong";
}

/** Problems with a sentence's form that point to a glitch, not to plain language. */
export function textArtifacts(text: string): string[] {
  const out: string[] = [];
  if (STRAY_START.test(text)) out.push("It starts with a stray word before the sentence begins. Write the sentence on its own.");
  if (/\b(\p{L}+)\s+\1\b/iu.test(text)) out.push("A word is repeated twice in a row.");
  if (/[{}]|\n/.test(text)) out.push("It contains formatting characters; write one plain sentence.");
  return out;
}

/** Removes a stray leading word and capitalises; anything else is left as it is. */
export function repairText(text: string): string {
  const t = text.replace(STRAY_START, "").replace(/\s{2,}/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Share of the shorter text's words that the other text also has. */
// A light stem, so "taxes" meets "tax" and "services" meets "service".
const stem = (w: string) => w.replace(/(ies|es|s|ing|ed)$/, "").slice(0, 5);

export function overlap(a: string, b: string): number {
  const A = new Set(terms(a).map(stem));
  const B = new Set(terms(b).map(stem));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

function dedupe<T>(list: T[] | undefined, text: (x: T) => string, threshold: number): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const x of list ?? []) {
    const t = text(x);
    if (kept.some((k) => normalise(text(k)) === normalise(t) || overlap(text(k), t) >= threshold)) dropped.push(x);
    else kept.push(x);
  }
  return { kept, dropped };
}

export interface TidyReport {
  dropped: string[];
  repaired: { id: string; from: string; to: string }[];
  estimates: string[];
  /** Statements whose quotes only weakly back them. */
  weak: string[];
  gradeBefore: number;
  gradeAfter: number;
}

const graded = (b: Brief) => readingGrade([...(b.summary ?? []), ...(b.impacts ?? []).flatMap((g) => g.statements ?? [])].map((s) => s.text));

/** Returns a tidied copy of the brief and what changed. `decisionWords`: its title and plain title. */
export function tidyBrief(input: Brief, decisionWords: string[] = []): { brief: Brief; report: TidyReport } {
  const b = structuredClone(input);
  const report: TidyReport = { dropped: [], repaired: [], estimates: [], weak: [], gradeBefore: graded(input), gradeAfter: 0 };

  const fixStatement = (s: Statement) => {
    const to = repairText(s.text);
    if (to !== s.text) {
      report.repaired.push({ id: s.id, from: s.text, to });
      s.text = to;
    }
    if (s.kind === "fact" && HEDGE.test(s.text)) {
      s.kind = "estimate";
      report.estimates.push(s.id);
    }
    s.support = supportOf(s.text, s.citations.map((c) => c.quote), decisionWords);
    if (s.support === "weak" && !report.weak.includes(s.id)) report.weak.push(s.id);
  };
  const lists: Statement[][] = [];
  const statements = (list: Statement[] | undefined, threshold: number): Statement[] => {
    for (const s of list ?? []) fixStatement(s);
    const { kept, dropped } = dedupe(list, (s) => s.text, threshold);
    report.dropped.push(...dropped.map((s) => `${s.id}: ${s.text}`));
    lists.push(kept);
    return kept;
  };

  b.summary = statements(b.summary, 0.8);
  b.whyNow = statements(b.whyNow, 0.8);
  b.haveYourSay = statements(b.haveYourSay, 0.8);
  // Trade-offs are often recorded twice by different specialists in different words.
  b.tradeoffs = statements(b.tradeoffs, 0.5);
  b.impacts = (b.impacts ?? []).map((g) => ({ ...g, statements: statements(g.statements, 0.8) })).filter((g) => g.statements.length > 0);
  for (const lens of Object.values(b.lenses ?? {}) as { statements?: Statement[]; commitments?: { progress?: Statement[] }[] }[]) {
    if (lens.statements) lens.statements = statements(lens.statements, 0.8);
    for (const k of lens.commitments ?? []) for (const s of k.progress ?? []) fixStatement(s);
  }

  const u = dedupe<Unknown>(b.unknowns, (x) => x.question, 0.6);
  report.dropped.push(...u.dropped.map((x) => `unknown: ${x.question}`));
  b.unknowns = u.kept;
  const g = dedupe<GlossaryTerm>(b.glossary, (x) => x.term, 1);
  report.dropped.push(...g.dropped.map((x) => `term: ${x.term}`));
  b.glossary = g.kept;
  const seen = new Set<string>();
  b.figures = (b.figures ?? []).filter((f) => {
    const key = `${normalise(f.label)}|${f.value}|${f.unit}`;
    if (seen.has(key)) {
      report.dropped.push(`figure: ${f.label}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  b.readingGrade = graded(b);
  report.gradeAfter = b.readingGrade;
  return { brief: b, report };
}
