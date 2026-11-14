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
export function startRun(app: App, opts: { signal?: AbortSignal; serverKinds?: LogEntry["kind"][]; timeoutMs?: number; runId?: string } = {}): Run {
  const signals = [AbortSignal.timeout(opts.timeoutMs ?? app.cfg.runTimeoutMs)];
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
      // Tie the answer or brief in the record to the saved run file (runs/<runId>.jsonl).
      if (opts.runId && (e.kind === "answer.given" || e.kind === "brief.generated") && e.payload && typeof e.payload === "object")
        e = { ...e, payload: { ...(e.payload as Record<string, unknown>), runId: opts.runId } };
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

// Text that came from the model provider (error bodies, billing links, keys) must never
// reach a visitor. Anything matching is replaced; details stay in the server's console.
const PROVIDER = /ai\.studio|generativelanguage|googleapis|\{\s*"error"|"code"\s*:|prepayment|FAILED_PRECONDITION|RESOURCE_EXHAUSTED|UNAVAILABLE|x-goog-api-key|api_key|AIza[0-9A-Za-z_-]{10}|Gemini \d{3}/i;
const LEAKY = new RegExp(`${PROVIDER.source}|https?://|[{}]`, "i");

/**
 * Plain words for a provider HTTP status. Residents never learn why the model is
 * unreachable (credit, rate limit, outage): that stays in the server's console.
 */
export function providerMessage(status: number): string {
  if (status === 0 || status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) return "The AI model can't be reached right now.";
  return "The AI model returned an error. Please try again.";
}

/**
 * An event as it may be sent to a visitor: error messages, failed steps and tool lines
 * with provider text in them are replaced by plain words. Answers are left alone (they
 * may cite the official notice's URL).
 */
export function safeEvent<E extends AgentEvent>(e: E): E {
  if (e.type === "error" && LEAKY.test(e.message)) return { ...e, message: "The AI model returned an error. Please try again." };
  if (e.type === "step.end" && PROVIDER.test(e.summary)) return { ...e, summary: "Stopped: the AI model returned an error." };
  if (e.type === "tool" && PROVIDER.test(e.summary)) return { ...e, summary: `${e.tool} failed` };
  return e;
}

/** A message safe to show a visitor for a failed run. */
export function failureMessage(err: unknown, run: Run): string {
  if (run.signal.aborted) {
    const reason = run.signal.reason as Error | undefined;
    if (reason?.name === "TimeoutError") return "The agents took too long on this one. Please try a shorter or more specific question.";
    return "The run was stopped.";
  }
  const msg = (err as Error)?.message ?? String(err);
  const status = (err as { status?: unknown })?.status;
  // Server-side only: the message and any provider detail, never the key (bodies don't carry it).
  console.error("agent run failed:", msg, typeof status === "number" ? `(status ${status})` : "", String((err as { detail?: unknown })?.detail ?? "").slice(0, 300));
  if (typeof status === "number" && /gemini/i.test(msg)) return providerMessage(status);
  // Budget, limit and "model unreachable" errors from the agents are already plain;
  // anything else (and anything that looks like provider text) is hidden.
  if (/limit|budget|cap|can't be reached|couldn't write this brief/i.test(msg) && msg.length < 300 && !LEAKY.test(msg)) return msg;
  return "Something went wrong while the agents were working. Please try again.";
}
