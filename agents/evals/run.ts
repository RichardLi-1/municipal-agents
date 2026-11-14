// Runs the eval cases against the real agents and scores them in code.
//   node --env-file=.env agents/evals/run.ts [--only id,id] [--cap 1.00] [--out agents/evals/results.md]
// Every case is checked for: citations that re-verify against the pages (checked again
// here, independently of the tools), valid [n] markers, no advice on how to vote or
// what to think, and a reading grade of 9 or lower (English answers). Cases add their
// own: pages that must be cited, words that must or must not appear, and "says it's
// unknown" when the documents don't answer.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, Figure, Statement } from "../../shared/types.ts";
import { verifyCitation } from "../../shared/verify.ts";
import { fleschKincaidGrade } from "../../shared/readability.ts";
import { ask, type AgentContext } from "../index.ts";

interface Case {
  id: string;
  decisionId: string;
  question: string;
  lang?: string;
  audiences?: AudienceId[];
  mustCite?: [string, number][]; // any one of these pages
  mustMention?: string[]; // each regex must match the answer
  mustNot?: string[]; // no regex may match
  expectUnknown?: boolean; // the answer must say the documents don't say
  noModel?: boolean; // must be answered without any model call
  mustUseComputed?: boolean; // must cite at least one computed lens figure ([Cn])
}

interface Scored {
  c: Case;
  pass: boolean;
  failed: string[];
  text: string;
  statements: Statement[];
  figures: Figure[];
  calls: number;
  costUsd: number;
  seconds: number;
  grade: number | null;
  error?: string;
}

const ADVICE = [/\byou should (vote|support|oppose|back|reject)\b/i, /\b(i|we) (recommend|suggest|urge|advise)\b/i, /\bvote (for|against|yes|no)\b/i];
const UNKNOWN = /(don'?t|do not|doesn'?t|does not|did not|didn'?t) (say|show|give|list|include|mention|answer|cover)|not (yet )?(been )?(published|released|available|public|known|announced|set|decided|stated|listed|included)|unknown|isn'?t (clear|known|stated)|not clear|no (information|details|figure|estimate)|couldn'?t find|could not find|ne (le )?(précisent|disent|mentionnent) pas/i;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const root = path.join(import.meta.dirname, "..", "..");
const dataDir = path.join(root, "data");
const pagesCache = new Map<string, string[] | undefined>();
function pagesOf(id: string): string[] | undefined {
  if (!pagesCache.has(id)) {
    try {
      pagesCache.set(id, JSON.parse(fs.readFileSync(path.join(dataDir, "sources", `${id}.pages.json`), "utf8")));
    } catch {
      pagesCache.set(id, undefined);
    }
  }
  return pagesCache.get(id);
}

async function runCase(c: Case): Promise<Scored> {
  const events: AgentEvent[] = [];
  let costUsd = 0;
  let calls = 0;
  const ctx: AgentContext = {
    dataDir,
    log(e) {
      if (e.kind === "usage") {
        calls++;
        costUsd += Number((e.payload as { costUsd?: number }).costUsd ?? 0);
      }
    },
  };
  const t0 = Date.now();
  await ask(ctx, { decisionId: c.decisionId, question: c.question, lang: c.lang, audiences: c.audiences }, (e) => events.push(e));
  const seconds = (Date.now() - t0) / 1000;
  const answer = events.find((e) => e.type === "answer") as Extract<AgentEvent, { type: "answer" }> | undefined;
  const error = (events.find((e) => e.type === "error") as Extract<AgentEvent, { type: "error" }> | undefined)?.message;
  const text = answer?.text ?? "";
  const statements = answer?.statements ?? [];
  const failed: string[] = [];
  const plain = text.replace(/\[C?\d+(?:,\s*C?\d+)*\]/g, "");

  if (!answer) failed.push("no answer");
  if (error) failed.push(`error: ${error}`);
  // Citations, checked again here against the pages.
  for (const s of statements) {
    const ok = s.citations.length > 0 && s.citations.every((cit) => {
      const pages = pagesOf(cit.sourceId);
      return pages ? verifyCitation(pages, cit) : false;
    });
    if (!ok) failed.push(`unverified citation in "${s.text.slice(0, 50)}"`);
  }
  for (const m of text.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)) {
    // [n] markers only; [Cn] markers are checked against the computed figures below
    for (const n of m[1].split(",").map((x) => Number(x.trim()))) if (n < 1 || n > statements.length) failed.push(`bad marker [${n}]`);
  }
  if (ADVICE.some((r) => r.test(text))) failed.push("gives advice on how to vote or what to think");
  const english = !c.lang || /^en/i.test(c.lang);
  const grade = english && plain.trim() ? fleschKincaidGrade(plain) : null;
  if (grade !== null && grade > 9) failed.push(`reading grade ${grade} > 9`);
  if (c.mustCite && !statements.some((s) => s.citations.some((cit) => c.mustCite!.some(([id, p]) => cit.sourceId === id && cit.page === p))))
    failed.push(`doesn't cite ${c.mustCite.map(([id, p]) => `${id} p.${p}`).join(" or ")}`);
  for (const r of c.mustMention ?? []) if (!new RegExp(r, "i").test(text)) failed.push(`doesn't mention /${r}/`);
  for (const r of c.mustNot ?? []) if (new RegExp(r, "i").test(text)) failed.push(`mentions /${r}/`);
  if (c.expectUnknown && !UNKNOWN.test(text)) failed.push("doesn't say the documents don't answer it");
  if (c.noModel && calls > 0) failed.push(`used ${calls} model calls`);
  const figures = answer?.figures ?? [];
  if (c.mustUseComputed && !figures.some((f) => f.kind === "computed")) failed.push("doesn't use a computed lens figure");
  for (const m of text.matchAll(/\[C(\d+)\]/g)) if (Number(m[1]) > figures.length) failed.push(`bad marker [C${m[1]}]`);
  return { c, pass: failed.length === 0, failed, text, statements, figures, calls, costUsd, seconds, grade, error };
}

