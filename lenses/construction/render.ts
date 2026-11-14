// Illustrative renders, one per construction step, from Gemini's image model over REST.
//   node --env-file=.env lenses/construction/render.ts [stepId ...] [--force]
// Writes data/renders/construction-<step>-<hash>.jpg (resized and compressed with
// macOS `sips`) and data/renders/construction-renders.json (file, prompt, model per
// step). Spend is capped and logged; the key comes from GEMINI_API_KEY and is never printed.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "data/renders");
const MANIFEST = path.join(OUT, "construction-renders.json");
const SPEND = path.join(ROOT, "data/cache/construction/render-spend.json");
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image", "nano-banana-pro-preview"];
/** Conservative US$ per image (1K, 16:9), so the cap is never understated. */
export const PRICE_PER_IMAGE: Record<string, number> = {
  "gemini-3.1-flash-image": 0.08,
  "gemini-3-pro-image": 0.15,
  "nano-banana-pro-preview": 0.15,
};
export const CAP_USD = 1.5;
const MAX_BYTES = 350 * 1024;

export const STYLE =
  "Illustration in the clean, smooth style that transit agencies and engineering consultancies use in public information boards: " +
  "soft natural daylight, gentle shadows, realistic proportions and accurate construction equipment, calm muted colours with a few safety-orange and blue accents, tidy and believable, " +
  "not fantasy, not dramatic, not an AI-art look. Setting: Waterloo Region in Southern Ontario, Canada, in early autumn: wide suburban arterial roads with concrete curbs and streetlights, " +
  "low-rise brick and modern commercial buildings, big-box stores with large parking lots, mature maple trees turning orange, overhead hydro poles. " +
  "Workers wear hard hats and high-visibility vests and are small in the frame, no faces in close-up. " +
  "Absolutely no text, no letters, no numbers, no signs with words, no logos, no watermarks. Wide 16:9 composition.";

export const PROMPTS: Record<string, string> = {
  investigate:
    "Scene: geotechnical investigation for a future light rail tunnel. A white truck-mounted drill rig with its mast raised drills a borehole in a coned-off lane of a wide suburban arterial road, " +
    "with a concrete highway overpass and a multi-lane freeway in the background. A second small track-mounted drill rig works on the grassy boulevard. " +
    "Two workers lay soil core samples in long wooden core boxes on a pickup tailgate. Orange traffic cones, a lane-closure arrow board trailer. Eye-level view from the sidewalk.",
  "set-up":
    "Scene: a large paved retail parking lot beside a big-box shopping centre being turned into a tunnel construction site. Tall plain white hoarding panels form the site fence, " +
    "two-storey stacked site office trailers, a truck wheel-wash bay at the gate, a mini excavator digging a shallow trench to relocate a buried utility line with orange pipe stacked beside it, " +
    "concrete barriers shifting traffic lanes on the arterial road next to the lot. Elevated three-quarter view from about 30 metres up.",
  shaft:
    "Scene: a deep rectangular launch shaft for a twin-bore light rail tunnel, about 24 m wide and 45 m long and 22 m deep, being excavated inside a fenced work site in a parking lot. " +
    "The walls are a row of interlocking round concrete secant piles, braced by horizontal steel walers and big tubular steel struts across the shaft. " +
    "An excavator works at the bottom, a long-reach clamshell bucket lifts soil out, dewatering pumps and a water treatment tank sit at the edge, " +
    "dump trucks queue at the gate. Aerial three-quarter view looking down into the shaft.",
  launch:
    "Scene: tunnel boring machine assembly. A large crawler crane lowers the round steel cutterhead of an earth pressure balance tunnel boring machine, about 6.5 m across, " +
    "covered in disc cutters and scrapers, into a deep rectangular shaft. A yellow gantry crane spans the shaft on rails. On the shaft floor sits the cylindrical steel shield on a launch cradle " +
    "facing a reinforced tunnel eye in the shaft wall. Stacks of curved precast concrete tunnel lining segments wait in the yard. Elevated view from the edge of the shaft, late morning light.",
  bore:
    "Scene: a clean technical cutaway illustration. The top third shows the ground surface: a multi-lane freeway on a concrete overpass, a suburban arterial road with cars and trees. " +
    "The lower two thirds show a cross-section of the earth in soft layered glacial soils (sand, silty clay till, gravel) in muted earth tones. " +
    "Deep below, two parallel round tunnels run side by side; in each, a tunnel boring machine with a rotating cutterhead advances, " +
    "one slightly ahead of the other, the finished tunnel behind each lined with grey precast concrete rings, a conveyor belt carrying soil back. Side-on view, crisp and diagrammatic, no labels.",
  breakthrough:
    "Scene: the breakthrough moment inside a deep rectangular concrete extraction shaft with straight vertical walls. The round cutterhead of a tunnel boring machine pushes through the flat end wall, " +
    "a little dust and broken concrete falling onto a steel receiving cradle on the concrete shaft floor. Beside it, the round opening of the first finished tunnel, lined with grey precast concrete rings. " +
    "A few workers in hard hats and high-visibility vests watch from a steel platform at a safe distance. At the top of the shaft, a yellow gantry crane on rails spans the opening, its hook hanging down, blue sky beyond. View from the shaft floor looking at the wall.",
  restore:
    "Scene: the same place a few years later, finished. A small modern emergency exit and ventilation building in red brick and glass with a green roof sits where the shaft was, " +
    "surrounded by new paving, planted young trees and a restored parking lot. A modern two-car light rail train in white and blue runs on a tree-lined arterial road in the background. " +
    "People walk and cycle on a wide sidewalk. Warm late-afternoon light. Eye-level view.",
};

