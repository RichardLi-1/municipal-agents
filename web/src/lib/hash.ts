import type { LogEntry } from "../../../shared/types.ts";

/** JSON with object keys sorted at every level and no whitespace. Undefined keys are left out. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function entryBody(e: Pick<LogEntry, "seq" | "at" | "actor" | "kind" | "decisionId" | "payload">) {
  return canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payload: e.payload });
}

export type ChainResult =
  | { ok: true; count: number }
  | { ok: false; count: number; brokenSeq: number; reason: string };

/** Re-check every hash in order of seq. */
export async function verifyChain(entries: LogEntry[]): Promise<ChainResult> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev: LogEntry | undefined;
  for (const e of sorted) {
    if (prev && e.prevHash !== prev.hash) {
      return { ok: false, count: sorted.length, brokenSeq: e.seq, reason: `Entry ${e.seq} does not point to entry ${prev.seq}.` };
    }
    const h = await sha256Hex(e.prevHash + entryBody(e));
    if (h !== e.hash) {
      return { ok: false, count: sorted.length, brokenSeq: e.seq, reason: `Entry ${e.seq} was changed after it was written.` };
    }
    prev = e;
  }
  return { ok: true, count: sorted.length };
}

/** Build hashes for entries (used by the sample data, so the sample chain checks out too). */
export async function chain(entries: Omit<LogEntry, "prevHash" | "hash">[]): Promise<LogEntry[]> {
  let prevHash = "0".repeat(64);
  const out: LogEntry[] = [];
  for (const e of entries) {
    const hash = await sha256Hex(prevHash + entryBody(e));
    out.push({ ...e, prevHash, hash });
    prevHash = hash;
  }
  return out;
}
