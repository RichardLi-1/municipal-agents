// The lead agent: plans which specialists to ask, runs them (in parallel, since their
// tasks are independent), and merges their verified statements into an answer or a
// brief. The answer is written by a model but kept honest by code: it may only use
// numbered verified statements, and sentences with figures that no statement backs
// are dropped before anyone sees them.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, Brief, Decision, Figure, LensId, Statement, CommitmentsLens } from "../shared/types.ts";
import { readingGrade } from "../shared/readability.ts";
import type { AgentContext } from "./index.ts";
import { callGemini, type CallModel } from "./gemini.ts";
import { loadCorpus, type Corpus } from "./corpus.ts";
import { Budget, budgetedCall, decisionBrief, runStep, type Run, type StepSpec } from "./loop.ts";
import { isUnreachable, logFailure, publicError, UNREACHABLE } from "./errors.ts";
import { offlineAnswer } from "./offline.ts";
import { tidyBrief } from "./tidy.ts";
import { listSkills, loadSkill } from "./skills.ts";
import { AUDIENCES, AUDIENCE_LABELS, newFindings, type Findings, type RecordedStatement } from "./tools.ts";
import { glossaryPass, plainAnswer, plainPass, TARGET_GRADE, type LeadCall, type PlainItem } from "./plain.ts";

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
  construction: "construction-scout",
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
 * Renumbers markers in order of use: [n] for verified statements, [Cn] for computed
 * figures. Keeps only what the text cites, and drops any sentence that states a figure
 * without a marker unless the figure is in a cited statement or the decision's
 * hand-checked timeline. Sentences that give voting advice are dropped too.
 */
const MARK = /\[(C?\d+(?:\s*,\s*C?\d+)*)\]/g;
export function groundAnswer(
  text: string, statements: Statement[], allowedText = "", computed: Figure[] = [],
): { text: string; statements: Statement[]; figures: Figure[] } {
  const usedS: number[] = [];
  const usedC: number[] = [];
  const known = (statements.map((s) => s.text).join(" ") + " " + allowedText).replace(/(\d),(?=\d{3})/g, "$1");
  const parse = (list: string) =>
    list.split(",").map((x) => x.trim()).map((x) => (x.startsWith("C") ? { c: true, n: Number(x.slice(1)) } : { c: false, n: Number(x) }))
      .filter((m) => m.n >= 1 && m.n <= (m.c ? computed.length : statements.length));
  const sentences = text
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？](?:\s*\[C?\d+(?:\s*,\s*C?\d+)*\])*)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (ADVICE.some((r) => r.test(sentence))) continue;
    const valid = [...sentence.matchAll(MARK)].flatMap((m) => parse(m[1]));
    const bare = sentence.replace(MARK, "");
    const nums = bare.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
    if (valid.length === 0 && nums.some((n) => !known.includes(n))) continue;
    for (const m of valid) {
      const used = m.c ? usedC : usedS;
      if (!used.includes(m.n)) used.push(m.n);
    }
    kept.push(
      sentence.replace(MARK, (_m, list: string) => {
        const ms = parse(list);
        return ms.length ? `[${ms.map((m) => (m.c ? `C${usedC.indexOf(m.n) + 1}` : String(usedS.indexOf(m.n) + 1))).join(", ")}]` : "";
      }).replace(/\s+([.!?。！？])/g, "$1"),
    );
  }
  return { text: kept.join(" ").trim(), statements: usedS.map((n) => statements[n - 1]), figures: usedC.map((n) => computed[n - 1]) };
}

// ---------------------------------------------------------------------------
// ask

interface PlanStep {
  specialist: string;
  question: string;
}

function skillExists(name: string): boolean {
  try {
    loadSkill(name);
    return true;
  } catch {
    return false;
  }
}

// A lens is only offered once its skill file exists (lenses land at different times).
function availableSpecialists(d: Decision): string[] {
  return ["explainer", ...d.lenses.map((l) => LENS_SPECIALIST[l]).filter((s) => s && skillExists(s))];
}

