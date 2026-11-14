import type { AgentEvent, Brief, Figure, Statement } from "../../../shared/types.ts";

export interface StepState {
  id: string;
  specialist: string;
  question: string;
  status: "pending" | "running" | "done" | "failed";
  tools: { tool: string; summary: string }[];
  statements: Statement[];
  summary?: string;
}

export interface RunState {
  planner?: string;
  steps: StepState[];
  answer?: { text: string; statements: Statement[]; figures?: Figure[]; replay?: Replay; offline?: boolean };
  /** Set when the events are a replay of a run saved in the record. */
  replay?: Replay;
  brief?: Brief;
  usage?: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  error?: string;
  done: boolean;
  startedAt: number;
}

export interface Replay {
  runId: string;
  at: string;
  label?: string;
  costUsd?: number;
}

export const emptyRun = (): RunState => ({ steps: [], done: false, startedAt: Date.now() });

export function reduceRun(prev: RunState, e: AgentEvent): RunState {
  const rp = (e as { replay?: Replay }).replay;
  const s = rp && !prev.replay ? { ...prev, replay: rp } : prev;
  const upd = (id: string, f: (x: StepState) => StepState, seed?: Partial<StepState>) => {
    const has = s.steps.some((x) => x.id === id);
    const steps = has
      ? s.steps.map((x) => (x.id === id ? f(x) : x))
      : [...s.steps, f({ id, specialist: seed?.specialist ?? "agent", question: seed?.question ?? "", status: "running", tools: [], statements: [] })];
    return { ...s, steps };
  };
  switch (e.type) {
    case "plan":
      return {
        ...s,
        planner: e.agent,
        steps: e.steps.map((p) => s.steps.find((x) => x.id === p.id) ?? { ...p, status: "pending", tools: [], statements: [] }),
      };
    case "step.start":
      return upd(e.id, (x) => ({ ...x, specialist: e.specialist, question: e.question || x.question, status: "running" }), e);
    case "tool":
      return upd(e.id, (x) => ({ ...x, tools: [...x.tools, { tool: e.tool, summary: e.summary }] }), e);
    case "statement":
      return upd(e.id, (x) => ({ ...x, statements: [...x.statements, e.statement] }));
    case "step.end":
      return upd(e.id, (x) => ({ ...x, status: e.status, summary: e.summary }), e);
    case "answer":
      return { ...s, answer: { text: e.text, statements: e.statements ?? [], figures: e.figures, replay: rp ?? s.replay, offline: (e as { offline?: boolean }).offline } };
    case "brief":
      return { ...s, brief: e.brief };
    case "usage":
      return { ...s, usage: e };
    case "error":
      return { ...s, error: e.message };
    case "done":
      return {
        ...s,
        done: true,
        steps: s.steps.map((x) => (x.status === "running" || x.status === "pending" ? { ...x, status: s.error ? "failed" : "done" } : x)),
      };
  }
  return s;
}
