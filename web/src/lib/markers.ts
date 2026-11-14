/**
 * Answer text marks its sources in brackets: [2] is the 2nd statement, [C1] the 1st computed
 * figure, [s12] a statement by id. The agents also group them: [2, 3], [2,3], [1, C2], [2-4].
 * This splits text into plain strings and one reference per source, so no bracket is left
 * on screen. Brackets that aren't markers (e.g. "[sic]") stay as text.
 */
export type Ref = { ref: "statement"; index: number } | { ref: "figure"; index: number } | { ref: "id"; id: string };
export type Part = string | Ref;

const BRACKET = /\[([^[\]]{1,80})\]/g;
const MAX_RANGE = 30;

function token(tok: string, knownIds: Set<string>): Ref[] | null {
  const t = tok.trim();
  if (!t) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)$/.exec(t))) return [{ ref: "statement", index: Number(m[1]) }];
  if ((m = /^c(\d+)$/i.exec(t))) return [{ ref: "figure", index: Number(m[1]) }];
  if ((m = /^(c?)(\d+)\s*[-–—]\s*(c?)(\d+)$/i.exec(t))) {
    const fig = !!m[1];
    if (fig !== !!m[3] && m[3]) return null; // "C1-2" is fine, "1-C2" is not
    const a = Number(m[2]);
    const b = Number(m[4]);
    if (b < a || b - a > MAX_RANGE) return null;
    const out: Ref[] = [];
    for (let i = a; i <= b; i++) out.push(fig ? { ref: "figure", index: i } : { ref: "statement", index: i });
    return out;
  }
  if (knownIds.has(t)) return [{ ref: "id", id: t }];
  return null;
}

export function parseMarkers(text: string, knownIds: Set<string> = new Set()): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(BRACKET)) {
    const refs: Ref[] = [];
    let ok = true;
    for (const tok of m[1].split(/[,;]/)) {
      const r = token(tok, knownIds);
      if (!r) {
        ok = false;
        break;
      }
      refs.push(...r);
    }
    if (!ok || !refs.length) continue;
    // Drop the space before a marker so chips sit next to the word they follow.
    const before = text.slice(last, m.index).replace(/\s+$/, (sp) => (refs.length ? "" : sp));
    if (before) parts.push(before);
    parts.push(...refs);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
