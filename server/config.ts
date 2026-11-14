// Settings from the environment, read once at start. Everything has a default so
// `npm run dev` works with no setup; production sets these in fly.toml and secrets.
import path from "node:path";

export interface Config {
  /** Repo root (locally) or /app (in the image): code, cities/, committed data/. */
  appRoot: string;
  /** Committed data shipped with the code. */
  appData: string;
  /** Where the log, generated briefs and uploads are written. On Fly, the /data volume. */
  dataDir: string;
  /** Built web app (Vite output). */
  webDist: string;
  port: number;
  host: string;
  staffToken: string | undefined;
  dailyLimitUsd: number;
  /** Per-IP limit for /ask and /translate: this many runs per window. */
  askPerWindow: number;
  askWindowMs: number;
  /** Runs (ask, brief, translate) allowed at once across all visitors. */
  maxConcurrentRuns: number;
  /** A single run is aborted after this long. */
  runTimeoutMs: number;
}

const here = import.meta.dirname;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appRoot = path.resolve(env.APP_ROOT ?? path.join(here, ".."));
  const appData = path.join(appRoot, "data");
  return {
    appRoot,
    appData,
    dataDir: path.resolve(env.DATA_DIR ?? appData),
    webDist: path.resolve(env.WEB_DIST ?? path.join(appRoot, "web", "dist")),
    // 4100 matches the Vite dev proxy in web/vite.config.ts.
    port: Number(env.PORT ?? 4100),
    host: env.HOST ?? "0.0.0.0",
    staffToken: env.STAFF_TOKEN || undefined,
    dailyLimitUsd: Number(env.DAILY_LIMIT_USD ?? 5),
    askPerWindow: Number(env.ASK_PER_WINDOW ?? 10),
    askWindowMs: Number(env.ASK_WINDOW_MIN ?? 10) * 60_000,
    maxConcurrentRuns: Number(env.MAX_CONCURRENT_RUNS ?? 4),
    runTimeoutMs: Number(env.RUN_TIMEOUT_SEC ?? 240) * 1000,
  };
}
