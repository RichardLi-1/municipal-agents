import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { syncCommittedData } from "./data.ts";

function write(file: string, text: string, mtime?: Date): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (mtime) fs.utimesSync(file, mtime, mtime);
}

test("boot mirror copies committed data, drops stale files, keeps uploads, and keeps the newer brief", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-sync-"));
  const app = path.join(root, "app");
  const vol = path.join(root, "vol");
  const old = new Date("2026-11-13T00:00:00Z");
  const newer = new Date("2026-11-14T00:00:00Z");
  write(path.join(app, "decisions/a.json"), '{"id":"a"}');
  write(path.join(app, "briefs/a.json"), "committed-old", old);
  write(path.join(app, "briefs/b.json"), "committed-new", newer);
  write(path.join(app, "log.db"), "never copied");
  write(path.join(vol, "decisions/gone.json"), "{}");
  write(path.join(vol, "decisions/upload-x.json"), "{}");
  write(path.join(vol, "briefs/a.json"), "staff-edited", newer);
  write(path.join(vol, "briefs/b.json"), "staff-edited-earlier", old);

  syncCommittedData(app, vol);
  const read = (p: string) => fs.readFileSync(path.join(vol, p), "utf8");
  assert.equal(read("decisions/a.json"), '{"id":"a"}');
  assert.equal(fs.existsSync(path.join(vol, "decisions/gone.json")), false);
  assert.equal(fs.existsSync(path.join(vol, "decisions/upload-x.json")), true);
  assert.equal(read("briefs/a.json"), "staff-edited");
  assert.equal(read("briefs/b.json"), "committed-new");
  assert.equal(fs.existsSync(path.join(vol, "log.db")), false);
});
