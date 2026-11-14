import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, GENESIS_HASH } from "./canonical.ts";
import { entryHash, legacyEntryHash, Log, payloadHash, sha256Hex } from "./log.ts";

function tempLog(): { log: Log; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ma-log-"));
  const file = path.join(dir, "log.db");
  return { log: new Log(file), file };
}

test("canonical JSON sorts keys at every depth and drops undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } }), '{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
});

test("entries chain from the genesis hash", () => {
  const { log } = tempLog();
  const a = log.append({ actor: "system", kind: "source.added", payload: { id: "x" } });
  const b = log.append({ actor: "visitor", kind: "question.asked", decisionId: "d1", payload: { question: "When?" } });
  assert.equal(a.seq, 1);
  assert.equal(a.prevHash, GENESIS_HASH);
  assert.equal(b.prevHash, a.hash);
  // The chain hashes the payload's own hash: sha256(canonical JSON of the payload).
  assert.equal(b.payloadHash, sha256Hex('{"question":"When?"}'));
  assert.equal(b.hash, entryHash({ seq: b.seq, at: b.at, actor: b.actor, kind: b.kind, decisionId: "d1", payloadHash: b.payloadHash!, prevHash: a.hash }));
  assert.equal(b.hash, sha256Hex(a.hash + canonicalJson({ seq: 2, at: b.at, actor: "visitor", kind: "question.asked", decisionId: "d1", payloadHash: b.payloadHash })));
  assert.deepEqual(log.verifyChain(), { intact: true, count: 2, headHash: b.hash });
});

test("list filters by decision and pages with after", () => {
  const { log } = tempLog();
  for (let i = 0; i < 5; i++) log.append({ actor: "system", kind: "usage", decisionId: i % 2 ? "odd" : "even", payload: { i } });
  assert.deepEqual(log.list({ decisionId: "odd" }).map((e) => e.seq), [2, 4]);
  assert.deepEqual(log.list({ after: 3 }).map((e) => e.seq), [4, 5]);
  assert.deepEqual(log.list({ limit: 2, order: "desc" }).map((e) => e.seq), [5, 4]);
});

test("updates and deletes are refused", () => {
  const { log } = tempLog();
  log.append({ actor: "system", kind: "usage", payload: { costUsd: 0.01 } });
  assert.throws(() => log.unsafeExec("UPDATE log SET actor = 'x'"), /append-only/);
  assert.throws(() => log.unsafeExec("DELETE FROM log"), /append-only/);
  // Content can't be rewritten or deleted either, only purged (see purge tests).
  assert.throws(() => log.unsafeExec(`UPDATE log_content SET payload = '{"costUsd":9}'`), /append-only/);
  assert.throws(() => log.unsafeExec("DELETE FROM log_content"), /append-only/);
});

test("tampering with a stored entry breaks verification", () => {
  const { log, file } = tempLog();
  log.append({ actor: "system", kind: "usage", payload: { costUsd: 0.01 } });
  log.append({ actor: "staff:ana", kind: "brief.published", decisionId: "d1", payload: { reviewer: "Ana" } });
  log.append({ actor: "system", kind: "usage", payload: { costUsd: 0.02 } });
  log.close();
  // Someone with file access drops the guard and rewrites history.
  const raw = new Log(file);
  raw.unsafeExec("DROP TRIGGER log_content_purge_only; UPDATE log_content SET payload = '{\"reviewer\":\"Bob\"}' WHERE seq = 2;");
  const check = raw.verifyChain();
  assert.equal(check.intact, false);
  assert.equal(check.brokenAt, 2);
  assert.match(check.reason ?? "", /content does not match/);
});

test("deleting an entry breaks verification", () => {
  const { log, file } = tempLog();
  for (let i = 0; i < 3; i++) log.append({ actor: "system", kind: "usage", payload: { i } });
  log.close();
  const raw = new Log(file);
  raw.unsafeExec("DROP TRIGGER log_no_delete; DELETE FROM log WHERE seq = 2;");
  assert.equal(raw.verifyChain().intact, false);
});

test("payloads are normalised to JSON before hashing", () => {
  const { log } = tempLog();
  log.append({ actor: "system", kind: "usage", payload: { when: new Date(0), skip: undefined, n: NaN } });
  assert.equal(log.verifyChain().intact, true);
});

test("a purged payload leaves a verifiable chain and a record of the purge", () => {
  const { log } = tempLog();
  log.append({ actor: "visitor", kind: "question.asked", decisionId: "d1", payload: { question: "I'm Jo at 12 Elm St: will my tax go up?" } });
  log.append({ actor: "agent:lead", kind: "answer.given", decisionId: "d1", payload: { text: "It may rise 4.9%." } });
  const before = log.list()[0];
  const { purged, record } = log.purge(1, { reason: "Retention period ended (By-law 2024-01, schedule B)", actor: "staff:ana", by: "Ana" });
  assert.equal(purged.payload, null);
  assert.equal(purged.hash, before.hash);
  assert.equal(purged.payloadHash, before.payloadHash);
  assert.deepEqual(purged.purged, { at: record.at, reason: "Retention period ended (By-law 2024-01, schedule B)", bySeq: 3 });
  assert.equal(record.kind, "record.purged");
  assert.equal(record.decisionId, "d1");
  assert.deepEqual(record.payload, { seq: 1, kind: "question.asked", payloadHash: before.payloadHash, reason: "Retention period ended (By-law 2024-01, schedule B)", by: "Ana" });
  assert.ok(!JSON.stringify(log.list()).includes("Elm St"), "the content is gone from the record");
  assert.deepEqual(log.verifyChain(), { intact: true, count: 3, headHash: record.hash, purged: 1 });
  assert.throws(() => log.purge(1, { reason: "again", actor: "staff" }), /already purged/);
  assert.throws(() => log.purge(3, { reason: "hide the purge", actor: "staff" }), /bookkeeping/);
  assert.throws(() => log.purge(99, { reason: "x", actor: "staff" }), /No entry 99/);
});

