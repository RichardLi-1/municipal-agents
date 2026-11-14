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

// The fixed lines of an offline answer, per language (statements stay in English: they
// are the checked text). Other languages get English for now.
const LINES = {
  en: {
    intro: OFFLINE_INTRO,
    quotes: "The agents can't be reached right now, and the checked brief doesn't cover that. The decision's documents mention it here (exact quotes):",
    none: "The agents can't be reached right now, and the checked brief doesn't cover that question.",
    clerk: (c: string) => ` You can ask the Clerk: ${c}.`,
    noDecision: "The agents can't be reached right now. Please try again later.",
    computed: "computed from open data",
    draft: "(This brief is a draft: code checked every quote against its page, but staff haven't reviewed it yet.)",
    estimated: "estimated: the latest it can be",
  },
  fr: {
    intro: "Les agents ne sont pas joignables pour le moment. Voici ce que dit le résumé vérifié (en anglais) :",
    quotes: "Les agents ne sont pas joignables pour le moment, et le résumé vérifié n'en parle pas. Les documents de la décision en parlent ici (citations exactes, en anglais) :",
    none: "Les agents ne sont pas joignables pour le moment, et le résumé vérifié ne répond pas à cette question.",
    clerk: (c: string) => ` Vous pouvez vous adresser au greffe : ${c}.`,
    noDecision: "Les agents ne sont pas joignables pour le moment. Veuillez réessayer plus tard.",
    computed: "calculé à partir de données ouvertes",
    draft: "(Ce résumé est une ébauche : chaque citation a été vérifiée par le code, mais le personnel ne l'a pas encore relu.)",
    estimated: "date estimée : au plus tard",
  },
};
type Lines = (typeof LINES)["en"];
const linesFor = (lang?: string): Lines => (/^fr\b/i.test(lang ?? "") ? LINES.fr : LINES.en);

// French question words mapped to the English words the documents use.
const FR: Record<string, string> = {
  quand: "when", parler: "speak", parle: "speak", conseil: "council", budget: "budget", impot: "tax", impots: "tax", taxe: "tax",
  foncier: "property", fonciere: "property", autobus: "bus", bus: "bus", eau: "water", appel: "appeal", appeler: "appeal", inscrire: "register",
  inscription: "register", reunion: "meeting", audience: "hearing", logement: "housing", logements: "housing", loyer: "rent", transport: "transit",
  cout: "cost", couts: "cost", sondage: "survey", delai: "deadline", date: "date", ordure: "garbage", ordures: "garbage", dechet: "waste", dechets: "waste",
  gare: "station", station: "station", train: "train", hopital: "hospital", dimanche: "sunday", matin: "morning", augmenter: "increase", hausse: "increase",
};
const plainLetters = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Questions about when and how to take part get the next chances to do so, always.
const WHEN_WORDS = new Set(["when", "register", "speak", "deadline", "delegation", "delegate", "date", "meeting", "hearing", "submit", "submission", "survey", "write", "attend", "say"]);

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
  better: ["better", "frequent", "frequency", "improve", "more"],
  station: ["station", "stop", "hub", "terminal"],
  register: ["register", "registration", "delegation"],
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

const TIME = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
/** "noon on December 9, 2026", "11:59 p.m. on February 26, 2027", or just the date. */
function fmtDeadline(iso: string): string {
  if (!/T/.test(iso)) return fmtDate(iso);
  const time = TIME.format(new Date(iso));
  return `${/^12:00\s*p/i.test(time) ? "noon" : time} on ${fmtDate(iso)}`;
}

