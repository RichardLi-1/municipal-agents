// Checks the storyboard against the brief: scenes cover the song with no gaps, every
// box is ticked exactly once, phrases are short and on screen long enough to read
// (at least one beat per three words), and at least two-thirds of the time is footage.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const board = JSON.parse(readFileSync(join(root, "storyboard.json"), "utf8"));
const music = JSON.parse(readFileSync(join(root, "music.json"), "utf8"));
const footage = JSON.parse(readFileSync(join(root, "footage.json"), "utf8"));
const beat = 60 / music.bpm;
const total = Math.round(music.fileDuration * music.fps);
const cueSec = (cue) => {
  const [bar, b = "1", half] = String(cue).split(".");
  return music.firstDownbeat + ((Number(bar) - 1) * 4 + (Number(b) + (half ? Number(`0.${half}`) : 0) - 1)) * beat;
};
const fr = (cue) => Math.round(cueSec(cue) * music.fps);
const problems = [];
const scenes = board.scenes.map((s) => ({
  ...s,
  start: s.from === "start" ? 0 : s.from !== undefined ? fr(s.from) : fr(`${s.bars[0]}`),
  end: s.to === "end" ? total : s.to !== undefined ? fr(s.to) : fr(`${s.bars[1] + 1}`),
}));
scenes.forEach((s, i) => {
  if (i > 0 && s.start !== scenes[i - 1].end) problems.push(`gap/overlap before ${s.id}: ${scenes[i - 1].end} -> ${s.start}`);
  if (s.end <= s.start) problems.push(`${s.id} has no length`);
  if (s.shot.type === "footage" && !footage.clips[s.shot.clip]) problems.push(`${s.id}: clip ${s.shot.clip} not in footage.json`);
  for (const w of s.words ?? []) {
    const n = w.text.split(/\s+/).length;
    const beats = (cueSec(w.to) - cueSec(w.at)) / beat;
    const max = w.style === "subtitle" ? 8 : 7;
    if (n > max) problems.push(`${s.id}: "${w.text}" has ${n} words (max ${max})`);
    if (beats < n / 3 - 1e-6) problems.push(`${s.id}: "${w.text}" is on for ${beats.toFixed(2)} beats; needs ${(n / 3).toFixed(2)}`);
  }
});
if (scenes[0].start !== 0) problems.push("first scene must start at frame 0");
if (scenes.at(-1).end !== total) problems.push(`last scene must end at ${total}`);
const ticked = scenes.flatMap((s) => (s.ticks ?? []).map((t) => t.box));
for (const b of board.boxes) {
  const n = ticked.filter((x) => x === b.id).length;
  if (n !== 1) problems.push(`box ${b.id} ticked ${n} times`);
}
// Over product footage: footage shots, shots drawn over a (blurred) clip, and the design shot
// (a language-switch clip, then product screenshots in dark mode and on a phone).
const footageFrames = scenes.filter((s) => s.shot.type === "footage" || s.shot.clip || ["design", "scout", "cuts"].includes(s.shot.type)).reduce((a, s) => a + s.end - s.start, 0);
// Plus real repo artifacts: the city config, UML, architecture, code, tests, credits, the report.
const productFrames = footageFrames + scenes.filter((s) => ["drop", "config"].includes(s.shot.type)).reduce((a, s) => a + s.end - s.start, 0);
const words = scenes.flatMap((s) => s.words ?? []);
console.log(`scenes ${scenes.length}, frames ${total}, phrases ${words.length}, ticks ${ticked.length}/${board.boxes.length}`);
console.log(`product footage ${(footageFrames / total * 100).toFixed(1)}%; with product stills, code and docs ${(productFrames / total * 100).toFixed(1)}%`);
if (footageFrames / total < 2 / 3) problems.push("less than two-thirds of the running time is product footage");
if (problems.length) {
  console.log(problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("storyboard ok");
