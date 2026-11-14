// Canonical JSON for the log's hash chain. No Node imports, so the browser can run the
// same rules; web/src/lib/hash.ts implements them too and canonical.test.ts checks the
// two agree on tricky payloads.
//
// Rules: object keys sorted by UTF-16 code unit order (Array.prototype.sort default),
// no whitespace, keys whose value is undefined are dropped, undefined in an array is
// null, strings and numbers exactly as JSON.stringify writes them. The string is built
// by hand rather than by JSON.stringify on a sorted object, because JS objects list
// integer-like keys ("9", "10") first whatever order they were inserted in.

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
}

/** The first entry's prevHash. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * The text that gets hashed: prevHash followed by the canonical entry header, which
 * carries the payload's own hash rather than the payload. So a payload can be purged
 * under a records retention by-law and the entry (and every later one) still verifies.
 */
export function hashInput(e: { seq: number; at: string; actor: string; kind: string; decisionId?: string; payloadHash: string; prevHash: string }): string {
  return e.prevHash + canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payloadHash: e.payloadHash });
}

/** What a payload hash covers: the canonical JSON of the payload (sha256 of this). */
export function payloadInput(payload: unknown): string {
  return canonicalJson(payload);
}

/** The hashing before payloads were hashed separately (log format 1), kept to migrate and to check legacy hashes. */
export function hashInputV1(e: { seq: number; at: string; actor: string; kind: string; decisionId?: string; payload: unknown; prevHash: string }): string {
  return e.prevHash + canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payload: e.payload });
}
