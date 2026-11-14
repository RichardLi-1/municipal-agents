// What every agent run shares: a context whose log() writes to the public record, an
// abort signal (client gone or run too long), and a tally of what the agents logged so
// the server can fill in anything they didn't (an answer, the spend) without
// duplicating what they did.
import type { AgentEvent, LogEntry } from "../shared/types.ts";
import type { AgentContext } from "./agents-loader.ts";
import type { App } from "./app.ts";

export interface Run {
  ctx: AgentContext;
  signal: AbortSignal;
  /** Log kinds the agents recorded themselves during this run. */
  loggedKinds: Set<LogEntry["kind"]>;
  /** The last `usage` event the agents emitted (cumulative for the run). */
  lastUsage?: Extract<AgentEvent, { type: "usage" }>;
}

/**
 * @param serverKinds kinds the server has already logged for this run; if an agent
 *   logs one again it's dropped, so the record has each fact once.
 */
export function startRun(app: App, opts: { signal?: AbortSignal; serverKinds?: LogEntry["kind"][] } = {}): Run {
  const signals = [AbortSignal.timeout(app.cfg.runTimeoutMs)];
  if (opts.signal) signals.push(opts.signal);
  const skip = new Set(opts.serverKinds ?? []);
  const run: Run = {
    signal: AbortSignal.any(signals),
    loggedKinds: new Set(),
    ctx: undefined as unknown as AgentContext,
  };
  run.ctx = {
    dataDir: app.cfg.dataDir,
    signal: run.signal,
    log(e) {
      if (skip.has(e.kind)) return;
      try {
        app.log.append(e);
        run.loggedKinds.add(e.kind);
      } catch (err) {
        // The record matters, but a failed write shouldn't kill a visitor's answer.
        console.error(`log append failed (${e.kind}):`, (err as Error).message);
      }
    },
  };
  return run;
}

/** If the agents reported usage only as an event, log it so the cap and /spend see it. */
export function logUsageFallback(app: App, run: Run, decisionId: string | undefined, actor: string): void {
  if (run.loggedKinds.has("usage") || !run.lastUsage) return;
  const { calls, inputTokens, outputTokens, costUsd } = run.lastUsage;
  app.log.append({
    actor,
    kind: "usage",
    decisionId,
    payload: { model: process.env.LEAD_MODEL ?? "unknown", calls, inputTokens, outputTokens, costUsd, source: "server" },
  });
}

/** A message safe to show a visitor for a failed run. */
export function failureMessage(err: unknown, run: Run): string {
  if (run.signal.aborted) {
    const reason = run.signal.reason as Error | undefined;
    if (reason?.name === "TimeoutError") return "The agents took too long on this one. Please try a shorter or more specific question.";
    return "The run was stopped.";
  }
  const msg = (err as Error)?.message ?? String(err);
  console.error("agent run failed:", msg);
  // Budget and limit errors from the agents are already plain; anything else is hidden.
  if (/limit|budget|cap/i.test(msg) && msg.length < 200) return msg;
  return "Something went wrong while the agents were working. Please try again.";
}
