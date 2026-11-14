// Helpers for tests: a fake model with the same shape as callGemini, so the loop, the
// lead and the tools are tested without the network or a key.

import path from "node:path";
import type { AgentEvent, LogEntry } from "../shared/types.ts";
import type { AgentContext } from "./index.ts";
import { costOf, type CallModel, type FunctionCall, type GeminiRequest, type GeminiResult, type Part } from "./gemini.ts";
import type { Deps } from "./lead.ts";

export const FIXTURES = path.join(import.meta.dirname, "fixtures");
export const DEMO = "demo-king-bike-lanes";

export function reply(parts: Part[], model = "fake-model"): GeminiResult {
  const usage = { promptTokens: 1000, candidatesTokens: 100, thoughtsTokens: 50 };
  return {
    model,
    content: { role: "model", parts },
    text: parts.filter((p) => p.text).map((p) => p.text).join(""),
    calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall!),
    finishReason: "STOP",
    usage,
    costUsd: costOf("gemini-3.6-flash", usage),
  };
}

export const text = (t: string) => reply([{ text: t }]);
export const calls = (...cs: FunctionCall[]) => reply(cs.map((c, i) => ({ functionCall: { id: `c${i}`, ...c } })));

/** A fake model that answers each request with `script(req)` and records every request. */
export function fakeModel(script: (req: GeminiRequest) => GeminiResult): CallModel & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  const fn = (async (req: GeminiRequest) => {
    requests.push(structuredClone({ ...req, signal: undefined }));
    return script(req);
  }) as CallModel & { requests: GeminiRequest[] };
  fn.requests = requests;
  return fn;
}

export function fakeDeps(callModel: CallModel): Deps {
  return { callModel, leadModel: "gemini-3.6-flash", specialistModel: "gemini-3.6-flash", now: () => new Date("2026-11-14T08:00:00Z") };
}

export interface Recorder {
  ctx: AgentContext;
  logs: { actor: string; kind: LogEntry["kind"]; decisionId?: string; payload: unknown }[];
  events: AgentEvent[];
  emit: (e: AgentEvent) => void;
}

export function recorder(dataDir = FIXTURES): Recorder {
  const logs: Recorder["logs"] = [];
  const events: AgentEvent[] = [];
  return { ctx: { dataDir, log: (e) => logs.push(e) }, logs, events, emit: (e) => events.push(e) };
}

/** How many model turns a specialist has had so far in this conversation. */
export function modelTurns(req: GeminiRequest): number {
  return req.contents.filter((c) => c.role === "model").length;
}
