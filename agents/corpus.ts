// What the agents may read for one decision: its metadata, its source documents' page
// text, the research notes, and any precomputed lens results. Plus a small BM25 index
// over passages so `search_pages` can find where something is said.

import fs from "node:fs";
import path from "node:path";
import type { Decision, LensId, SourceDoc } from "../shared/types.ts";

export interface Passage {
  sourceId: string;
  page: number; // 1-based
  text: string; // a few lines of the page, as extracted
  terms: Map<string, number>;
  length: number;
}

export interface Corpus {
  dataDir: string;
  decision: Decision;
  sources: SourceDoc[]; // only the decision's sources, in the decision's order
  pages: Map<string, string[]>;
  notes?: string;
  passages: Passage[];
  docFreq: Map<string, number>;
  avgLength: number;
  lensData: Partial<Record<LensId, unknown>>;
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function loadCorpus(dataDir: string, decisionId: string): Corpus {
  if (!SAFE_ID.test(decisionId)) throw new Error(`bad decision id "${decisionId}"`);
  const decision = readJson<Decision>(path.join(dataDir, "decisions", `${decisionId}.json`));
  if (!decision) throw new Error(`decision "${decisionId}" not found in ${dataDir}/decisions`);
  const index = readJson<SourceDoc[]>(path.join(dataDir, "sources", "index.json")) ?? [];
  const pages = new Map<string, string[]>();
  const sources: SourceDoc[] = [];
  for (const id of decision.sources) {
    if (!SAFE_ID.test(id)) continue;
    const p = readJson<string[]>(path.join(dataDir, "sources", `${id}.pages.json`));
    if (!p) continue; // a source without extracted text can't be cited, so it's left out
    pages.set(id, p);
    sources.push(
      index.find((s) => s.id === id) ?? {
        id, title: id, publisher: "", url: "", published: "", retrieved: "", pages: p.length, licence: "", kind: "other",
      },
    );
  }
  let notes: string | undefined;
  try {
    notes = fs.readFileSync(path.join(dataDir, "decisions", `${decisionId}.notes.md`), "utf8");
  } catch {
    notes = undefined;
  }
  const corpus: Corpus = {
    dataDir, decision, sources, pages, notes,
    passages: [], docFreq: new Map(), avgLength: 0,
    lensData: loadLensFiles(dataDir, decision),
  };
  indexPassages(corpus);
  return corpus;
}

// ---------------------------------------------------------------------------
// Precomputed lens results in data/lenses. The lens builder's file layout may vary, so
// any JSON file whose path names a lens id is used, preferring one that also names this
// decision; a file naming another decision is skipped.

const LENS_IDS: LensId[] = ["transit", "cost", "commitments", "housing"];

export function loadLensFiles(dataDir: string, decision: Decision): Partial<Record<LensId, unknown>> {
  const root = path.join(dataDir, "lenses");
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const n of names) {
      const p = path.join(dir, n);
      if (n.startsWith(".")) continue;
      if (n.endsWith(".json")) files.push(p);
      else if (depth < 2 && fs.statSync(p).isDirectory()) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  const forThis: Partial<Record<LensId, unknown>> = {};
  const general: Partial<Record<LensId, unknown>> = {};
  const otherIds = new Set(
    (() => {
      try {
        return fs.readdirSync(path.join(dataDir, "decisions")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
      } catch {
        return [];
      }
    })().filter((id) => id !== decision.id),
  );
  for (const file of files) {
    const tokens = path.relative(root, file).replace(/\.json$/, "").split(/[/.]/);
    if (tokens.some((t) => otherIds.has(t))) continue;
    const value = readJson<Record<string, unknown>>(file);
    if (!value || typeof value !== "object") continue;
    if (typeof value.decisionId === "string" && value.decisionId !== decision.id) continue;
    const mine = tokens.includes(decision.id);
    const lens = LENS_IDS.find((l) => tokens.includes(l));
    if (lens) (mine ? forThis : general)[lens] = value;
    else if (mine) for (const l of LENS_IDS) if (value[l]) forThis[l] = value[l];
  }
  for (const l of decision.lenses ?? []) if (!forThis[l] && general[l]) forThis[l] = general[l];
  return forThis;
}

// ---------------------------------------------------------------------------
// BM25 over passages of ~10 lines (overlapping by half), so a hit comes back as a
// readable snippet with its page, not a whole page.

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with which who what when where how why do does can i my we our you your they their there these those than then not no".split(" "),
);

export function terms(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^\p{L}\p{N}$%.]+/u)
    .map((t) => t.replace(/^[.$]+|[.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

const WINDOW = 10;

function indexPassages(c: Corpus): void {
  for (const [sourceId, pages] of c.pages) {
    pages.forEach((pageText, i) => {
      const lines = pageText.split(/\r?\n/).filter((l) => l.trim());
      for (let start = 0; start < Math.max(1, lines.length); start += WINDOW / 2) {
        const text = lines.slice(start, start + WINDOW).join("\n");
        if (!text.trim()) continue;
        const ts = terms(text);
        const tf = new Map<string, number>();
        for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
        c.passages.push({ sourceId, page: i + 1, text, terms: tf, length: ts.length });
        if (start + WINDOW >= lines.length) break;
      }
    });
  }
  for (const p of c.passages) for (const t of p.terms.keys()) c.docFreq.set(t, (c.docFreq.get(t) ?? 0) + 1);
  c.avgLength = c.passages.reduce((n, p) => n + p.length, 0) / Math.max(1, c.passages.length);
}

export interface SearchHit {
  sourceId: string;
  page: number;
  score: number;
  snippet: string;
}

/** Top passages for a query, at most one per page (the best), highest score first. */
export function search(c: Corpus, query: string, opts: { sourceId?: string; limit?: number } = {}): SearchHit[] {
  const q = [...new Set(terms(query))];
  const N = c.passages.length;
  const k1 = 1.2;
  const b = 0.75;
  const best = new Map<string, SearchHit>();
  for (const p of c.passages) {
    if (opts.sourceId && p.sourceId !== opts.sourceId) continue;
    let score = 0;
    for (const t of q) {
      const f = p.terms.get(t);
      if (!f) continue;
      const df = c.docFreq.get(t) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * p.length) / (c.avgLength || 1)));
    }
    if (score <= 0) continue;
    const key = `${p.sourceId}#${p.page}`;
    const prev = best.get(key);
    if (!prev || prev.score < score) best.set(key, { sourceId: p.sourceId, page: p.page, score, snippet: displayText(p.text) });
  }
  return [...best.values()].sort((a, b2) => b2.score - a.score).slice(0, opts.limit ?? 6);
}

/**
 * Page text as the model sees it: runs of 3+ spaces (gaps between columns) become " | "
 * so the model can tell columns apart, and long blank runs are squeezed.
 */
export function displayText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/ {3,}/g, " | "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
