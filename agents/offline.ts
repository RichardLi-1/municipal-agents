// When the model can't be reached (no credit, rate limit, outage, no key), a question is
// still answered, without a model, from things already checked:
//   1. the brief's statements that passed the citation check (and staff didn't reject),
//   2. the decision's hand-checked timeline (meetings, deadlines; each with its citation),
//   3. computed lens results (transit gaps and fixes, the construction scenario, figures).
// They're ranked against the question with BM25. An item must share a meaningful word
// with the question (question words and generic verbs like "change" don't count) and
// score well enough. If nothing does, exact quotes from the decision's documents are the
// last resort; if those don't match either, the answer says so and names the clerk.
// Nothing is written by a model, so nothing new can be wrong; the answer is `offline`.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, Brief, CityConfig, Decision, Figure, Statement } from "../shared/types.ts";
import { verifyCitation } from "../shared/verify.ts";
import { loadCorpus, loadLensFiles, terms } from "./corpus.ts";

type Answer = Extract<AgentEvent, { type: "answer" }>;

export const OFFLINE_INTRO = "The agents can't be reached right now. Here is what the checked brief says about that:";

// Words that shape a question but say nothing about its topic.
const QUESTION_WORDS = new Set(
  ("much many get got gets getting people person going goe go any about would should could also like need want know tell please there here does did doing " +
    "make makes made change changes changing changed affect affects affecting affected happen happens happening happened will my mine our ours me us you your " +
    "they them their it its this that these those what when where who whom why how which is are was were be been being do can may might must " +
    "new next still now really actually anything something thing things way ways mean means decision decide decided going-to near around up down " +
    "if then than more less most least some every each other just only ever even yes no okay ok thank thanks").split(" "),
);

// Everyday words residents use, mapped to the words the documents use.
const SYNONYMS: Record<string, string[]> = {
  propose: ["propos", "proposed", "draft", "present", "prepare"],
  proposes: ["propos", "proposed", "draft", "present", "prepare"],
  garbage: ["garbage", "waste", "recycling", "organic"],
  trash: ["garbage", "waste"],
  pickup: ["collection", "pickup"],
  appeal: ["appeal", "tribunal", "olt"],
  bus: ["bus", "buse", "transit", "grt", "route"],
  buses: ["bus", "buse", "transit", "grt", "route"],
  train: ["ion", "lrt", "rail", "train"],
  tax: ["tax", "taxe", "levy"],
  taxes: ["tax", "taxe", "levy"],
  speak: ["speak", "delegation", "delegate"],
  hearing: ["hearing", "meeting"],
  cost: ["cost", "price", "spend", "spending"],
  hospital: ["hospital"],
  veto: ["veto"],
};

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
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

