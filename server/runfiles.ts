// Every agent run's events, saved: $DATA_DIR/runs/<runId>.jsonl. The first line is a
// header (what was asked, of which decision, when, with which model); each later line
// is one event with its time in ms since the start. The files are the record of what
// the agents actually said, and they double as an answer cache: when someone asks a
// question a real run already answered, that run is replayed (labelled with when it was
// answered) instead of paying for a new one.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, IsoDate } from "../shared/types.ts";

export interface RunHeader {
  type: "run";
  runId: string;
  kind: "ask" | "brief";
  decisionId: string;
  question?: string;
  lang?: string;
  audiences?: AudienceId[];
  startedAt: IsoDate;
  model: string;
  /** "live" for runs the server recorded; otherwise where a seeded run came from. */
  source: string;
  note?: string;
  /** Model calls and spend of the original run, when known. */
  calls?: number;
  costUsd?: number;
}

export interface RunLine {
  t: number;
  event: AgentEvent;
}

export interface SavedRun {
  file: string;
  header: RunHeader;
  lines: RunLine[];
}

type Answer = Extract<AgentEvent, { type: "answer" }>;

export function runsDir(dataDir: string): string {
  return path.join(dataDir, "runs");
}

/** Sortable and unique: 20261114T065501Z-ask-3fa9c1. */
export function newRunId(kind: RunHeader["kind"], at = new Date()): string {
  return `${at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${kind}-${randomBytes(3).toString("hex")}`;
}

/** Appends a run's events as they happen. A failed write never breaks the run. */
export class RunWriter {
  readonly runId: string;
  readonly file: string;
  private t0 = Date.now();
  private ok = true;

  constructor(dataDir: string, header: Omit<RunHeader, "type" | "runId" | "startedAt" | "source"> & { source?: string }) {
    const at = new Date();
    this.runId = newRunId(header.kind, at);
    this.file = path.join(runsDir(dataDir), `${this.runId}.jsonl`);
    const full: RunHeader = { type: "run", runId: this.runId, startedAt: at.toISOString(), source: "live", ...header };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(full) + "\n");
    } catch (err) {
      this.ok = false;
      console.error("run file not written:", (err as Error).message);
    }
  }

  write(event: AgentEvent): void {
    if (!this.ok) return;
    try {
      fs.appendFileSync(this.file, JSON.stringify({ t: Date.now() - this.t0, event } satisfies RunLine) + "\n");
    } catch (err) {
      this.ok = false;
      console.error("run file append failed:", (err as Error).message);
    }
  }
}

export function readRun(file: string): SavedRun | undefined {
  try {
    const [first, ...rest] = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
    const header = JSON.parse(first) as RunHeader;
    if (header?.type !== "run") return undefined;
    return { file, header, lines: rest.map((l) => JSON.parse(l) as RunLine) };
  } catch {
    return undefined; // half-written or damaged: not served
  }
}

// ---------------------------------------------------------------------------
// Matching a question to one already answered.

const STOP = new Set("the a an and or of to in on for is are was be by with what how does do can will would could my our your i we it its this that there their about from at as much many".split(" "));

/** Lower case, straight quotes, no punctuation, single spaces. */
export function questionKey(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The same question, or very close: nearly all the same words and exactly the same numbers. */
export function sameQuestion(a: string, b: string): boolean {
  const ka = questionKey(a);
  const kb = questionKey(b);
  if (ka === kb) return true;
  const words = (k: string) => new Set(k.split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !/\d/.test(w)));
  const nums = (k: string) => (k.match(/\d+/g) ?? []).sort().join(" ");
  if (nums(ka) !== nums(kb)) return false;
  const A = words(ka);
  const B = words(kb);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared) >= 0.85;
}

const sameSet = (a?: string[], b?: string[]) => [...(a ?? [])].sort().join(",") === [...(b ?? [])].sort().join(",");
const langOf = (l?: string) => (!l || /^en\b/i.test(l) ? "en" : l.toLowerCase());

function answerOf(run: SavedRun): Answer | undefined {
  if (run.lines.some((l) => l.event.type === "error")) return undefined;
  const a = run.lines.map((l) => l.event).find((e): e is Answer => e.type === "answer");
  // Only real, substantive answers: not offline fallbacks, not replays, not "couldn't find".
  if (!a || a.offline || a.replay) return undefined;
  if (!a.statements?.length && !a.figures?.length) return undefined;
  return a;
}

const headerCache = new Map<string, { mtimeMs: number; run?: SavedRun }>();

function savedRuns(dataDir: string): SavedRun[] {
  const dir = runsDir(dataDir);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const out: SavedRun[] = [];
  for (const n of names) {
    const file = path.join(dir, n);
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      continue;
    }
    let hit = headerCache.get(file);
    if (!hit || hit.mtimeMs !== mtimeMs) {
      hit = { mtimeMs, run: readRun(file) };
      headerCache.set(file, hit);
    }
    if (hit.run) out.push(hit.run);
  }
  return out;
}

const hasSteps = (r: SavedRun) => r.lines.some((l) => ["plan", "step.start", "tool", "statement"].includes(l.event.type));

/**
 * The real run that answered this question about this decision, if any: one with
 * recorded steps first (so a replay shows the agents working), then the most recent.
 */
