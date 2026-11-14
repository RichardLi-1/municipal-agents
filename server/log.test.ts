import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { canonicalJson, GENESIS_HASH } from "./canonical.ts";
import { entryHash, Log } from "./log.ts";

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
  assert.equal(b.hash, entryHash({ seq: b.seq, at: b.at, actor: b.actor, kind: b.kind, decisionId: "d1", payload: b.payload, prevHash: a.hash }));
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
});

test("tampering with a stored entry breaks verification", () => {
  const { log, file } = tempLog();
  log.append({ actor: "system", kind: "usage", payload: { costUsd: 0.01 } });
  log.append({ actor: "staff:ana", kind: "brief.published", decisionId: "d1", payload: { reviewer: "Ana" } });
  log.append({ actor: "system", kind: "usage", payload: { costUsd: 0.02 } });
  log.close();
  // Someone with file access drops the guard and rewrites history.
  const raw = new Log(file);
  raw.unsafeExec("DROP TRIGGER log_no_update; UPDATE log SET payload = '{\"reviewer\":\"Bob\"}' WHERE seq = 2;");
  const check = raw.verifyChain();
  assert.equal(check.intact, false);
  assert.equal(check.brokenAt, 2);
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
