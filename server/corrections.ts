// Puts operator corrections on the public record: one `statement.reviewed` entry per
// correction (actor operator:municipal-agents-team), the first time the server applies
// it. Run at start and whenever a corrections file changes. The corrections themselves
// are applied when a brief is loaded (Store.brief).
import fs from "node:fs";
import path from "node:path";
import { applyCorrections, OPERATOR, OPERATOR_ACTOR } from "../shared/corrections.ts";
import type { App } from "./app.ts";

const seen = new Map<string, number>(); // corrections file -> mtime last synced

export function syncCorrections(app: App): { logged: number; refused: number } {
  const dir = path.join(app.cfg.dataDir, "corrections");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return { logged: 0, refused: 0 };
  }
  let logged = 0;
  let refused = 0;
  for (const name of names) {
    const file = path.join(dir, name);
    const mtime = fs.statSync(file).mtimeMs;
    if (seen.get(file) === mtime) continue;
    const decisionId = name.slice(0, -5);
    const brief = app.store.rawBrief(decisionId);
    const corrections = app.store.corrections(decisionId);
    if (!brief || !corrections.length) continue;
    const result = applyCorrections(brief, corrections, (id) => app.store.sourcePages(id));
    const done = new Set(
      app.log.list({ kind: "statement.reviewed", decisionId, limit: 10_000 }).map((e) => (e.payload as { correctionKey?: string } | null)?.correctionKey),
    );
    for (const a of result.applied) {
      if (done.has(a.key)) continue;
      const c = a.correction;
      app.log.append({
        actor: OPERATOR_ACTOR,
        kind: "statement.reviewed",
        decisionId,
        payload: {
          statementId: c.statementId, action: c.action ?? "edited", by: OPERATOR, at: c.at, note: c.note,
          originalText: a.originalText, text: c.text, citations: c.citations, kind: c.kind, correctionKey: a.key,
          source: `data/corrections/${name}`,
        },
      });
      logged++;
    }
    for (const r of result.refused) console.error(`correction refused (${decisionId} ${r.correction.statementId}): ${r.reason}`);
    refused += result.refused.length;
    seen.set(file, mtime);
  }
  return { logged, refused };
}
