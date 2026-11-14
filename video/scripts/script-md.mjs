// Writes SCRIPT.md from storyboard.json, music.json and footage.json, so the script a
// person reads is always the one the video renders.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const j = (f) => JSON.parse(readFileSync(join(root, f), "utf8"));
const board = j("storyboard.json");
const music = j("music.json");
const footage = j("footage.json");
const beat = 60 / music.bpm;
const total = music.fileDuration;
const sec = (cue) => {
  if (cue === "start") return 0;
  if (cue === "end") return total;
  const [bar, b = "1", half] = String(cue).split(".");
  return music.firstDownbeat + ((Number(bar) - 1) * 4 + (Number(b) + (half ? Number(`0.${half}`) : 0) - 1)) * beat;
};
const ts = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const box = Object.fromEntries(board.boxes.map((b) => [b.id, b.label]));
const section = (bar) => music.sections.find((s) => bar >= s.bars[0] && bar <= s.bars[1]);

const lines = [];
const p = (s = "") => lines.push(s);
p("# Municipal Agents: demo video script");
p();
p("Generated from `storyboard.json` by `npm run script`; edit the storyboard, not this file.");
p();
p(`- **Music:** “${music.title}”, ${music.artist}. ${music.bpm} BPM, 4/4, first downbeat ${music.firstDownbeat} s, ${music.bars} bars, last hit ${music.lastHit} s, file ${music.fileDuration} s.`);
p(`- **Video:** 1920×1080, ${music.fps} fps, ${Math.round(total * music.fps)} frames (${ts(total)}), the length of the song. Under the 3-minute limit.`);
p("- **Cues** are bar.beat (bar.beat.5 is the off-beat). `src/timing.ts` rounds each beat to its nearest frame, so nothing drifts.");
p("- **Honesty:** scenarios are tagged (fictional resident, fictional clerk, illustrative construction scenario); sped-up clips say “4× speed”; every number on screen comes from the product or a source page listed below. Words on screen carry no numbers except “191 pages” (the real budget book) and the WCAG level.");
p("- **Stand-ins:** until a clip is recorded the video shows a labelled card, “Footage: <what>”, so it renders end to end.");
p();
p("## Story");
p();
p("1. **Hook (bars 1-4).** A laptop opens on the Region of Waterloo's real 2026 budget book; 191 pages flip past and pull back into a grid. Title on the dip.");
p("2. **One resident, one real decision (bars 5-26).** The Region of Waterloo 2027 Plan and Budget: find it, understand it (every figure to its page), how it affects me, when I can have a say, ask anything, the transit lens. Tagged “Scenario: fictional resident”.");
p("3. **First drop (bars 27-35).** A question in the near-silence, then the cost lens, the construction scout (tagged as an illustrative scenario), commitments and housing, cut on the beat.");
p("4. **Breakdown (36-39).** Part A of the return slip is stamped complete on the first beat; then unknowns, trade-offs both ways, possible harms.");
p("5. **City staff (40-47).** A clerk drafts with agents; a quote not on its page is rejected; staff approve, edit, reject; a named person publishes. Agents never decide.");
p("6. **The record and spend (48-51).** Hash-chained log, chain intact; every model call costed.");
p("7. **Who it's for and how it travels (52-59).** Residents and the people who serve them; any language, light and dark, any screen, keyboard and screen reader; another city is one config file.");
p("8. **Under the hood and the final drop (60-69).** Requirements, UML, architecture, code tour, tests, evals, Lighthouse, credits, the readiness report, this video; every remaining box ticks on the beat.");
p("9. **End (70).** The lid closes on the last hit. End card.");
p();
p("## The return slip");
p();
p("A paper civic form, “CIVIC Hack 2026 · Return slip”, Part A (the challenges) and Part B (the judging criteria). Each box is ticked in blue ballpoint on the beat right after it is shown working, with the time it was shown written beside it.");
p();
p("| Box | Ticked at | Scene |");
p("|---|---|---|");
for (const s of board.scenes) for (const t of s.ticks ?? []) p(`| ${box[t.box]} | ${t.at} (${ts(sec(t.at))}) | ${s.id} |`);
p();
p("## Scenes");
p();
for (const s of board.scenes) {
  const from = s.from ?? `${s.bars[0]}`;
  const to = s.to ?? `${s.bars[1] + 1}`;
  const sect = section(s.bars[0]);
  p(`### ${s.id} · bars ${s.bars[0]}${s.bars[1] !== s.bars[0] ? `-${s.bars[1]}` : ""} · ${ts(sec(from))} to ${ts(sec(to))}`);
  p();
  p(`- **Music:** ${sect ? `${sect.energy}${sect.note ? ` (${sect.note})` : ""}` : ""}`);
  if (s.step) p(`- **Step label:** ${s.step}${(s.steps ?? []).map((x) => `; from ${x.at}: ${x.text}`).join("")}`);
  if (s.tags?.length) p(`- **Tags:** ${s.tags.map((t) => `“${t}”`).join(", ")}`);
  const sh = s.shot;
  let shot = sh.type;
  if (sh.type === "footage") shot = `footage \`${sh.clip}\`${sh.rate ? ` at ${sh.rate}×` : ""}${sh.veil ? ", blurred under a white veil" : ""}: ${footage.clips[sh.clip]?.what ?? ""}`;
  if (sh.type === "scout" || sh.type === "cuts")
    shot = `cuts: ${sh.cuts.map((c) => (c.clip ? `\`${c.clip}\` at ${c.at}` : c.renders === "scout" ? `the scout's seven stage renders (data/renders), stepping 1 to 7, from ${c.at}` : `renders ${c.renders.join(", ")} from ${c.at}`)).join("; ")}`;
  if (sh.type === "drop") shot = `split: evidence left (${sh.items.map((i) => `${i.at} ${i.label}`).join("; ")}), the slip's Part B right`;
  if (sh.clip && sh.type !== "footage") shot += ` over \`${sh.clip}\` (blurred)`;
  p(`- **Shot:** ${shot}`);
  if (sh.camera?.length) p(`- **Camera:** ${sh.camera.map((k) => `${k.at} zoom ${k.z} at (${k.x}, ${k.y})`).join(" → ")}`);
  if (s.words?.length) {
    p("- **Words:**");
    for (const w of s.words) p(`  - ${w.at} to ${w.to}: “${w.text}”${w.style !== "pill" ? ` (${w.style})` : ""}`);
  }
  if (s.ticks?.length) p(`- **Ticks:** ${s.ticks.map((t) => `${box[t.box]} at ${t.at}`).join("; ")}`);
  if (s.facts?.length) {
    p("- **Facts and sources:**");
    for (const f of s.facts) p(`  - ${f.text}: \`${f.source}\`, page ${f.page}`);
  }
  if (s.notes) p(`- **Action:** ${s.notes}`);
  p();
}
p("## Footage to record (phase 2)");
p();
p("`npm run record -- <baseUrl>` (scripts/record.mjs). 1920×1080, Chrome via playwright-core, visible cursor, human-speed typing; files go to `public/footage/` (gitignored) and action times to `footage-marks.json`.");
p();
p("| Clip | Length needed | What |");
p("|---|---|---|");
for (const [id, c] of Object.entries(footage.clips)) p(`| \`${id}\` | ${c.seconds} s | ${c.what} |`);
p();
p("Stills: " + Object.entries(footage.stills).map(([id, s]) => `\`${id}\` (${s.what})`).join("; ") + ".");
p();
writeFileSync(join(root, "SCRIPT.md"), lines.join("\n"));
console.log(`SCRIPT.md: ${board.scenes.length} scenes`);
