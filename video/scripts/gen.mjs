// Gathers what the video shows from the real repo into src/generated/ and public/docs/:
// which footage clips exist, the UML and report images, real code snippets, the city
// config, the credits, the requirements, and captured test/eval output. Run before
// studio, preview and render. Nothing here is invented: missing inputs stay missing and
// the video shows a labelled stand-in instead.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const video = resolve(here, "..");
const repo = resolve(video, "..");
const pub = join(video, "public");
const out = join(video, "src", "generated");
mkdirSync(out, { recursive: true });

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const fps = 30;
const probe = (file) => {
  try {
    const s = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
    return Math.floor(Number(s) * fps);
  } catch {
    return null;
  }
};

// Footage and stills.
const spec = JSON.parse(readFileSync(join(video, "footage.json"), "utf8"));
const footage = {};
for (const id of Object.keys(spec.clips)) {
  for (const ext of ["mp4", "webm"]) {
    const rel = `footage/${id}.${ext}`;
    if (existsSync(join(pub, rel))) {
      footage[id] = { file: rel, frames: probe(join(pub, rel)) };
      break;
    }
  }
}

// Docs: UML images, the readiness report's first page, the budget book's pages.
const images = {};
const copyDir = (from, to, filter) => {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from).filter(filter)) {
    const src = join(from, f);
    const dst = join(to, f);
    if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) copyFileSync(src, dst);
  }
};
copyDir(join(repo, "docs", "uml"), join(pub, "docs", "uml"), (f) => f.endsWith(".png"));
const reportPdf = existsSync(join(repo, "report")) ? readdirSync(join(repo, "report")).find((f) => f.endsWith(".pdf")) : null;
if (reportPdf) {
  mkdirSync(join(pub, "docs", "report"), { recursive: true });
  const target = join(pub, "docs", "report", "readiness");
  const src = join(repo, "report", reportPdf);
  if (!existsSync(`${target}.png`) || statSync(`${target}.png`).mtimeMs < statSync(src).mtimeMs) {
    execFileSync("pdftoppm", ["-png", "-r", "160", "-f", "1", "-l", "1", "-singlefile", src, target]);
  }
}
const listImages = (dir, prefix) => {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (/\.(png|jpe?g)$/.test(f)) images[`${prefix}/${f}`] = true;
  }
};
listImages(join(pub, "docs", "uml"), "uml");
listImages(join(pub, "docs", "report"), "report");
listImages(join(pub, "shots"), "shots");

// The budget book's pages and thumbnails, for the hook.
const pagesDir = join(pub, "docs", "pages", "budget-book");
const bookPdf = join(repo, "data", "sources", "row-2026-budget-book.pdf");
if (existsSync(bookPdf) && !existsSync(pagesDir)) {
  mkdirSync(pagesDir, { recursive: true });
  execFileSync("pdftoppm", ["-jpeg", "-jpegopt", "quality=80", "-scale-to", "1000", bookPdf, join(pagesDir, "p")]);
}
const thumbsDir = join(pub, "docs", "pages", "budget-book-thumbs");
if (existsSync(bookPdf) && !existsSync(thumbsDir)) {
  mkdirSync(thumbsDir, { recursive: true });
  execFileSync("pdftoppm", ["-jpeg", "-jpegopt", "quality=70", "-scale-to", "180", bookPdf, join(thumbsDir, "t")]);
}
const pages = existsSync(pagesDir) ? readdirSync(pagesDir).filter((f) => f.endsWith(".jpg")).sort() : [];
const thumbs = existsSync(thumbsDir) ? readdirSync(thumbsDir).filter((f) => f.endsWith(".jpg")).sort() : [];

// The construction scout's stage renders, in step order, with the product's own titles.
const renders = (() => {
  const lens = read(join(repo, "data", "lenses", "construction-row-2027-budget.json"));
  if (!lens) return [];
  const steps = JSON.parse(lens).steps ?? [];
  const dir = join(pub, "docs", "renders");
  mkdirSync(dir, { recursive: true });
  return steps
    .map((st) => {
      const url = typeof st.render === "string" ? st.render : st.render?.url;
      const file = url ? url.split("/").pop() : null;
      const src = file ? join(repo, "data", "renders", file) : null;
      if (!src || !existsSync(src)) return null;
      const dst = join(dir, file);
      if (!existsSync(dst)) copyFileSync(src, dst);
      return { n: Number(st.n), id: st.id, title: st.title, file: `docs/renders/${file}` };
    })
    .filter(Boolean);
})();

// Real code for the code tour: a few short, telling excerpts.
const excerpt = (file, startPattern, lines = 18) => {
  const text = read(join(repo, file));
  if (!text) return null;
  const all = text.split("\n");
  let i = startPattern ? all.findIndex((l) => l.includes(startPattern)) : 0;
  if (i < 0) i = 0;
  return { file, line: i + 1, text: all.slice(i, i + lines).join("\n") };
};
const code = [
  excerpt("agents/loop.ts", "export", 18),
  excerpt("server/log.ts", "hash", 16),
  excerpt("agents/tools.ts", "record_statement", 16),
  excerpt("lenses/transit/index.ts", "export", 16) ?? excerpt("lenses/cost/index.ts", "export", 16),
].filter(Boolean);

// Other real text.
const firstExisting = (...files) => {
  for (const f of files) {
    const t = read(join(repo, f));
    if (t) return { file: f, text: t };
  }
  return null;
};
const city = firstExisting("cities/waterloo-region.json");
const credits = firstExisting("CREDITS.md", "docs/CREDITS.md");
const requirements = firstExisting("docs/requirements.md", "docs/requirements/README.md");
const tests = firstExisting("video/public/docs/tests.txt");
const evals = (() => {
  const r = firstExisting("agents/evals/results.md", "video/public/docs/evals.txt");
  // The summary and the results table, not the long answers.
  return r ? { file: r.file, text: r.text.split("\n## Answers")[0] } : null;
})();
const architecture = (() => {
  const t = read(join(repo, "docs", "architecture.md"));
  const m = t?.match(/```[a-z]*\n([\s\S]*?)```/);
  return m ? { file: "docs/architecture.md", text: m[1].replace(/\s+$/, "") } : null;
})();
const cityType = (() => {
  const t = read(join(repo, "shared", "types.ts"));
  if (!t) return null;
  const i = t.indexOf("export interface CityConfig");
  return i < 0 ? null : { file: "shared/types.ts", text: t.slice(i, t.indexOf("}", i) + 1) };
})();

const marks = (() => {
  try {
    return JSON.parse(readFileSync(join(video, "footage-marks.json"), "utf8"));
  } catch {
    return {};
  }
})();
const manifest = { marks, footage, images, pages, thumbs, code, city, cityType, credits, requirements, tests, evals, architecture, renders, generatedAt: new Date().toISOString() };
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
const have = Object.keys(footage);
console.log(
  `gen: ${have.length}/${Object.keys(spec.clips).length} clips (${have.join(", ") || "none"}), ${Object.keys(images).length} images, ${pages.length} book pages, ${code.length} code excerpts, ${renders.length} scout renders, city ${city ? "yes" : "no"}, credits ${credits ? "yes" : "no"}, requirements ${requirements ? "yes" : "no"}`,
);