interface Spend {
  totalUsd: number;
  calls: { at: string; step: string; model: string; usd: number; ok: boolean }[];
}

function readSpend(): Spend {
  try {
    return JSON.parse(fs.readFileSync(SPEND, "utf8"));
  } catch {
    return { totalUsd: 0, calls: [] };
  }
}

function writeSpend(s: Spend) {
  fs.mkdirSync(path.dirname(SPEND), { recursive: true });
  fs.writeFileSync(SPEND, JSON.stringify(s, null, 2));
}

async function generate(model: string, prompt: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (run with node --env-file=.env)");
  const r = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9", imageSize: "1K" } },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${model}: HTTP ${r.status} ${text.slice(0, 200)}`);
  const d = JSON.parse(text);
  const part = d.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) throw new Error(`${model}: no image in the response (${d.candidates?.[0]?.finishReason ?? "?"})`);
  return Buffer.from(part.inlineData.data, "base64");
}

/** Resize to 1600 px wide JPEG and step quality down until it is under 350 KB. */
function toJpeg(src: string, dst: string) {
  for (const q of [82, 74, 66, 58, 50]) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(q), "--resampleWidth", "1600", src, "--out", dst], { stdio: "ignore" });
    if (fs.statSync(dst).size <= MAX_BYTES) return;
  }
}

export async function renderStep(stepId: string, opts: { force?: boolean; extra?: string } = {}): Promise<{ file: string; model: string; prompt: string } | null> {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
  if (!opts.force && manifest[stepId] && fs.existsSync(path.join(OUT, manifest[stepId].file))) return manifest[stepId];
  const prompt = `${PROMPTS[stepId]}${opts.extra ? ` ${opts.extra}` : ""} ${STYLE}`;
  const spend = readSpend();
  for (const model of MODELS) {
    const price = PRICE_PER_IMAGE[model] ?? 0.24;
    if (spend.totalUsd + price > CAP_USD) {
      console.error(`Spend cap: $${spend.totalUsd.toFixed(2)} spent, next image ~$${price}: skipping ${stepId}`);
      return null;
    }
    try {
      const png = await generate(model, prompt);
      spend.totalUsd = +(spend.totalUsd + price).toFixed(3);
      spend.calls.push({ at: new Date().toISOString(), step: stepId, model, usd: price, ok: true });
      writeSpend(spend);
      const hash = crypto.createHash("sha256").update(png).digest("hex").slice(0, 8);
      fs.mkdirSync(OUT, { recursive: true });
      const raw = path.join(ROOT, "data/cache/construction", `raw-${stepId}-${hash}.png`);
      fs.writeFileSync(raw, png);
      const file = `construction-${stepId}-${hash}.jpg`;
      toJpeg(raw, path.join(OUT, file));
      // Drop this step's older render, so only one per step is committed.
      const old = manifest[stepId]?.file;
      if (old && old !== file) fs.rmSync(path.join(OUT, old), { force: true });
      const fresh = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
      fresh[stepId] = { file, prompt, model };
      fs.writeFileSync(MANIFEST, JSON.stringify(fresh, null, 2) + "\n");
      console.log(`${stepId}: ${file} (${model}, ~$${price}; total ~$${spend.totalUsd.toFixed(2)})`);
      return fresh[stepId];
    } catch (e) {
      console.error(String(e).slice(0, 300));
      // A failed call may still be billed: count a small amount to stay safe.
      spend.calls.push({ at: new Date().toISOString(), step: stepId, model, usd: 0, ok: false });
      writeSpend(spend);
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const extraIdx = args.indexOf("--extra");
  const extra = extraIdx >= 0 ? args[extraIdx + 1] : undefined;
  const ids = args.filter((a, i) => !a.startsWith("--") && (extraIdx < 0 || i !== extraIdx + 1));
  const todo = ids.length ? ids : Object.keys(PROMPTS);
  // One at a time, so the spend ledger is never written by two calls at once.
  for (const id of todo) await renderStep(id, { force, extra });
  console.log(`Spend so far: ~$${readSpend().totalUsd.toFixed(2)} of $${CAP_USD}`);
}
