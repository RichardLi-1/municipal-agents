// The tools specialists call. Reading tools find text; recording tools are where the
// product rules are enforced in code: a statement is checked against its pages the
// moment it is recorded, and a rejected one comes back with the reason (and, where we
// can tell, where the quote really is) so the model can fix it. Nothing unverified is
// ever accepted as a fact.

import type {
  AgentEvent, AudienceId, Citation, CommitmentsLens, ConstructionLens, CostLens, Decision, Figure, GlossaryTerm, HousingLens, LensId, LogEntry,
  Statement, StatementKind, TransitLens, Unknown,
} from "../shared/types.ts";
import { findQuotePages, normalise, verifyCitation, MIN_QUOTE_CHARS } from "../shared/verify.ts";
import { fleschKincaidGrade } from "../shared/readability.ts";
import { supportOf, textArtifacts } from "./tidy.ts";
import { displayText, search, type Corpus } from "./corpus.ts";
import type { FunctionDeclaration } from "./gemini.ts";

export const AUDIENCES: AudienceId[] = [
  "renter", "homeowner", "transit-rider", "driver", "walk-cycle", "business-owner", "senior", "student", "parent",
  "disability", "newcomer",
];

export const AUDIENCE_LABELS: Record<AudienceId, string> = {
  renter: "If you rent",
  homeowner: "If you own a home",
  "transit-rider": "If you ride transit",
  driver: "If you drive",
  "walk-cycle": "If you walk or cycle",
  "business-owner": "If you run a business",
  senior: "If you are a senior",
  student: "If you are a student",
  parent: "If you are a parent",
  disability: "If you have a disability",
  newcomer: "If you are new to Canada",
};

/** Where a statement goes in the brief. "answer" is for questions asked in the chat. */
export type Section = "summary" | "whyNow" | "impact" | "haveYourSay" | "tradeoff" | "lens" | "answer";
const SECTIONS: Section[] = ["summary", "whyNow", "impact", "haveYourSay", "tradeoff", "lens", "answer"];

export interface RecordedStatement extends Statement {
  section: Section;
  audience?: AudienceId;
  specialist: string;
  stepId: string;
  lens?: LensId;
}

export type CommitmentDraft = CommitmentsLens["commitments"][number];

/** Everything recorded during one run (a brief or an answer), shared by its specialists. */
export interface Findings {
  statements: RecordedStatement[];
  figures: Figure[];
  unknowns: Unknown[];
  terms: GlossaryTerm[];
  commitments: CommitmentDraft[];
  rejected: number;
  nextId: number;
  /** Text of every lens result a specialist saw; computed figures must come from here. */
  lensOutputs: Partial<Record<LensId, string>>;
  /** A cost lens built during this run from cited figures and stated assumptions. */
  costLens?: CostLens;
}

export function newFindings(): Findings {
  return { statements: [], figures: [], unknowns: [], terms: [], commitments: [], rejected: 0, nextId: 1, lensOutputs: {} };
}

function rememberLens(env: ToolEnv, lens: LensId, text: string): void {
  env.findings.lensOutputs[lens] = `${env.findings.lensOutputs[lens] ?? ""}\n${text}`;
}

export interface ToolEnv {
  corpus: Corpus;
  findings: Findings;
  specialist: string;
  stepId: string;
  lens?: LensId;
  emit(e: AgentEvent): void;
  log(kind: LogEntry["kind"], payload: unknown): void;
}

export interface ToolOutcome {
  response: Record<string, unknown>;
  /** One plain line for the steps panel. */
  summary: string;
}

export interface Tool {
  decl: FunctionDeclaration;
  run(args: any, env: ToolEnv): ToolOutcome | Promise<ToolOutcome>;
}

// ---------------------------------------------------------------------------
// Plain-language and neutrality rules a statement must pass, checked in code.

const ADVOCACY = [
  /\b(you|residents|people|everyone|voters|readers)\s+(should|must|ought to|need to)\s+(vote|support|oppose|back|reject|approve|object|fight|demand)\b/i,
  /\b(we|i)\s+(recommend|suggest|urge|advise|believe|think)\b/i,
  /\bvote\s+(for|against|yes|no)\b/i,
  /\bthis (is|would be) an? (good|bad|great|terrible|smart|poor|wise|unwise) (idea|plan|decision|deal|choice)\b/i,
];

const HEDGE = /\b(may|might|could)\b/i;
const CONTRAST = /\b(but|while|however|though|although|whereas|yet|on the other hand|in exchange|at the cost of|trade-?off)\b/i;
const MAX_WORDS = 40;
/** A single sentence above this grade is rejected; above HINT_GRADE it is accepted with a nudge. */
export const MAX_GRADE = 14;
const HINT_GRADE = 10;

export function ruleProblems(text: string, section: Section, kind: StatementKind): string[] {
  const out: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) out.push("The statement is empty.");
  if (words > MAX_WORDS) out.push(`Too long (${words} words). Use one plain sentence under 30 words.`);
  if (ADVOCACY.some((r) => r.test(text)))
    out.push("Never tell residents what to think or how to vote, and never judge the plan. Describe what the documents say.");
  if (section === "impact" && !HEDGE.test(text))
    out.push('Impacts are not certain: say what "may" happen next (use "may", "might" or "could"), with any past fact as context: "Your tax may rise again; in 2026 it rose $142."');
  if ((section === "tradeoff" || kind === "tradeoff") && !CONTRAST.test(text))
    out.push('A trade-off shows both sides in one sentence: what is gained "but" what it costs or who may lose.');
  // The summary and impacts are what the brief's reading grade is measured on, so they
  // are held to a stricter limit.
  const grade = fleschKincaidGrade(text);
  const limit = section === "summary" || section === "impact" ? MAX_GRADE - 2 : MAX_GRADE;
  if (words >= 8 && grade > limit)
    out.push(`Hard to read (grade ${grade}). Use a shorter sentence (8 to 15 words) and everyday words ("the Region", "upkeep", "money set aside").`);
  return out;
}

// ---------------------------------------------------------------------------
// Numbers: every number a sentence states must be in one of its quotes. Budget tables
// are often "in $ thousands", so "$80.5 million" is accepted for a quoted "80,483":
// the quoted number, scaled by a power of 1,000 and rounded to the sentence's
// precision, must equal the stated one.

export function numbersIn(text: string): string[] {
  return text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
}

