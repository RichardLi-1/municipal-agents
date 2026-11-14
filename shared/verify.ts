// Citation checks, done in code and never by a model (spec, principle 1). A statement
// counts as verified only if every quote it cites is found on the page it names.
//
// "Found" means: equal after normalising (case, spacing, curly quotes, dashes,
// ligatures, words hyphenated at a line break). Page text comes from
// `pdftotext -layout`, which keeps columns side by side, so a sentence in one column
// is interleaved with the other column's text line by line. We tolerate that by also
// matching the quote word by word, allowing a jump at the end of a column segment to
// the start of a segment on the next few lines. Words must still appear in order and
// in full; nothing is fuzzy.

import type { Citation, Statement } from "./types.ts";

/** Quotes shorter than this (after normalising) prove nothing, e.g. "2027". */
export const MIN_QUOTE_CHARS = 8;

/** Lower-case, straight quotes, plain hyphens, ligatures split, single spaces. */
export function normalise(text: string): string {
  return (
    joinBreakHyphens(baseNormalise(text))
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Everything except joining hyphenated words and collapsing whitespace, so callers can
// still see line breaks.
function baseNormalise(text: string): string {
  return text
    .normalize("NFKC") // ﬁ → fi, non-breaking and other odd spaces → space
    .replace(/­/g, "") // soft hyphen
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, "-")
    .replace(/…/g, "...")
    .replace(/\r\n?/g, "\n");
}

// "infra-\n   structure" → "infrastructure". Only when a lower-case letter follows, so
// "Phase 1-\nPhase 2" style breaks are left alone.
function joinBreakHyphens(text: string): string {
  return text.replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");
}

// Models sometimes wrap a quote in quote marks or end it with a full stop the page
// doesn't have at that point; neither changes what is being quoted.
function cleanQuote(q: string): string {
  return q.replace(/^["'\s]+|["'\s]+$/g, "").replace(/[.,;:]+$/, "").trim();
}

/** True if `quote` appears on `pageText` (see the header for what "appears" means). */
export function quoteOnPage(pageText: string, quote: string): boolean {
  const q = cleanQuote(normalise(quote));
  if (q.length < MIN_QUOTE_CHARS) return false;
  const page = normalise(pageText);
  if (page.includes(q)) return true;

  // Whitespace collapsed entirely: tolerates odd spacing from PDF extraction
  // ("T otal") and line-break hyphens in compound words ("long-\nterm").
  const squash = (s: string) => s.replace(/\s+/g, "");
  const qs = squash(q);
  if (squash(page).includes(qs)) return true;
  if (squash(baseNormalise(pageText).toLowerCase()).includes(qs)) return true;

  return matchAcrossColumns(pageText, q);
}

/** The check every statement goes through. */
export function verifyCitation(pages: string[], c: Citation): boolean {
  if (!Number.isInteger(c.page) || c.page < 1) return false;
  const page = pages[c.page - 1];
  if (typeof page !== "string" || typeof c.quote !== "string") return false;
  return quoteOnPage(page, c.quote);
}

/** Every page (1-based) of a source where the quote appears; used to tell a model where its quote really is. */
export function findQuotePages(pages: string[], quote: string): number[] {
  const found: number[] = [];
  pages.forEach((p, i) => {
    if (quoteOnPage(p, quote)) found.push(i + 1);
  });
  return found;
}

export interface StatementCheck {
  verified: boolean;
  problems: string[];
}

/**
 * Verified means at least one citation, and every citation found on its page. A
 * statement with no citations is never verified: "every" over nothing proves nothing.
 */
export function verifyStatement(
  pagesOf: (sourceId: string) => string[] | undefined,
  s: Pick<Statement, "citations">,
): StatementCheck {
  const problems: string[] = [];
  if (!s.citations || s.citations.length === 0) problems.push("no citations");
  for (const c of s.citations ?? []) {
    const pages = pagesOf(c.sourceId);
    if (!pages) problems.push(`unknown source "${c.sourceId}"`);
    else if (!verifyCitation(pages, c)) problems.push(`quote not found on ${c.sourceId} page ${c.page}`);
  }
  return { verified: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Column-aware word matching

interface Tok {
  w: string; // the word, normalised, without surrounding punctuation
  line: number;
  segStart: boolean; // first word on the line, or after a gap of 3+ spaces
  segEnd: boolean; // last word on the line, or before a gap of 3+ spaces
  hyphenEnd: boolean; // segment ends with "word-": hyphenated across a line
}

const COLUMN_GAP = 3; // pdftotext -layout separates columns by at least this many spaces
const MAX_LINE_JUMP = 3; // a sentence continues within the next few lines of its column

function wordKey(raw: string): string {
  return normalise(raw).replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, "");
}

function tokenise(pageText: string): Tok[] {
  const toks: Tok[] = [];
  baseNormalise(pageText)
    .split("\n")
    .forEach((line, li) => {
      const raw: { text: string; gapBefore: number }[] = [];
      let prevEnd = -Infinity;
      for (const m of line.matchAll(/\S+/g)) {
        raw.push({ text: m[0], gapBefore: m.index - prevEnd });
        prevEnd = m.index + m[0].length;
      }
      raw.forEach((r, i) => {
        const w = wordKey(r.text);
        if (!w) return; // bullets, lone dashes
        const segEnd = i === raw.length - 1 || raw[i + 1].gapBefore >= COLUMN_GAP;
        toks.push({
          w,
          line: li,
          segStart: i === 0 || r.gapBefore >= COLUMN_GAP,
          segEnd,
          hyphenEnd: segEnd && /\p{L}-$/u.test(r.text),
        });
      });
    });
  return toks;
}

function matchAcrossColumns(pageText: string, normalisedQuote: string): boolean {
  const q = normalisedQuote.split(" ").map(wordKey).filter(Boolean);
  if (q.length < 2) return false;
  const toks = tokenise(pageText);
  for (let p = 0; p < toks.length; p++) {
    if (matchAt(toks, q, p, 0)) return true;
  }
  return false;
}

// Segment starts on the next few lines after token p: where a column's text resumes.
function jumpTargets(toks: Tok[], p: number): number[] {
  const out: number[] = [];
  const line = toks[p].line;
  for (let t = p + 1; t < toks.length && toks[t].line <= line + MAX_LINE_JUMP; t++) {
    if (toks[t].segStart && toks[t].line > line) out.push(t);
  }
  return out;
}

// Can q[j..] be matched with q[j] at token p?
function matchAt(toks: Tok[], q: string[], p: number, j: number): boolean {
  const t = toks[p];
  if (!t) return false;
  if (t.w === q[j]) return j === q.length - 1 || follows(toks, q, p, j + 1);
  // "infra-" at the end of a column line, "structure" where the column resumes.
  if (t.hyphenEnd && q[j].length > t.w.length && q[j].startsWith(t.w)) {
    const rest = q[j].slice(t.w.length);
    for (const c of [p + 1, ...jumpTargets(toks, p)]) {
      if (toks[c]?.w === rest && (j === q.length - 1 || follows(toks, q, c, j + 1))) return true;
    }
  }
  return false;
}

// Does q[j] come right after token p, either next in line order or where the column resumes?
function follows(toks: Tok[], q: string[], p: number, j: number): boolean {
  if (matchAt(toks, q, p + 1, j)) return true;
  if (!toks[p].segEnd) return false;
  for (const c of jumpTargets(toks, p)) {
    if (c !== p + 1 && matchAt(toks, q, c, j)) return true;
  }
  return false;
}
