// The final render: one bundle, rendered in two halves (each retried up to three times),
// then joined and given the song as 320 kb/s AAC. The bundle's copy of the footage is
// swapped for a link to public/footage, so a render needs ~150 MB less free disk.
//   node scripts/render.mjs [out.mp4] [--crf=16] [--comp=MunicipalAgents]
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) ?? join(root, "out", "municipal-agents.mp4"));
const crf = Number(args.find((a) => a.startsWith("--crf="))?.slice(6) ?? 16);
const id = args.find((a) => a.startsWith("--comp="))?.slice(7) ?? "MunicipalAgents";
const music = JSON.parse(readFileSync(join(root, "music.json"), "utf8"));
mkdirSync(dirname(out), { recursive: true });
execFileSync("node", [join(root, "scripts", "gen.mjs")], { stdio: "inherit" });

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts") });
for (const big of ["footage", "docs/pages"]) {
  const copy = join(serveUrl, "public", big);
  if (existsSync(copy)) {
    rmSync(copy, { recursive: true, force: true });
    symlinkSync(join(root, "public", big), copy);
  }
}
const composition = await selectComposition({ serveUrl, id, inputProps: {} });
const total = composition.durationInFrames;
const half = Math.round(total / 2);
const parts = [
  [0, half - 1],
  [half, total - 1],
].map(([a, b], i) => ({ a, b, file: join(dirname(out), `part-${i}.mp4`) }));

for (const p of parts) {
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      let last = -1;
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        crf,
        outputLocation: p.file,
        frameRange: [p.a, p.b],
        muted: true,
        concurrency: 4,
        imageFormat: "jpeg",
        jpegQuality: 92,
        chromiumOptions: { gl: "angle" },
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 10);
          if (pct !== last) console.log(`frames ${p.a}-${p.b}: ${pct * 10}%`), (last = pct);
        },
      });
      ok = true;
    } catch (e) {
      console.log(`frames ${p.a}-${p.b}: attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (!ok) process.exit(1);
}
rmSync(serveUrl, { recursive: true, force: true });

const list = join(dirname(out), "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p.file}'`).join("\n") + "\n");
const song = join(root, "public", music.file);
const withSong = id === "MunicipalAgents" && existsSync(song);
const audio = withSong ? ["-i", song, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k"] : [];
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, ...audio, "-c:v", "copy", "-t", String(total / music.fps), "-movflags", "+faststart", out], { stdio: "inherit" });
for (const p of parts) rmSync(p.file, { force: true });
rmSync(list, { force: true });
console.log(`render: ${out}`);
