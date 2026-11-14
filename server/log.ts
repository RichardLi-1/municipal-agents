// The public record: an append-only SQLite table where each entry's hash covers the
// previous entry's hash, so changing or deleting any past entry breaks every hash
// after it. Triggers refuse UPDATE and DELETE; verifyChain() catches anyone who goes
// around them by editing the file directly.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LogEntry } from "../shared/types.ts";
import { GENESIS_HASH, hashInput } from "./canonical.ts";

export type LogInput = { actor: string; kind: LogEntry["kind"]; decisionId?: string; payload: unknown };

type Row = {
  seq: number;
  at: string;
  actor: string;
  kind: string;
  decision_id: string | null;
  payload: string;
  prev_hash: string;
  hash: string;
};

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function entryHash(e: Omit<LogEntry, "hash">): string {
  return sha256Hex(hashInput(e));
}

function fromRow(r: Row): LogEntry {
  const e: LogEntry = {
    seq: Number(r.seq),
    at: r.at,
    actor: r.actor,
    kind: r.kind as LogEntry["kind"],
    payload: JSON.parse(r.payload),
    prevHash: r.prev_hash,
    hash: r.hash,
  };
  if (r.decision_id != null) e.decisionId = r.decision_id;
  return e;
}

export interface ChainCheck {
  intact: boolean;
  count: number;
  headHash: string;
  /** The first entry whose hash or link doesn't match, if any. */
  brokenAt?: number;
  reason?: string;
}

export class Log {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS log (
        seq INTEGER PRIMARY KEY,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        kind TEXT NOT NULL,
        decision_id TEXT,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS log_decision ON log (decision_id, seq);
      CREATE INDEX IF NOT EXISTS log_kind ON log (kind, at);
      CREATE TRIGGER IF NOT EXISTS log_no_update BEFORE UPDATE ON log
        BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS log_no_delete BEFORE DELETE ON log
        BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
    `);
  }

  append(input: LogInput): LogEntry {
    // Round-trip through JSON first so the hashed payload is exactly what we store
    // and what a verifier will read back (no Dates, undefineds or NaNs).
    const payload = JSON.parse(JSON.stringify(input.payload ?? null));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const last = this.db.prepare("SELECT seq, hash FROM log ORDER BY seq DESC LIMIT 1").get() as
        | { seq: number; hash: string }
        | undefined;
      const body: Omit<LogEntry, "hash"> = {
        seq: last ? Number(last.seq) + 1 : 1,
        at: new Date().toISOString(),
        actor: input.actor,
        kind: input.kind,
        payload,
        prevHash: last ? last.hash : GENESIS_HASH,
      };
      if (input.decisionId) body.decisionId = input.decisionId;
      const entry: LogEntry = { ...body, hash: entryHash(body) };
      this.db
        .prepare(
          "INSERT INTO log (seq, at, actor, kind, decision_id, payload, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(entry.seq, entry.at, entry.actor, entry.kind, entry.decisionId ?? null, JSON.stringify(payload), entry.prevHash, entry.hash);
      this.db.exec("COMMIT");
      return entry;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Entries in seq order (or newest first with order "desc"), filtered and paged. */
  list(opts: { decisionId?: string; kind?: string; after?: number; before?: number; limit?: number; order?: "asc" | "desc" } = {}): LogEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.decisionId) (where.push("decision_id = ?"), args.push(opts.decisionId));
    if (opts.kind) (where.push("kind = ?"), args.push(opts.kind));
    if (opts.after != null) (where.push("seq > ?"), args.push(opts.after));
    if (opts.before != null) (where.push("seq < ?"), args.push(opts.before));
    const limit = Math.max(1, Math.min(opts.limit ?? 1000, 10_000));
    const sql =
      `SELECT * FROM log ${where.length ? "WHERE " + where.join(" AND ") : ""} ` +
      `ORDER BY seq ${opts.order === "desc" ? "DESC" : "ASC"} LIMIT ${limit}`;
    return (this.db.prepare(sql).all(...args) as Row[]).map(fromRow);
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM log").get() as { n: number }).n);
  }

  /** Recompute every hash from the start. O(n), fine for the sizes we expect. */
  verifyChain(): ChainCheck {
    let prev = GENESIS_HASH;
    let expectSeq = 1;
    let count = 0;
    for (const row of this.db.prepare("SELECT * FROM log ORDER BY seq ASC").iterate() as Iterable<Row>) {
      const e = fromRow(row);
      count++;
      if (e.seq !== expectSeq) return { intact: false, count, headHash: prev, brokenAt: e.seq, reason: `missing entry before ${e.seq}` };
      if (e.prevHash !== prev) return { intact: false, count, headHash: prev, brokenAt: e.seq, reason: "prevHash does not match the previous entry" };
      const { hash, ...body } = e;
      if (entryHash(body) !== hash) return { intact: false, count, headHash: prev, brokenAt: e.seq, reason: "hash does not match the entry's contents" };
      prev = hash;
      expectSeq++;
    }
    return { intact: true, count, headHash: prev };
  }

  /** Payloads of `usage` entries since an instant (ISO, UTC). */
  usagePayloads(sinceIso?: string): { at: string; payload: unknown }[] {
    const rows = sinceIso
      ? this.db.prepare("SELECT at, payload FROM log WHERE kind = 'usage' AND at >= ? ORDER BY seq").all(sinceIso)
      : this.db.prepare("SELECT at, payload FROM log WHERE kind = 'usage' ORDER BY seq").all();
    return (rows as { at: string; payload: string }[]).map((r) => ({ at: r.at, payload: JSON.parse(r.payload) }));
  }

  /** For tests and the tamper demo only: run raw SQL against the file. */
  unsafeExec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
