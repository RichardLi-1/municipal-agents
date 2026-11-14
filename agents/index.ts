// The agents' public interface, used by the service (server/) and the CLI.
// Everything else in agents/ is an implementation detail.

import type { AgentEvent, AudienceId, Brief, LogEntry } from "../shared/types.ts";
import { askWith, defaultDeps, generateBriefWith, translateBriefWith } from "./lead.ts";

export interface AgentContext {
  dataDir: string;
  log(e: { actor: string; kind: LogEntry["kind"]; decisionId?: string; payload: unknown }): void;
  signal?: AbortSignal;
}

/**
 * Answer a resident's question. Emits plan, step.start, tool, statement, step.end and
 * usage events while working, then answer and done (or error and done). Never throws.
 * The answer's text carries [n] markers: n is the 1-based index into answer.statements.
 */
export async function ask(
  ctx: AgentContext,
  req: { decisionId: string; question: string; audiences?: AudienceId[]; lang?: string },
  emit: (e: AgentEvent) => void,
): Promise<void> {
  return askWith(ctx, req, emit, defaultDeps());
}

/** Draft a full brief (status "draft") for staff to review. Emits progress, then brief and done. */
export async function generateBrief(ctx: AgentContext, req: { decisionId: string }, emit: (e: AgentEvent) => void): Promise<Brief> {
  return generateBriefWith(ctx, req, emit, defaultDeps());
}

/** The brief with its resident-facing text in `lang`; citations keep their original quotes. */
export async function translateBrief(ctx: AgentContext, brief: Brief, lang: string): Promise<Brief> {
  return translateBriefWith(ctx, brief, lang, defaultDeps());
}