test("content removed without a purge record breaks verification", () => {
  const { log, file } = tempLog();
  for (let i = 0; i < 3; i++) log.append({ actor: "system", kind: "usage", payload: { i } });
  log.close();
  const raw = new Log(file);
  raw.unsafeExec("DROP TRIGGER log_content_purge_only; UPDATE log_content SET payload = NULL, purged_at = '2026-11-14', purged_by_seq = 3 WHERE seq = 2;");
  const check = raw.verifyChain();
  assert.equal(check.intact, false);
  assert.equal(check.brokenAt, 2);
  assert.match(check.reason ?? "", /without a record\.purged entry/);
});

/** A log file in format 1 (the payload hashed inside the entry), as written before payload hashing. */
function formatOneFile(entries: { actor: string; kind: string; decisionId?: string; payload: unknown }[]): { file: string; head: string } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ma-log-v1-")), "log.db");
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE log (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, decision_id TEXT,
    payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
    CREATE INDEX log_decision ON log (decision_id, seq);
    CREATE TRIGGER log_no_update BEFORE UPDATE ON log BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;
    CREATE TRIGGER log_no_delete BEFORE DELETE ON log BEGIN SELECT RAISE(ABORT, 'the log is append-only'); END;`);
  let prev = GENESIS_HASH;
  entries.forEach((e, i) => {
    const at = new Date(Date.UTC(2026, 10, 13, 12, i)).toISOString();
    const hash = legacyEntryHash({ seq: i + 1, at, actor: e.actor, kind: e.kind, decisionId: e.decisionId, payload: e.payload, prevHash: prev });
    db.prepare("INSERT INTO log VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(i + 1, at, e.actor, e.kind, e.decisionId ?? null, JSON.stringify(e.payload), prev, hash);
    prev = hash;
  });
  db.close();
  return { file, head: prev };
}

test("a format-1 log is migrated once: re-hashed with payload hashes, old hashes kept, migration on the record", () => {
  const { file, head } = formatOneFile([
    { actor: "system", kind: "source.added", payload: { id: "x" } },
    { actor: "visitor", kind: "question.asked", decisionId: "d1", payload: { question: "When?" } },
    { actor: "system", kind: "usage", decisionId: "d1", payload: { costUsd: 0.25 } },
  ]);
  const log = new Log(file);
  assert.equal(log.migrated?.entries, 3);
  assert.equal(log.migrated?.legacyHeadHash, head);
  const entries = log.list();
  assert.equal(entries.length, 4);
  assert.equal(entries[1].legacyHash, legacyEntryHash({ ...entries[1], prevHash: entries[0].legacyHash! }));
  assert.equal(entries[1].payloadHash, payloadHash({ question: "When?" }));
  assert.deepEqual(entries[1].payload, { question: "When?" });
  const mig = entries[3];
  assert.equal(mig.kind, "record.migrated");
  assert.equal((mig.payload as { legacyHeadHash: string }).legacyHeadHash, head);
  assert.equal((mig.payload as { headHash: string }).headHash, entries[2].hash);
  assert.equal(log.verifyChain().intact, true);
  assert.equal(log.usagePayloads().length, 1, "usage still reads the moved content");
  // Migrated entries can be purged like any other, and the triggers are in place.
  log.purge(2, { reason: "Retention ended", actor: "staff" });
  assert.equal(log.verifyChain().intact, true);
  assert.throws(() => log.unsafeExec("DELETE FROM log"), /append-only/);
  log.close();
  // Opening again doesn't migrate twice.
  const again = new Log(file);
  assert.equal(again.migrated, undefined);
  assert.equal(again.count(), 5);
  assert.equal(again.verifyChain().intact, true);
});

test("a broken format-1 chain is not migrated", () => {
  const { file } = formatOneFile([
    { actor: "system", kind: "usage", payload: { i: 1 } },
    { actor: "system", kind: "usage", payload: { i: 2 } },
  ]);
  const db = new DatabaseSync(file);
  db.exec(`DROP TRIGGER log_no_update; UPDATE log SET payload = '{"i":9}' WHERE seq = 2;`);
  db.close();
  assert.throws(() => new Log(file), /format-1 chain is broken at entry 2/);
  // Nothing changed: the file is still format 1.
  const check = new DatabaseSync(file);
  assert.ok((check.prepare("PRAGMA table_info(log)").all() as { name: string }[]).some((c) => c.name === "payload"));
  check.close();
});
