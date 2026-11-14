// Renders stills at given cues (bar.beat) or frames into a folder, bundling once.
// node scripts/stills.mjs <outDir> [--scale=0.5] 1.1 2.3 f:120 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const music = JSON.parse(readFileSync(join(root, "music.json"), "utf8"));
const args = process.argv.slice(2);
const outDir = resolve(args.shift());
const scaleArg = args.find((a) => a.startsWith("--scale="));
const scale = scaleArg ? Number(scaleArg.split("=")[1]) : 0.5;
const cues = args.filter((a) => !a.startsWith("--"));
mkdirSync(outDir, { recursive: true });

const beat = 60 / music.bpm;
const frameOf = (cue) => {
  if (cue.startsWith("f:")) return Number(cue.slice(2));
  const [bar, b = "1", half] = cue.split(".");
  const bb = Number(b) + (half ? Number(`0.${half}`) : 0);
  return Math.round((music.firstDownbeat + ((Number(bar) - 1) * 4 + (bb - 1)) * beat) * music.fps);
};

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts") });
const composition = await selectComposition({ serveUrl, id: "MunicipalAgents", inputProps: {} });
for (const cue of cues) {
  const frame = frameOf(cue);
  const output = join(outDir, `still-${cue.replace(/[:.]/g, "_")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 85, scale, chromiumOptions: { gl: "angle" } });
  console.log(`${cue} -> frame ${frame} -> ${output}`);
}
