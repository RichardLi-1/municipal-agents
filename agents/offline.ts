// When the model can't be reached (no credit, rate limit, outage, no key), a question is
// still answered, without a model: the brief's statements that passed the citation check
// (and weren't rejected by staff) are ranked against the question with BM25, and the best
// few are shown with their citations, plus computed lens figures. Nothing is written by
// a model, so nothing new can be wrong; the answer is marked `offline`.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, Brief, Figure, Statement } from "../shared/types.ts";
import { terms } from "./corpus.ts";

type Answer = Extract<AgentEvent, { type: "answer" }>;

export const OFFLINE_INTRO = "The agents can't be reached right now. Here is what the checked brief says about that:";

function readBrief(dataDir: string, decisionId: string): Brief | undefined {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(decisionId)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "briefs", `${decisionId}.json`), "utf8")) as Brief;
  } catch {
    return undefined;
  }
}

/** Every resident-facing statement in a brief that passed the checker and wasn't rejected. */
export function checkedStatements(b: Brief): Statement[] {
  const lenses = Object.values(b.lenses ?? {}) as { statements?: Statement[]; commitments?: { progress?: Statement[] }[] }[];
  const all = [
    ...(b.summary ?? []), ...(b.whyNow ?? []), ...(b.haveYourSay ?? []), ...(b.impacts ?? []).flatMap((g) => g.statements ?? []),
    ...(b.tradeoffs ?? []), ...lenses.flatMap((l) => [...(l.statements ?? []), ...(l.commitments ?? []).flatMap((k) => k.progress ?? [])]),
  ];
  const seen = new Set<string>();
  return all.filter((s) => {
    if (!s?.verified || s.review?.action === "rejected" || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/** BM25 scores of short documents against a query (k1 1.2, b 0.75). */
export function bm25(docs: string[], query: string): number[] {
  const toks = docs.map((d) => terms(d));
  const avg = toks.reduce((n, t) => n + t.length, 0) / Math.max(1, toks.length);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const q = [...new Set(terms(query))];
  return toks.map((t) => {
    let score = 0;
    for (const w of q) {
      const f = t.filter((x) => x === w).length;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * t.length) / (avg || 1)));
    }
    return score;
  });
}

// Words that shape a question but say nothing about its topic.
const QUESTION_WORDS = new Set("much many get got people going any about would should could also like need want know tell please there here does did doing make makes made".split(" "));

function decisionName(dataDir: string, decisionId: string): string {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, "decisions", `${decisionId}.json`), "utf8")) as { title?: string; decidedBy?: string };
    return `${d.title ?? ""} ${d.decidedBy ?? ""}`;
  } catch {
    return "";
  }
}

function nearDuplicate(a: string, b: string): boolean {
  const A = new Set(terms(a));
  const B = new Set(terms(b));
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(1, Math.min(A.size, B.size)) >= 0.8;
}

export function offlineAnswer(dataDir: string, decisionId: string, question: string, reason?: string): Answer {
  const why = reason ? ` (${reason})` : "";
  const brief = readBrief(dataDir, decisionId);
  if (!brief)
    return { type: "answer", offline: true, statements: [], text: `The agents can't be reached right now${why}, and there is no checked brief for this decision yet. Please try again later.` };
  const statements = checkedStatements(brief);
  const figures = (brief.figures ?? []).filter((f) => f.kind === "computed");
  const docs = [...statements.map((s) => s.text), ...figures.map((f) => `${f.label} ${f.display}`)];
  const scores = bm25(docs, terms(question).filter((w) => !QUESTION_WORDS.has(w)).join(" "));
  // Words in a third or more of the statements ("region", "budget") say nothing about
  // relevance; a statement must share at least one other word with the question.
  const toks = docs.map((d) => new Set(terms(d)));
  // Words from the decision's own title and decider ("Region", "budget", "Council") are
  // about the whole decision, not the question's topic.
  const decisionWords = new Set(terms(decisionName(dataDir, decisionId)));
  const asked = terms(question).filter((w) => !QUESTION_WORDS.has(w) && !decisionWords.has(w));
  const common = new Set(asked.filter((w) => toks.filter((t) => t.has(w)).length >= Math.max(2, docs.length / 3)));
  const telling = asked.filter((w) => !common.has(w));
  const best = Math.max(0, ...scores);
  const picked: { score: number; i: number }[] = [];
  for (const x of scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score)) {
    if (picked.length >= 5 || x.score <= 0 || x.score < best * 0.4) break;
    if (!telling.some((w) => toks[x.i].has(w))) continue;
    if (picked.some((p) => nearDuplicate(docs[p.i], docs[x.i]))) continue;
    picked.push(x);
  }
  const top = picked;
  if (!top.length)
    return {
      type: "answer",
      offline: true,
      statements: [],
      text: `The agents can't be reached right now${why}, and the checked brief doesn't cover that question. Please try again later.`,
    };
  const usedS: Statement[] = [];
  const usedF: Figure[] = [];
  const lines = top.map(({ i }) => {
    if (i < statements.length) {
      usedS.push(statements[i]);
      return `• ${statements[i].text} [${usedS.length}]`;
    }
    const f = figures[i - statements.length];
    usedF.push(f);
    return `• ${f.label}: ${f.display} (computed from open data) [C${usedF.length}]`;
  });
  const draft = brief.review?.status === "published" ? "" : "\n\n(This brief is a draft: code checked every quote against its page, but staff haven't reviewed it yet.)";
  const intro = reason ? OFFLINE_INTRO.replace("right now.", `right now${why}.`) : OFFLINE_INTRO;
  return { type: "answer", offline: true, text: `${intro}\n${lines.join("\n")}${draft}`, statements: usedS, ...(usedF.length ? { figures: usedF } : {}) };
}