/** Topic hints so the planner routes questions to the right specialist. */
const ROUTING: Record<string, string> = {
  "transit-access": "bus and ION service, reaching places by transit, walking, cycling",
  "lifecycle-cost": "what things cost over their life, upkeep, renewal, funding gaps, per-household cost",
  commitments: "targets and pledges (climate, housing, transit plans) and whether they are on track",
  "housing-pipeline": "homes approved, permits, construction starts and completions, housing targets",
  "construction-scout": "construction, tunnels, excavation, launch shafts or portals, boreholes, truck routes, construction noise and closures",
};

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
    ...skills.map((s) => `- ${s.name}: ${s.description}${ROUTING[s.name] ? ` Ask it about: ${ROUTING[s.name]}.` : ""}`),
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
    "The documents are in English: search with English words, whatever language the resident used.",
    "Find what the documents say and record 1 to 4 statements with section \"answer\" (or \"impact\" with an audience, or record_tradeoff) that answer it, each with exact quotes.",
    "If the documents don't answer it, record_unknown saying what is missing and who could answer. Don't guess.",
    "Be quick: search, read the one or two pages you need, record, then reply with one short line.",
  ].filter(Boolean).join("\n");
}

async function writeAnswer(
  run: Run, deps: Deps, question: string, lang: string | undefined, audiences: AudienceId[] | undefined, statements: Statement[], computed: Figure[],
): Promise<string> {
  const d = run.corpus.decision;
  const unknowns = run.findings.unknowns;
  const system = [
    "You are the lead agent of Municipal Agents. Write the answer a resident reads, using ONLY the numbered statements and the listed unknowns below. They were checked against the city's documents.",
    "- 2 to 6 short sentences, everyday words, grade 8 or lower. No headings, no lists unless the resident asked for steps.",
    "- After each sentence that uses a statement, put its number in square brackets, e.g. [2] or [1, 3]. For a computed figure use [C1]. Never cite a marker you weren't given.",
    "- Computed figures come from code over open data, not from the city's documents: say so in words (\"by our count from GRT's timetable\").",
    "- Short sentences: 8 to 14 words. If a term must stay (\"infrastructure funding gap\"), explain it in a few plain words in round brackets.",
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
    ...(computed.length ? ["", "Computed figures (from code over open data):", ...computed.map((f, i) => `[C${i + 1}] ${f.label}: ${f.display}. Method: ${f.formula ?? ""}`)] : []),
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

/** Budgeted calls for the lead's own work (planning, writing, plain-language pass). */
function leadCaller(run: Run, deps: Deps): LeadCall {
  return (req) => budgetedCall(run, "agent:lead", { ...req, model: deps.leadModel }, true);
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
  // Model unreachable: answer from the brief's checked statements instead (no model).
  const answerOffline = (err: unknown) => {
    // Why the model is unreachable goes to the console only; residents and the public
    // record just learn that it is.
    logFailure("ask (answered offline)", err);
    const a = offlineAnswer(ctx.dataDir, req.decisionId, question, { lang: req.lang });
    emit(a);
    ctx.log({
      actor: "agent:lead", kind: "answer.given", decisionId: req.decisionId,
      payload: { question, text: a.text, offline: true, statements: a.statements.map((s) => ({ id: s.id, text: s.text, citations: s.citations })), costUsd: 0 },
    });
  };

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
    budget.heldCalls = 2; // keep calls for writing the answer and making it plain
    budget.heldUsd = 0.05;
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
    const computed = run.findings.figures.filter((f) => f.kind === "computed");
    if (run.unreachable && !verified.length && !computed.length) {
      answerOffline(run.unreachable);
      emit({ type: "done" });
      return;
    }
    let text = "";
    let used: Statement[] = [];
    let figures: Figure[] = [];
    // With nothing found, a non-English answer still needs the model to say so in that language.
    if (verified.length || computed.length || run.findings.unknowns.length || !isEnglish(req.lang)) {
      const draft = await writeAnswer(run, deps, question, req.lang, req.audiences, verified, computed);
      ({ text, statements: used, figures } = groundAnswer(draft, verified, `${question} ${timelineText(corpus.decision)}`, computed));
      // The plain-language pass is a nicety: if the model drops out here, keep the answer.
      if (text) text = await plainAnswer(leadCaller(run, deps), text, req.lang).then((p) => p.text, () => text);
    }
    if (!text) text = fallbackAnswer(run);
    emit({ type: "answer", text, statements: used, figures: figures.length ? figures : undefined });
    ctx.log({
      actor: "agent:lead",
      kind: "answer.given",
      decisionId: req.decisionId,
      payload: {
        question, text, lang: req.lang,
        statements: used.map((s) => ({ id: s.id, text: s.text, citations: s.citations })),
        computedFigures: figures,
        unknowns: run.findings.unknowns,
        calls: budget.calls, costUsd: budget.usd, models: [...budget.models],
      },
    });
  } catch (err) {
    logFailure("ask", err);
    if (isUnreachable(err)) answerOffline(err);
    else emit({ type: "error", message: publicError(err) });
  }
  emit({ type: "done" });
}

function readDecision(dataDir: string, id: string): Decision {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id)) throw new Error(`bad decision id "${id}"`);
  return JSON.parse(fs.readFileSync(path.join(dataDir, "decisions", `${id}.json`), "utf8")) as Decision;
}