function report(results: Scored[], skipped: Case[], model: string): string {
  const passed = results.filter((r) => r.pass).length;
  const cost = results.reduce((n, r) => n + r.costUsd, 0);
  const calls = results.reduce((n, r) => n + r.calls, 0);
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    "# Agent evals: results",
    "",
    `Run ${new Date().toISOString()} with \`${model}\` against the committed data. Scored in code by \`agents/evals/run.ts\` from \`agents/evals/cases.json\`.`,
    "",
    `**${passed} of ${results.length} cases pass.** ${calls} model calls, US$${cost.toFixed(4)} in total (US$${(cost / Math.max(1, results.length)).toFixed(4)} a question), median ${median(results.map((r) => r.seconds)).toFixed(1)} s a question.` +
      (skipped.length ? ` ${skipped.length} case(s) skipped at the spend cap.` : ""),
    "",
    "Every case is checked for: each cited quote found again on its page, valid [n] markers, no advice on how to vote or what to think, and a reading grade of 9 or lower (English). Cases add pages that must be cited, words that must (or must not) appear, and \"says the documents don't answer it\".",
    "",
    "| Case | Result | Grade | Calls | US$ | Seconds | What failed |",
    "|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.c.id} | ${r.pass ? "pass" : "**fail**"} | ${r.grade ?? "n/a"} | ${r.calls} | ${r.costUsd.toFixed(4)} | ${r.seconds.toFixed(1)} | ${cell(r.failed.join("; "))} |`),
    "",
    "## Answers",
    "",
  ];
  for (const r of results) {
    lines.push(`### ${r.c.id}${r.pass ? "" : " (fail)"}`, "", `**Q:** ${r.c.question}${r.c.lang ? ` (lang ${r.c.lang})` : ""}`, "", `**A:** ${r.text || "(none)"}`, "");
    r.statements.forEach((s, i) => lines.push(`${i + 1}. ${s.text} (${s.citations.map((cit) => `${cit.sourceId} p.${cit.page}: "${cit.quote}"`).join("; ")})`));
    r.figures.forEach((f, i) => lines.push(`C${i + 1}. ${f.label}: ${f.display} (computed: ${f.formula ?? ""})`));
    if (r.statements.length || r.figures.length) lines.push("");
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cap = Number(option(args, "cap") ?? 1);
  const only = option(args, "only")?.split(",");
  const out = path.resolve(option(args, "out") ?? path.join(import.meta.dirname, "results.md"));
  const all = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "cases.json"), "utf8")) as Case[];
  const cases = only ? all.filter((c) => only.includes(c.id)) : all;
  const results: Scored[] = [];
  const skipped: Case[] = [];
  let spent = 0;
  // Three at a time: quick enough, and well inside the API's rate limits.
  for (let i = 0; i < cases.length; i += 3) {
    const batch = cases.slice(i, i + 3);
    if (spent >= cap * 0.85) {
      skipped.push(...cases.slice(i));
      break;
    }
    const done = await Promise.all(batch.map(runCase));
    for (const r of done) {
      spent += r.costUsd;
      results.push(r);
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.c.id}  $${r.costUsd.toFixed(4)} ${r.seconds.toFixed(1)}s ${r.failed.join("; ")}`);
    }
  }
  fs.writeFileSync(out, report(results, skipped, process.env.LEAD_MODEL || "gemini-3.6-flash"));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} pass, $${spent.toFixed(4)}; wrote ${path.relative(process.cwd(), out)}`);
}

await main();
