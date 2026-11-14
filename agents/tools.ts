// The tools specialists call. Reading tools find text; recording tools are where the
// product rules are enforced in code: a statement is checked against its pages the
// moment it is recorded, and a rejected one comes back with the reason (and, where we
// can tell, where the quote really is) so the model can fix it. Nothing unverified is
// ever accepted as a fact.

import type {
  AgentEvent, AudienceId, Citation, CommitmentsLens, CostLens, Figure, GlossaryTerm, HousingLens, LensId, LogEntry,
  Statement, StatementKind, TransitLens, Unknown,
} from "../shared/types.ts";
import { findQuotePages, normalise, verifyCitation, MIN_QUOTE_CHARS } from "../shared/verify.ts";
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
}

export function newFindings(): Findings {
  return { statements: [], figures: [], unknowns: [], terms: [], commitments: [], rejected: 0, nextId: 1 };
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

export function ruleProblems(text: string, section: Section, kind: StatementKind): string[] {
  const out: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) out.push("The statement is empty.");
  if (words > MAX_WORDS) out.push(`Too long (${words} words). Use one plain sentence under 30 words.`);
  if (ADVOCACY.some((r) => r.test(text)))
    out.push("Never tell residents what to think or how to vote, and never judge the plan. Describe what the documents say.");
  if (section === "impact" && !HEDGE.test(text))
    out.push('Impacts are not certain: say what "may" happen (use "may", "might" or "could").');
  if ((section === "tradeoff" || kind === "tradeoff") && !CONTRAST.test(text))
    out.push('A trade-off shows both sides in one sentence: what is gained "but" what it costs or who may lose.');
  return out;
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
  const clean = list.map((c) => ({ sourceId: String(c?.sourceId ?? ""), page: Number(c?.page), quote: String(c?.quote ?? "").trim() }));
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
  const text = String(a.text ?? "").trim();
  const kind: StatementKind = (["fact", "estimate", "harm", "tradeoff"] as StatementKind[]).includes(a.kind as StatementKind) ? a.kind! : "fact";
  const section: Section = SECTIONS.includes(a.section as Section) ? a.section! : "answer";
  const problems = ruleProblems(text, section, kind);
  if (section === "impact" && !AUDIENCES.includes(a.audience as AudienceId))
    problems.push(`An impact needs an audience, one of: ${AUDIENCES.join(", ")}.`);
  const { citations, problems: citeProblems } = checkCitations(env.corpus, a.citations);
  problems.push(...citeProblems);

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
  };
  env.findings.statements.push(statement);
  const { section: _s, audience: _a, specialist: _sp, stepId: _st, lens: _l, ...publicStatement } = statement;
  env.emit({ type: "statement", id: env.stepId, statement: publicStatement });
  env.log("statement.recorded", { specialist: env.specialist, id: statement.id, section, audience: statement.audience, text, citations });
  return {
    response: { accepted: true, id: statement.id },
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
      // The number shown must be the number quoted: "$3.1 million" needs "3.1" in the quote.
      const nums = (s: string) => (s.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []);
      const quoteNums = new Set(nums(citations[0]?.quote ?? ""));
      if (!problems.length && nums(display).length && !nums(display).some((n) => quoteNums.has(n)))
        problems.push(`The quote must contain the number in display ("${display}"). Quote the words around that number.`);
      if (!label || !display || typeof a.value !== "number") problems.push("label, value (a number) and display are all required.");
      if (problems.length) {
        env.findings.rejected++;
        env.log("statement.rejected", { specialist: env.specialist, figure: { label, display }, citations, reasons: problems });
        return { response: { accepted: false, reasons: problems }, summary: `Rejected a figure: ${short(problems[0], 100)}` };
      }
      const dup = env.findings.figures.find((f) => normalise(f.label) === normalise(label));
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
      if (env.findings.unknowns.some((x) => normalise(x.question) === normalise(u.question)))
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
      if (!env.findings.terms.some((x) => normalise(x.term) === normalise(t.term))) env.findings.terms.push(t);
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
        },
        required: ["title", "madeBy", "target", "status", "relation", "progress"],
      },
    },
    run(a: any, env) {
      const problems: string[] = [];
      const progress: Statement[] = [];
      const items: { text?: string; citations?: Citation[] }[] = Array.isArray(a.progress) ? a.progress : [];
      if (!items.length) problems.push("At least one cited progress statement is required.");
      items.forEach((p, i) => {
        const text = String(p?.text ?? "").trim();
        const rp = ruleProblems(text, "lens", "fact");
        const { citations, problems: cp } = checkCitations(env.corpus, p?.citations);
        for (const x of [...rp, ...cp]) problems.push(`Progress ${i + 1}: ${x}`);
        progress.push({ id: `s${env.findings.nextId++}`, text, kind: "fact", citations, verified: cp.length === 0 });
      });
      const status = ["on-track", "behind", "done", "unclear"].includes(a.status) ? a.status : "unclear";
      if (status !== "unclear" && progress.length < 2)
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
      };
      env.findings.commitments.push(k);
      for (const s of progress) env.emit({ type: "statement", id: env.stepId, statement: s });
      env.log("statement.recorded", { specialist: env.specialist, commitment: k });
      return { response: { accepted: true, id: k.id }, summary: `Checked and recorded a commitment: ${short(k.title, 60)} (${status})` };
    },
  },

  transit_gaps: {
    decl: {
      name: "transit_gaps",
      description: "Computed transit access for this decision's area (from GTFS schedules and essential destinations): access by time of day, service gaps, ranked fixes with trade-offs, method and limits.",
      parameters: { type: "object", properties: {} },
    },
    async run(_a, env) {
      const data = env.corpus.lensData.transit as TransitLens | undefined;
      if (data) return { response: transitSummary(data), summary: `Looked up computed transit access: ${data.gaps?.length ?? 0} gaps, ${data.fixes?.length ?? 0} possible fixes` };
      return { response: NO_LENS("transit"), summary: "Looked for computed transit access: none yet" };
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
      let data = env.corpus.lensData.cost as CostLens | undefined;
      const wantsChange = data && ((a.horizonYears && a.horizonYears !== data.horizonYears) || (a.discountRate !== undefined && a.discountRate !== data.discountRate));
      if (data && wantsChange) {
        const mod = await tryImport(["../lenses/cost.ts", "../lenses/cost/index.ts"]);
        const fn = mod?.lifecycleCost as ((...args: unknown[]) => unknown) | undefined;
        if (typeof fn === "function") {
          try {
            const out = (await fn(data, { horizonYears: a.horizonYears ?? data.horizonYears, discountRate: a.discountRate ?? data.discountRate })) as CostLens;
            if (out && typeof out === "object" && out.totals) data = { ...data, ...out };
          } catch {
            // the lens function's inputs may differ from what we pass; keep the precomputed result
          }
        }
      }
      if (data) return { response: costSummary(data), summary: `Looked up the lifecycle cost over ${data.horizonYears} years` };
      return { response: NO_LENS("lifecycle cost"), summary: "Looked for a computed lifecycle cost: none yet" };
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
      if (data) return { response: housingSummary(data), summary: `Looked up housing units by stage for ${data.city}` };
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

export function toolsFor(names: string[]): Tool[] {
  return names.map((n) => TOOLS[n]).filter((t): t is Tool => Boolean(t));
}
