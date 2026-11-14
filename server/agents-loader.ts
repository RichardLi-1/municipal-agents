// The agents live in agents/ and are written in parallel with the server, so they're
// imported lazily: the server starts (and serves briefs) even if agents/index.ts is
// missing or broken, and /ask answers 503 until it loads.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentEvent, AudienceId, Brief, LogEntry } from "../shared/types.ts";
import { HttpError } from "./http.ts";

/** What the server hands every agent run. */
export interface AgentContext {
  dataDir: string;
  log(e: { actor: string; kind: LogEntry["kind"]; decisionId?: string; payload: unknown }): void;
  signal?: AbortSignal;
}

export type Emit = (e: AgentEvent) => void;

export interface AgentsModule {
  ask(ctx: AgentContext, req: { decisionId: string; question: string; audiences?: AudienceId[]; lang?: string }, emit: Emit): Promise<void>;
  generateBrief(ctx: AgentContext, req: { decisionId: string }, emit: Emit): Promise<Brief>;
  translateBrief(ctx: AgentContext, brief: Brief, lang: string): Promise<Brief>;
}

const RETRY_MS = 15_000;

export class AgentsLoader {
  private file: string;
  private mod?: AgentsModule;
  private error?: string;
  private lastTry = 0;
  private attempts = 0;

  constructor(appRoot: string) {
    this.file = path.join(appRoot, "agents", "index.ts");
  }

  /** Try to load the module; a failure is remembered and retried after a pause. */
  async load(): Promise<AgentsModule | undefined> {
    if (this.mod) return this.mod;
    if (this.lastTry && Date.now() - this.lastTry < RETRY_MS) return undefined;
    this.lastTry = Date.now();
    if (!fs.existsSync(this.file)) {
      this.error = "agents/index.ts not found";
      return undefined;
    }
    try {
      // A fresh URL on retries, because Node caches a module that failed to evaluate.
      const url = pathToFileURL(this.file).href + (this.attempts++ ? `?retry=${this.attempts}` : "");
      const m = (await import(url)) as Partial<AgentsModule>;
      if (typeof m.ask !== "function" || typeof m.generateBrief !== "function" || typeof m.translateBrief !== "function") {
        this.error = "agents/index.ts does not export ask, generateBrief and translateBrief";
        return undefined;
      }
      this.mod = m as AgentsModule;
      this.error = undefined;
      return this.mod;
    } catch (err) {
      this.error = `agents failed to load: ${(err as Error).message}`;
      console.error(this.error);
      return undefined;
    }
  }

  async require(): Promise<AgentsModule> {
    const m = await this.load();
    if (!m) throw new HttpError(503, "The AI agents aren't available right now. The briefs can still be read.");
    return m;
  }

  status(): { available: boolean; error?: string } {
    return this.mod ? { available: true } : { available: false, error: this.error ?? "not loaded yet" };
  }

  /** For tests: use this module instead of importing agents/index.ts. */
  set(m: AgentsModule): void {
    this.mod = m;
  }
}
