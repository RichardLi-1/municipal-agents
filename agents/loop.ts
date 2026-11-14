// One specialist at work: a plain loop. Send the instructions and task to the model,
// run any tools it asks for, send the results back, repeat until it stops asking or
// the budget runs out. Every model call is counted and logged with its cost.

import type { AgentEvent, LogEntry } from "../shared/types.ts";
import type { AgentContext } from "./index.ts";
import type { CallModel, Content, GeminiResult, Part } from "./gemini.ts";
import type { Corpus } from "./corpus.ts";
import { loadRules, loadSkill, type Skill } from "./skills.ts";
import { AUDIENCES, toolsFor, type Findings, type ToolEnv } from "./tools.ts";
import type { Decision, LensId } from "../shared/types.ts";

/** Spend limits for one run (a brief or an answer), shared by the lead and every specialist. */
export class Budget {
  maxCalls: number;
  maxUsd: number;
  calls = 0;
  usd = 0;
  inputTokens = 0;
  outputTokens = 0;
  models = new Set<string>();
  /** Calls and dollars held back for the lead's final answer. */
  heldCalls = 0;
  heldUsd = 0;
  /** Optional caps on groups of steps, e.g. calls kept for the explainer so lenses can't use them up. */
  pools: Record<string, { max: number; used: number }> = {};
  private inFlight = 0;
  // Specialists run in parallel, so a call's cost isn't known until it returns. Assume
  // each in-flight call may cost this much, so parallel calls can't overshoot together.
  static readonly EST_CALL_USD = 0.015;

  constructor(maxCalls = 40, maxUsd = 0.5) {
    this.maxCalls = maxCalls;
    this.maxUsd = maxUsd;
  }

  canCall(forLead = false, pool?: string): boolean {
    const calls = forLead ? this.maxCalls : this.maxCalls - this.heldCalls;
    const usd = forLead ? this.maxUsd : this.maxUsd - this.heldUsd;
    const p = pool ? this.pools[pool] : undefined;
    if (p && p.used >= p.max) return false;
    return this.calls < calls && this.usd + this.inFlight * Budget.EST_CALL_USD < usd;
  }

  /** Take a call slot before calling; returns false if none is left. */
  reserve(forLead = false, pool?: string): boolean {
    if (!this.canCall(forLead, pool)) return false;
    this.calls++;
    this.inFlight++;
    if (pool && this.pools[pool]) this.pools[pool].used++;
    return true;
  }

  settle(r: GeminiResult | null): void {
    this.inFlight--;
    if (!r) return;
    this.usd += r.costUsd;
    this.inputTokens += r.usage.promptTokens;
    this.outputTokens += r.usage.candidatesTokens + r.usage.thoughtsTokens;
    this.models.add(r.model);
  }

  usageEvent(): AgentEvent {
    return {
      type: "usage",
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: Math.round(this.usd * 1e6) / 1e6,
    };
  }
}

/** State shared by every step of one run. */
export interface Run {
  ctx: AgentContext;
  corpus: Corpus;
  findings: Findings;
  budget: Budget;
  emit: (e: AgentEvent) => void;
  callModel: CallModel;
  model: string;
  /** Set when the model can't be reached (no credit, rate limit, outage, no key). */
  unreachable?: Error;
}

/** True for errors that mean the model can't be reached at all, as opposed to a bad request. */
export function isUnreachable(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown } | undefined;
  if (!e || typeof e.status !== "number" || typeof e.message !== "string" || !/^Gemini|GEMINI_API_KEY/.test(e.message)) return false;
  return e.status === 0 || [401, 402, 403, 429].includes(e.status) || e.status >= 500;
}

/**
 * What a resident may be told about any failure: plain words, never the provider's
 * response, a URL or a stack. The details go to the server's console only.
 */
export function publicError(err: unknown): string {
  if (isUnreachable(err)) return `The AI model can't be reached right now: ${unreachableReason(err)}.`;
  const e = err as { name?: string; message?: string; status?: number; detail?: string } | undefined;
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /aborted|cancelled|timed? ?out/i.test(e?.message ?? "")) return "The run was stopped before it finished.";
  if (typeof e?.status === "number") return "The AI model returned an error. Please try again.";
  return "Something went wrong while the agents were working.";
}

/** Server-side log of a failure, without secrets (provider bodies never contain the key). */
export function logFailure(where: string, err: unknown): void {
  const e = err as { message?: string; status?: number; detail?: string };
  console.error(`${where}: ${e?.message ?? String(err)}${e?.status !== undefined ? ` (status ${e.status})` : ""}${e?.detail ? ` ${e.detail.slice(0, 300)}` : ""}`);
}

