// Skills are plain Markdown files a non-programmer can read and edit:
// agents/skills/<name>/SKILL.md, with a small front matter (name, description, tools)
// and a body that becomes part of the specialist's instructions. RULES.md holds the
// rules every specialist follows. They are read at runtime, so editing one changes the
// agents' behaviour without touching code.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Skill {
  name: string;
  description: string;
  tools: string[];
  body: string;
}

export const SKILLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "skills");

/** Parses `key: value` front matter; `tools` may be `[a, b]` or `a, b`. */
export function parseSkill(text: string, fallbackName = ""): Skill {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
  }
  const list = (v = "") =>
    v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return {
    name: meta.name || fallbackName,
    description: meta.description ?? "",
    tools: list(meta.tools),
    body: (m ? m[2] : text).trim(),
  };
}

const cache = new Map<string, Skill>();

export function loadSkill(name: string, dir = SKILLS_DIR): Skill {
  const key = `${dir}:${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad skill name "${name}"`);
  const skill = parseSkill(fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8"), name);
  cache.set(key, skill);
  return skill;
}

export function loadRules(dir = SKILLS_DIR): string {
  return fs.readFileSync(path.join(dir, "RULES.md"), "utf8").trim();
}

export function listSkills(dir = SKILLS_DIR): Skill[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => loadSkill(d.name, dir));
}
