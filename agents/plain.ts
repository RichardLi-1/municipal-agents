// The plain-language pass (spec, principle 2: grade 8 or lower). After statements are
// verified, any that read above grade 8 go back to the model to be rewritten in shorter
// sentences and everyday words. Code decides whether a rewrite is kept: it must read
// easier, keep every number exactly, keep "may" for impacts and both sides of a
// trade-off, and still share words with its quotes (the citations don't change).
// Otherwise the original stays. Then jargon the brief uses gets a glossary entry.

import type { GlossaryTerm, StatementKind } from "../shared/types.ts";
import { fleschKincaidGrade } from "../shared/readability.ts";
import type { GeminiRequest, GeminiResult } from "./gemini.ts";
import { numbersIn, ruleProblems, sharesWords, type Section } from "./tools.ts";

export const TARGET_GRADE = 8;

/** One budgeted model call; returns null when the budget is used up. */
export type LeadCall = (req: Omit<GeminiRequest, "model">) => Promise<GeminiResult | null>;

export interface PlainItem {
  id: string;
  text: string;
  section: Section;
  kind: StatementKind;
  quotes: string[];
}

export interface Rewrite {
  id: string;
  from: string;
  to: string;
  before: number;
  after: number;
}

const sameNumbers = (a: string, b: string) => numbersIn(a).sort().join(" ") === numbersIn(b).sort().join(" ");

/** Why a rewrite can't replace the original, or null if it can. */
export function rewriteProblem(item: PlainItem, to: string): string | null {
  const t = to.trim();
  if (!t) return "empty";
  if (!sameNumbers(item.text, t)) return `numbers changed (keep exactly: ${numbersIn(item.text).join(", ") || "none"})`;
  const rules = ruleProblems(t, item.section, item.kind);
  if (rules.length) return rules[0];
  if (!sharesWords(t, item.quotes)) return "it no longer uses any words from the quoted source";
  if (fleschKincaidGrade(t) >= fleschKincaidGrade(item.text)) return "not easier to read than the original";
  return null;
}

const REWRITE_RULES = `You rewrite sentences for residents of Waterloo Region so they read at grade 6 to 8.
For each item:
- Keep the exact meaning. Don't add, drop or narrow any fact: if the original lists three things, keep all three.
- Keep every number exactly as written: same digits, same $ and %, same years.
- Keep who does what: "Waterloo Region" or "the community" (everyone who lives here) is not "the Region" (the regional government); "staff" is not "Council".
- Keep budget and planning terms as they are ("capital budget", "operating budget", "levy", "delegation", "development charges"): a glossary explains them. Don't swap them for looser words.
- Keep "may", "might" or "could" where they are, and both sides of a "but".
- Otherwise use short everyday words, 8 to 14 words per sentence. You may split one sentence into two short ones.
- Never add advice or opinion.
`;
const BATCH_RETURN = "Return a JSON array of {id, text} for every item.";

const rewriteSchema = {
  type: "array",
  items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] },
};

/** Rewrites items above the target grade, in up to `rounds` batched calls. Returns the accepted rewrites. */
export async function plainPass(call: LeadCall, items: PlainItem[], opts: { target?: number; rounds?: number } = {}): Promise<Rewrite[]> {
  const target = opts.target ?? TARGET_GRADE;
  const accepted = new Map<string, Rewrite>();
  const refused = new Map<string, string>(); // id → why the last rewrite was refused
  for (let round = 0; round < (opts.rounds ?? 2); round++) {
    const todo = items.filter((it) => fleschKincaidGrade(accepted.get(it.id)?.to ?? it.text) > target);
    if (!todo.length) break;
    const payload = todo.map((it) => ({
      id: it.id,
      text: accepted.get(it.id)?.to ?? it.text,
      grade: fleschKincaidGrade(accepted.get(it.id)?.to ?? it.text),
      ...(refused.has(it.id) ? { lastTryRefusedBecause: refused.get(it.id) } : {}),
    }));
    const res = await call({
      system: REWRITE_RULES + BATCH_RETURN,
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      jsonSchema: rewriteSchema,
      thinking: "low",
    });
    if (!res) break;
    let out: { id: string; text: string }[] = [];
    try {
      out = JSON.parse(res.text);
    } catch {
      continue;
    }
    for (const it of todo) {
      const r = out.find((o) => o?.id === it.id);
      if (!r || typeof r.text !== "string") continue;
      const current = accepted.get(it.id)?.to ?? it.text;
      const problem = rewriteProblem({ ...it, text: current }, r.text);
      if (problem) {
        refused.set(it.id, problem);
        continue;
      }
      accepted.set(it.id, { id: it.id, from: it.text, to: r.text.trim(), before: fleschKincaidGrade(it.text), after: fleschKincaidGrade(r.text) });
    }
  }
  return [...accepted.values()];
}

// ---------------------------------------------------------------------------
// Answers in the chat get the same treatment, aiming at grade 9 or lower: markers ([n]
// and [Cn]) and numbers must survive, and terms that must stay get a short plain
// explanation in round brackets.

