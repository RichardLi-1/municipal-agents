// Reads the data files other builders produce. Files are re-read when they change on
// disk (mtime check), so the running server picks up new decisions and briefs without
// a restart. Nothing here calls a model.
import fs from "node:fs";
import path from "node:path";
import type { Brief, CityConfig, Decision, LensId, SourceDoc } from "../shared/types.ts";

export type Lenses = Brief["lenses"];

const LENS_IDS: LensId[] = ["transit", "cost", "commitments", "housing", "construction"];

/** Ids become file names, so they are restricted to a safe slug. */
export const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
export const SAFE_LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

const cache = new Map<string, { mtimeMs: number; size: number; value: unknown }>();

/** JSON from disk, cached until the file changes. Undefined if missing or invalid. */
export function readJson<T>(file: string): T | undefined {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return undefined;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.value as T;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, value });
    return value as T;
  } catch (err) {
    // A builder may be halfway through writing the file; skip it rather than crash.
    console.warn(`skipping unreadable ${file}: ${(err as Error).message}`);
    return undefined;
  }
}

/** Write JSON atomically (temp file + rename) so a reader never sees half a file. */
export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function listJson(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function mtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return -1;
  }
}

export class Store {
  readonly appRoot: string;
  readonly dataDir: string;

  constructor(opts: { appRoot: string; dataDir: string }) {
    this.appRoot = opts.appRoot;
    this.dataDir = opts.dataDir;
  }

  // ---- cities ---------------------------------------------------------------

  cities(): CityConfig[] {
    return listJson(path.join(this.appRoot, "cities"))
      .map((f) => readJson<CityConfig>(f))
      .filter((c): c is CityConfig => !!c && typeof c.id === "string");
  }

  /** The city this deployment serves: CITY env, else the first config. */
  city(id = process.env.CITY): CityConfig | undefined {
    const all = this.cities();
    return (id && all.find((c) => c.id === id)) || all[0];
  }

  // ---- decisions ------------------------------------------------------------

  decisions(): Decision[] {
    return listJson(path.join(this.dataDir, "decisions"))
      .map((f) => readJson<Decision>(f))
      .filter((d): d is Decision => !!d && typeof d.id === "string" && Array.isArray(d.timeline));
  }

  decision(id: string): Decision | undefined {
    if (!SAFE_ID.test(id)) return undefined;
    const direct = readJson<Decision>(path.join(this.dataDir, "decisions", `${id}.json`));
    if (direct?.id === id) return direct;
    return this.decisions().find((d) => d.id === id);
  }

  // ---- sources --------------------------------------------------------------

  /** Committed sources plus any uploaded by staff (uploads win on an id clash). */
  sources(): SourceDoc[] {
    const committed = readJson<SourceDoc[]>(path.join(this.dataDir, "sources", "index.json")) ?? [];
    const uploaded = readJson<SourceDoc[]>(path.join(this.dataDir, "uploads", "index.json")) ?? [];
    const byId = new Map<string, SourceDoc>();
    for (const s of [...committed, ...uploaded]) if (s && typeof s.id === "string") byId.set(s.id, s);
    return [...byId.values()];
  }

  source(id: string): SourceDoc | undefined {
    if (!SAFE_ID.test(id)) return undefined;
    return this.sources().find((s) => s.id === id);
  }

  private sourceFile(id: string, ext: string): string | undefined {
    if (!SAFE_ID.test(id)) return undefined;
    for (const dir of ["uploads", "sources"]) {
      const f = path.join(this.dataDir, dir, `${id}${ext}`);
      if (fs.existsSync(f)) return f;
    }
    return undefined;
  }

  sourcePdfPath(id: string): string | undefined {
    return this.sourceFile(id, ".pdf");
  }

  /** Page texts, index 0 is page 1. */
  sourcePages(id: string): string[] | undefined {
    const f = this.sourceFile(id, ".pages.json");
    return f ? readJson<string[]>(f) : undefined;
  }

  // ---- briefs ---------------------------------------------------------------

  briefPath(decisionId: string, lang?: string): string {
    const name = lang ? `${decisionId}.${lang}.json` : `${decisionId}.json`;
    return path.join(this.dataDir, "briefs", name);
  }

  /** The brief as generated (`<id>.json`), or a translation (`<id>.<lang>.json`). */
  brief(decisionId: string, lang?: string): Brief | undefined {
    if (!SAFE_ID.test(decisionId) || (lang && !SAFE_LANG.test(lang))) return undefined;
    const b = readJson<Brief>(this.briefPath(decisionId, lang));
    return b && Array.isArray(b.summary) ? b : undefined;
  }

  briefMtime(decisionId: string, lang?: string): number {
    return mtime(this.briefPath(decisionId, lang));
  }

