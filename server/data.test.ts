import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Store, syncCommittedData } from "./data.ts";

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

test("city-wide lens files go to the decision whose decider they name", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-lens-"));
  const d = (id: string, decidedBy: string) => ({ id, decidedBy, title: "t", lenses: ["housing", "cost"], timeline: [] });
  write(path.join(root, "data/decisions/row-budget.json"), JSON.stringify(d("row-budget", "Regional Council, Region of Waterloo")));
  write(path.join(root, "data/decisions/kit-hub.json"), JSON.stringify(d("kit-hub", "City of Kitchener Committee of Adjustment")));
  write(path.join(root, "data/lenses/housing-kitchener.json"), '{"city":"kitchener"}');
  write(path.join(root, "data/lenses/housing-region.json"), '{"city":"region"}');
  write(path.join(root, "data/lenses/kit-hub.cost.json"), '{"asset":"hub"}');
  const store = new Store({ appRoot: root, dataDir: path.join(root, "data") });
  const lenses = (id: string) => store.lenses(store.decision(id)!) as Record<string, Record<string, string>>;
  assert.equal(lenses("row-budget").housing.city, "region");
  assert.equal(lenses("kit-hub").housing.city, "kitchener");
  assert.equal(lenses("kit-hub").cost.asset, "hub");
  assert.equal(lenses("row-budget").cost, undefined);
});

test("a render on the volume overrides the committed one with the same name", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-renders-"));
  write(path.join(root, "app/data/renders/a.png"), "committed");
  write(path.join(root, "app/data/renders/b.webp"), "committed");
  write(path.join(root, "vol/renders/a.png"), "runtime");
  const store = new Store({ appRoot: path.join(root, "app"), dataDir: path.join(root, "vol") });
  assert.equal(fs.readFileSync(store.renderPath("a.png")!, "utf8"), "runtime");
  assert.equal(fs.readFileSync(store.renderPath("b.webp")!, "utf8"), "committed");
  assert.equal(store.renderPath("a.gif"), undefined);
  assert.equal(store.renderPath("../a.png"), undefined);
});