/** Why the model is unreachable, in plain words. */
export function unreachableReason(err: unknown): string {
  const status = (err as { status?: number })?.status ?? 0;
  const msg = String((err as Error)?.message ?? "");
  if (status === 402) return "the model service's prepaid credit is used up";
  if (status === 429) return "the model service is rate-limiting requests";
  if (status === 401 || status === 403) return "the model service refused the API key";
  if (status >= 500) return "the model service is having an outage";
  if (/GEMINI_API_KEY/.test(msg)) return "no API key is set";
  return "there is no connection to the model service";
}

export interface StepSpec {
  id: string;
  specialist: string;
  /** What the lead asks for, in plain words (shown in the steps panel). */
  question: string;
  /** The full task message sent to the specialist. */
  task: string;
  maxCalls: number;
  lens?: LensId;
  /** Budget pool this step draws from (see Budget.pools). */
  pool?: string;
}

export interface StepResult {
  id: string;
  status: "done" | "failed";
  summary: string;
  calls: number;
}

/** A model call through the shared budget, logged and reported as usage. */
export async function budgetedCall(
  run: Run,
  actor: string,
  req: Parameters<CallModel>[0],
  forLead = false,
  pool?: string,
): Promise<GeminiResult | null> {
  if (!run.budget.reserve(forLead, pool)) return null;
  let res: GeminiResult | null = null;
  try {
    res = await run.callModel({ ...req, signal: run.ctx.signal });
    return res;
  } catch (err) {
    if (isUnreachable(err)) run.unreachable ??= err as Error;
    throw err;
  } finally {
    run.budget.settle(res);
    if (res) {
      run.ctx.log({
        actor,
        kind: "usage",
        decisionId: run.corpus.decision.id,
        payload: {
          model: res.model,
          promptTokens: res.usage.promptTokens,
          candidatesTokens: res.usage.candidatesTokens,
          thoughtsTokens: res.usage.thoughtsTokens,
          costUsd: res.costUsd,
        },
      });
      run.emit(run.budget.usageEvent());
    }
  }
}

/** The decision's metadata as the specialists see it. */
export function decisionBrief(c: Corpus, opts: { notes?: boolean } = {}): string {
  const d = c.decision;
  // The same participation instructions repeat on every meeting; list each once and
  // refer to it by letter, which keeps every model call smaller.
  const ways: string[] = [];
  const wayRef = (p: NonNullable<Decision["timeline"][number]["participation"]>[number]) => {
    const text = `${p.method}: ${p.instructions}${p.contact ? ` Contact: ${p.contact}.` : ""}${p.url ? ` ${p.url}` : ""}`;
    if (!ways.includes(text)) ways.push(text);
    return `(${String.fromCharCode(97 + ways.indexOf(text))}${p.deadline ? `, by ${p.deadline}` : ""})`;
  };
  const timeline = d.timeline.map((t) => {
    const how = (t.participation ?? []).map(wayRef);
    return `- ${t.date}${t.end ? ` to ${t.end}` : ""} | ${t.kind} | ${t.title}: ${t.plain}${t.location ? ` At ${t.location}.` : ""}${how.length ? ` Take part: ${how.join(" ")}` : ""}`;
  });
  const lines = [
    "## This decision",
    `- Id: ${d.id}`,
    `- Official title: ${d.title}`,
    `- In plain words: ${d.plainTitle}`,
    `- Decided by: ${d.decidedBy}`,
    `- Status: ${d.status}`,
    `- Official notice: ${d.officialUrl}`,
    `- Lenses: ${d.lenses.join(", ") || "none"}`,
    "",
    "### Timeline (hand-checked by the team; cite the documents, not this list)",
    ...timeline,
    ...(ways.length ? ["", "Ways to take part:", ...ways.map((w, i) => `(${String.fromCharCode(97 + i)}) ${w}`)] : []),
    "",
    "### Sources (cite these ids and their page numbers)",
    ...c.sources.map((s) => `- ${s.id}: "${s.title}", ${s.publisher || "publisher unknown"}, ${s.published || "undated"}, ${c.pages.get(s.id)?.length ?? s.pages} pages`),
    "",
    `### Audiences you may write impacts for\n${AUDIENCES.join(", ")}`,
  ];
  if (opts.notes !== false && c.notes) {
    const notes = c.notes.length > 9000 ? `${c.notes.slice(0, 9000)}\n[notes cut for length]` : c.notes;
    lines.push("", "## Research notes (where the key facts are; verify each on its page before citing)", notes);
  }
  return lines.join("\n");
}

export function systemPrompt(skill: Skill, corpus: Corpus): string {
  return [loadRules(), `# Your skill: ${skill.name}\n\n${skill.body}`, decisionBrief(corpus)].join("\n\n---\n\n");
}

