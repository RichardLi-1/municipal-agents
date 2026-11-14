// Canonical JSON for the log's hash chain. No Node imports, so the web app can import
// this same function to check the chain in the browser.
//
// Rules: object keys sorted by UTF-16 code unit order (Array.prototype.sort default),
// no whitespace, keys whose value is undefined are dropped (as JSON.stringify does),
// arrays keep their order, numbers and strings as JSON.stringify writes them.

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? "null";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** The first entry's prevHash. */
export const GENESIS_HASH = "0".repeat(64);

/** The text that gets hashed: prevHash followed by the canonical entry body. */
export function hashInput(e: {
  seq: number;
  at: string;
  actor: string;
  kind: string;
  decisionId?: string;
  payload: unknown;
  prevHash: string;
}): string {
  return e.prevHash + canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payload: e.payload });
}