// ---------------------------------------------------------------------------
// generateBrief

const OVERVIEW_TASK = `Write the overview of the brief. Record, with exact quotes, in this order:
- section "summary": 3 to 6 statements: what is being decided and by whom, where it stands now (say plainly if the proposal itself is not published yet), the cost and who pays, what changes for people. Most important first.
- section "haveYourSay": 3 to 5 statements covering every way to take part the documents list (survey, speaking, writing in, watching), with dates and deadlines.
- section "whyNow": 1 to 3 statements on why this is before council now.
- record_figure: the 3 to 5 key numbers a resident would look for, each labelled with its year.
- record_term: 4 to 8 terms from the documents a resident may not know, in plain words.
Start from the research notes, verify on the pages, and record several items per turn (summary and have-your-say together in your first recording turn). Have your say needs real dates: the next meeting where people can speak and the deadline to register, how to write in, and any survey with its closing date. Dates in the timeline above may be stated as dates (the team checked them); cite the rule or schedule they come from. Every other number must be in your quotes. Keep each sentence to 8 to 15 short words.`;

const IMPACTS_TASK = `Write how the decision may affect people. Record, with exact quotes:
- section "impact" with an audience: for the 4 to 6 audiences the documents give most reason to think are affected, 1 to 3 statements each, always with "may", "might" or "could", and the year of any figure.
- record_tradeoff: 2 to 4 trade-offs, each one sentence with both sides, quoting the passage that shows each side.
- record_unknown: 2 to 5 questions residents would ask that the documents don't answer, with who can answer.
Start from the research notes, verify on the pages, and record several items per turn. Keep each sentence to 8 to 15 short words.`;

function lensTask(lens: LensId): string {
  const what: Record<LensId, string> = {
    transit: "how this decision touches people's ability to reach essential places by transit, walking and cycling",
    cost: "the lifecycle cost: upfront price vs yearly operating, maintenance and renewal costs, funding sources, and who pays",
    commitments: "the public commitments this decision touches, each with its target, latest cited progress, status and what is unclear",
    housing: "housing from approval to construction: units this decision proposes or enables, the city's target, and where progress is hard to track",
    construction: "how the work may be built and what nearby residents may notice (sites, excavation, tunnelling, trucks, closures), always as an illustrative scenario for engineers and staff to evaluate, never as the Region's plan",
  };
  return `Write the ${lens} lens of the brief: ${what[lens]}. Follow your skill's steps. You have only a few model calls: in your first turn call your lens tool and search_pages together; from your second turn on, record several items per turn (computed figures, cited statements with section "lens" or "impact" with an audience, trade-offs, unknowns).`;
}

