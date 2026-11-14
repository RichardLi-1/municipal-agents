// The lead agent: plans which specialists to ask, runs them (in parallel, since their
// tasks are independent), and merges their verified statements into an answer or a
// brief. The answer is written by a model but kept honest by code: it may only use
// numbered verified statements, and sentences with figures that no statement backs
// are dropped before anyone sees them.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, Brief, Decision, LensId, Statement, CommitmentsLens } from "../shared/types.ts";
import { readingGrade } from "../shared/readability.ts";
import type { AgentContext } from "./index.ts";
import { callGemini, type CallModel } from "./gemini.ts";
import { loadCorpus, type Corpus } from "./corpus.ts";
import { Budget, budgetedCall, decisionBrief, runStep, type Run, type StepSpec } from "./loop.ts";
import { listSkills, loadSkill } from "./skills.ts";
import { AUDIENCES, AUDIENCE_LABELS, newFindings, type Findings, type RecordedStatement } from "./tools.ts";

export interface Deps {
  callModel: CallModel;
  leadModel: string;
  specialistModel: string;
  now: () => Date;
}

export function defaultDeps(): Deps {
  return {
    callModel: (req) => callGemini(req),
    leadModel: process.env.LEAD_MODEL || "gemini-3.6-flash",
    specialistModel: process.env.SPECIALIST_MODEL || "gemini-3.6-flash",
    now: () => new Date(),
  };
}

export const LENS_SPECIALIST: Record<LensId, string> = {
  transit: "transit-access",
  cost: "lifecycle-cost",
  commitments: "commitments",
  housing: "housing-pipeline",
};

const SPECIALIST_LENS: Record<string, LensId> = Object.fromEntries(
  Object.entries(LENS_SPECIALIST).map(([l, s]) => [s, l as LensId]),
);

/** Spec limits: each run stops at 40 model calls or US$0.50. */
export const RUN_MAX_CALLS = 40;
export const RUN_MAX_USD = 0.5;

