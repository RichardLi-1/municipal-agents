// Statements inside a brief, wherever they sit (summary, impacts, every lens), and the
// product rules that act on them: staff review each one before publishing, a
// published brief leaves out what staff rejected, and an edit is re-checked against
// its pages so `verified` stays true to the checker.
import { OPERATOR } from "../shared/corrections.ts";
import type { Brief, Statement } from "../shared/types.ts";
import { readingGrade } from "../shared/readability.ts";
import { verifyStatement } from "../shared/verify.ts";

// Map layers can be large and never hold statements.
const SKIP_KEYS = new Set(["layers", "alignment", "footprint", "bores", "profile", "area"]);

export function isStatement(x: unknown): x is Statement {
  const s = x as Statement;
  return !!s && typeof s === "object" && typeof s.id === "string" && typeof s.text === "string" && Array.isArray(s.citations);
}

/**
 * Every statement in the brief, found by walking it, so a lens added later (like
 * construction) is covered without changing this code. Returns the live objects.
 */
export function allStatements(brief: Brief): Statement[] {
  const out: Statement[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (isStatement(x)) out.push(x);
        else walk(x);
      }
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) if (!SKIP_KEYS.has(k)) walk(x);
    }
  };
  walk(brief);
  return out;
}

export function unreviewed(brief: Brief): Statement[] {
  return allStatements(brief).filter((s) => !s.review);
}

/** The brief with the given statements removed; audience groups left empty are dropped. */
export function withoutStatements(brief: Brief, drop: Set<string>): Brief {
  if (drop.size === 0) return brief;
  const prune = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((x) => !(isStatement(x) && drop.has(x.id))).map(prune);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = SKIP_KEYS.has(k) ? x : prune(x);
      return o;
    }
    return v;
  };
  const out = prune(brief) as Brief;
  out.impacts = (out.impacts ?? []).filter((i) => (i.statements ?? []).length > 0);
  return out;
}

/**
 * What residents see. A published brief leaves out the statements staff rejected; a
 * draft is shown whole (it's labelled as a draft). For a translation, `source` is the
 * brief it was made from: its review decides, matched by statement id.
 */
export function publicBrief(brief: Brief, source: Brief = brief): Brief {
  if (source.review?.status !== "published") {
    // A draft is shown whole, except statements the Municipal Agents team withdrew
    // (operator corrections, data/corrections): they're known not to be supported.
    const withdrawn = new Set(
      [...allStatements(source), ...allStatements(brief)].filter((s) => s.review?.action === "rejected" && s.review.by === OPERATOR).map((s) => s.id),
    );
    return withdrawn.size ? withoutStatements(brief, withdrawn) : brief;
  }
  const rejected = new Set(
    [...allStatements(source), ...allStatements(brief)].filter((s) => s.review?.action === "rejected").map((s) => s.id),
  );
  return withoutStatements(brief, rejected);
}

/** Re-run the citation checker on one statement (an edit keeps its citations). */
export function recheck(st: Statement, pagesOf: (sourceId: string) => string[] | undefined): string[] {
  const check = verifyStatement(pagesOf, st);
  st.verified = check.verified;
  return check.problems;
}

/** Flesch-Kincaid grade of the summary and impacts, as the agents compute it. */
export function briefGrade(brief: Brief): number {
  return readingGrade([...(brief.summary ?? []), ...(brief.impacts ?? []).flatMap((i) => i.statements ?? [])].map((s) => s.text));
}