export function numberBacked(n: string, quoteNumbers: string[]): boolean {
  if (quoteNumbers.includes(n)) return true;
  const x = Number(n);
  const decimals = (n.split(".")[1] ?? "").length;
  for (const qs of quoteNumbers) {
    const q = Number(qs);
    for (const k of [-9, -6, -3, 0, 3, 6, 9]) {
      if (Math.abs(Number((q / 10 ** k).toFixed(decimals)) - x) < 1e-9) return true;
    }
  }
  return false;
}

// Dates in the decision's hand-checked timeline (meeting days, registration and survey
// deadlines) may be stated as dates without being in a quote: the team checked them, and
// some (like "register by noon one week before") are worked out from a cited rule.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function stripTimelineDates(text: string, decision: Decision): string {
  const isoDates = decision.timeline.flatMap((t) => [t.date, t.end, ...(t.participation ?? []).map((p) => p.deadline)]).filter((d): d is string => !!d);
  let out = text;
  for (const iso of isoDates) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const [year, month, day] = [m[1], MONTHS[Number(m[2]) - 1], String(Number(m[3]))];
    const mon = month.slice(0, 3);
    const yr = `(?:,?\\s*${year})?`;
    for (const re of [
      new RegExp(`\\b(?:${month}|${mon}\\.?)\\s+${day}(?:st|nd|rd|th)?\\b${yr}`, "gi"),
      new RegExp(`\\b${day}(?:st|nd|rd|th)?\\s+(?:${month}|${mon}\\.?)\\b${yr}`, "gi"),
    ]) out = out.replace(re, " ");
  }
  return out;
}

function unbackedNumbers(text: string, citations: Citation[], exempt: string): string[] {
  const quoted = citations.flatMap((c) => numbersIn(c.quote));
  const free = new Set(numbersIn(exempt));
  return [...new Set(numbersIn(text))].filter((n) => !free.has(n) && !numberBacked(n, quoted));
}

/** The value a display string shows: "$87.6 million" → 87600000. Undefined if none. */
export function displayValue(display: string): number | undefined {
  const m = display.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/(\d+(?:\.\d+)?)\s*(thousand|million|billion|bn|k|m|b)?\b/i);
  if (!m) return undefined;
  const mult: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, bn: 1e9 };
  return Number(m[1]) * (mult[(m[2] ?? "").toLowerCase()] ?? 1);
}

// A sentence must share at least one word (or a number) with its quotes; otherwise the
// quotes can't be showing what it says. Catches a model citing a real passage for an
// unrelated or placeholder sentence. Words are compared by their first five letters so
// "spaces" matches "space" and "removes" matches "removed".
const SHARE_STOP = new Set("this that with from have will what when where which their there they them were been than then into also more most some such only over your about would could might".split(" "));
function contentWords(s: string): Set<string> {
  return new Set(
    normalise(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !SHARE_STOP.has(w) && !/\d/.test(w))
      .map((w) => w.slice(0, 5)),
  );
}
export function sharesWords(text: string, quotes: string[]): boolean {
  const q = contentWords(quotes.join(" "));
  if ([...contentWords(text)].some((w) => q.has(w))) return true;
  const quoteNums = quotes.flatMap(numbersIn);
  return numbersIn(text).some((n) => numberBacked(n, quoteNums));
}

const PLACEHOLDER = /\b(placeholder|lorem ipsum|todo|tbd|sentence \d+|statement \d+)\b/i;