function langName(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

function isEnglish(lang?: string): boolean {
  return !lang || /^en\b/i.test(lang);
}

function newRun(ctx: AgentContext, corpus: Corpus, emit: (e: AgentEvent) => void, deps: Deps, budget: Budget): Run {
  return { ctx, corpus, findings: newFindings(), budget, emit, callModel: deps.callModel, model: deps.specialistModel };
}

function publicStatement(s: RecordedStatement | Statement): Statement {
  const { id, text, kind, citations, verified, review } = s;
  return review ? { id, text, kind, citations, verified, review } : { id, text, kind, citations, verified };
}

// ---------------------------------------------------------------------------
// Greetings and "what can you do": answered at once, without a model.

const GREETING =
  /^\s*(hi|hello|hey|hiya|howdy|yo|bonjour|salut|allo|hola|ciao|hallo|ni ?hao|你好|good (morning|afternoon|evening|day)|thanks|thank you|thx|merci|gracias)\b[\s\p{P}]*((there|all|everyone|again|so much|a lot|claude|bot))?[\s\p{P}]*$/iu;
const CAPABILITIES =
  /^\s*(help|\?|what can (you|i) (do|ask)( here)?|what do you do|who are you|what are you|how does this work|how do i use this|what is this( site| page)?|que (peux|pouvez)-(tu|vous) faire)\s*\??\s*$/i;

export function isSmallTalk(q: string): "greeting" | "capabilities" | null {
  if (CAPABILITIES.test(q)) return "capabilities";
  if (GREETING.test(q)) return "greeting";
  return null;
}

function suggestions(d: Decision): string[] {
  const s = ["What is being proposed, in plain words?", "How could this affect renters?", "When can I have my say?"];
  if (d.lenses.includes("cost")) s.push("What will it cost over its whole life?");
  if (d.lenses.includes("transit")) s.push("Can people reach a grocery store by bus from here?");
  if (d.lenses.includes("commitments")) s.push("Which city commitments does this touch?");
  if (d.lenses.includes("housing")) s.push("How many approved homes are actually being built?");
  return s.slice(0, 4);
}

export function smallTalkAnswer(kind: "greeting" | "capabilities", d: Decision, lang?: string): string {
  const fr = /^fr\b/i.test(lang ?? "");
  const qs = suggestions(d);
  if (fr) {
    return (
      `Bonjour! Je peux expliquer « ${d.plainTitle} » : ce qui est proposé, comment cela pourrait vous toucher, et quand donner votre avis. ` +
      `Chaque réponse renvoie à la page du document d'où elle vient. Je ne dis jamais quoi penser ni comment voter. ` +
      `Essayez : ${qs.map((q) => `« ${q} »`).join(", ")}.`
    );
  }
  const intro = kind === "greeting" ? "Hi! " : "";
  return (
    `${intro}I can explain "${d.plainTitle}": what's proposed, how it may affect you, and when you can have a say. ` +
    `Every answer links to the page in the city's documents it came from, and I'll tell you when the documents don't say. ` +
    `I won't tell you what to think or how to vote. Try asking: ${qs.map((q) => `"${q}"`).join(", ")}.`
  );
}

// ---------------------------------------------------------------------------
// Keeping the written answer to what the statements support.

const ADVICE = [
  /\b(you|residents|people|everyone)\s+(should|must|ought to)\s+(vote|support|oppose|back|reject|approve)\b/i,
  /\b(i|we)\s+(recommend|suggest|urge|advise)\b/i,
  /\bvote\s+(for|against|yes|no)\b/i,
];

/**
 * Renumbers [n] markers in order of use, keeps only statements the text cites, and
 * drops any sentence that contains a figure without a marker unless the figure is in a
 * cited statement or the decision's hand-checked timeline. Sentences that give voting
 * advice are dropped too.
 */
export function groundAnswer(text: string, statements: Statement[], allowedText = ""): { text: string; statements: Statement[] } {
  const used: number[] = [];
  const known = (statements.map((s) => s.text).join(" ") + " " + allowedText).replace(/(\d),(?=\d{3})/g, "$1");
  const sentences = text
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？](?:\s*\[\d+(?:\s*,\s*\d+)*\])*)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (ADVICE.some((r) => r.test(sentence))) continue;
    const markers = [...sentence.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(",").map((n) => Number(n.trim())));
    const valid = markers.filter((n) => n >= 1 && n <= statements.length);
    const bare = sentence.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "");
    const nums = bare.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
    if (valid.length === 0 && nums.some((n) => !known.includes(n))) continue;
    for (const n of valid) if (!used.includes(n)) used.push(n);
    kept.push(
      sentence.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_m, list: string) => {
        const ns = list.split(",").map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= statements.length);
        return ns.length ? `[${ns.map((n) => used.indexOf(n) + 1).join(", ")}]` : "";
      }).replace(/\s+([.!?。！？])/g, "$1"),
    );
  }
  return { text: kept.join(" ").trim(), statements: used.map((n) => statements[n - 1]) };
}

// ---------------------------------------------------------------------------
// ask

interface PlanStep {
  specialist: string;
  question: string;
}

function availableSpecialists(d: Decision): string[] {
  return ["explainer", ...d.lenses.map((l) => LENS_SPECIALIST[l]).filter(Boolean)];
}

