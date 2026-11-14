// The public record: an append-only SQLite table where each entry's hash covers the
// previous entry's hash, so changing or deleting any past entry breaks every hash
// after it. Triggers refuse UPDATE and DELETE; verifyChain() catches anyone who goes
// around them by editing the file directly.
//
// Records retention. A municipality may have to destroy a record once its retention
// period under the records retention by-law ends (Municipal Act, 2001, s. 255), and an
// append-only record can't delete anything. So each entry's content (its payload) lives
// in a separate table and the chain hashes the payload's own sha256 instead:
//
//   hash        = sha256(prevHash + canonical JSON of {seq, at, actor, kind, decisionId, payloadHash})
//   payloadHash = sha256(canonical JSON of payload)
//
// Staff can purge a payload (purge()): the content is removed, a `record.purged` entry
// saying which entry, why and by whom is appended to the chain, and the purged entry
// keeps its header and payloadHash, so the whole chain still verifies. Content that is
// missing without a matching `record.purged` entry, or that doesn't match its hash,
// fails verification.
//
// Format 1 (before this) hashed the payload itself. A format-1 file is migrated once at
// start: its chain is verified, every entry is re-hashed in format 2 with its old hash
// kept as `legacyHash`, and a `record.migrated` entry records the old and new heads.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LogEntry } from "../shared/types.ts";
import { GENESIS_HASH, hashInput, hashInputV1, payloadInput } from "./canonical.ts";

export type LogInput = { actor: string; kind: LogEntry["kind"]; decisionId?: string; payload: unknown };

const FORMAT = 2;

/** Entries whose content can't be purged: the record's own bookkeeping. */
export const UNPURGEABLE: LogEntry["kind"][] = ["record.purged", "record.migrated"];

type Row = {
  seq: number;
  at: string;
  actor: string;
  kind: string;
  decision_id: string | null;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  legacy_hash: string | null;
  payload: string | null;
  purged_at: string | null;
  purged_reason: string | null;
  purged_by_seq: number | null;
};

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function payloadHash(payload: unknown): string {
  return sha256Hex(payloadInput(payload));
}

export function entryHash(e: { seq: number; at: string; actor: string; kind: string; decisionId?: string; payloadHash: string; prevHash: string }): string {
  return sha256Hex(hashInput(e));
}

