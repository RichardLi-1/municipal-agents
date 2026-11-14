// The OpenAPI description covers every route the server registers, and its schemas
// match shared/types.ts (regenerated here and compared with the committed file).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generateSchemas, OUT, render } from "../scripts/openapi-schemas.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { buildOpenApi, openApiPath } from "./openapi.ts";
import { buildRouter } from "./server.ts";

test("every registered route is in /api/openapi.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-openapi-"));
  const app = createApp(loadConfig({ APP_ROOT: root }));
  const doc = buildOpenApi("https://example.org") as { paths: Record<string, Record<string, unknown>> };
  const routes = buildRouter(app).list();
  assert.ok(routes.length >= 25);
  const missing = routes.filter((r) => !doc.paths[openApiPath(r.pattern)]?.[r.method.toLowerCase()]).map((r) => `${r.method} ${r.pattern}`);
  assert.deepEqual(missing, [], `document these routes in server/openapi.ts: ${missing.join(", ")}`);
  // And nothing documented that the server doesn't have.
  const registered = new Set(routes.map((r) => `${r.method.toLowerCase()} ${openApiPath(r.pattern)}`));
  const extra = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)).filter((k) => !registered.has(k));
  assert.deepEqual(extra, []);
  app.log.close();
});

test("every $ref points at a schema that exists", () => {
  const doc = buildOpenApi() as { components: { schemas: Record<string, unknown> } };
  const refs = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) k === "$ref" ? refs.add(String(x)) : walk(x);
  };
  walk(doc);
  for (const r of refs) {
    const parts = r.replace(/^#\//, "").split("/");
    let node: unknown = doc;
    for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
    assert.ok(node, `dangling $ref ${r}`);
  }
  assert.equal((doc as { openapi?: string }).openapi, "3.1.0");
});

test("the schemas are generated from shared/types.ts and up to date", () => {
  const fresh = render(generateSchemas());
  assert.equal(fs.readFileSync(OUT, "utf8"), fresh, "run: node scripts/openapi-schemas.ts");
  const schemas = JSON.parse(fresh);
  for (const name of ["Decision", "Brief", "Statement", "AgentEvent", "DecisionCard", "LogEntry", "UsageSummary", "ConstructionLens"]) assert.ok(schemas[name], name);
  const events = schemas.AgentEvent.oneOf.map((s: { properties: { type: { const: string } } }) => s.properties.type.const);
  assert.deepEqual(events, ["plan", "step.start", "tool", "statement", "step.end", "answer", "brief", "usage", "error", "done"]);
});