async function plan(run: Run, deps: Deps, question: string, audiences: AudienceId[] | undefined): Promise<PlanStep[]> {
  const names = availableSpecialists(run.corpus.decision);
  const skills = listSkills().filter((s) => names.includes(s.name));
  const system = [
    "You are the lead agent of Municipal Agents. A resident asked a question about one municipal decision.",
    "Split it into 1 to 4 steps, each a focused sub-question for one specialist who reads the city's documents.",
    "Use 1 step for a simple question; more only when the question has separate parts or needs a lens.",
    "Write each step's question in English (the documents are in English), whatever language the resident used.",
    "If the resident asks what to think or how to vote, plan steps that gather the trade-offs on both sides instead.",
    "",
    "Specialists:",
    ...skills.map((s) => `- ${s.name}: ${s.description}`),
    "",
    decisionBrief(run.corpus, { notes: false }),
  ].join("\n");
  const res = await budgetedCall(
    run,
    "agent:lead",
    {
      model: deps.leadModel,
      system,
      contents: [{ role: "user", parts: [{ text: `Question: ${question}${audiences?.length ? `\nThe resident says they are: ${audiences.join(", ")}` : ""}` }] }],
      thinking: "minimal",
      jsonSchema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              properties: { specialist: { type: "string", enum: names }, question: { type: "string" } },
              required: ["specialist", "question"],
            },
          },
        },
        required: ["steps"],
      },
    },
    true,
  );
  try {
    const parsed = JSON.parse(res?.text ?? "") as { steps?: PlanStep[] };
    const steps = (parsed.steps ?? []).filter((s) => names.includes(s.specialist) && s.question?.trim()).slice(0, 4);
    if (steps.length) return steps;
  } catch {
    // fall through to the simple plan
  }
  return [{ specialist: "explainer", question }];
}

function askTask(question: string, original: string, audiences?: AudienceId[]): string {
  return [
    `A resident asked: "${original}"`,
    question !== original ? `Your part of the answer: ${question}` : "",
    audiences?.length ? `They describe themselves as: ${audiences.join(", ")}.` : "",
    "",
    "Find what the documents say and record 1 to 4 statements with section \"answer\" (or \"impact\" with an audience, or record_tradeoff) that answer it, each with exact quotes.",
    "If the documents don't answer it, record_unknown saying what is missing and who could answer. Don't guess.",
    "Be quick: search, read the one or two pages you need, record, then reply with one short line.",
  ].filter(Boolean).join("\n");
}

async function writeAnswer(
  run: Run, deps: Deps, question: string, lang: string | undefined, audiences: AudienceId[] | undefined, statements: Statement[],
): Promise<string> {
  const d = run.corpus.decision;
  const unknowns = run.findings.unknowns;
  const system = [
    "You are the lead agent of Municipal Agents. Write the answer a resident reads, using ONLY the numbered statements and the listed unknowns below. They were checked against the city's documents.",
    "- 2 to 6 short sentences, everyday words, grade 8 or lower. No headings, no lists unless the resident asked for steps.",
    "- After each sentence that uses a statement, put its number in square brackets, e.g. [2] or [1, 3]. Never cite a number you weren't given.",
    "- Don't add facts, figures, dates or names that are not in the statements, the unknowns or the decision's timeline.",
    "- Impacts are uncertain: use \"may\", \"might\" or \"could\".",
    "- Never tell the resident what to think, support or oppose, or how to vote. If they ask, say you can't advise, and give the trade-offs on both sides from the statements.",
    "- If the statements don't answer the question, say plainly that the documents don't say, and who could answer (from the unknowns, or the body that decides).",
    `- Write in ${langName(lang ?? "en")}. Keep numbers, dates, names of bodies, emails and URLs as they are.`,
    "",
    decisionBrief(run.corpus, { notes: false }),
  ].join("\n");
  const body = [
    `Question: ${question}`,
    audiences?.length ? `The resident says they are: ${audiences.map((a) => AUDIENCE_LABELS[a] ?? a).join("; ")}` : "",
    "",
    "Statements:",
    ...(statements.length ? statements.map((s, i) => `[${i + 1}] ${s.text}`) : ["(none found)"]),
    "",
    "Unknowns (the documents don't say):",
    ...(unknowns.length ? unknowns.map((u) => `- ${u.question}. Why it matters: ${u.why}. Who can answer: ${u.whoCanAnswer}${u.contact ? ` (${u.contact})` : ""}`) : ["(none)"]),
    "",
    `Decided by: ${d.decidedBy}. Official notice: ${d.officialUrl}`,
  ].filter((l) => l !== undefined).join("\n");
  const res = await budgetedCall(
    run,
    "agent:lead",
    { model: deps.leadModel, system, contents: [{ role: "user", parts: [{ text: body }] }], thinking: "low" },
    true,
  );
  return res?.text.trim() ?? "";
}