// Old page texts and search results are the bulk of the history. Once the model has
// moved on (two turns later) we replace them with a stub to keep each call cheap; it
// can read the page again if it needs to.
const BULKY = new Set(["read_page", "search_pages"]);
function trimHistory(contents: Content[], keepLastUserTurns = 2): void {
  const userTurns = contents.map((c, i) => (c.role === "user" ? i : -1)).filter((i) => i >= 0);
  const cutoff = userTurns[userTurns.length - keepLastUserTurns] ?? 0;
  for (let i = 1; i < cutoff; i++) {
    const c = contents[i];
    if (c.role !== "user") continue;
    for (const p of c.parts) {
      if (p.functionResponse && BULKY.has(p.functionResponse.name) && !p.functionResponse.response.trimmed) {
        p.functionResponse.response = { trimmed: true, note: "Shown earlier; call the tool again if you need it." };
      }
    }
  }
}

/** Run one specialist on one task until it is done or out of budget. */
export async function runStep(run: Run, step: StepSpec): Promise<StepResult> {
  const actor = `agent:${step.specialist}`;
  const skill = loadSkill(step.specialist);
  const tools = toolsFor(skill.tools);
  const env: ToolEnv = {
    corpus: run.corpus,
    findings: run.findings,
    specialist: step.specialist,
    stepId: step.id,
    lens: step.lens,
    emit: run.emit,
    log: (kind: LogEntry["kind"], payload: unknown) => run.ctx.log({ actor, kind, decisionId: run.corpus.decision.id, payload }),
  };
  const system = systemPrompt(skill, run.corpus);
  const contents: Content[] = [{ role: "user", parts: [{ text: step.task }] }];
  // Counted per step: steps run in parallel over shared findings.
  let recorded = 0;
  let calls = 0;
  let finalText = "";
  let stopped = "";

  run.emit({ type: "step.start", id: step.id, specialist: step.specialist, question: step.question });
  try {
    while (true) {
      if (run.ctx.signal?.aborted) {
        stopped = "cancelled";
        break;
      }
      if (calls >= step.maxCalls) {
        stopped = "reached its call limit";
        break;
      }
      trimHistory(contents);
      const res = await budgetedCall(run, actor, {
        model: run.model,
        system,
        contents,
        tools: tools.map((t) => t.decl),
        thinking: "low",
      }, false, step.pool);
      if (!res) {
        stopped = "the run's budget was used up";
        break;
      }
      calls++;
      if (res.content.parts.length) contents.push(res.content);
      if (res.calls.length === 0) {
        if (res.text.trim() || res.finishReason === "STOP") {
          finalText = res.text.trim();
          break;
        }
        // Empty or malformed reply: nudge once more within the limits.
        contents.push({ role: "user", parts: [{ text: "Your last reply was empty or malformed. Call a tool, or reply with one short line if you are done." }] });
        continue;
      }
      const left = step.maxCalls - calls;
      const parts: Part[] = [];
      for (const call of res.calls) {
        const tool = tools.find((t) => t.decl.name === call.name);
        let response: Record<string, unknown>;
        let summary: string;
        if (!tool) {
          response = { error: `No tool named ${call.name}. Your tools: ${tools.map((t) => t.decl.name).join(", ")}` };
          summary = `Asked for a tool it doesn't have (${call.name})`;
        } else {
          try {
            ({ response, summary } = await tool.run(call.args ?? {}, env));
          } catch (err) {
            response = { error: (err as Error).message };
            summary = `${call.name} failed`;
          }
        }
        if (call.name.startsWith("record_") && response.accepted === true && !response.note) recorded++;
        if (left <= 2) response = { ...response, budget: `${left} model call(s) left: record what you have now.` };
        run.emit({ type: "tool", id: step.id, specialist: step.specialist, tool: call.name, summary });
        parts.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } });
      }
      contents.push({ role: "user", parts });
    }
  } catch (err) {
    logFailure(`${step.specialist} step ${step.id}`, err);
    const message = publicError(err);
    run.emit({ type: "step.end", id: step.id, specialist: step.specialist, status: "failed", summary: `Stopped: ${message}` });
    return { id: step.id, status: "failed", summary: message, calls };
  }

  const summary =
    (finalText ? finalText.split("\n")[0].slice(0, 240) : `Recorded ${recorded} item${recorded === 1 ? "" : "s"}.`) +
    (stopped ? ` (Stopped: ${stopped}.)` : "");
  const status = stopped === "cancelled" || (recorded === 0 && stopped) ? "failed" : "done";
  run.emit({ type: "step.end", id: step.id, specialist: step.specialist, status, summary });
  return { id: step.id, status, summary, calls };
}
