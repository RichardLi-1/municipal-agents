// Run the agents from a terminal, without the service:
//   node --env-file=.env agents/cli.ts brief <decisionId>          → data/briefs/<id>.json
//   node --env-file=.env agents/cli.ts ask <decisionId> "<question>" [--lang fr] [--audience renter,driver]
//   node --env-file=.env agents/cli.ts translate <decisionId> <lang> → data/briefs/<id>.<lang>.json
//   node agents/cli.ts correct <decisionId>   applies data/corrections/<id>.json to the brief (no model)
// Options: --data <dir> (default ./data). Log entries go to data/cache/agents-cli.jsonl.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, Brief, Decision } from "../shared/types.ts";
import { applyCorrections, OPERATOR, OPERATOR_ACTOR, type Correction } from "../shared/corrections.ts";
import { readingGrade } from "../shared/readability.ts";
import { supportOf } from "./tidy.ts";
import { ask, generateBrief, translateBrief, type AgentContext } from "./index.ts";

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function makeContext(dataDir: string): AgentContext & { spent: () => number } {
  const logFile = path.join(dataDir, "cache", "agents-cli.jsonl");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  let spent = 0;
  return {
    dataDir,
    log(e) {
      if (e.kind === "usage") spent += Number((e.payload as { costUsd?: number }).costUsd ?? 0);
      fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
      if (e.kind === "statement.rejected") {
        const p = e.payload as { reasons?: string[] };
        console.log(`    \x1b[33m✗ rejected\x1b[0m ${p.reasons?.[0] ?? ""}`);
      }
    },
    spent: () => spent,
  };
}

