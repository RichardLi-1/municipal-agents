import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Log } from "./log.ts";
import { GRID_G_CO2E_PER_KWH, readUsage, summarise, WH_PER_INPUT_TOKEN, WH_PER_OUTPUT_TOKEN } from "./usage.ts";

test("usage payloads in Gemini's naming count thinking as output", () => {
  const u = readUsage({ model: "m", promptTokens: 100, candidatesTokens: 20, thoughtsTokens: 5, costUsd: 0.01 });
  assert.deepEqual(u, { model: "m", calls: 1, inputTokens: 100, outputTokens: 25, costUsd: 0.01 });
});

test("the summary adds up spend, tokens and the energy estimate by model", () => {
  const log = new Log(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ma-usage-")), "log.db"));
  log.append({ actor: "agent:lead", kind: "usage", payload: { model: "a", inputTokens: 1000, outputTokens: 100, costUsd: 0.1 } });
  log.append({ actor: "agent:lead", kind: "usage", payload: { model: "b", inputTokens: 2000, outputTokens: 200, costUsd: 0.2 } });
  log.append({ actor: "visitor", kind: "question.asked", payload: { question: "ignored" } });
  const s = summarise(log, 5);
  assert.equal(s.calls, 2);
  assert.equal(s.costUsd, 0.3);
  assert.equal(s.today.costUsd, 0.3);
  assert.equal(s.byModel.b.inputTokens, 2000);
  const wh = 3000 * WH_PER_INPUT_TOKEN + 300 * WH_PER_OUTPUT_TOKEN;
  assert.equal(s.energyWh, Math.round(wh * 1000) / 1000);
  assert.ok(Math.abs(s.co2eGrams - (wh / 1000) * GRID_G_CO2E_PER_KWH) < 1e-4);
});