function timelineText(d: Decision): string {
  return d.timeline.map((t) => `${t.date} ${t.end ?? ""} ${t.title} ${t.plain} ${(t.participation ?? []).map((p) => `${p.instructions} ${p.deadline ?? ""} ${p.contact ?? ""}`).join(" ")}`).join(" ");
}

function fallbackAnswer(run: Run): string {
  const d = run.corpus.decision;
  const u = run.findings.unknowns[0];
  return u
    ? `The city's documents for this decision don't say. ${u.whoCanAnswer} could answer${u.contact ? ` (${u.contact})` : ""}.`
    : `I couldn't find this in the city's documents for this decision. ${d.decidedBy} decides it; the official notice is at ${d.officialUrl}.`;
}

export async function askWith(
  ctx: AgentContext,
  req: { decisionId: string; question: string; audiences?: AudienceId[]; lang?: string },
  emit: (e: AgentEvent) => void,
  deps: Deps,
): Promise<void> {
  const question = String(req.question ?? "").trim().slice(0, 1000);
  // The question text only: no IP, no identity, nothing that ties it to a person.
  ctx.log({ actor: "visitor", kind: "question.asked", decisionId: req.decisionId, payload: { question, lang: req.lang, audiences: req.audiences } });
  try {
    const small = isSmallTalk(question);
    if (small || !question) {
      const d = readDecision(ctx.dataDir, req.decisionId);
      const text = smallTalkAnswer(small ?? "capabilities", d, req.lang);
      emit({ type: "answer", text, statements: [] });
      ctx.log({ actor: "agent:lead", kind: "answer.given", decisionId: req.decisionId, payload: { question, text, statements: [], model: null, costUsd: 0 } });
      emit({ type: "done" });
      return;
    }

    const corpus = loadCorpus(ctx.dataDir, req.decisionId);
    const budget = new Budget(RUN_MAX_CALLS, RUN_MAX_USD);
    budget.heldCalls = 1; // keep one call for writing the answer
    budget.heldUsd = 0.04;
    const run = newRun(ctx, corpus, emit, deps, budget);

    const planned = await plan(run, deps, question, req.audiences);
    const steps: StepSpec[] = planned.map((p, i) => ({
      id: `step-${i + 1}`,
      specialist: p.specialist,
      question: p.question,
      task: askTask(p.question, question, req.audiences),
      maxCalls: planned.length > 2 ? 5 : 6,
      lens: SPECIALIST_LENS[p.specialist],
    }));
    emit({ type: "plan", agent: "lead", steps: steps.map(({ id, specialist, question: q }) => ({ id, specialist, question: q })) });
    await Promise.all(steps.map((s) => runStep(run, s)));

    const verified = run.findings.statements.filter((s) => s.verified).map(publicStatement);
    for (const k of run.findings.commitments) verified.push(...k.progress.filter((s) => s.verified));
    let text = "";
    let used: Statement[] = [];
    if (verified.length || run.findings.unknowns.length) {
      const draft = await writeAnswer(run, deps, question, req.lang, req.audiences, verified);
      ({ text, statements: used } = groundAnswer(draft, verified, `${question} ${timelineText(corpus.decision)}`));
    }
    if (!text) text = fallbackAnswer(run);
    emit({ type: "answer", text, statements: used, figures: run.findings.figures.length ? run.findings.figures : undefined });
    ctx.log({
      actor: "agent:lead",
      kind: "answer.given",
      decisionId: req.decisionId,
      payload: {
        question, text, lang: req.lang,
        statements: used.map((s) => ({ id: s.id, text: s.text, citations: s.citations })),
        unknowns: run.findings.unknowns,
        calls: budget.calls, costUsd: budget.usd, models: [...budget.models],
      },
    });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  }
  emit({ type: "done" });
}

function readDecision(dataDir: string, id: string): Decision {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id)) throw new Error(`bad decision id "${id}"`);
  return JSON.parse(fs.readFileSync(path.join(dataDir, "decisions", `${id}.json`), "utf8")) as Decision;
}

// ---------------------------------------------------------------------------
// generateBrief

