import { test } from "node:test";
import assert from "node:assert/strict";
import { listSkills, loadRules, parseSkill } from "./skills.ts";
import { TOOLS } from "./tools.ts";

test("front matter is parsed: name, description, tools", () => {
  const s = parseSkill("---\nname: demo\ndescription: Does a thing\ntools: [search_pages, read_page]\n---\n\n# Body\nText");
  assert.deepEqual(s, { name: "demo", description: "Does a thing", tools: ["search_pages", "read_page"], body: "# Body\nText" });
  assert.deepEqual(parseSkill("---\nname: x\ntools: a, b\n---\nbody").tools, ["a", "b"]);
});

test("every skill loads, and every tool it names exists", () => {
  const skills = listSkills();
  for (const name of ["commitments", "explainer", "housing-pipeline", "lifecycle-cost", "transit-access", "translator"])
    assert.ok(skills.some((s) => s.name === name), name);
  for (const s of skills) {
    assert.ok(s.description.length > 20, s.name);
    assert.ok(s.body.length > 200, s.name);
    for (const t of s.tools) assert.ok(TOOLS[t], `${s.name} names unknown tool ${t}`);
  }
  assert.match(loadRules(), /Never decide, never persuade/);
});
