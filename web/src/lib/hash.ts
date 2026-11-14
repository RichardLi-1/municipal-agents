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

/**
 * What each entry's hash covers: its header and its payload's own hash, not the payload.
 * So content purged under a records retention by-law leaves the chain verifiable.
 */
export function entryBody(e: Pick<LogEntry, "seq" | "at" | "actor" | "kind" | "decisionId"> & { payloadHash: string }) {
  return canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payloadHash: e.payloadHash });
}

export type ChainResult =
  | { ok: true; count: number }
  | { ok: false; count: number; brokenSeq: number; reason: string };

/**
 * Re-check every hash in order of seq. Content must match its payload hash; content
 * that's gone must be named, with the same payload hash, by a later record.purged entry.
 */
export async function verifyChain(entries: LogEntry[]): Promise<ChainResult> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const purges = new Map<number, string>();
  for (const e of sorted) {
    const p = e.kind === "record.purged" ? (e.payload as { seq?: number; payloadHash?: string } | null) : null;
    if (p && typeof p.seq === "number" && typeof p.payloadHash === "string") purges.set(p.seq, p.payloadHash);
  }
  let prev: LogEntry | undefined;
  for (const e of sorted) {
    const broken = (reason: string): ChainResult => ({ ok: false, count: sorted.length, brokenSeq: e.seq, reason });
    if (prev && e.prevHash !== prev.hash) return broken(`Entry ${e.seq} does not point to entry ${prev.seq}.`);
    const payloadHash = e.payloadHash ?? "";
    if (e.purged) {
      if (purges.get(e.seq) !== payloadHash) return broken(`Entry ${e.seq}'s content was removed without a purge record.`);
    } else if ((await sha256Hex(canonicalJson(e.payload))) !== payloadHash) {
      return broken(`Entry ${e.seq} was changed after it was written.`);
    }
    if ((await sha256Hex(e.prevHash + entryBody({ ...e, payloadHash }))) !== e.hash) return broken(`Entry ${e.seq} was changed after it was written.`);
    prev = e;
  }
  return { ok: true, count: sorted.length };
}

/** Build hashes for entries (used by the sample data, so the sample chain checks out too). */
export async function chain(entries: Omit<LogEntry, "prevHash" | "hash" | "payloadHash">[]): Promise<LogEntry[]> {
  let prevHash = "0".repeat(64);
  const out: LogEntry[] = [];
  for (const e of entries) {
    const payloadHash = await sha256Hex(canonicalJson(e.payload));
    const hash = await sha256Hex(prevHash + entryBody({ ...e, payloadHash }));
    out.push({ ...e, payloadHash, prevHash, hash });
    prevHash = hash;
  }
  return out;
}