// Two texts saying nearly the same thing (most of their longer words shared).
function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(normalise(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.7;
}

// ---------------------------------------------------------------------------
// Citation checking with feedback a model can act on.

function closestLine(pageText: string, quote: string): string {
  const qWords = new Set(normalise(quote).split(" ").filter((w) => w.length > 2));
  let best = "";
  let bestScore = 0;
  const segments = pageText.split(/\r?\n/).flatMap((l) => l.split(/ {3,}/)).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const score = normalise(seg).split(" ").filter((w) => qWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  }
  return bestScore >= 2 ? best.slice(0, 220) : "";
}

export function checkCitation(corpus: Corpus, c: Citation): string | null {
  if (!c || typeof c.quote !== "string" || typeof c.sourceId !== "string") return "Each citation needs sourceId, page and quote.";
  const pages = corpus.pages.get(c.sourceId);
  if (!pages) return `Source "${c.sourceId}" is not one of this decision's sources: ${[...corpus.pages.keys()].join(", ")}.`;
  const page = Number(c.page);
  if (!Number.isInteger(page) || page < 1 || page > pages.length) return `${c.sourceId} has pages 1 to ${pages.length}; page ${c.page} doesn't exist.`;
  if (/\.\.\.|…/.test(c.quote)) return "Quotes must be continuous words from the page, with no ellipsis. Split it into two citations instead.";
  if (normalise(c.quote).length < MIN_QUOTE_CHARS) return "Quote is too short to check. Copy at least 6 words exactly as they appear.";
  if (verifyCitation(pages, { ...c, page })) return null;
  const elsewhere = findQuotePages(pages, c.quote);
  if (elsewhere.length) return `That quote is on page ${elsewhere.join(", ")} of ${c.sourceId}, not page ${page}. Cite page ${elsewhere[0]}.`;
  for (const [sid, ps] of corpus.pages) {
    if (sid === c.sourceId) continue;
    const found = findQuotePages(ps, c.quote);
    if (found.length) return `That quote is in ${sid}, page ${found[0]}, not ${c.sourceId}.`;
  }
  const near = closestLine(pages[page - 1], c.quote);
  return (
    `Quote not found on ${c.sourceId} page ${page}.` +
    (near ? ` Closest text on that page: "${near}".` : "") +
    " Copy the words exactly as they appear (no paraphrase, no added words, no '|'), or call read_page first."
  );
}

function checkCitations(corpus: Corpus, citations: unknown): { citations: Citation[]; problems: string[] } {
  const list = Array.isArray(citations) ? (citations as Citation[]) : [];
  if (list.length === 0) return { citations: [], problems: ["At least one citation is required: a short exact quote from a page."] };
  const problems: string[] = [];
  // " | " is how we show column gaps to the model, not page text: drop it from quotes.
  const clean = list.map((c) => ({
    sourceId: String(c?.sourceId ?? ""),
    page: Number(c?.page),
    quote: String(c?.quote ?? "").replace(/\s*\|\s*/g, " ").replace(/^\s*(\.\.\.|…)|(\.\.\.|…)\s*$/g, "").replace(/\s+/g, " ").trim(),
  }));
  clean.forEach((c, i) => {
    const p = checkCitation(corpus, c);
    if (p) problems.push(list.length > 1 ? `Citation ${i + 1}: ${p}` : p);
  });
  return { citations: clean, problems };
}

function short(text: string, n = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function cites(cs: Citation[]): string {
  return cs.map((c) => `${c.sourceId} p.${c.page}`).join(", ");
}

/** Shared by record_statement and record_tradeoff. */
function recordStatement(
  env: ToolEnv,
  a: { text?: string; kind?: StatementKind; section?: Section; audience?: AudienceId; citations?: Citation[] },
): ToolOutcome {
  const raw = String(a.text ?? "").trim();
  const text = raw.charAt(0).toUpperCase() + raw.slice(1);
  let kind: StatementKind = (["fact", "estimate", "harm", "tradeoff"] as StatementKind[]).includes(a.kind as StatementKind) ? a.kind! : "fact";
  // Hedged ("may", "could", "might") is an estimate, never a fact.
  if (kind === "fact" && HEDGE.test(text)) kind = "estimate";
  const section: Section = SECTIONS.includes(a.section as Section) ? a.section! : "answer";
  const problems = [...textArtifacts(raw), ...ruleProblems(text, section, kind)];
  if (section === "impact" && !AUDIENCES.includes(a.audience as AudienceId))
    problems.push(`An impact needs an audience, one of: ${AUDIENCES.join(", ")}.`);
  const { citations, problems: citeProblems } = checkCitations(env.corpus, a.citations);
  problems.push(...citeProblems);
  if (PLACEHOLDER.test(text)) problems.push("That is placeholder text. Write the real sentence for residents.");
  if (!citeProblems.length) {
    const d = env.corpus.decision;
    const missing = unbackedNumbers(stripTimelineDates(text, d), citations, `${d.title} ${d.plainTitle}`);
    if (missing.length)
      problems.push(`Every number you state must be in one of your quotes; ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not. Quote the words with that number (a table row is fine), add a citation, or drop the number.`);
    else if (!sharesWords(text, citations.map((c) => c.quote)))
      problems.push("Your sentence shares no words with its quotes, so the quotes don't show what it says. Quote the words that say it, or change the sentence to match them.");
  }

  if (problems.length) {
    env.findings.rejected++;
    env.log("statement.rejected", { specialist: env.specialist, text, section, citations, reasons: problems });
    return {
      response: { accepted: false, reasons: problems, fix: "Fix the problem and call the tool again, or drop this statement." },
      summary: `Rejected a statement: ${short(problems[0], 100)}`,
    };
  }

  const dup = env.findings.statements.find((s) => normalise(s.text) === normalise(text));
  if (dup) return { response: { accepted: true, id: dup.id, note: "Already recorded; no need to repeat it." }, summary: `Already had: "${short(text, 60)}"` };

  const statement: RecordedStatement = {
    id: `s${env.findings.nextId++}`,
    text,
    kind,
    citations,
    verified: true, // every citation was just found on its page
    section,
    audience: section === "impact" ? a.audience : AUDIENCES.includes(a.audience as AudienceId) ? a.audience : undefined,
    specialist: env.specialist,
    stepId: env.stepId,
    lens: env.lens,
    support: supportOf(text, citations.map((c) => c.quote), [env.corpus.decision.title, env.corpus.decision.plainTitle]),
  };
  env.findings.statements.push(statement);
  const { section: _s, audience: _a, specialist: _sp, stepId: _st, lens: _l, ...publicStatement } = statement;
  env.emit({ type: "statement", id: env.stepId, statement: publicStatement });
  env.log("statement.recorded", { specialist: env.specialist, id: statement.id, section, audience: statement.audience, text, citations });
  const grade = fleschKincaidGrade(text);
  return {
    response: {
      accepted: true,
      id: statement.id,
      ...(grade > HINT_GRADE ? { hint: `Accepted, but it reads at grade ${grade}. Make the next ones shorter (8 to 15 words) with shorter words.` } : {}),
    },
    summary: `Checked and recorded: "${short(text, 70)}" (${cites(citations)})`,
  };
}

// ---------------------------------------------------------------------------
// Lens results: precomputed files in data/lenses, or the lens builder's functions
// when they exist. Missing lens data is reported plainly, never invented.

async function tryImport(paths: string[]): Promise<Record<string, unknown> | undefined> {
  for (const p of paths) {
    try {
      return (await import(new URL(p, import.meta.url).href)) as Record<string, unknown>;
    } catch {
      // not built yet, or a different layout; try the next one
    }
  }
  return undefined;
}

const COMPUTED_HOW =
  "These numbers are computed by code from open data, not quoted from a document. Record the key ones with record_computed_figure (lens, label, display, method). Never put them in record_statement, whose numbers must be in page quotes.";

const NO_LENS = (lens: string) => ({
  available: false,
  note: `No ${lens} results have been computed for this decision yet. Work from the documents, and record what can't be answered with record_unknown.`,
});

function transitSummary(t: TransitLens): Record<string, unknown> {
  return {
    available: true,
    feed: t.feed,
    scenarios: t.scenarios,
    access: t.access?.slice(0, 16),
    gaps: t.gaps?.slice(0, 10).map(({ id, kind, title, detail, scenario, peopleAffected }) => ({ id, kind, title, detail, scenario, peopleAffected })),
    fixes: t.fixes?.slice(0, 6),
    method: t.method,
    limits: t.limits,
    howToCite: "These are computed results, not quotes. Describe them in words; cite document pages only for what the documents say.",
  };
}

function costSummary(c: CostLens): Record<string, unknown> {
  return {
    available: true,
    asset: c.asset,
    horizonYears: c.horizonYears,
    discountRate: c.discountRate,
    households: c.households,
    totals: c.totals,
    figures: c.figures?.map(({ id, label, display, kind, citation, formula }) => ({ id, label, display, kind, citation, formula })),
    assumptions: c.assumptions,
    howToCite: "Cited figures carry their page: cite that page with its quote. Computed totals are maths over those figures; describe them as estimates.",
  };
}

function housingSummary(h: HousingLens): Record<string, unknown> {
  return { available: true, city: h.city, stages: h.stages, timeBetween: h.timeBetween, target: h.target, hardToTrack: h.hardToTrack };
}

function constructionJson(c: ConstructionLens): Record<string, unknown> {
  return {
    available: true,
    scenario: c.scenario,
    method: c.method,
    alignmentSource: c.alignmentSource,
    proposed: c.proposed,
    weights: c.weights,
    sites: c.sites?.slice(0, 6).map(({ id, name, role, areaM2, landUse, distanceToAlignmentM, nearestSensitive, truckAccess, score, reasons, concerns }) => ({
      id, name, role, areaM2, landUse, distanceToAlignmentM, nearestSensitive, truckAccess, score, reasons, concerns,
    })),
    bores: c.bores?.map(({ id, label, lengthM, diameterM, depthM }) => ({ id, label, lengthM, diameterM, depthM })),
    boreholes: c.boreholes?.length,
    crossPassages: c.crossPassages?.length,
    steps: c.steps?.map(({ n, title, plain, duration, whatResidentsNotice }) => ({ n, title, plain, duration, whatResidentsNotice })),
    limits: c.limits,
    references: c.references,
  };
}

function commitmentsSummary(c: CommitmentsLens): Record<string, unknown> {
  return {
    available: true,
    commitments: c.commitments?.map((k) => ({
      id: k.id, title: k.title, madeBy: k.madeBy, madeOn: k.madeOn, target: k.target, status: k.status, relation: k.relation, unclear: k.unclear,
      progress: k.progress?.map((s) => ({ text: s.text, citations: s.citations })),
    })),
  };
}

// ---------------------------------------------------------------------------

const citationSchema = {
  type: "object",
  properties: {
    sourceId: { type: "string", description: "Source id, e.g. one listed under Sources." },
    page: { type: "integer", description: "1-based page number." },
    quote: {
      type: "string",
      description: "6 to 30 words copied exactly, in order, from that page. No ellipsis, no added words, no '|'.",
    },
  },
  required: ["sourceId", "page", "quote"],
};

export const TOOLS: Record<string, Tool> = {
  search_pages: {
    decl: {
      name: "search_pages",
      description: "Keyword search over this decision's source documents. Returns up to 6 snippets with source id and page. Use specific words (a street, a dollar figure, 'parking', 'deadline').",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, sourceId: { type: "string", description: "Optional: search one source only." } },
        required: ["query"],
      },
    },
    run(a: { query?: string; sourceId?: string }, env) {
      const query = String(a.query ?? "").trim();
      const hits = search(env.corpus, query, { sourceId: a.sourceId || undefined, limit: 6 });
      return {
        response: { results: hits.map((h) => ({ sourceId: h.sourceId, page: h.page, snippet: h.snippet.slice(0, 900) })) },
        summary: `Searched the documents for "${short(query, 50)}": ${hits.length ? hits.map((h) => `${h.sourceId} p.${h.page}`).slice(0, 3).join(", ") : "nothing found"}`,
      };
    },
  },

  read_page: {
    decl: {
      name: "read_page",
      description: "Read one full page of a source document. ' | ' marks a gap between columns: read each column top to bottom and never copy '|' into a quote.",
      parameters: {
        type: "object",
        properties: { sourceId: { type: "string" }, page: { type: "integer" } },
        required: ["sourceId", "page"],
      },
    },
    run(a: { sourceId?: string; page?: number }, env) {
      const pages = env.corpus.pages.get(String(a.sourceId));
      const n = Number(a.page);
      if (!pages) return { response: { error: `Unknown source. Sources: ${[...env.corpus.pages.keys()].join(", ")}` }, summary: `Tried to open an unknown source "${a.sourceId}"` };
      if (!Number.isInteger(n) || n < 1 || n > pages.length) return { response: { error: `${a.sourceId} has pages 1 to ${pages.length}.` }, summary: `Tried page ${a.page} of ${a.sourceId}, which doesn't exist` };
      const title = env.corpus.sources.find((s) => s.id === a.sourceId)?.title ?? a.sourceId;
      return {
        response: { sourceId: a.sourceId, page: n, of: pages.length, text: displayText(pages[n - 1]).slice(0, 9000) },
        summary: `Read page ${n} of ${short(String(title), 60)}`,
      };
    },
  },

  record_statement: {
    decl: {
      name: "record_statement",
      description: "Record one plain sentence for residents, backed by exact quotes. It is checked against the page at once; if rejected, you get the reason and can fix it.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "One plain sentence, under 25 words, everyday words (grade 8)." },
          kind: { type: "string", enum: ["fact", "estimate", "harm", "tradeoff"] },
          section: { type: "string", enum: SECTIONS, description: "Where it goes in the brief ('answer' when answering a question)." },
          audience: { type: "string", enum: AUDIENCES, description: "Required when section is 'impact'." },
          citations: { type: "array", items: citationSchema },
        },
        required: ["text", "kind", "section", "citations"],
      },
    },
    run: (a, env) => recordStatement(env, a),
  },

  record_tradeoff: {
    decl: {
      name: "record_tradeoff",
      description: "Record a trade-off: one sentence with both sides (what is gained, but what it costs or who may lose), backed by quotes.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, audience: { type: "string", enum: AUDIENCES }, citations: { type: "array", items: citationSchema } },
        required: ["text", "citations"],
      },
    },
    run: (a, env) => recordStatement(env, { ...a, kind: "tradeoff", section: "tradeoff" }),
  },

  record_figure: {
    decl: {
      name: "record_figure",
      description: "Record a key number (a cost, a count, a date-bound target). Its quote must contain the number shown in 'display'.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", description: "Plain label, e.g. 'Cost to build'." },
          value: { type: "number" },
          unit: { type: "string", description: "CAD, %, units, km, spaces, years..." },
          display: { type: "string", description: "How to show it, e.g. '$3.1 million'." },
          citation: citationSchema,
        },
        required: ["label", "value", "unit", "display", "citation"],
      },
    },
    run(a: { label?: string; value?: number; unit?: string; display?: string; citation?: Citation }, env) {
      const label = String(a.label ?? "").trim();
      const display = String(a.display ?? "").trim();
      const { citations, problems } = checkCitations(env.corpus, a.citation ? [a.citation] : []);
      // The number shown must be the number quoted ("$80.5 million" may come from a
      // "$ thousands" table's "80,483"), and the stored value must match what is shown.
      if (!problems.length) {
        const missing = unbackedNumbers(display, citations, "");
        if (missing.length) problems.push(`The quote must contain the number in display ("${display}"). Quote the words (or table row) with that number.`);
      }
      if (!label || !display || typeof a.value !== "number") problems.push("label, value (a number) and display are all required.");
      const shown = displayValue(display);
      if (typeof a.value === "number" && shown !== undefined && Math.abs(shown - a.value) > Math.max(Math.abs(shown), 1) * 0.01)
        problems.push(`value ${a.value} doesn't match display "${display}" (${shown}). Give value as the full number, e.g. 87600000 for "$87.6 million".`);
      if (problems.length) {
        env.findings.rejected++;
        env.log("statement.rejected", { specialist: env.specialist, figure: { label, display }, citations, reasons: problems });
        return { response: { accepted: false, reasons: problems }, summary: `Rejected a figure: ${short(problems[0], 100)}` };
      }
      // Same label, or the same amount in the same unit, is the same figure.
      const dup = env.findings.figures.find(
        (f) => normalise(f.label) === normalise(label) || (f.unit === String(a.unit ?? "") && Math.abs(f.value - a.value!) <= Math.abs(f.value) * 0.005),
      );
      if (dup) return { response: { accepted: true, id: dup.id, note: "A figure with this label was already recorded." }, summary: `Already had figure "${label}"` };
      const fig: Figure = { id: `f${env.findings.nextId++}`, label, value: a.value!, unit: String(a.unit ?? ""), display, citation: citations[0], kind: "cited" };
      env.findings.figures.push(fig);
      env.log("statement.recorded", { specialist: env.specialist, figure: fig });
      return { response: { accepted: true, id: fig.id }, summary: `Checked and recorded a figure: ${label}, ${display} (${cites(citations)})` };
    },
  },

  record_unknown: {
    decl: {
      name: "record_unknown",
      description: "Record something residents would want to know that the documents do not answer, and who could answer it.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "Plain question or gap, e.g. 'Where displaced parking will go during construction'." },
          why: { type: "string", description: "Why it matters to residents, one sentence." },
          whoCanAnswer: { type: "string", description: "The office or body that could answer (public offices only, no private people)." },
          contact: { type: "string", description: "Optional public office contact taken from the documents." },
        },
        required: ["question", "why", "whoCanAnswer"],
      },
    },
    run(a: Unknown, env) {
      const u: Unknown = { question: String(a.question ?? "").trim(), why: String(a.why ?? "").trim(), whoCanAnswer: String(a.whoCanAnswer ?? "").trim() };
      if (a.contact) u.contact = String(a.contact);
      if (!u.question) return { response: { accepted: false, reasons: ["question is required"] }, summary: "Rejected an empty unknown" };
      if (env.findings.unknowns.some((x) => normalise(x.question) === normalise(u.question) || similar(x.question, u.question)))
        return { response: { accepted: true, note: "Already recorded." }, summary: `Already had unknown "${short(u.question, 60)}"` };
      env.findings.unknowns.push(u);
      env.log("statement.recorded", { specialist: env.specialist, unknown: u });
      return { response: { accepted: true }, summary: `Noted an unknown: ${short(u.question, 80)}` };
    },
  },

  record_term: {
    decl: {
      name: "record_term",
      description: "Add a glossary entry: a term from the documents and its meaning in plain words (one sentence).",
      parameters: { type: "object", properties: { term: { type: "string" }, plain: { type: "string" } }, required: ["term", "plain"] },
    },
    run(a: GlossaryTerm, env) {
      const t = { term: String(a.term ?? "").trim(), plain: String(a.plain ?? "").trim() };
      if (!t.term || !t.plain) return { response: { accepted: false, reasons: ["term and plain are required"] }, summary: "Rejected an empty glossary term" };
      if (!env.findings.terms.some((x) => normalise(x.term) === normalise(t.term))) {
        env.findings.terms.push(t);
        env.log("statement.recorded", { specialist: env.specialist, glossary: t });
      }
      return { response: { accepted: true }, summary: `Explained a term: ${t.term}` };
    },
  },

  record_commitment: {
    decl: {
      name: "record_commitment",
      description: "Record a public commitment this decision touches (a target the city or region set), with cited progress. Status 'on-track', 'behind' or 'done' needs cited progress against the target; otherwise use 'unclear'.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Plain title, e.g. 'Build 25 km of protected bike lanes by 2030'." },
          madeBy: { type: "string" },
          madeOn: { type: "string", description: "ISO date or year, if the documents say." },
          target: { type: "string" },
          status: { type: "string", enum: ["on-track", "behind", "done", "unclear"] },
          relation: { type: "string", description: "How this decision touches the commitment, one plain sentence." },
          unclear: { type: "array", items: { type: "string" }, description: "What is still unclear about progress." },
          progress: {
            type: "array",
            description: "Cited statements: the commitment itself and the latest progress figure.",
            items: { type: "object", properties: { text: { type: "string" }, citations: { type: "array", items: citationSchema } }, required: ["text", "citations"] },
          },
          numbers: {
            type: "object",
            description: "Optional, when the quotes give them: code then works out the status on a straight line from baseline to target. Every number must be in your progress quotes (0 and 100 excepted). For a % cut: baselineValue 0, targetValue 50, latestValue 12.",
            properties: {
              baselineYear: { type: "number" }, baselineValue: { type: "number" }, targetYear: { type: "number" }, targetValue: { type: "number" },
              latestYear: { type: "number" }, latestValue: { type: "number" }, unit: { type: "string" },
            },
            required: ["baselineYear", "baselineValue", "targetYear", "targetValue", "latestYear", "latestValue"],
          },
        },
        required: ["title", "madeBy", "target", "status", "relation", "progress"],
      },
    },
    async run(a: any, env) {
      const problems: string[] = [];
      const progress: Statement[] = [];
      const items: { text?: string; citations?: Citation[] }[] = Array.isArray(a.progress) ? a.progress : [];
      if (!items.length) problems.push("At least one cited progress statement is required.");
      items.forEach((p, i) => {
        const text = String(p?.text ?? "").trim();
        const rp = ruleProblems(text, "lens", "fact");
        const { citations, problems: cp } = checkCitations(env.corpus, p?.citations);
        if (!cp.length) {
          const missing = unbackedNumbers(text, citations, "");
          if (missing.length) cp.push(`the number(s) ${missing.join(", ")} must be in a quote.`);
        }
        for (const x of [...rp, ...cp]) problems.push(`Progress ${i + 1}: ${x}`);
        progress.push({
          id: `s${env.findings.nextId++}`, text, kind: "fact", citations, verified: cp.length === 0,
          support: supportOf(text, citations.map((c) => c.quote), [env.corpus.decision.title, env.corpus.decision.plainTitle]),
        });
      });
      let status = ["on-track", "behind", "done", "unclear"].includes(a.status) ? a.status : "unclear";
      // With numbers, the status is computed (lenses/commitments), not judged by the model.
      let computed: { status: string; explanation: string; method: string } | undefined;
      if (a.numbers && typeof a.numbers === "object" && !problems.length) {
        const n = a.numbers as Record<string, number>;
        const keys = ["baselineYear", "baselineValue", "targetYear", "targetValue", "latestYear", "latestValue"];
        const quoted = progress.flatMap((st) => st.citations.flatMap((c) => numbersIn(c.quote)));
        const unbacked = keys.filter((k) => typeof n[k] !== "number" || (n[k] !== 0 && n[k] !== 100 && !numberBacked(String(n[k]), quoted)));
        const mod = unbacked.length ? undefined : await tryImport(["../lenses/commitments/index.ts"]);
        if (unbacked.length) problems.push(`numbers: ${unbacked.join(", ")} must be numbers found in your progress quotes.`);
        else if (typeof mod?.commitmentStatus === "function") {
          const r = (mod.commitmentStatus as (i: unknown) => { status: string; explanation: string })({ ...n, unit: a.numbers.unit });
          computed = { status: r.status, explanation: r.explanation, method: "Straight line from the baseline to the target, compared with the latest figure (lenses/commitments)." };
          status = r.status;
        }
      }
      if (!computed && status !== "unclear" && progress.length < 2)
        problems.push(`Status "${status}" needs both the target and a progress figure cited; otherwise use "unclear".`);
      for (const f of ["title", "madeBy", "target", "relation"]) if (!String(a[f] ?? "").trim()) problems.push(`${f} is required.`);
      if (problems.length) {
        env.findings.rejected++;
        env.log("statement.rejected", { specialist: env.specialist, commitment: a.title, reasons: problems });
        return { response: { accepted: false, reasons: problems }, summary: `Rejected a commitment: ${short(problems[0], 100)}` };
      }
      const k: CommitmentDraft = {
        id: `c${env.findings.nextId++}`,
        title: String(a.title).trim(),
        madeBy: String(a.madeBy).trim(),
        madeOn: a.madeOn ? String(a.madeOn) : undefined,
        target: String(a.target).trim(),
        status,
        progress,
        unclear: Array.isArray(a.unclear) ? a.unclear.map(String) : [],
        relation: String(a.relation).trim(),
        ...(computed ? { computed } : {}),
      } as CommitmentDraft;
      env.findings.commitments.push(k);
      for (const s of progress) env.emit({ type: "statement", id: env.stepId, statement: s });
      env.log("statement.recorded", { specialist: env.specialist, commitment: k });
      return {
        response: { accepted: true, id: k.id, status, ...(computed ? { computedStatus: computed.explanation } : {}) },
        summary: `Checked and recorded a commitment: ${short(k.title, 60)} (${status}${computed ? ", computed" : ""})`,
      };
    },
  },

  transit_gaps: {
    decl: {
      name: "transit_gaps",
      description: "Computed transit access for this decision's area (from GTFS schedules and essential destinations): access by time of day, service gaps, ranked fixes with trade-offs, method and limits. Numbers from here are 'computed': record them with record_computed_figure.",
      parameters: {
        type: "object",
        properties: { scenario: { type: "string", description: "Optional: weekday-0800, weekday-2200 or sunday-0800 only." } },
      },
    },
    async run(a: { scenario?: string }, env) {
      const data = env.corpus.lensData.transit as TransitLens | undefined;
      if (!data) return { response: NO_LENS("transit"), summary: "Looked for computed transit access: none yet" };
      const mod = await tryImport(["../lenses/transit/summary.ts"]);
      const fn = mod?.transitSummary as ((l: TransitLens, o: Record<string, unknown>) => string) | undefined;
      let text: string | undefined;
      try {
        text = typeof fn === "function" ? fn(data, { scenario: a.scenario || undefined, maxGaps: 6, maxFixes: 5 }) : undefined;
      } catch {
        text = undefined;
      }
      const response = text ? { available: true, summary: text, howToCite: COMPUTED_HOW } : { ...transitSummary(data), howToCite: COMPUTED_HOW };
      rememberLens(env, "transit", text ?? JSON.stringify(response));
      return { response, summary: `Looked up computed transit access: ${data.gaps?.length ?? 0} gaps, ${data.fixes?.length ?? 0} possible fixes` };
    },
  },

  lifecycle_cost: {
    decl: {
      name: "lifecycle_cost",
      description: "Lifecycle cost of the asset: upfront capital vs operating, maintenance, renewal and environmental costs over its life, per household. Optionally recompute for a different horizon or discount rate.",
      parameters: {
        type: "object",
        properties: {
          horizonYears: { type: "integer", description: "Optional: years to count (default as computed, often 25 or 40)." },
          discountRate: { type: "number", description: "Optional: 0 or 0.03." },
        },
      },
    },
    async run(a: { horizonYears?: number; discountRate?: number }, env) {
      let data = (env.findings.costLens ?? env.corpus.lensData.cost) as (CostLens & { inputs?: Record<string, unknown> }) | undefined;
      if (!data)
        return {
          response: { available: false, note: "No lifecycle cost computed yet. Record the cost inputs you find with record_figure, then call build_lifecycle_cost with those figure ids and any stated assumptions." },
          summary: "Looked for a computed lifecycle cost: none yet",
        };
      const mod = await tryImport(["../lenses/cost/index.ts"]);
      const wantsChange = (a.horizonYears && a.horizonYears !== data.horizonYears) || (a.discountRate !== undefined && a.discountRate !== data.discountRate);
      if (wantsChange && data.inputs && typeof mod?.lifecycleCost === "function") {
        try {
          const overrides: Record<string, number> = {};
          if (a.horizonYears) overrides.horizonYears = a.horizonYears;
          if (a.discountRate !== undefined) overrides.discountRate = a.discountRate;
          data = (mod.lifecycleCost as (l: unknown, o: unknown) => CostLens & { inputs?: Record<string, unknown> })(data, overrides);
        } catch {
          // keep the lens as it was
        }
      }
      let text: string | undefined;
      try {
        text = data.inputs && typeof mod?.costSummary === "function" ? (mod.costSummary as (i: unknown) => string)(data.inputs) : undefined;
      } catch {
        text = undefined;
      }
      const response = text ? { available: true, summary: text, howToCite: COMPUTED_HOW } : { ...costSummary(data), howToCite: COMPUTED_HOW };
      rememberLens(env, "cost", text ?? JSON.stringify(response));
      return { response, summary: `Looked up the lifecycle cost over ${data.horizonYears} years` };
    },
  },

  housing_stages: {
    decl: {
      name: "housing_stages",
      description: "Housing units by stage from approval to completion for the city (from open permit and application data), median time between stages, and where progress is hard to track.",
      parameters: { type: "object", properties: {} },
    },
    async run(_a, env) {
      const data = env.corpus.lensData.housing as HousingLens | undefined;
      if (data) {
        // The lens builder's own plain-text summary when it exists (it knows its data best).
        const mod = await tryImport(["../lenses/housing/summary.ts"]);
        const fn = mod?.housingSummary as ((l: HousingLens) => string) | undefined;
        let text: string | undefined;
        try {
          text = typeof fn === "function" ? fn(data) : undefined;
        } catch {
          text = undefined;
        }
        const response = text ? { available: true, summary: text, howToCite: COMPUTED_HOW } : { ...housingSummary(data), howToCite: COMPUTED_HOW };
        rememberLens(env, "housing", text ?? JSON.stringify(response));
        return { response, summary: `Looked up housing units by stage for ${data.city}` };
      }
      return { response: NO_LENS("housing pipeline"), summary: "Looked for computed housing stages: none yet" };
    },
  },

  commitment_progress: {
    decl: {
      name: "commitment_progress",
      description: "Precomputed public commitments this decision touches, with their latest progress and status.",
      parameters: { type: "object", properties: {} },
    },
    async run(_a, env) {
      const data = env.corpus.lensData.commitments as CommitmentsLens | undefined;
      if (data) return { response: commitmentsSummary(data), summary: `Looked up ${data.commitments?.length ?? 0} tracked commitments` };
      return { response: NO_LENS("commitments"), summary: "Looked for tracked commitments: none yet" };
    },
  },
};

