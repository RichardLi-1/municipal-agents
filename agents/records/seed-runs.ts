// Turns the saved output of tonight's real agent runs into run files (data/runs/*.jsonl)
// that the server can show and replay. Nothing is generated here: every answer, step and
// statement comes from agents/records/sources/, which holds what the runs saved:
//   eval-*.md                 the eval runner's reports (final answers only)
//   cli-log-excerpt.jsonl     the CLI's log entries (timestamps, usage, checked statements)
//   brief-*.txt               the CLI's printed event stream for four brief runs
// What a source didn't save is left out, and each header's `note` says what that is.
//   node agents/records/seed-runs.ts
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, Brief, Citation, Statement } from "../../shared/types.ts";
import { verifyCitation } from "../../shared/verify.ts";

const ROOT = path.join(import.meta.dirname, "..", "..");
const SRC = path.join(import.meta.dirname, "sources");
const OUT = path.join(ROOT, "data", "runs");
const MODEL = "gemini-3.6-flash";

interface Header {
  type: "run";
  runId: string;
  kind: "ask" | "brief";
  decisionId: string;
  question?: string;
  lang?: string;
  startedAt: string;
  model: string;
  source: string;
  calls?: number;
  costUsd?: number;
  note: string;
}
type Line = { t: number; event: AgentEvent };

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);