function printEvent(e: AgentEvent): void {
  switch (e.type) {
    case "plan":
      console.log(`\x1b[1mplan\x1b[0m ${e.steps.map((s) => `${s.id}=${s.specialist}: ${s.question}`).join(" | ")}`);
      break;
    case "step.start":
      console.log(`\x1b[36m▶ ${e.id} (${e.specialist})\x1b[0m ${e.question}`);
      break;
    case "tool":
      console.log(`  ${e.id} · ${e.summary}`);
      break;
    case "statement":
      console.log(`    \x1b[32m✓\x1b[0m ${e.statement.text}`);
      break;
    case "step.end":
      console.log(`\x1b[36m■ ${e.id} ${e.status}\x1b[0m ${e.summary}`);
      break;
    case "answer":
      console.log(`\n\x1b[1manswer\x1b[0m ${e.text}`);
      e.statements.forEach((s, i) => console.log(`  [${i + 1}] ${s.text} — ${s.citations.map((c) => `${c.sourceId} p.${c.page}: "${c.quote}"`).join("; ")}`));
      break;
    case "usage":
      process.stdout.write(`\x1b[2m  usage: ${e.calls} calls, $${e.costUsd.toFixed(4)}\x1b[0m\n`);
      break;
    case "error":
      console.log(`\x1b[31merror\x1b[0m ${e.message}`);
      break;
    case "brief":
    case "done":
      break;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dataDir = path.resolve(option(args, "data") ?? process.env.DATA_DIR ?? path.join(import.meta.dirname, "..", "data"));
  const lang = option(args, "lang");
  const audiences = option(args, "audience")?.split(",") as AudienceId[] | undefined;
  const [cmd, decisionId, ...rest] = args;
  const ctx = makeContext(dataDir);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort(new Error("cancelled")));
  ctx.signal = controller.signal;

  if (cmd === "brief" && decisionId) {
    const force = args.includes("--force");
    const brief = await generateBrief(ctx, { decisionId }, printEvent);
    const file = path.join(dataDir, "briefs", `${decisionId}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Keep the previous brief, and don't replace one that has a summary with one that doesn't.
    if (fs.existsSync(file)) {
      const prev = JSON.parse(fs.readFileSync(file, "utf8")) as Brief;
      if (prev.summary?.length && !brief.summary.length && !force) {
        console.log(`\nnot writing ${file}: the new brief has no summary and the old one does (use --force to replace it)`);
        process.exitCode = 1;
        return;
      }
      const hist = path.join(dataDir, "cache", "brief-history");
      fs.mkdirSync(hist, { recursive: true });
      fs.copyFileSync(file, path.join(hist, `${decisionId}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
    }
    fs.writeFileSync(file, JSON.stringify(brief, null, 2) + "\n");
    const n = brief.summary.length + brief.whyNow.length + brief.haveYourSay.length + brief.tradeoffs.length + brief.impacts.reduce((k, g) => k + g.statements.length, 0);
    console.log(`\nwrote ${path.relative(process.cwd(), file)}: ${n} statements, ${brief.figures.length} figures, ${brief.unknowns.length} unknowns, grade ${brief.readingGrade}, $${brief.costUsd.toFixed(4)}`);
  } else if (cmd === "ask" && decisionId && rest.length) {
    await ask(ctx, { decisionId, question: rest.join(" "), lang, audiences }, printEvent);
    console.log(`\nspent $${ctx.spent().toFixed(4)}`);
  } else if (cmd === "correct" && decisionId) {
    // Operator corrections: every corrected quote is checked on its page, or refused.
    const file = path.join(dataDir, "briefs", `${decisionId}.json`);
    const brief = JSON.parse(fs.readFileSync(file, "utf8")) as Brief;
    const corrections = JSON.parse(fs.readFileSync(path.join(dataDir, "corrections", `${decisionId}.json`), "utf8")) as Correction[];
    const decision = JSON.parse(fs.readFileSync(path.join(dataDir, "decisions", `${decisionId}.json`), "utf8")) as Decision;
    const pagesOf = (id: string) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, "sources", `${id}.pages.json`), "utf8")) as string[];
      } catch {
        return undefined;
      }
    };
    const { brief: out, applied, refused } = applyCorrections(brief, corrections, pagesOf, {
      support: (text, quotes) => supportOf(text, quotes, [decision.title, decision.plainTitle]),
    });
    for (const r of refused) console.log(`\x1b[33mrefused\x1b[0m ${r.correction.statementId}: ${r.reason}`);
    for (const a of applied) {
      console.log(`\x1b[32mapplied\x1b[0m ${a.correction.statementId} (${a.correction.action ?? "edited"}): ${a.correction.text ?? "(text unchanged)"}`);
      ctx.log({ actor: OPERATOR_ACTOR, kind: "statement.reviewed", decisionId, payload: { statementId: a.correction.statementId, action: a.correction.action ?? "edited", by: OPERATOR, note: a.correction.note, originalText: a.originalText, correctionKey: a.key } });
    }
    out.readingGrade = readingGrade([...out.summary, ...out.impacts.flatMap((g) => g.statements)].map((x) => x.text));
    const hist = path.join(dataDir, "cache", "brief-history");
    fs.mkdirSync(hist, { recursive: true });
    fs.copyFileSync(file, path.join(hist, `${decisionId}.${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), file)}: ${applied.length} applied, ${refused.length} refused, grade ${out.readingGrade}`);
    if (refused.length) process.exitCode = 1;
  } else if (cmd === "translate" && decisionId && rest[0]) {
    const brief = JSON.parse(fs.readFileSync(path.join(dataDir, "briefs", `${decisionId}.json`), "utf8")) as Brief;
    const out = await translateBrief(ctx, brief, rest[0]);
    const file = path.join(dataDir, "briefs", `${decisionId}.${rest[0]}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), file)}, spent $${ctx.spent().toFixed(4)}`);
  } else {
    console.log('usage: agents/cli.ts brief <decisionId> | ask <decisionId> "<question>" [--lang fr] [--audience renter] | translate <decisionId> <lang> | correct <decisionId>  [--data dir]');
    process.exitCode = 2;
  }
}

await main();