// Construction scout: an illustrative scenario computed from open data. The lens
// builder's constructionSummary() is used when it exists; until then, the JSON fields.
TOOLS.construction_sites = {
  decl: {
    name: "construction_sites",
    description: "The construction scout's illustrative scenario for this decision: candidate sites for excavation and a tunnel launch portal or shaft, scored with stated weights, bores, boreholes, the construction steps with what residents may notice, and the limits. A scenario for engineers and staff to evaluate, never the Region's plan.",
    parameters: { type: "object", properties: {} },
  },
  async run(_a, env) {
    const data = env.corpus.lensData.construction as ConstructionLens | undefined;
    if (!data) return { response: NO_LENS("construction scout"), summary: "Looked for a construction scenario: none yet" };
    const mod = await tryImport(["../lenses/construction/index.ts"]);
    const fn = mod?.constructionSummary as ((l: ConstructionLens) => string) | undefined;
    let text: string | undefined;
    try {
      text = typeof fn === "function" ? fn(data) : undefined;
    } catch {
      text = undefined;
    }
    const howToCite = `${COMPUTED_HOW} This is an illustrative scenario for engineers and staff to evaluate, never the Region's plan: say so whenever you use it.`;
    const response = text ? { available: true, summary: text, howToCite } : { ...constructionJson(data), howToCite };
    rememberLens(env, "construction", text ?? JSON.stringify(response));
    return {
      response,
      summary: `Looked up the construction scenario: ${data.sites?.length ?? 0} candidate sites, ${data.steps?.length ?? 0} steps`,
    };
  },
};