/** BM25 scores of short documents against query terms (k1 1.2, b 0.75). */
export function bm25(docs: string[][], query: string[]): number[] {
  const avg = docs.reduce((n, t) => n + t.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const t of docs) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const q = [...new Set(query)];
  return docs.map((t) => {
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

const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "long", day: "numeric", year: "numeric" });
const fmtDate = (iso: string) => DATE.format(new Date(/T/.test(iso) ? iso : `${iso}T12:00:00-05:00`));

/** One thing an offline answer can show: a checked statement, or a computed result. */
type Item = ({ kind: "statement"; statement: Statement } | { kind: "figure"; figure: Figure }) & { context?: string };

function itemText(i: Item): string {
  return i.kind === "statement" ? i.statement.text : `${i.figure.label} ${i.figure.display}`;
}

/**
 * How many of the question's words an item covers. Each word (with its synonyms) needs
 * its own matching token, so one document word can't count twice ("collection" is not
 * both "garbage" and "pickup").
 */
export function coveredWords(tokens: Set<string>, words: string[][]): number {
  const used = new Set<string>();
  let n = 0;
  for (const alts of words) {
    const hit = alts.find((w) => tokens.has(w) && !used.has(w));
    if (hit) {
      used.add(hit);
      n++;
    }
  }
  return n;
}

// The construction scenario only answers questions about construction.
const CONSTRUCTION = new Set(["construction", "construct", "tunnel", "tunnelling", "dig", "digging", "excavation", "truck", "noise", "shaft", "portal", "borehole", "crane", "boring", "tbm", "closure", "dust", "vibration", "underground", "bore", "site", "work"]);

function pagesOf(dataDir: string, sourceId: string): string[] | undefined {
  return readJson<string[]>(path.join(dataDir, "sources", `${sourceId}.pages.json`));
}

/** The decision's hand-checked timeline as checked statements (each cites its own page). */
function timelineItems(dataDir: string, d: Decision): Item[] {
  return d.timeline.map((t) => {
    const est = (t as { estimated?: boolean }).estimated ? " (estimated: the latest it can be)" : "";
    const how = (t.participation ?? []).map((p) => p.instructions).join(" ");
    const text = `${fmtDate(t.date)}${est}: ${t.title}. ${t.plain}${how ? ` ${how}` : ""}`;
    const pages = t.citation ? pagesOf(dataDir, t.citation.sourceId) : undefined;
    const verified = !!(t.citation && pages && verifyCitation(pages, t.citation));
    return { kind: "statement", statement: { id: `timeline-${t.id}`, text, kind: "fact", citations: t.citation ? [t.citation] : [], verified } } as Item;
  });
}

/** Computed lens results residents ask about: transit gaps and fixes, the construction scenario. */
function lensItems(dataDir: string, d: Decision): Item[] {
  const lenses = loadLensFiles(dataDir, d) as Record<string, any>;
  const out: Item[] = [];
  const fig = (id: string, label: string, display: string, formula: string, value = 0, unit = ""): Item & { figure: Figure } => ({
    kind: "figure",
    figure: { id, label, value, unit, display, kind: "computed", formula },
  });
  const t = lenses.transit;
  if (t) {
    const method = `Computed by Municipal Agents from GRT's published timetables and the 2021 census. ${String(t.method ?? "").slice(0, 200)}`;
    for (const g of t.gaps ?? []) out.push(fig(`gap-${g.id}`, g.title, g.peopleAffected ? `${Number(g.peopleAffected).toLocaleString("en-CA")} people` : "", method, g.peopleAffected ?? 0, "people"));
    for (const f of t.fixes ?? []) out.push(fig(`fix-${f.id}`, `Possible fix (not a GRT proposal): ${f.title}`, `${f.benefit} Trade-off: ${f.tradeoff}`, method));
  }
  const c = lenses.construction;
  if (c) {
    const tag = "Illustrative scenario, not a Region plan";
    const method = `${tag}. ${String(c.scenario?.basis ?? "").slice(0, 200)}`;
    const context = `construction ${c.scenario?.title ?? ""}`;
    if (c.scenario?.title) out.push({ ...fig("construction-scenario", `${tag}: ${c.scenario.title}`, "", method), context });
    for (const s of c.steps ?? []) out.push({ ...fig(`construction-step-${s.n}`, `${tag}, step ${s.n}: ${s.title}`, `${s.whatResidentsNotice} (${s.duration})`, method), context });
  }
  return out;
}

/** Last resort: short exact quotes from the decision's own documents (never navigation menus). */
function documentQuotes(dataDir: string, decisionId: string, words: string[][]): Statement[] {
  let corpus;
  try {
    corpus = loadCorpus(dataDir, decisionId);
  } catch {
    return [];
  }
  const out: Statement[] = [];
  const need = words.length <= 2 ? words.length : Math.ceil((words.length * 2) / 3);
  for (const [sourceId, pages] of corpus.pages) {
    pages.forEach((page, i) => {
      const flat = page.replace(/\s+/g, " ");
      // Sentences (roughly) that contain enough of the question's words.
      for (const sentence of flat.split(/(?<=[.!?])\s+/)) {
        if (sentence.length < 40 || sentence.length > 400) continue;
        if ((sentence.match(/https?:\/\/|\(\//g) ?? []).length >= 1) continue; // links and menus
        if ((sentence.match(/\d[\d,.]*/g) ?? []).length >= 6) continue; // table rows
        if (coveredWords(new Set(terms(sentence)), words) < need) continue;
        const quote = sentence.trim();
        const citation = { sourceId, page: i + 1, quote };
        if (verifyCitation(pages, citation)) out.push({ id: `doc-${sourceId}-${i + 1}-${out.length}`, text: `"${quote}"`, kind: "fact", citations: [citation], verified: true });
      }
    });
  }
  return out.slice(0, 3);
}

function clerk(d: Decision | undefined): string {
  const city = d ? readJson<CityConfig>(path.join(import.meta.dirname, "..", "cities", `${d.city}.json`)) : undefined;
  return city?.clerkContact ? ` You can ask the Clerk: ${city.clerkContact}.` : "";
}

export function offlineAnswer(dataDir: string, decisionId: string, question: string, reason?: string): Answer {
  const why = reason ? ` (${reason})` : "";
  const decision = /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(decisionId) ? readJson<Decision>(path.join(dataDir, "decisions", `${decisionId}.json`)) : undefined;
  const brief = decision ? readJson<Brief>(path.join(dataDir, "briefs", `${decisionId}.json`)) : undefined;
  if (!decision) return { type: "answer", offline: true, statements: [], text: `The agents can't be reached right now${why}. Please try again later.` };

  // The question's meaningful words, each with the document words that count for it.
  // Words of the decision's title ("Region", "budget") are about the whole decision, not the question's topic.
  const decisionWords = new Set(terms(decision.title));
  const asked = [...new Set(terms(question))].filter((w) => !QUESTION_WORDS.has(w) && !decisionWords.has(w) && !/^\d+$/.test(w));
  const words = asked.map((w) => [w, ...(SYNONYMS[w] ?? [])]);

  const aboutConstruction = words.some((alts) => alts.some((w) => CONSTRUCTION.has(w)));
  const items: Item[] = [
    ...(brief ? checkedStatements(brief).map((s) => ({ kind: "statement", statement: s }) as Item) : []),
    ...timelineItems(dataDir, decision).filter((i) => i.kind !== "statement" || i.statement.verified),
    ...(brief?.figures ?? []).filter((f) => f.kind === "computed").map((f) => ({ kind: "figure", figure: f }) as Item),
    ...lensItems(dataDir, decision).filter((i) => aboutConstruction || i.kind !== "figure" || !i.figure.id.startsWith("construction")),
  ];
  const picked = rankItems(items, words);

  const draft = brief && brief.review?.status !== "published" ? "\n\n(This brief is a draft: code checked every quote against its page, but staff haven't reviewed it yet.)" : "";
  const intro = reason ? OFFLINE_INTRO.replace("right now.", `right now${why}.`) : OFFLINE_INTRO;
  if (picked.length) {
    const statements: Statement[] = [];
    const figures: Figure[] = [];
    const lines = picked.map((i) => {
      const it = items[i];
      if (it.kind === "statement") {
        statements.push(it.statement);
        return `• ${it.statement.text} [${statements.length}]`;
      }
      figures.push(it.figure);
      return `• ${it.figure.label}${it.figure.display ? `: ${it.figure.display}` : ""} (computed from open data) [C${figures.length}]`;
    });
    return { type: "answer", offline: true, text: `${intro}\n${lines.join("\n")}${draft}`, statements, ...(figures.length ? { figures } : {}) };
  }

  const quotes = words.length ? documentQuotes(dataDir, decisionId, words) : [];
  if (quotes.length)
    return {
      type: "answer",
      offline: true,
      statements: quotes,
      text: `The agents can't be reached right now${why}, and the checked brief doesn't cover that. The decision's documents mention it here (exact quotes):\n${quotes.map((q, i) => `• ${q.text} [${i + 1}]`).join("\n")}`,
    };
  return {
    type: "answer",
    offline: true,
    statements: [],
    text: `The agents can't be reached right now${why}, and the checked brief doesn't cover that question.${clerk(decision)}`,
  };
}

/** Minimum BM25 score for an item to be shown (calibrated on the questions in offline.test.ts). */
export const MIN_SCORE = 1.0;

/** Indexes of the items to show, best first: enough words covered, a fair score, no near-duplicates. */
function rankItems(items: Item[], words: string[][]): number[] {
  if (!words.length) return [];
  const toks = items.map((i) => terms(`${itemText(i)} ${i.context ?? ""}`));
  const scores = bm25(toks, words.flat());
  const need = words.length <= 2 ? 1 : 2;
  const best = Math.max(0, ...scores);
  const picked: number[] = [];
  for (const i of scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a])) {
    if (picked.length >= 5 || scores[i] < MIN_SCORE || scores[i] < best * 0.3) break;
    if (coveredWords(new Set(toks[i]), words) < need) continue;
    if (picked.some((p) => nearDuplicate(itemText(items[p]), itemText(items[i])))) continue;
    picked.push(i);
  }
  return picked;
}

function nearDuplicate(a: string, b: string): boolean {
  const A = new Set(terms(a));
  const B = new Set(terms(b));
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(1, Math.min(A.size, B.size)) >= 0.8;
}

