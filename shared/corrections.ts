// Operator corrections: fixes the Municipal Agents team made to an agent-written brief,
// kept in a committed file (data/corrections/<decisionId>.json) so they're public and
// reviewable. They are not a staff review: each corrected statement says it was edited
// by "Municipal Agents team (not Region staff)", and the brief stays a draft until a
// named staff member approves it. Every corrected citation must pass the same check as
// the agents' (its quote found on that page), or the correction is refused.
//
// Used by the server (applied whenever a brief is loaded) and by the agents' CLI
// (`agents/cli.ts correct <decisionId>`, which writes the result into the brief file).

import { createHash } from "node:crypto";
import type { Brief, Citation, IsoDate, Statement, StatementKind } from "./types.ts";
import { verifyCitation } from "./verify.ts";

export const OPERATOR = "Municipal Agents team (not Region staff)";
export const OPERATOR_ACTOR = "operator:municipal-agents-team";

export interface Correction {
  statementId: string;
  /** "edited" (default) changes text, citations or kind; "rejected" withdraws the statement. */
  action?: "edited" | "rejected";
  text?: string;
  citations?: Citation[];
  kind?: StatementKind;
  note: string;
  by: string;
  at: IsoDate;
}

export interface CorrectionResult {
  applied: { correction: Correction; key: string; originalText: string }[];
  refused: { correction: Correction; reason: string }[];
}

/** A stable id for one correction, so it is logged once however often it's applied. */
export function correctionKey(decisionId: string, c: Correction): string {
  return createHash("sha256").update(JSON.stringify([decisionId, c.statementId, c.action ?? "edited", c.text ?? null, c.citations ?? null, c.kind ?? null, c.at])).digest("hex").slice(0, 16);
}

/** Every statement in a brief, wherever it sits (sections, impacts, lenses, commitments). */
export function allBriefStatements(b: Brief): Statement[] {
  const lenses = Object.values(b.lenses ?? {}) as { statements?: Statement[]; commitments?: { progress?: Statement[] }[] }[];
  return [
    ...(b.summary ?? []), ...(b.whyNow ?? []), ...(b.haveYourSay ?? []), ...(b.tradeoffs ?? []),
    ...(b.impacts ?? []).flatMap((g) => g.statements ?? []),
    ...lenses.flatMap((l) => [...(l.statements ?? []), ...(l.commitments ?? []).flatMap((k) => k.progress ?? [])]),
  ];
}

/**
 * Applies corrections to a copy of the brief. A statement a named staff member has
 * already reviewed is left alone (their decision stands); a correction already applied
 * (same date) is applied again harmlessly. `support` recomputes the support strength.
 */
export function applyCorrections(
  input: Brief,
  corrections: Correction[],
  pagesOf: (sourceId: string) => string[] | undefined,
  opts: { support?: (text: string, quotes: string[]) => "strong" | "weak" } = {},
): { brief: Brief } & CorrectionResult {
  const brief = structuredClone(input);
  const result: CorrectionResult = { applied: [], refused: [] };
  const statements = allBriefStatements(brief);
  for (const c of corrections) {
    const s = statements.find((x) => x.id === c.statementId);
    if (!s) {
      result.refused.push({ correction: c, reason: `no statement ${c.statementId} in this brief` });
      continue;
    }
    if (!c.note?.trim() || !c.by?.trim() || !c.at) {
      result.refused.push({ correction: c, reason: "a correction needs a note, who made it and when" });
      continue;
    }
    if (s.review && s.review.by !== OPERATOR) continue; // staff reviewed it: theirs stands
    const already = s.review?.by === OPERATOR && s.review.at === c.at;
    const citations = c.citations ?? s.citations;
    const bad = citations.filter((cit) => {
      const pages = pagesOf(cit.sourceId);
      return !pages || !verifyCitation(pages, cit);
    });
    if (c.action !== "rejected" && (!citations.length || bad.length)) {
      result.refused.push({ correction: c, reason: bad.length ? `quote not found: ${bad.map((b) => `${b.sourceId} p.${b.page} "${b.quote.slice(0, 60)}"`).join("; ")}` : "no citations" });
      continue;
    }
    const originalText = already ? (s.review?.originalText ?? s.text) : s.text;
    if (!already) {
      if (c.text) s.text = c.text.trim();
      s.citations = citations;
      if (c.kind) s.kind = c.kind;
      s.verified = citations.length > 0 && bad.length === 0;
    }
    s.review = { action: c.action ?? "edited", by: OPERATOR, at: c.at, note: c.note, originalText };
    // Support strength is measured by the agents' code; without it, an old value would be stale.
    if (opts.support) s.support = opts.support(s.text, s.citations.map((x) => x.quote));
    else if (!already) delete s.support;
    result.applied.push({ correction: c, key: correctionKey(brief.decisionId, c), originalText });
  }
  return { brief, ...result };
}