// A number from a lens result (transit access, lifecycle totals, housing stages,
// construction scenario). It is not a quote, so instead of a page it carries the method;
// code checks the number really is in a lens result this run has seen.
TOOLS.record_computed_figure = {
  decl: {
    name: "record_computed_figure",
    description: "Record a key number computed by a lens tool (not quoted from a document), with the method in plain words. The number in 'display' must appear in a lens result you looked up in this run.",
    parameters: {
      type: "object",
      properties: {
        lens: { type: "string", enum: ["transit", "cost", "housing", "construction", "commitments"] },
        label: { type: "string", description: "Plain label with its scenario, e.g. 'People who can reach a hospital within 45 min by transit, Sunday 8 am'." },
        value: { type: "number", description: "The number as shown: 48 for '48%', 462606 for '462,606 people'." },
        unit: { type: "string", description: "%, people, CAD, units, minutes..." },
        display: { type: "string", description: "e.g. '48%', '462,606 people', '$1.2 billion'." },
        method: { type: "string", description: "How it was computed, in one plain sentence (from the lens result's method)." },
      },
      required: ["lens", "label", "value", "unit", "display", "method"],
    },
  },
  run(a: { lens?: LensId; label?: string; value?: number; unit?: string; display?: string; method?: string }, env) {
    const lens = a.lens as LensId;
    const label = String(a.label ?? "").trim();
    const display = String(a.display ?? "").trim();
    const method = String(a.method ?? "").trim();
    const problems: string[] = [];
    const seen = env.findings.lensOutputs[lens];
    if (!seen) problems.push(`Look up the ${lens} lens first (its tool), then record numbers from its result.`);
    else {
      const missing = numbersIn(display).filter((n) => !numberBacked(n, numbersIn(seen)));
      if (missing.length) problems.push(`${missing.join(", ")} is not in the ${lens} result you looked up. Copy the number as it appears there.`);
    }
    if (!label || !display || !method || typeof a.value !== "number") problems.push("label, value (a number), display and method are all required.");
    const shown = displayValue(display);
    if (typeof a.value === "number" && shown !== undefined && Math.abs(shown - a.value) > Math.max(Math.abs(shown), 1) * 0.01)
      problems.push(`value ${a.value} doesn't match display "${display}" (${shown}). Give value as shown, e.g. 48 for "48%".`);
    if (problems.length) {
      env.findings.rejected++;
      env.log("statement.rejected", { specialist: env.specialist, figure: { label, display, lens }, reasons: problems });
      return { response: { accepted: false, reasons: problems }, summary: `Rejected a computed figure: ${short(problems[0], 100)}` };
    }
    const dup = env.findings.figures.find((f) => normalise(f.label) === normalise(label));
    if (dup) return { response: { accepted: true, id: dup.id, note: "A figure with this label was already recorded." }, summary: `Already had figure "${label}"` };
    const fig: Figure = {
      id: `f${env.findings.nextId++}`, label, value: a.value!, unit: String(a.unit ?? ""), display, kind: "computed",
      formula: `${method} (computed by Municipal Agents' ${lens} lens from open data)`, inputs: [],
    };
    env.findings.figures.push(fig);
    env.log("statement.recorded", { specialist: env.specialist, figure: fig });
    return { response: { accepted: true, id: fig.id }, summary: `Recorded a computed figure: ${short(label, 60)}, ${display}` };
  },
};