function fromRow(r: Row): LogEntry {
  const e: LogEntry = {
    seq: Number(r.seq),
    at: r.at,
    actor: r.actor,
    kind: r.kind as LogEntry["kind"],
    payload: r.payload == null ? null : JSON.parse(r.payload),
    payloadHash: r.payload_hash,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
  if (r.decision_id != null) e.decisionId = r.decision_id;
  if (r.purged_at) e.purged = { at: r.purged_at, reason: r.purged_reason ?? "", bySeq: Number(r.purged_by_seq) };
  if (r.legacy_hash) e.legacyHash = r.legacy_hash;
  return e;
}

export interface ChainCheck {
  intact: boolean;
  count: number;
  headHash: string;
  /** Entries whose content was purged under the retention by-law (each with its record.purged entry). */
  purged?: number;
  /** The first entry whose hash or link doesn't match. */
  brokenAt?: number;
  reason?: string;
}

const SELECT = `SELECT l.seq, l.at, l.actor, l.kind, l.decision_id, l.payload_hash, l.prev_hash, l.hash, l.legacy_hash,
  c.payload, c.purged_at, c.purged_reason, c.purged_by_seq
  FROM log l LEFT JOIN log_content c ON c.seq = l.seq`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS log (
    seq INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    decision_id TEXT,
    payload_hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    legacy_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS log_content (
    seq INTEGER PRIMARY KEY,
    payload TEXT,
    purged_at TEXT,
    purged_reason TEXT,
    purged_by_seq INTEGER
  );
  CREATE INDEX IF NOT EXISTS log_decision ON log (decision_id, seq);
  CREATE INDEX IF NOT EXISTS log_kind ON log (kind, at);
  CREATE TRIGGER IF NOT EXISTS log_no_update BEFORE UPDATE ON log
    BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS log_no_delete BEFORE DELETE ON log
    BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS log_content_no_delete BEFORE DELETE ON log_content
    BEGIN SELECT RAISE(ABORT, 'the log is append-only: content can only be purged'); END;
  CREATE TRIGGER IF NOT EXISTS log_content_purge_only BEFORE UPDATE ON log_content
    WHEN NOT (OLD.payload IS NOT NULL AND OLD.purged_at IS NULL AND NEW.payload IS NULL AND NEW.purged_at IS NOT NULL
              AND NEW.purged_by_seq IS NOT NULL AND NEW.seq = OLD.seq)
    BEGIN SELECT RAISE(ABORT, 'the log is append-only: content can only be purged'); END;
`;

export class Log {
  private db: DatabaseSync;
  /** Set when this file was migrated from format 1 at open. */
  migrated?: { entries: number; legacyHeadHash: string; headHash: string };

  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    const cols = (this.db.prepare("PRAGMA table_info(log)").all() as { name: string }[]).map((c) => c.name);
    if (cols.includes("payload") && !cols.includes("payload_hash")) this.migrateFromV1();
    else this.db.exec(SCHEMA + `PRAGMA user_version = ${FORMAT};`);
  }

  /**
   * Format 1 to 2, in one transaction: check the old chain end to end (a broken one is
   * not migrated: that would launder tampering), re-hash every entry with its payload
   * hash, keep the old hash, then record the migration itself on the chain.
   */
  private migrateFromV1(): void {
    type V1 = { seq: number; at: string; actor: string; kind: string; decision_id: string | null; payload: string; prev_hash: string; hash: string };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = this.db.prepare("SELECT * FROM log ORDER BY seq ASC").all() as V1[];
      let prev = GENESIS_HASH;
      rows.forEach((r, i) => {
        const body = { seq: Number(r.seq), at: r.at, actor: r.actor, kind: r.kind, decisionId: r.decision_id ?? undefined, payload: JSON.parse(r.payload), prevHash: r.prev_hash };
        if (body.seq !== i + 1 || r.prev_hash !== prev || sha256Hex(hashInputV1(body)) !== r.hash) {
          throw new Error(`log: the format-1 chain is broken at entry ${r.seq}; not migrating. Investigate before starting the service.`);
        }
        prev = r.hash;
      });
      const legacyHeadHash = prev;
      // DROP takes the old table's triggers and indexes with it; the rows are in memory.
      this.db.exec("DROP TABLE log;" + SCHEMA);
      const insLog = this.db.prepare(
        "INSERT INTO log (seq, at, actor, kind, decision_id, payload_hash, prev_hash, hash, legacy_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const insContent = this.db.prepare("INSERT INTO log_content (seq, payload) VALUES (?, ?)");
      let head = GENESIS_HASH;
      for (const r of rows) {
        const ph = payloadHash(JSON.parse(r.payload));
        const hash = entryHash({ seq: Number(r.seq), at: r.at, actor: r.actor, kind: r.kind, decisionId: r.decision_id ?? undefined, payloadHash: ph, prevHash: head });
        insLog.run(r.seq, r.at, r.actor, r.kind, r.decision_id, ph, head, hash, r.hash);
        insContent.run(r.seq, r.payload);
        head = hash;
      }
      this.db.exec(`PRAGMA user_version = ${FORMAT}`);
      if (rows.length) {
        this.appendInTx({
          actor: "system",
          kind: "record.migrated",
          payload: {
            from: 1,
            to: FORMAT,
            entries: rows.length,
            legacyHeadHash,
            headHash: head,
            why: "Content is stored apart from the chain so it can be purged when its retention period ends; each entry now hashes its payload's sha256. Each migrated entry keeps its old hash as legacyHash.",
          },
        });
      }
      this.db.exec("COMMIT");
      this.migrated = { entries: rows.length, legacyHeadHash, headHash: head };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  append(input: LogInput): LogEntry {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const entry = this.appendInTx(input);
      this.db.exec("COMMIT");
      return entry;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private appendInTx(input: LogInput): LogEntry {
    // Round-trip through JSON first so the hashed payload is exactly what we store
    // and what a verifier will read back (no Dates, undefineds or NaNs).
    const payload = JSON.parse(JSON.stringify(input.payload ?? null));
    const last = this.db.prepare("SELECT seq, hash FROM log ORDER BY seq DESC LIMIT 1").get() as { seq: number; hash: string } | undefined;
    const seq = last ? Number(last.seq) + 1 : 1;
    const prevHash = last ? last.hash : GENESIS_HASH;
    const at = new Date().toISOString();
    const ph = payloadHash(payload);
    const hash = entryHash({ seq, at, actor: input.actor, kind: input.kind, decisionId: input.decisionId, payloadHash: ph, prevHash });
    this.db
      .prepare("INSERT INTO log (seq, at, actor, kind, decision_id, payload_hash, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(seq, at, input.actor, input.kind, input.decisionId ?? null, ph, prevHash, hash);
    this.db.prepare("INSERT INTO log_content (seq, payload) VALUES (?, ?)").run(seq, JSON.stringify(payload));
    const entry: LogEntry = { seq, at, actor: input.actor, kind: input.kind, payload, payloadHash: ph, prevHash, hash };
    if (input.decisionId) entry.decisionId = input.decisionId;
    return entry;
  }

  /** One entry, or undefined. */
  get(seq: number): LogEntry | undefined {
    const r = this.db.prepare(`${SELECT} WHERE l.seq = ?`).get(seq) as Row | undefined;
    return r ? fromRow(r) : undefined;
  }

  /**
   * Remove one entry's content under the records retention by-law. Appends a
   * `record.purged` entry (which entry, its payload hash, why, by whom) and blanks the
   * content in the same transaction. The purged entry keeps its header and payload hash.
   */
  purge(seq: number, opts: { reason: string; actor: string; by?: string; also?: Record<string, unknown> }): { purged: LogEntry; record: LogEntry } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const target = this.get(seq);
      if (!target) throw new PurgeError(404, `No entry ${seq} in the record.`);
      if (target.purged) throw new PurgeError(409, `Entry ${seq}'s content was already purged on ${target.purged.at.slice(0, 10)}.`);
      if (UNPURGEABLE.includes(target.kind)) throw new PurgeError(409, `Entry ${seq} is a ${target.kind} entry: the record's own bookkeeping is kept.`);
      const record = this.appendInTx({
        actor: opts.actor,
        kind: "record.purged",
        decisionId: target.decisionId,
        payload: { seq, kind: target.kind, payloadHash: target.payloadHash, reason: opts.reason, ...(opts.by ? { by: opts.by } : {}), ...(opts.also ?? {}) },
      });
      const changed = this.db
        .prepare("UPDATE log_content SET payload = NULL, purged_at = ?, purged_reason = ?, purged_by_seq = ? WHERE seq = ?")
        .run(record.at, opts.reason, record.seq, seq);
      if (Number(changed.changes) !== 1) throw new PurgeError(409, `Entry ${seq} has no content to purge.`);
      this.db.exec("COMMIT");
      return { purged: this.get(seq)!, record };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Entries in seq order (or newest first with order "desc"), filtered and paged. */
  list(opts: { decisionId?: string; kind?: string; after?: number; before?: number; limit?: number; order?: "asc" | "desc" } = {}): LogEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (opts.decisionId) (where.push("l.decision_id = ?"), args.push(opts.decisionId));
    if (opts.kind) (where.push("l.kind = ?"), args.push(opts.kind));
    if (opts.after != null) (where.push("l.seq > ?"), args.push(opts.after));
    if (opts.before != null) (where.push("l.seq < ?"), args.push(opts.before));
    const limit = Math.max(1, Math.min(opts.limit ?? 1000, 10_000));
    const sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY l.seq ${opts.order === "desc" ? "DESC" : "ASC"} LIMIT ${limit}`;
    return (this.db.prepare(sql).all(...args) as Row[]).map(fromRow);
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM log").get() as { n: number }).n);
  }

  /**
   * Recompute every hash from the start. O(n), fine for the sizes we expect. Content
   * must match its payload hash; content that is gone must have a record.purged entry
   * naming that entry and that payload hash.
   */
  verifyChain(): ChainCheck {
    const purges = new Map<number, string>();
    for (const r of this.db.prepare(`${SELECT} WHERE l.kind = 'record.purged'`).all() as Row[]) {
      try {
        const p = JSON.parse(r.payload ?? "null") as { seq?: number; payloadHash?: string } | null;
        if (p && typeof p.seq === "number" && typeof p.payloadHash === "string") purges.set(p.seq, p.payloadHash);
      } catch {}
    }
    let prev = GENESIS_HASH;
    let expectSeq = 1;
    let count = 0;
    let purged = 0;
    for (const r of this.db.prepare(`${SELECT} ORDER BY l.seq ASC`).iterate() as Iterable<Row>) {
      const e = fromRow(r);
      count++;
      const broken = (reason: string): ChainCheck => ({ intact: false, count, headHash: prev, brokenAt: e.seq, reason });
      if (e.seq !== expectSeq) return broken(`missing entry before ${e.seq}`);
      if (e.prevHash !== prev) return broken("prevHash does not match the previous entry");
      if (entryHash({ ...e, payloadHash: r.payload_hash }) !== e.hash) return broken("hash does not match the entry's header");
      if (r.payload != null) {
        if (sha256Hex(payloadInput(JSON.parse(r.payload))) !== r.payload_hash) return broken("content does not match its payload hash");
      } else if (purges.get(e.seq) === r.payload_hash) {
        purged++;
      } else {
        return broken("content was removed without a record.purged entry");
      }
      prev = e.hash;
      expectSeq++;
    }
    return { intact: true, count, headHash: prev, ...(purged ? { purged } : {}) };
  }

  /** Payloads of `usage` entries since an instant (ISO, UTC). Purged ones are skipped. */
  usagePayloads(sinceIso?: string): { at: string; payload: unknown }[] {
    const base = "SELECT l.at, c.payload FROM log l JOIN log_content c ON c.seq = l.seq WHERE l.kind = 'usage' AND c.payload IS NOT NULL";
    const rows = sinceIso ? this.db.prepare(`${base} AND l.at >= ? ORDER BY l.seq`).all(sinceIso) : this.db.prepare(`${base} ORDER BY l.seq`).all();
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

export class PurgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The canonical JSON a format-1 hash covered (exported for the legacy-hash check in tests and docs). */
export function legacyEntryHash(e: { seq: number; at: string; actor: string; kind: string; decisionId?: string; payload: unknown; prevHash: string }): string {
  return sha256Hex(hashInputV1(e));
}