export function findCachedAnswer(
  dataDir: string,
  q: { decisionId: string; question: string; lang?: string; audiences?: AudienceId[] },
): SavedRun | undefined {
  return savedRuns(dataDir)
    .filter((r) => r.header.kind === "ask" && r.header.decisionId === q.decisionId)
    .filter((r) => langOf(r.header.lang) === langOf(q.lang) && sameSet(r.header.audiences, q.audiences))
    .filter((r) => r.header.question && sameQuestion(r.header.question, q.question))
    .filter((r) => answerOf(r))
    .sort((a, b) => Number(hasSteps(b)) - Number(hasSteps(a)) || b.header.startedAt.localeCompare(a.header.startedAt))[0];
}

// ---------------------------------------------------------------------------
// Replaying a saved run.

/**
 * The brief run to replay for staff: the saved run that produced the current brief (its
 * brief event has the same generatedAt), else the most recent brief run.
 */
export function findBriefRun(dataDir: string, decisionId: string, currentGeneratedAt?: string): SavedRun | undefined {
  const runs = savedRuns(dataDir)
    .filter((r) => r.header.kind === "brief" && r.header.decisionId === decisionId && hasSteps(r))
    .filter((r) => !r.lines.some((l) => l.event.type === "error"))
    .sort((a, b) => b.header.startedAt.localeCompare(a.header.startedAt));
  const produced = runs.find((r) => r.lines.some((l) => l.event.type === "brief" && (l.event as Extract<AgentEvent, { type: "brief" }>).brief.generatedAt === currentGeneratedAt));
  return produced ?? runs[0];
}

export function briefReplayLabel(at: IsoDate): string {
  return replayLabel(at).replace(/^Answered by the agents on (.*) ET · replayed from the record$/, "Replay of the agents' real run on $1 ET");
}

/**
 * Sends a saved brief run's steps at about 4× (3 to 25 s in all), each labelled as a
 * replay, then `brief` (the current one, as the caller passes it), also labelled.
 * Recorded spend is left out: a replay costs nothing.
 */
export async function replayBriefRun(
  run: SavedRun,
  brief: unknown,
  send: (e: AgentEvent & { replay: { runId: string; at: IsoDate; label: string; costUsd?: number } }) => void,
  opts: { speed?: number; minMs?: number; maxMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const replay = { runId: run.header.runId, at: run.header.startedAt, label: briefReplayLabel(run.header.startedAt), ...(run.header.costUsd !== undefined ? { costUsd: run.header.costUsd } : {}) };
  const steps = run.lines.filter((l) => !["usage", "brief", "done", "error"].includes(l.event.type));
  const span = Math.max(0, ...run.lines.map((l) => l.t));
  const duration = Math.min(opts.maxMs ?? 25_000, Math.max(opts.minMs ?? 3000, span / (opts.speed ?? 4)));
  const start = Date.now();
  for (const l of steps) {
    if (opts.signal?.aborted) return;
    await wait((span > 0 ? (l.t / span) * duration : 0) - (Date.now() - start), opts.signal);
    send({ ...l.event, replay });
  }
  await wait(duration - (Date.now() - start), opts.signal);
  if (!opts.signal?.aborted) send({ type: "brief", brief: brief as Extract<AgentEvent, { type: "brief" }>["brief"], replay });
}

export function replayLabel(at: IsoDate): string {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
  return `Answered by the agents on ${when} ET · replayed from the record`;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/**
 * Sends a saved run's steps at about 4× their real pace (at least `minMs` in all, so a
 * viewer can follow; at most `maxMs`), then its answer, labelled with when it was
 * answered. Recorded spend is left out: a replay costs nothing.
 */
export async function replayRun(
  run: SavedRun,
  send: (e: AgentEvent) => void,
  opts: { speed?: number; minMs?: number; maxMs?: number; signal?: AbortSignal } = {},
): Promise<Answer> {
  const answer = answerOf(run);
  if (!answer) throw new Error(`run ${run.header.runId} has no answer to replay`);
  const steps = run.lines.filter((l) => !["usage", "answer", "done", "error"].includes(l.event.type));
  const answerAt = run.lines.find((l) => l.event === answer)?.t ?? 0;
  const span = Math.max(answerAt, ...steps.map((l) => l.t), 0);
  // Nothing to show before the answer (a run that saved only its answer): just the minimum.
  const duration = steps.length ? Math.min(opts.maxMs ?? 12_000, Math.max(opts.minMs ?? 3000, span / (opts.speed ?? 4))) : (opts.minMs ?? 3000);
  const at = (t: number, i: number) => (span > 0 ? (t / span) * duration : ((i + 1) / (steps.length + 1)) * duration);
  const start = Date.now();
  for (let i = 0; i < steps.length; i++) {
    if (opts.signal?.aborted) break;
    await wait(at(steps[i].t, i) - (Date.now() - start), opts.signal);
    send(steps[i].event);
  }
  await wait(duration - (Date.now() - start), opts.signal);
  const label = replayLabel(run.header.startedAt);
  const cost = run.lines.filter((l) => l.event.type === "usage").map((l) => (l.event as Extract<AgentEvent, { type: "usage" }>).costUsd).pop() ?? run.header.costUsd;
  const out: Answer = {
    ...answer,
    text: `${answer.text}\n\n${label}`,
    replay: { runId: run.header.runId, at: run.header.startedAt, label, ...(cost !== undefined ? { costUsd: cost } : {}) },
  };
  send(out);
  return out;
}