/** The decision's hand-checked timeline as checked statements (each cites its own page). */
function timelineItems(dataDir: string, d: Decision, lines: Lines = LINES.en): Item[] {
  return d.timeline.map((t) => {
    const est = (t as { estimated?: boolean }).estimated ? ` (${lines.estimated})` : "";
    const how = (t.participation ?? []).map((p) => `${p.instructions}${p.deadline ? ` Deadline: ${fmtDeadline(p.deadline)}.` : ""}`).join(" ");
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
    const n = (x: number) => Number(x).toLocaleString("en-CA");
    const pct = (x: number, of: number) => (of ? ` (${Math.round((x / of) * 100)}%)` : "");
    const fs_ = t.frequentService;
    const total = t.population?.total ?? 0;
    const where = t.area?.label ?? "the area";
    if (fs_) {
      out.push(fig("frequent-15", `People in ${where} within 800 m of a stop with a bus or train every 15 minutes or better (weekday 8 am)`, `${n(fs_.peopleWithin800mOf15Min)} of ${n(total)}${pct(fs_.peopleWithin800mOf15Min, total)}`, method, fs_.peopleWithin800mOf15Min, "people"));
      out.push(fig("frequent-10", `People in ${where} within 800 m of a stop with a bus or train every 10 minutes or better (weekday 8 am)`, `${n(fs_.peopleWithin800mOf10Min)} of ${n(total)}${pct(fs_.peopleWithin800mOf10Min, total)}`, method, fs_.peopleWithin800mOf10Min, "people"));
    }
    if (t.focus?.reach?.length) {
      const r = t.focus.reach.filter((x: { scenario: string }) => x.scenario === "weekday-0800");
      if (r.length) out.push(fig("focus-reach", `People who can reach ${t.focus.label} by transit and walking (weekday 8 am)`, r.map((x: { minutes: number; people: number; share: number }) => `${x.minutes} min: ${n(x.people)} (${Math.round(x.share * 100)}%)`).join("; "), method));
    }
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

function clerk(d: Decision | undefined, lines: Lines): string {
  const city = d ? readJson<CityConfig>(path.join(import.meta.dirname, "..", "cities", `${d.city}.json`)) : undefined;
  return city?.clerkContact ? lines.clerk(city.clerkContact) : "";
}

/** The next events (or open windows) with ways to take part, soonest first. */
function upcoming(d: Decision, now: Date): string[] {
  const t = now.getTime();
  const start = (iso: string) => new Date(/T/.test(iso) ? iso : `${iso}T23:59:00-05:00`).getTime();
  return d.timeline
    .filter((e) => e.participation?.length && (start(e.end ?? e.date) >= t))
    .sort((a, b) => start(a.date) - start(b.date))
    .slice(0, 2)
    .map((e) => `timeline-${e.id}`);
}

export function offlineAnswer(dataDir: string, decisionId: string, question: string, opts: { lang?: string; now?: Date } = {}): Answer {
  const L = linesFor(opts.lang);
  const decision = /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(decisionId) ? readJson<Decision>(path.join(dataDir, "decisions", `${decisionId}.json`)) : undefined;
  const brief = decision ? readJson<Brief>(path.join(dataDir, "briefs", `${decisionId}.json`)) : undefined;
  if (!decision) return { type: "answer", offline: true, statements: [], text: L.noDecision };

  // The question's meaningful words (French ones mapped to English), each with the
  // document words that count for it. Words of the decision's title ("Region", "budget")
  // are about the whole decision, not the question's topic.
  const decisionWords = new Set(terms(decision.title));
  const raw = [...new Set(terms(question).map((w) => FR[plainLetters(w)] ?? w).flatMap((w) => terms(w)))];
  const asked = raw.filter((w) => !QUESTION_WORDS.has(w) && !decisionWords.has(w) && !/^\d+$/.test(w));
  const words = asked.map((w) => [w, ...(SYNONYMS[w] ?? [])]);

  const aboutConstruction = words.some((alts) => alts.some((w) => CONSTRUCTION.has(w)));
  const timeline = timelineItems(dataDir, decision, L).filter((i) => i.kind !== "statement" || i.statement.verified);
  const items: Item[] = [
    ...(brief ? checkedStatements(brief).map((s) => ({ kind: "statement", statement: s }) as Item) : []),
    ...timeline,
    ...(brief?.figures ?? []).filter((f) => f.kind === "computed").map((f) => ({ kind: "figure", figure: f }) as Item),
    ...lensItems(dataDir, decision).filter((i) => aboutConstruction || i.kind !== "figure" || !i.figure.id.startsWith("construction")),
  ];
  const picked = rankItems(items, words);
  // "When can I…", "how do I register…": the next chances to take part, with their
  // deadlines, always come first.
  // Read from the raw words: "when" is a stopword to the search, but not to the intent.
  const rawWords = question.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).map((w) => FR[plainLetters(w)] ?? w);
  if (rawWords.some((w) => WHEN_WORDS.has(w) || WHEN_WORDS.has(w.replace(/s$/, "")))) {
    const next = upcoming(decision, opts.now ?? new Date())
      .map((id) => items.findIndex((it) => it.kind === "statement" && it.statement.id === id))
      .filter((i) => i >= 0);
    for (const i of next.reverse()) {
      const at = picked.indexOf(i);
      if (at >= 0) picked.splice(at, 1);
      picked.unshift(i);
    }
    picked.splice(5);
  }

  const draft = brief && brief.review?.status !== "published" ? `\n\n${L.draft}` : "";
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
      return `• ${it.figure.label}${it.figure.display ? `: ${it.figure.display}` : ""} (${L.computed}) [C${figures.length}]`;
    });
    return { type: "answer", offline: true, text: `${L.intro}\n${lines.join("\n")}${draft}`, statements, ...(figures.length ? { figures } : {}) };
  }

  const quotes = words.length ? documentQuotes(dataDir, decisionId, words) : [];
  if (quotes.length)
    return { type: "answer", offline: true, statements: quotes, text: `${L.quotes}\n${quotes.map((q, i) => `• ${q.text} [${i + 1}]`).join("\n")}` };
  return { type: "answer", offline: true, statements: [], text: `${L.none}${clerk(decision, L)}` };
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

export const __forTests = { timelineItems, upcoming };