function write(header: Omit<Header, "type" | "runId">, lines: Line[], key: string): string {
  const runId = `${compact(header.startedAt)}-${header.kind}-${shortHash(key)}`;
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${runId}.jsonl`);
  fs.writeFileSync(file, [{ type: "run", runId, ...header }, ...lines].map((x) => JSON.stringify(x)).join("\n") + "\n");
  return runId;
}

const pagesCache = new Map<string, string[]>();
function verified(citations: Citation[]): boolean {
  return citations.length > 0 && citations.every((c) => {
    if (!pagesCache.has(c.sourceId)) pagesCache.set(c.sourceId, JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sources", `${c.sourceId}.pages.json`), "utf8")));
    return verifyCitation(pagesCache.get(c.sourceId)!, c);
  });
}

// ---------------------------------------------------------------------------
// Eval reports: one answer per case.

interface EvalCase { id: string; calls: number; cost: number; seconds: number; question: string; lang?: string; text: string; statements: { text: string; citations: Citation[] }[] }

function parseCitations(s: string): Citation[] {
  return [...s.matchAll(/([a-z0-9-]+) p\.(\d+): "(.*?)"(?=; [a-z0-9-]+ p\.\d+: "|$)/g)].map((m) => ({ sourceId: m[1], page: Number(m[2]), quote: m[3] }));
}

function parseEval(md: string): { end: string; model: string; cases: EvalCase[] } {
  const head = md.match(/^Run (\S+) with `([^`]+)`/m);
  if (!head) throw new Error("not an eval report");
  const rows = new Map<string, { calls: number; cost: number; seconds: number }>();
  for (const m of md.matchAll(/^\| ([a-z0-9-]+) \| (?:pass|\*\*fail\*\*) \| [^|]+ \| (\d+) \| ([\d.]+) \| ([\d.]+) \|/gm))
    rows.set(m[1], { calls: Number(m[2]), cost: Number(m[3]), seconds: Number(m[4]) });
  const answers = md.slice(md.indexOf("## Answers")).split(/^### /m).slice(1);
  const cases: EvalCase[] = [];
  for (const block of answers) {
    const id = block.split(/[\s(]/)[0];
    const row = rows.get(id);
    const q = block.match(/^\*\*Q:\*\* (.*?)(?: \(lang (\w+)\))?$/m);
    const a = block.match(/^\*\*A:\*\* ([\s\S]*?)(?=\n\d+\. |\n## |\n### |$)/m);
    if (!row || !q || !a) continue;
    const statements = [...block.matchAll(/^\d+\. (.*?) \(((?:[a-z0-9-]+ p\.\d+: ".*?"(?:; )?)+)\)$/gm)].map((m) => ({ text: m[1], citations: parseCitations(m[2]) }));
    cases.push({ id, ...row, question: q[1], lang: q[2], text: a[1].trim(), statements });
  }
  return { end: head[1], model: head[2], cases };
}

function seedEval(file: string): string[] {
  const { end, model, cases } = parseEval(fs.readFileSync(path.join(SRC, file), "utf8"));
  const decisions = new Map((JSON.parse(fs.readFileSync(path.join(ROOT, "agents", "evals", "cases.json"), "utf8")) as { id: string; decisionId: string }[]).map((c) => [c.id, c.decisionId]));
  // The runner ran cases three at a time and wrote the report at the end, so each case's
  // start is the end time minus the batches that ran from its batch on.
  const batches: EvalCase[][] = [];
  for (let i = 0; i < cases.length; i += 3) batches.push(cases.slice(i, i + 3));
  const durations = batches.map((b) => Math.max(...b.map((c) => c.seconds)) * 1000);
  const ids: string[] = [];
  batches.forEach((batch, bi) => {
    const start = new Date(Date.parse(end) - durations.slice(bi).reduce((a, b) => a + b, 0)).toISOString();
    for (const c of batch) {
      if (c.calls === 0 || c.text === "(none)") continue; // the greeting needs no model and isn't a run worth replaying
      const statements: Statement[] = c.statements.map((s, i) => ({ id: `s${i + 1}`, text: s.text, kind: "fact", citations: s.citations, verified: verified(s.citations) }));
      const answer: AgentEvent = { type: "answer", text: c.text, statements };
      ids.push(write(
        {
          kind: "ask", decisionId: decisions.get(c.id) ?? "row-2027-budget", question: c.question, ...(c.lang ? { lang: c.lang } : {}),
          startedAt: start, model, source: `eval run (agents/records/sources/${file}, case ${c.id})`, calls: c.calls, costUsd: c.cost,
          note: "The eval runner saved only the final answer, so no steps are shown. Statement kinds weren't saved and are shown as \"fact\"; every citation was checked again by code when this file was made. The start time is worked out from the report's end time and each case's duration.",
        },
        [{ t: Math.round(c.seconds * 1000), event: answer }, { t: Math.round(c.seconds * 1000) + 1, event: { type: "done" } }],
        `${file}:${c.id}`,
      ));
    }
  });
  return ids;
}

// ---------------------------------------------------------------------------
// The CLI log: one asked question, with its usage and checked statements.

interface LogLine { at: string; actor: string; kind: string; decisionId?: string; payload: any }
const log: LogLine[] = fs.readFileSync(path.join(SRC, "cli-log-excerpt.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

function usageEvents(entries: LogLine[]): { at: string; event: AgentEvent }[] {
  let calls = 0, input = 0, output = 0, cost = 0;
  return entries.filter((e) => e.kind === "usage").map((e) => {
    calls++;
    input += e.payload.promptTokens ?? 0;
    output += (e.payload.candidatesTokens ?? 0) + (e.payload.thoughtsTokens ?? 0);
    cost += e.payload.costUsd ?? 0;
    return { at: e.at, event: { type: "usage", calls, inputTokens: input, outputTokens: output, costUsd: Math.round(cost * 1e6) / 1e6 } as AgentEvent };
  });
}

const asStatement = (p: any): Statement => ({ id: p.id, text: p.text, kind: p.kind ?? "fact", citations: p.citations, verified: verified(p.citations) });

function seedCliAsks(): string[] {
  const ids: string[] = [];
  for (const q of log.filter((e) => e.kind === "question.asked")) {
    const end = log.find((e) => e.kind === "answer.given" && e.decisionId === q.decisionId && e.at >= q.at);
    if (!end) continue;
    const within = log.filter((e) => e.decisionId === q.decisionId && e.at >= q.at && e.at <= end.at);
    const t = (at: string) => Date.parse(at) - Date.parse(q.at);
    const timed: { at: string; event: AgentEvent }[] = [
      ...usageEvents(within),
      ...within.filter((e) => e.kind === "statement.recorded" && typeof e.payload.text === "string").map((e) => ({ at: e.at, event: { type: "statement", id: "seed", statement: asStatement(e.payload) } as AgentEvent })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const answer: AgentEvent = {
      type: "answer",
      text: end.payload.text,
      statements: (end.payload.statements ?? []).map(asStatement),
      ...(end.payload.computedFigures?.length ? { figures: end.payload.computedFigures } : {}),
    };
    const usage = timed.filter((x) => x.event.type === "usage").pop()?.event as Extract<AgentEvent, { type: "usage" }> | undefined;
    ids.push(write(
      {
        kind: "ask", decisionId: q.decisionId!, question: q.payload.question, startedAt: q.at,
        model: within.find((e) => e.kind === "usage")?.payload.model ?? MODEL, source: "CLI run (agents/cli.ts ask), log in agents/records/sources/cli-log-excerpt.jsonl",
        calls: usage?.calls, costUsd: usage?.costUsd,
        note: "The plan and tool steps of this run weren't saved; its usage and checked statements come from the log, with their real times. Statement kinds weren't logged and are shown as \"fact\".",
      },
      [...timed.map((x) => ({ t: t(x.at), event: x.event })), { t: t(end.at), event: answer }, { t: t(end.at) + 1, event: { type: "done" } }],
      `cli:${q.at}`,
    ));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Brief runs: the CLI's printed event stream, timed against the log.

const TOOL_BY_SUMMARY: [RegExp, string][] = [
  [/^Searched the documents/, "search_pages"],
  [/^(Read page|Tried page|Tried to open)/, "read_page"],
  [/(recorded a figure|Rejected a figure|Already had figure)/, "record_figure"],
  [/(computed figure)/, "record_computed_figure"],
  [/(a commitment)/, "record_commitment"],
  [/^(Checked and recorded:|Rejected a statement|Already had:)/, "record_statement"],
  [/(an unknown|unknown ")/, "record_unknown"],
  [/^Explained a term/, "record_term"],
  [/transit access/, "transit_gaps"],
  [/^Computed the lifecycle cost|^Couldn't build the lifecycle cost/, "build_lifecycle_cost"],
  [/lifecycle cost/, "lifecycle_cost"],
  [/housing (units|stages)/, "housing_stages"],
  [/tracked commitments/, "commitment_progress"],
  [/construction (scenario)/, "construction_sites"],
  [/^Rewrote \d+ of \d+ sentences/, "plain_language"],
];

function seedBrief(file: string, decisionId: string, from: string, briefFile?: string): string {
  const startEntry = log.find((e) => e.kind === "brief.started" && e.decisionId === decisionId && e.at >= from)!;
  const endEntry = log.find((e) => e.kind === "brief.generated" && e.decisionId === decisionId && e.at >= startEntry.at)!;
  const within = log.filter((e) => e.decisionId === decisionId && e.at >= startEntry.at && e.at <= endEntry.at);
  const usage = usageEvents(within);
  const recorded = within.filter((e) => e.kind === "statement.recorded");
  const t0 = Date.parse(startEntry.at);
  let t = 0;
  let u = 0;
  let r = 0;
  const specialistOf = new Map<string, string>([["plain", "lead"]]);
  const lines: Line[] = [];
  const push = (event: AgentEvent) => lines.push({ t, event });
  for (const raw of fs.readFileSync(path.join(SRC, file), "utf8").split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^plan (.*)$/))) {
      const steps = m[1].split(" | ").map((s) => s.match(/^(\S+)=(\S+): (.*)$/)!).map((x) => ({ id: x[1], specialist: x[2], question: x[3] }));
      for (const s of steps) specialistOf.set(s.id, s.specialist);
      push({ type: "plan", agent: "lead", steps });
    } else if ((m = raw.match(/^▶ (\S+) \((\S+)\) (.*)$/))) {
      specialistOf.set(m[1], m[2]);
      push({ type: "step.start", id: m[1], specialist: m[2], question: m[3] });
    } else if ((m = raw.match(/^■ (\S+) (done|failed) (.*)$/))) {
      push({ type: "step.end", id: m[1], specialist: specialistOf.get(m[1]) ?? "lead", status: m[2] as "done" | "failed", summary: m[3] });
    } else if ((m = raw.match(/^ {2}usage: (\d+) calls, \$([\d.]+)$/))) {
      const x = usage[u++];
      if (x) {
        t = Date.parse(x.at) - t0;
        push(x.event);
      }
    } else if ((m = raw.match(/^ {4}✓ (.*)$/))) {
      // Match the printed statement to its log entry (same text), for its id, citations and time.
      const text = m[1];
      let found: Statement | undefined;
      for (let k = r; k < recorded.length && !found; k++) {
        const p = recorded[k].payload;
        const candidates: any[] = p.commitment ? p.commitment.progress : typeof p.text === "string" ? [p] : [];
        const hit = candidates.find((c) => c.text === text);
        if (hit) {
          found = asStatement(hit);
          t = Date.parse(recorded[k].at) - t0;
          if (!p.commitment) r = k + 1;
        }
      }
      if (found) push({ type: "statement", id: "seed", statement: found });
    } else if ((m = raw.match(/^ {2}(\S+) · (.*)$/))) {
      const tool = TOOL_BY_SUMMARY.find(([re]) => re.test(m![2]))?.[1] ?? "unknown";
      push({ type: "tool", id: m[1], specialist: specialistOf.get(m[1]) ?? "lead", tool, summary: m[2] });
    }
  }
  t = Date.parse(endEntry.at) - t0;
  if (briefFile) push({ type: "brief", brief: JSON.parse(fs.readFileSync(path.join(ROOT, "data", "briefs", briefFile), "utf8")) as Brief });
  push({ type: "done" });
  return write(
    {
      kind: "brief", decisionId, startedAt: startEntry.at, model: within.find((e) => e.kind === "usage")?.payload.model ?? MODEL,
      source: `CLI run (agents/cli.ts brief), printed events in agents/records/sources/${file}, times from cli-log-excerpt.jsonl`,
      calls: endEntry.payload.calls, costUsd: endEntry.payload.costUsd,
      note:
        "Events are the CLI's printed stream; tool names are read from each step's one-line summary, and times come from the log (events between two logged ones share the earlier time). Statement kinds weren't logged and are shown as \"fact\"." +
        (briefFile ? " The final brief is the one now in data/briefs (lens data stored lean)." : " The final brief from this run wasn't saved (a later failed run overwrote the file), so it isn't included."),
    },
    lines,
    `brief:${file}`,
  );
}

const ids = [
  ...seedEval("eval-round1.md"),
  ...seedEval("eval-recheck.md"),
  ...seedEval("eval-round2.md"),
  ...seedCliAsks(),
  seedBrief("brief-row-2027-budget-0649Z.txt", "row-2027-budget", "2026-11-14T06:49:13", "row-2027-budget.json"),
  seedBrief("brief-kitchener-transit-hub-variances-0658Z.txt", "kitchener-transit-hub-variances", "2026-11-14T06:58:25", "kitchener-transit-hub-variances.json"),
  seedBrief("brief-row-water-supply-2051-0658Z.txt", "row-water-supply-2051", "2026-11-14T06:58:25", "row-water-supply-2051.json"),
  seedBrief("brief-row-2027-budget-0709Z.txt", "row-2027-budget", "2026-11-14T07:09:39"),
];
console.log(`wrote ${ids.length} run files to ${path.relative(process.cwd(), OUT)}`);