export const ANSWER_GRADE = 9;
const MARKERS = /\[C?\d+(?:\s*,\s*C?\d+)*\]/g;
const markers = (s: string) => [...s.matchAll(MARKERS)].map((m) => m[0].replace(/\s/g, "")).sort().join(" ");
const withoutMarkers = (s: string) => s.replace(MARKERS, "");

const ANSWER_RULES = `${REWRITE_RULES.replace("For each item:", "For the answer:").replace("8 to 14 words per sentence", "6 to 12 words per sentence")}- If a term must stay ("infrastructure funding gap", "capital budget"), add a short plain explanation in round brackets the first time, with no numbers in it: "infrastructure funding gap (money short for repairs)".
- Keep every [n] or [Cn] marker right after the fact it supports.
Return only the rewritten answer.`;

export async function plainAnswer(call: LeadCall, answer: string, lang?: string): Promise<{ text: string; before: number; after: number }> {
  const english = !lang || /^en/i.test(lang);
  const before = fleschKincaidGrade(withoutMarkers(answer));
  if (!english || before <= ANSWER_GRADE) return { text: answer, before, after: before };
  let best = answer;
  let bestGrade = before;
  let feedback = "";
  for (let round = 0; round < 2 && bestGrade > ANSWER_GRADE; round++) {
    const res = await call({
      system: ANSWER_RULES,
      contents: [{ role: "user", parts: [{ text: `${feedback}Grade now ${bestGrade}; make it ${ANSWER_GRADE - 2} or lower.\n\n${best}` }] }],
      thinking: "low",
    });
    const to = res?.text.trim() ?? "";
    if (!to) break;
    const grade = fleschKincaidGrade(withoutMarkers(to));
    const problem =
      markers(to) !== markers(answer) ? "a [n] marker was lost or changed"
      : numbersIn(withoutMarkers(to)).sort().join(" ") !== numbersIn(withoutMarkers(answer)).sort().join(" ") ? "a number was changed, added or lost"
      : ruleProblems(withoutMarkers(to), "answer", "fact").some((p) => /Never tell/.test(p)) ? "it gave advice"
      : grade >= bestGrade ? "it was not easier to read"
      : "";
    if (problem) {
      feedback = `Your last rewrite was refused because ${problem}. `;
      continue;
    }
    best = to;
    bestGrade = grade;
    feedback = "";
  }
  return { text: best, before, after: bestGrade };
}

// ---------------------------------------------------------------------------
// Glossary: municipal jargon residents meet in briefs. When the brief uses one of these
// and the glossary doesn't explain it yet, the model defines it in one plain sentence.

export const JARGON = [
  "levy", "tax levy", "capital budget", "capital program", "capital forecast", "capital", "operating budget", "delegation",
  "debenture", "reserve fund", "reserve", "development charge", "infrastructure funding gap", "funding gap",
  "asset management", "minor variance", "variance", "zoning", "by-law", "environmental assessment", "Class EA", "wastewater",
  "user rates", "user fees", "Committee of Adjustment", "LRT", "light rail", "ION", "GRT", "frequent network", "on-demand",
  "assessment", "assessed value", "lifecycle", "renewal", "Floor Space Ratio", "site plan", "official plan", "master plan",
  "strategic plan", "affordable housing", "community housing", "greenhouse gas", "motion",
];

export function jargonUsed(texts: string[], glossary: GlossaryTerm[]): string[] {
  const all = texts.join(" \n ");
  const have = glossary.map((g) => g.term.toLowerCase());
  const found: string[] = [];
  // Longest first, so "tax levy" is picked before "levy".
  for (const term of [...JARGON].sort((a, b) => b.length - a.length)) {
    const t = term.toLowerCase();
    const re = new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?([^\\p{L}]|$)`, "iu");
    if (!re.test(all)) continue;
    // Skip a term already explained, or one covered by a longer term we already picked.
    if (have.some((h) => h.includes(t) || t.includes(h))) continue;
    if (found.some((f) => f.toLowerCase().includes(t))) continue;
    found.push(term);
  }
  return found;
}

export async function glossaryPass(call: LeadCall, texts: string[], glossary: GlossaryTerm[], context: string): Promise<GlossaryTerm[]> {
  const terms = jargonUsed(texts, glossary).slice(0, 10);
  if (!terms.length) return [];
  const res = await call({
    system:
      "You explain municipal terms to residents of Waterloo Region in one plain sentence each (under 20 words, grade 6 to 8, no numbers, no opinion). Explain what the term means as used in a city or regional budget or planning decision. Return a JSON array of {term, plain}.",
    contents: [{ role: "user", parts: [{ text: `Decision: ${context}\nTerms: ${JSON.stringify(terms)}` }] }],
    jsonSchema: { type: "array", items: { type: "object", properties: { term: { type: "string" }, plain: { type: "string" } }, required: ["term", "plain"] } },
    thinking: "minimal",
  });
  try {
    const out = JSON.parse(res?.text ?? "[]") as GlossaryTerm[];
    return out
      .filter((g) => terms.some((t) => t.toLowerCase() === String(g.term).toLowerCase()) && typeof g.plain === "string" && g.plain.trim() && !/\d/.test(g.plain))
      .map((g) => ({ term: String(g.term), plain: g.plain.trim() }));
  } catch {
    return [];
  }
}
