// The service's shared state, created once at start and handed to every route.
import { createHash } from "node:crypto";
import path from "node:path";
import type { Brief } from "../shared/types.ts";
import { AgentsLoader } from "./agents-loader.ts";
import { canonicalJson } from "./canonical.ts";
import type { Config } from "./config.ts";
import { Store } from "./data.ts";
import { RateLimiter, RunSlots } from "./limits.ts";
import { Log } from "./log.ts";

export interface App {
  cfg: Config;
  store: Store;
  log: Log;
  agents: AgentsLoader;
  /** Per-IP limit shared by /ask and /translate. */
  visitorLimiter: RateLimiter;
  slots: RunSlots;
  /** Translations being made right now, so two visitors asking for French share one run. */
  translating: Map<string, Promise<Brief>>;
  startedAt: Date;
}

export function createApp(cfg: Config, overrides: Partial<App> = {}): App {
  return {
    cfg,
    store: new Store({ appRoot: cfg.appRoot, dataDir: cfg.dataDir }),
    log: new Log(path.join(cfg.dataDir, "log.db")),
    agents: new AgentsLoader(cfg.appRoot),
    visitorLimiter: new RateLimiter(cfg.askPerWindow, cfg.askWindowMs),
    slots: new RunSlots(cfg.maxConcurrentRuns),
    translating: new Map(),
    startedAt: new Date(),
    ...overrides,
  };
}

/** sha256 of a brief's canonical JSON: ties log entries to the exact text reviewed. */
export function briefHash(brief: Brief): string {
  return createHash("sha256").update(canonicalJson(brief)).digest("hex");
}