const LENS_LABEL: Record<LensId, string> = {
  transit: "Transit access",
  cost: "Lifecycle cost",
  commitments: "Commitments",
  housing: "Housing pipeline",
  construction: "Construction scout",
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

  // A brief stores only what the agents added to each lens (statements, drafted
  // commitments, a cost lens they built). The server lays these over the computed lens
  // files, so the brief stays small and the computed results (with their map layers)
  // live in one place.
  const lenses: Brief["lenses"] = {};
  const computed = corpus.lensData as Partial<Record<LensId, unknown>>;
  for (const lens of corpus.decision.lenses) {
    const extra = lensStatements(lens);
    const has = !!computed[lens];
    if (lens === "commitments") {
      if (f.commitments.length || extra.length)
        lenses.commitments = {
          commitments: f.commitments,
          ...(extra.length ? { statements: extra } : {}),
          ...(!has && !f.commitments.length ? { partial: true } : {}),
        };
    } else if (lens === "cost" && !has && f.costLens) {
      lenses.cost = { ...f.costLens, statements: [...(f.costLens.statements ?? []), ...extra] };
    } else if (extra.length) {
      // Without a computed lens the statements are all the tab has: marked partial.
      (lenses as Record<string, unknown>)[lens] = { statements: extra, ...(has ? {} : { partial: true }) };
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

const GRADED: RecordedStatement["section"][] = ["summary", "impact"];

/**
 * After the specialists: rewrite anything above grade 8 (code keeps a rewrite only if
 * it is easier and every number survives), then explain jargon the brief uses.
 */
async function plainLanguageStep(run: Run, deps: Deps): Promise<{ gradeBefore: number; gradeAfter: number; rewritten: number; termsAdded: number }> {
  const f = run.findings;
  const graded = () => readingGrade(f.statements.filter((s) => s.verified && GRADED.includes(s.section)).map((s) => s.text));
  const gradeBefore = graded();
  run.emit({ type: "step.start", id: "plain", specialist: "lead", question: `Make every sentence grade ${TARGET_GRADE} or lower, and explain the jargon` });

  const progress = f.commitments.flatMap((k) => k.progress);
  const items: PlainItem[] = [
    ...f.statements.filter((s) => s.verified).map((s) => ({ id: s.id, text: s.text, section: s.section, kind: s.kind, quotes: s.citations.map((c) => c.quote) })),
    ...progress.filter((s) => s.verified).map((s) => ({ id: s.id, text: s.text, section: "lens" as const, kind: s.kind, quotes: s.citations.map((c) => c.quote) })),
  ];
  const call = leadCaller(run, deps);
  const rewrites = await plainPass(call, items);
  for (const r of rewrites) {
    const target = f.statements.find((s) => s.id === r.id) ?? progress.find((s) => s.id === r.id);
    if (!target) continue;
    target.text = r.to;
    run.ctx.log({ actor: "agent:lead", kind: "statement.recorded", decisionId: run.corpus.decision.id, payload: { rewrite: r } });
  }

  const texts = [...f.statements.map((s) => s.text), ...progress.map((s) => s.text), ...f.unknowns.map((u) => u.question)];
  const terms = await glossaryPass(call, texts, f.terms, `${run.corpus.decision.plainTitle} (${run.corpus.decision.decidedBy})`);
  f.terms.push(...terms);
  if (terms.length) run.ctx.log({ actor: "agent:lead", kind: "statement.recorded", decisionId: run.corpus.decision.id, payload: { glossary: terms } });

  const gradeAfter = graded();
  const summary = `Rewrote ${rewrites.length} of ${items.length} sentences in plainer words; reading grade ${gradeBefore} → ${gradeAfter}. Explained ${terms.length} more term${terms.length === 1 ? "" : "s"}.`;
  run.emit({ type: "tool", id: "plain", specialist: "lead", tool: "plain_language", summary });
  run.emit({ type: "step.end", id: "plain", specialist: "lead", status: "done", summary });
  return { gradeBefore, gradeAfter, rewritten: rewrites.length, termsAdded: terms.length };
}

export async function generateBriefWith(
  ctx: AgentContext, req: { decisionId: string }, emit: (e: AgentEvent) => void, deps: Deps,
): Promise<Brief> {
  try {
    const corpus = loadCorpus(ctx.dataDir, req.decisionId);
    if (corpus.pages.size === 0) throw new Error(`no source text found for ${req.decisionId}; run the sources script first`);
    const budget = new Budget(RUN_MAX_CALLS, RUN_MAX_USD);
    budget.heldCalls = 3; // kept for the plain-language and glossary passes
    budget.heldUsd = 0.04;
    const run = newRun(ctx, corpus, emit, deps, budget);
    const lenses = corpus.decision.lenses.filter((l) => LENS_SPECIALIST[l] && skillExists(LENS_SPECIALIST[l]));
    // The explainer (challenge 1: summary, have your say, impacts) gets a pool of calls
    // the lenses can't touch; the lenses share what is left. Steps run side by side, so
    // without pools many lenses would use up the run before the summary is written.
    const EXPLAINER_POOL = 19;
    const lensPool = RUN_MAX_CALLS - budget.heldCalls - EXPLAINER_POOL;
    budget.pools = { explainer: { max: EXPLAINER_POOL, used: 0 }, lens: { max: lensPool, used: 0 } };
    const lensCalls = lenses.length ? Math.max(3, Math.min(7, Math.ceil(lensPool / lenses.length) + 1)) : 0;
    const steps: StepSpec[] = [
      { id: "overview", specialist: "explainer", question: "What's proposed, how to have a say, why now", task: OVERVIEW_TASK, maxCalls: 11, pool: "explainer" },
      { id: "impacts", specialist: "explainer", question: "How it may affect people, trade-offs, unknowns", task: IMPACTS_TASK, maxCalls: 9, pool: "explainer" },
      ...lenses.map((l) => ({ id: l, specialist: LENS_SPECIALIST[l], question: LENS_LABEL[l], task: lensTask(l), maxCalls: lensCalls, lens: l, pool: "lens" })),
    ];
    for (const s of steps) loadSkill(s.specialist); // fail fast on a missing skill file
    ctx.log({ actor: "agent:lead", kind: "brief.started", decisionId: req.decisionId, payload: { steps: steps.map((s) => ({ id: s.id, specialist: s.specialist })) } });
    emit({ type: "plan", agent: "lead", steps: steps.map(({ id, specialist, question }) => ({ id, specialist, question })) });

    const results = await Promise.all(steps.map((s) => runStep(run, s)));
    if (ctx.signal?.aborted) throw new Error("cancelled");
    // Never hand back an empty brief that could replace a good one (e.g. the API is down
    // or out of credit): if every specialist failed, the run fails.
    if (results.every((r) => r.status === "failed")) {
      if (run.unreachable)
        throw new Error(`${UNREACHABLE} No new brief was made; the current brief is unchanged.`);
      throw new Error(`The agents couldn't write this brief (${results[0]?.summary ?? "every step failed"}). The current brief is unchanged.`);
    }

    const plain = await plainLanguageStep(run, deps);

    const assembled = assembleBrief(corpus, run.findings, {
      generatedAt: deps.now().toISOString(),
      models: [...budget.models],
      costUsd: budget.usd,
    });
    // Code's last pass: near-duplicates out, hedged facts become estimates, glitches fixed.
    const { brief, report: tidy } = tidyBrief(assembled, [corpus.decision.title, corpus.decision.plainTitle]);
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
        readingGradeBefore: plain.gradeBefore,
        tidied: { dropped: tidy.dropped.length, repaired: tidy.repaired.length, estimates: tidy.estimates.length, weak: tidy.weak.length },
        rewritten: plain.rewritten,
        glossaryAdded: plain.termsAdded,
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
    logFailure("generateBrief", err);
    // Our own messages are already plain; anything else (a provider error) is mapped.
    const message = /^The (AI model|agents) /.test((err as Error)?.message ?? "") ? (err as Error).message : publicError(err);
    emit({ type: "error", message });
    emit({ type: "done" });
    throw new Error(message);
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
  statements(L.construction?.statements);
  if (L.construction?.scenario) for (const k of ["title", "label", "basis"]) field(L.construction.scenario, k);
  for (const st of L.construction?.steps ?? []) for (const k of ["title", "plain", "duration", "whatResidentsNotice"]) field(st, k);
  for (const site of L.construction?.sites ?? []) {
    site.reasons?.forEach((_: string, i: number) => field(site.reasons, String(i)));
    site.concerns?.forEach((_: string, i: number) => field(site.concerns, String(i)));
  }
  L.construction?.limits?.forEach((_: string, i: number) => field(L.construction.limits, String(i)));
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