  /** Save a brief, keeping the previous version in data/cache/brief-history. */
  writeBrief(brief: Brief, lang?: string): string {
    const file = this.briefPath(brief.decisionId, lang);
    if (fs.existsSync(file)) {
      const hist = path.join(this.dataDir, "cache", "brief-history");
      fs.mkdirSync(hist, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(file, path.join(hist, `${path.basename(file, ".json")}.${stamp}.json`));
    }
    writeJson(file, brief);
    return file;
  }

  // ---- renders --------------------------------------------------------------

  /** A construction-lens image: $DATA_DIR/renders first, then the committed data/renders. */
  renderPath(file: string): string | undefined {
    if (!/^[a-z0-9][a-z0-9._-]{0,200}\.(png|jpe?g|webp)$/i.test(file) || file.includes("..")) return undefined;
    for (const dir of [path.join(this.dataDir, "renders"), path.join(this.appRoot, "data", "renders")]) {
      const f = path.join(dir, file);
      try {
        if (fs.statSync(f).isFile()) return f;
      } catch {}
    }
    return undefined;
  }

  // ---- lenses ---------------------------------------------------------------

  /**
   * Lens results for one decision from data/lenses, matched the same way the agents
   * match them (agents/corpus.ts): a file name naming a lens and this decision's id
   * places it; one naming another decision is skipped; one naming only a lens is
   * city-wide and applies to decisions that list that lens (the best match on the
   * decider's words wins); one naming only the decision holds `{transit, cost, ...}`.
   */
  lenses(decision: Decision): Lenses {
    const root = path.join(this.dataDir, "lenses");
    const out: Lenses = {};
    const files: string[] = [];
    const walk = (dir: string, depth: number) => {
      let names: string[] = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const n of names.sort()) {
        const p = path.join(dir, n);
        if (n.startsWith(".")) continue;
        if (n.endsWith(".json")) files.push(p);
        else if (depth < 2 && fs.statSync(p).isDirectory()) walk(p, depth + 1);
      }
    };
    walk(root, 0);
    const others = this.decisions().map((d) => d.id).filter((id) => id !== decision.id);
    // Words of the decider and title pick between city-wide files, e.g.
    // housing-kitchener.json for a Kitchener committee, housing-region.json for the Region.
    const decider = `${decision.decidedBy} ${decision.title}`.toLowerCase();
    const general: Partial<Record<LensId, { value: unknown; score: number }>> = {};
    for (const file of files) {
      const rel = path.relative(root, file).replace(/\.json$/, "").toLowerCase();
      const words = rel.split(/[/._-]+/);
      const names = (id: string) => new RegExp(`(^|[/._-])${id.toLowerCase()}([/._-]|$)`).test(rel);
      if (others.some(names)) continue;
      const value = readJson<Record<string, unknown>>(file);
      if (!value || typeof value !== "object") continue;
      if (typeof value.decisionId === "string" && value.decisionId !== decision.id) continue;
      const mine = names(decision.id);
      const lens = LENS_IDS.find((l) => words.includes(l));
      if (lens && mine) out[lens] = value as never;
      else if (lens) {
        const score = words.filter((w) => w !== lens && w.length > 2 && decider.includes(w)).length;
        if (!general[lens] || score > general[lens].score) general[lens] = { value, score };
      } else if (mine) {
        for (const l of LENS_IDS) if (value[l]) out[l] = value[l] as never;
      }
    }
    for (const l of decision.lenses ?? []) if (!out[l] && general[l]) out[l] = general[l].value as never;
    return out;
  }
}

/**
 * On Fly the image carries the committed data at /app/data and the volume is at
 * /data. At boot we mirror the committed files into the volume so the server and the
 * agents read one folder. Briefs are the exception: staff edit them at runtime, so for
 * each brief whichever copy is newer wins (a redeploy with a fresher committed brief
 * replaces an older runtime one).
 */
export function syncCommittedData(appData: string, dataDir: string): { copied: number; removed: number } {
  const stats = { copied: 0, removed: 0 };
  if (path.resolve(appData) === path.resolve(dataDir) || !fs.existsSync(appData)) return stats;
  fs.mkdirSync(dataDir, { recursive: true });
  // Not mirrored: written at runtime (briefs merge below; renders are served from both
  // folders, runtime first, so nothing generated on the volume is deleted).
  const runtimeOnly = new Set(["briefs", "uploads", "cache", "renders"]);
  for (const name of fs.readdirSync(appData)) {
    if (name.startsWith("log.db") || name.startsWith(".") || runtimeOnly.has(name)) continue;
    mirror(path.join(appData, name), path.join(dataDir, name), stats);
  }
  const fromBriefs = path.join(appData, "briefs");
  const toBriefs = path.join(dataDir, "briefs");
  if (fs.existsSync(fromBriefs)) {
    fs.mkdirSync(toBriefs, { recursive: true });
    for (const f of fs.readdirSync(fromBriefs)) {
      const src = path.join(fromBriefs, f);
      const dst = path.join(toBriefs, f);
      if (!fs.statSync(src).isFile()) continue;
      if (mtime(src) > mtime(dst)) {
        fs.copyFileSync(src, dst);
        const st = fs.statSync(src);
        fs.utimesSync(dst, st.atime, st.mtime);
        stats.copied++;
      }
    }
  }
  return stats;
}

/** Make dst an exact copy of src (files compared by size and mtime). */
function mirror(src: string, dst: string, stats: { copied: number; removed: number }): void {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    const want = new Set(fs.readdirSync(src));
    for (const n of want) mirror(path.join(src, n), path.join(dst, n), stats);
    for (const n of fs.readdirSync(dst)) {
      // Staff uploads live beside committed files; they're re-applied after the mirror.
      if (!want.has(n) && !n.startsWith("upload-") && n !== "index.json") {
        fs.rmSync(path.join(dst, n), { recursive: true, force: true });
        stats.removed++;
      }
    }
    return;
  }
  let same = false;
  try {
    const d = fs.statSync(dst);
    same = d.isFile() && d.size === st.size && Math.abs(d.mtimeMs - st.mtimeMs) < 1000;
    if (!d.isFile()) fs.rmSync(dst, { recursive: true, force: true });
  } catch {}
  if (same) return;
  fs.copyFileSync(src, dst);
  fs.utimesSync(dst, st.atime, st.mtime);
  stats.copied++;
}