const OVERVIEW_TASK = `Write the overview of the brief. Record, with exact quotes:
- section "summary": 3 to 6 statements: what is proposed, where, the cost and who pays, what changes for people. Most important first.
- section "whyNow": 1 to 3 statements on why this is before council now.
- section "haveYourSay": 2 to 4 statements on how and when residents can take part (meeting, date, how to register or send comments, deadline). Cite the notice or agenda pages.
- record_figure: the 2 to 5 key numbers a resident would look for.
- record_term: 3 to 8 terms from the documents a resident may not know, in plain words.
Start from the research notes, verify on the pages, and record several items per turn.`;

const IMPACTS_TASK = `Write how the decision may affect people. Record, with exact quotes:
- section "impact" with an audience: for the 3 to 6 audiences the documents give most reason to think are affected, 1 to 3 statements each, always with "may", "might" or "could".
- record_tradeoff: 2 to 4 trade-offs, each one sentence with both sides.
- record_unknown: 2 to 5 questions residents would ask that the documents don't answer, with who can answer.
Start from the research notes, verify on the pages, and record several items per turn.`;

function lensTask(lens: LensId): string {
  const what: Record<LensId, string> = {
    transit: "how this decision touches people's ability to reach essential places by transit, walking and cycling",
    cost: "the lifecycle cost: upfront price vs yearly operating, maintenance and renewal costs, funding sources, and who pays",
    commitments: "the public commitments this decision touches, each with its target, latest cited progress, status and what is unclear",
    housing: "housing from approval to construction: units this decision proposes or enables, the city's target, and where progress is hard to track",
  };
  return `Write the ${lens} lens of the brief: ${what[lens]}. Follow your skill's steps: call your lens tool first, then the documents. Record cited statements (section "lens", or "impact" with an audience where the documents give reason), figures, trade-offs and unknowns. Record several items per turn.`;
}

const LENS_LABEL: Record<LensId, string> = {
  transit: "Transit access",
  cost: "Lifecycle cost",
  commitments: "Commitments",
  housing: "Housing pipeline",
};

/** Turns a run's findings into the Brief shape the service and display read. */
export function assembleBrief(corpus: Corpus, f: Findings, meta: { generatedAt: string; models: string[]; costUsd: number }): Brief {
  const ok = f.statements.filter((s) => s.verified);
  const by = (sec: RecordedStatement["section"]) => ok.filter((s) => s.section === sec).map(publicStatement);
  const impacts = AUDIENCES.map((a) => ({
    audience: a,
    label: AUDIENCE_LABELS[a],
    statements: ok.filter((s) => s.section === "impact" && s.audience === a).map(publicStatement),
  })).filter((g) => g.statements.length > 0);
  const summary = by("summary");
  const lensStatements = (lens: LensId) => ok.filter((s) => s.section === "lens" && s.lens === lens).map(publicStatement);

  // Lens results computed by the lens builder are the base; agent statements are added.
  const lenses: Brief["lenses"] = {};
  const data = corpus.lensData as Record<LensId, any>;
  for (const lens of corpus.decision.lenses) {
    const base = data[lens] ? structuredClone(data[lens]) : undefined;
    const extra = lensStatements(lens);
    if (lens === "commitments") {
      const drafted = f.commitments;
      if (base || drafted.length) {
        const merged: CommitmentsLens = { commitments: [...((base as CommitmentsLens | undefined)?.commitments ?? [])] };
        for (const k of drafted) if (!merged.commitments.some((c) => c.title.toLowerCase() === k.title.toLowerCase())) merged.commitments.push(k);
        // Statements are carried alongside so nothing verified is lost (additive field).
        lenses.commitments = extra.length ? ({ ...merged, statements: extra } as CommitmentsLens) : merged;
      }
    } else if (base) {
      lenses[lens] = { ...base, statements: [...(base.statements ?? []), ...extra] };
    } else if (extra.length) {
      // No computed lens yet: carry the cited statements so the tab has something true to show.
      lenses[lens] = { statements: extra, partial: true } as any;
    }
  }

  return {
    decisionId: corpus.decision.id,
    lang: "en",
    generatedAt: meta.generatedAt,
    models: meta.models,
    costUsd: Math.round(meta.costUsd * 1e6) / 1e6,
    readingGrade: readingGrade([...summary, ...impacts.flatMap((g) => g.statements)].map((s) => s.text)),
    summary,
    whyNow: by("whyNow"),
    impacts,
    haveYourSay: by("haveYourSay"),
    figures: f.figures,
    unknowns: f.unknowns,
    tradeoffs: by("tradeoff"),
    glossary: f.terms,
    lenses,
    review: { status: "draft" },
  };
}

