// Run the agents from a terminal, without the service:
//   node --env-file=.env agents/cli.ts brief <decisionId>          → data/briefs/<id>.json
//   node --env-file=.env agents/cli.ts ask <decisionId> "<question>" [--lang fr] [--audience renter,driver]
//   node --env-file=.env agents/cli.ts translate <decisionId> <lang> → data/briefs/<id>.<lang>.json
// Options: --data <dir> (default ./data). Log entries go to data/cache/agents-cli.jsonl.

import fs from "node:fs";
import path from "node:path";
import type { AgentEvent, AudienceId, Brief } from "../shared/types.ts";
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
    const brief = await generateBrief(ctx, { decisionId }, printEvent);
    const file = path.join(dataDir, "briefs", `${decisionId}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(brief, null, 2) + "\n");
    const n = brief.summary.length + brief.whyNow.length + brief.haveYourSay.length + brief.tradeoffs.length + brief.impacts.reduce((k, g) => k + g.statements.length, 0);
    console.log(`\nwrote ${path.relative(process.cwd(), file)}: ${n} statements, ${brief.figures.length} figures, ${brief.unknowns.length} unknowns, grade ${brief.readingGrade}, $${brief.costUsd.toFixed(4)}`);
  } else if (cmd === "ask" && decisionId && rest.length) {
    await ask(ctx, { decisionId, question: rest.join(" "), lang, audiences }, printEvent);
    console.log(`\nspent $${ctx.spent().toFixed(4)}`);
  } else if (cmd === "translate" && decisionId && rest[0]) {
    const brief = JSON.parse(fs.readFileSync(path.join(dataDir, "briefs", `${decisionId}.json`), "utf8")) as Brief;
    const out = await translateBrief(ctx, brief, rest[0]);
    const file = path.join(dataDir, "briefs", `${decisionId}.${rest[0]}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), file)}, spent $${ctx.spent().toFixed(4)}`);
  } else {
    console.log('usage: agents/cli.ts brief <decisionId> | ask <decisionId> "<question>" [--lang fr] [--audience renter] | translate <decisionId> <lang>  [--data dir]');
    process.exitCode = 2;
  }
}

await main();