// The lifecycle cost lens, built by code (lenses/cost) from inputs the specialist found.
// Each input is either a recorded cited figure (by id, values must match) or a stated
// assumption with its reason, which residents can change with a slider.
const COST_INPUTS = ["capital", "operatingPerYear", "maintenancePerYear", "renewalAmount", "households"] as const;
TOOLS.build_lifecycle_cost = {
  decl: {
    name: "build_lifecycle_cost",
    description: "Compute the lifecycle cost (capital vs operating, maintenance, renewal over 25 or 40 years, per household) for one asset in this decision. Every input must come from a figure you recorded with record_figure (give its id) or be a stated assumption with its reason.",
    parameters: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Plain name, e.g. 'ION light rail to Cambridge (Stage 2)'." },
        startYear: { type: "integer" },
        horizonYears: { type: "integer", description: "25 or 40." },
        buildYears: { type: "integer" },
        capital: { type: "number" },
        operatingPerYear: { type: "number" },
        maintenancePerYear: { type: "number" },
        renewalEveryYears: { type: "integer", description: "Optional: a renewal every N years of service." },
        renewalAmount: { type: "number", description: "Optional: cost of each renewal." },
        households: { type: "number", description: "Optional: households sharing the cost." },
        discountRate: { type: "number", description: "0 (default) or 0.03." },
        sources: {
          type: "array",
          description: "One per input used: capital, operatingPerYear, maintenancePerYear, renewalAmount, households.",
          items: {
            type: "object",
            properties: {
              input: { type: "string", enum: [...COST_INPUTS] },
              figureId: { type: "string", description: "Id of a recorded cited figure with this value." },
              assumption: { type: "string", description: "If not cited: why this value is assumed, in plain words." },
            },
            required: ["input"],
          },
        },
      },
      required: ["asset", "startYear", "horizonYears", "capital", "operatingPerYear", "maintenancePerYear", "sources"],
    },
  },
  async run(a: any, env) {
    const problems: string[] = [];
    const sources: { input: string; figureId?: string; assumption?: string }[] = Array.isArray(a.sources) ? a.sources : [];
    const values: Record<string, number | undefined> = {
      capital: a.capital, operatingPerYear: a.operatingPerYear, maintenancePerYear: a.maintenancePerYear,
      renewalAmount: a.renewalEveryYears ? a.renewalAmount : undefined, households: a.households,
    };
    const used: Figure[] = [];
    const assumptions: CostLens["assumptions"] = [];
    for (const input of COST_INPUTS) {
      const v = values[input];
      if (v === undefined || v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        problems.push(`${input} must be a number of 0 or more.`);
        continue;
      }
      const src = sources.find((s) => s.input === input);
      const fig = src?.figureId ? env.findings.figures.find((f) => f.id === src.figureId && f.kind === "cited") : undefined;
      if (fig && Math.abs(fig.value - v) <= Math.max(Math.abs(fig.value), 1) * 0.01) used.push(fig);
      else if (src?.assumption?.trim()) {
        const step = v > 0 ? Number((10 ** Math.floor(Math.log10(v))).toPrecision(1)) / 10 : 1000;
        assumptions.push({ id: input, label: `Assumed ${input.replace(/PerYear$/, " per year")}`, value: v, unit: input === "households" ? "households" : "CAD", min: 0, max: v > 0 ? v * 3 : 1_000_000, step, why: src.assumption.trim() });
      } else if (fig) problems.push(`${input} is ${v} but figure ${fig.id} says ${fig.value}. Use the figure's value or state an assumption.`);
      else problems.push(`${input} needs a source: the id of a cited figure you recorded with that value, or an assumption with its reason.`);
    }
    if (!(a.horizonYears > 0 && a.horizonYears <= 100)) problems.push("horizonYears must be between 1 and 100 (25 or 40 is usual).");
    const mod = problems.length ? undefined : await tryImport(["../lenses/cost/index.ts"]);
    if (!problems.length && typeof mod?.buildCostLens !== "function") problems.push("The cost lens code isn't available.");
    if (problems.length) {
      env.findings.rejected++;
      env.log("statement.rejected", { specialist: env.specialist, costLens: a.asset, reasons: problems });
      return { response: { accepted: false, reasons: problems }, summary: `Couldn't build the lifecycle cost: ${short(problems[0], 90)}` };
    }
    const inputs: Record<string, unknown> = {
      startYear: a.startYear, horizonYears: a.horizonYears, capital: a.capital, buildYears: a.buildYears ?? 1,
      operatingPerYear: a.operatingPerYear, maintenancePerYear: a.maintenancePerYear, discountRate: a.discountRate ?? 0,
      ...(a.renewalEveryYears && a.renewalAmount ? { renewalEvery: { years: a.renewalEveryYears, amount: a.renewalAmount } } : {}),
      ...(a.households ? { households: a.households } : {}),
    };
    try {
      const lens = (mod!.buildCostLens as (x: unknown) => CostLens)({ asset: String(a.asset), inputs, figures: used, assumptions });
      env.findings.costLens = lens;
      const text = typeof mod!.costSummary === "function" ? (mod!.costSummary as (i: unknown) => string)(inputs) : JSON.stringify(lens.totals);
      rememberLens(env, "cost", text);
      env.log("statement.recorded", { specialist: env.specialist, costLens: { asset: lens.asset, inputs, assumptions: assumptions.map((x) => x.id), cited: used.map((f) => f.id) } });
      return {
        response: { accepted: true, summary: text, assumptions: assumptions.map((x) => `${x.id}: ${x.why}`), howToCite: COMPUTED_HOW },
        summary: `Computed the lifecycle cost of ${short(String(a.asset), 50)} over ${a.horizonYears} years (${used.length} cited inputs, ${assumptions.length} assumed)`,
      };
    } catch (err) {
      return { response: { accepted: false, reasons: [(err as Error).message] }, summary: `Couldn't build the lifecycle cost: ${(err as Error).message}` };
    }
  },
};

export function toolsFor(names: string[]): Tool[] {
  return names.map((n) => TOOLS[n]).filter((t): t is Tool => Boolean(t));
}