export async function generateBriefWith(
  ctx: AgentContext, req: { decisionId: string }, emit: (e: AgentEvent) => void, deps: Deps,
): Promise<Brief> {
  try {
    const corpus = loadCorpus(ctx.dataDir, req.decisionId);
    if (corpus.pages.size === 0) throw new Error(`no source text found for ${req.decisionId}; run the sources script first`);
    const budget = new Budget(RUN_MAX_CALLS, RUN_MAX_USD);
    const run = newRun(ctx, corpus, emit, deps, budget);
    const lenses = corpus.decision.lenses.filter((l) => LENS_SPECIALIST[l]);
    // Explainer steps get the most room; lenses share what's left of the 40 calls.
    const explainerCalls = 11;
    const lensCalls = lenses.length ? Math.max(4, Math.min(8, Math.floor((RUN_MAX_CALLS - 2 * explainerCalls) / lenses.length))) : 0;
    const steps: StepSpec[] = [
      { id: "overview", specialist: "explainer", question: "What's proposed, why now, how to have a say", task: OVERVIEW_TASK, maxCalls: explainerCalls },
      { id: "impacts", specialist: "explainer", question: "How it may affect people, trade-offs, unknowns", task: IMPACTS_TASK, maxCalls: explainerCalls },
      ...lenses.map((l) => ({ id: l, specialist: LENS_SPECIALIST[l], question: LENS_LABEL[l], task: lensTask(l), maxCalls: lensCalls, lens: l })),
    ];
    for (const s of steps) loadSkill(s.specialist); // fail fast on a missing skill file
    ctx.log({ actor: "agent:lead", kind: "brief.started", decisionId: req.decisionId, payload: { steps: steps.map((s) => ({ id: s.id, specialist: s.specialist })) } });
    emit({ type: "plan", agent: "lead", steps: steps.map(({ id, specialist, question }) => ({ id, specialist, question })) });

    const results = await Promise.all(steps.map((s) => runStep(run, s)));
    if (ctx.signal?.aborted) throw new Error("cancelled");

    const brief = assembleBrief(corpus, run.findings, {
      generatedAt: deps.now().toISOString(),
      models: [...budget.models],
      costUsd: budget.usd,
    });
    ctx.log({
      actor: "agent:lead",
      kind: "brief.generated",
      decisionId: req.decisionId,
      payload: {
        statements: run.findings.statements.length,
        rejected: run.findings.rejected,
        figures: brief.figures.length,
        unknowns: brief.unknowns.length,
        readingGrade: brief.readingGrade,
        steps: results.map((r) => ({ id: r.id, status: r.status, calls: r.calls })),
        calls: budget.calls,
        costUsd: budget.usd,
        models: brief.models,
      },
    });
    emit({ type: "brief", brief });
    emit({ type: "done" });
    return brief;
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
    emit({ type: "done" });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// translateBrief

/** Every resident-facing text field in a brief, as getters and setters (quotes excluded). */
function textSlots(b: Brief): { get: () => string; set: (v: string) => void }[] {
  const slots: { get: () => string; set: (v: string) => void }[] = [];
  const field = (o: any, k: string) => {
    if (o && typeof o[k] === "string" && o[k].trim()) slots.push({ get: () => o[k], set: (v) => (o[k] = v) });
  };
  const statements = (list?: Statement[]) => list?.forEach((s) => field(s, "text"));
  statements(b.summary);
  statements(b.whyNow);
  statements(b.haveYourSay);
  statements(b.tradeoffs);
  for (const g of b.impacts) {
    field(g, "label");
    statements(g.statements);
  }
  for (const f of b.figures) {
    field(f, "label");
    field(f, "display");
  }
  for (const u of b.unknowns) for (const k of ["question", "why", "whoCanAnswer"]) field(u, k);
  for (const t of b.glossary) {
    field(t, "term");
    field(t, "plain");
  }
  const L = b.lenses as any;
  statements(L.cost?.statements);
  statements(L.housing?.statements);
  statements(L.transit?.statements);
  statements(L.commitments?.statements);
  for (const k of L.commitments?.commitments ?? []) {
    for (const f of ["title", "target", "relation"]) field(k, f);
    statements(k.progress);
    k.unclear?.forEach((_: string, i: number) => field(k.unclear, String(i)));
  }
  L.housing?.hardToTrack?.forEach((_: string, i: number) => field(L.housing.hardToTrack, String(i)));
  for (const s of L.housing?.stages ?? []) field(s, "label");
  for (const g of L.transit?.gaps ?? []) for (const f of ["title", "detail"]) field(g, f);
  for (const x of L.transit?.fixes ?? []) for (const f of ["title", "benefit", "tradeoff"]) field(x, f);
  for (const a of L.cost?.assumptions ?? []) for (const f of ["label", "why"]) field(a, f);
  for (const f of L.cost?.figures ?? []) for (const k of ["label", "display"]) field(f, k);
  return slots;
}

export async function translateBriefWith(ctx: AgentContext, brief: Brief, lang: string, deps: Deps): Promise<Brief> {
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(lang)) throw new Error(`bad language code "${lang}"`);
  const out = structuredClone(brief);
  out.lang = lang;
  if (isEnglish(lang) && isEnglish(brief.lang)) return out;
  const slots = textSlots(out);
  const unique = [...new Set(slots.map((s) => s.get()))];
  const skill = loadSkill("translator");
  const budget = new Budget(RUN_MAX_CALLS, RUN_MAX_USD);
  const translated = new Map<string, string>();
  const CHUNK = 60;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const translateChunk = async (chunk: string[]) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!budget.reserve(true)) return;
      let res = null;
      try {
        res = await deps.callModel({
          model: deps.leadModel,
          system: `${skill.body}\n\nTarget language: ${langName(lang)} (${lang}).`,
          contents: [{ role: "user", parts: [{ text: `Translate each string in this JSON array. Return a JSON array of the same length and order.\n${JSON.stringify(chunk)}` }] }],
          jsonSchema: { type: "array", items: { type: "string" } },
          thinking: "minimal",
          signal: ctx.signal,
        });
      } finally {
        budget.settle(res);
      }
      if (res) {
        ctx.log({
          actor: "agent:translator", kind: "usage", decisionId: brief.decisionId,
          payload: { model: res.model, promptTokens: res.usage.promptTokens, candidatesTokens: res.usage.candidatesTokens, thoughtsTokens: res.usage.thoughtsTokens, costUsd: res.costUsd },
        });
        try {
          const arr = JSON.parse(res.text);
          if (Array.isArray(arr) && arr.length === chunk.length && arr.every((x) => typeof x === "string")) {
            chunk.forEach((src, i) => translated.set(src, arr[i]));
            return;
          }
        } catch {
          // retry once; a chunk that still fails keeps its English text
        }
      }
    }
  };
  // A few chunks at a time keeps latency low without bursting the rate limit.
  for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map(translateChunk));

  for (const s of slots) {
    const t = translated.get(s.get());
    if (t) s.set(t);
  }
  out.costUsd = Math.round((brief.costUsd + budget.usd) * 1e6) / 1e6;
  out.models = [...new Set([...brief.models, ...budget.models])];
  ctx.log({
    actor: "agent:translator", kind: "translation.made", decisionId: brief.decisionId,
    payload: { lang, strings: unique.length, translated: translated.size, calls: budget.calls, costUsd: budget.usd },
  });
  return out;
}
