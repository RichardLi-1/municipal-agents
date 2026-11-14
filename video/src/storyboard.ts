// Typed access to storyboard.json, with every cue turned into a frame.
import board from "../storyboard.json";
import { cf, FPS, TOTAL_FRAMES, f } from "./timing";

export type CameraKey = { at: string; z: number; x: number; y: number };
export type Word = {
  at: string;
  to: string;
  text: string;
  style: "pill" | "hero" | "hero2" | "title" | "subtitle";
  pos: "center" | "bottom" | "top" | "left" | "right";
  perWord?: boolean;
  tone?: "bad";
};
export type Tick = { box: string; at: string };
export type DropItem = { at: string; kind: "image" | "code" | "terminal" | "scroll" | "self" | "text"; src: string; label: string };
export type Shot = {
  type: string;
  clip?: string;
  rate?: number;
  camera?: CameraKey[];
  items?: DropItem[];
  stamp?: { at: string; text: string };
  focus?: string;
  screen?: string;
  doc?: string;
  pages?: number;
  veil?: boolean;
  /** Seconds into the clip where this shot starts. */
  in?: number;
  /** Or: start the clip so that its recorded action `mark` (footage-marks.json) lands on cue `at`. */
  align?: { mark: string; at: string };
};
export type SceneDef = {
  id: string;
  bars: [number, number];
  from?: string;
  to?: string;
  part: string;
  step?: string;
  steps?: { at: string; text: string }[];
  tags?: string[];
  shot: Shot;
  words?: Word[];
  ticks?: Tick[];
  notes?: string;
};
export type Box = { id: string; group: "A" | "B"; label: string };

export const boxes = board.boxes as Box[];
const defs = board.scenes as unknown as SceneDef[];

export type Scene = SceneDef & { start: number; end: number };

export const scenes: Scene[] = defs.map((d) => {
  const start = d.from === "start" ? 0 : d.from !== undefined ? cf(d.from) : f(d.bars[0]);
  const end = d.to === "end" ? TOTAL_FRAMES : d.to !== undefined ? cf(d.to) : f(d.bars[1] + 1);
  return { ...d, start, end };
});

/** Every tick in the video, in order, with its frame and the scene it belongs to. */
export const ticks = scenes
  .flatMap((s, i) =>
    (s.ticks ?? []).map((t) => {
      const frame = cf(t.at);
      // Where the box was shown working: the scene itself, the one before a slip, or the bar of a drop item.
      const shown = s.shot.type === "drop" ? f(Math.floor(Number(t.at.split(".")[0]))) : s.shot.type.startsWith("slip") ? scenes[i - 1].start : s.start;
      return { ...t, frame, shown, scene: s };
    }),
  )
  .sort((a, b) => a.frame - b.frame);

export const tickFrame: Record<string, number> = Object.fromEntries(ticks.map((t) => [t.box, t.frame]));

/** Words with absolute frames. */
export const words = scenes.flatMap((s) =>
  (s.words ?? []).map((w, i) => ({ ...w, id: `${s.id}-${i}`, from: cf(w.at), until: cf(w.to), scene: s })),
);

export const sceneAt = (frame: number): Scene | undefined => scenes.find((s) => frame >= s.start && frame < s.end);

import manifest from "./generated/manifest.json";
const marks = (manifest as unknown as { marks: Record<string, Record<string, number>> }).marks ?? {};

/** Frames to skip at the start of a clip so a recorded action lands on its cue. */
export const trimFor = (clip: string | undefined, shot: { in?: number; align?: { mark: string; at: string } }, sceneStart: number): number => {
  const m = clip && shot.align ? marks[clip]?.[shot.align.mark] : undefined;
  if (m !== undefined && shot.align) return Math.max(0, Math.round(m * FPS - (cf(shot.align.at) - sceneStart)));
  return Math.round((shot.in ?? 0) * FPS);
};

/** m:ss of a frame, for the handwritten "shown at" times on the slip. */
export const clock = (frame: number): string => {
  const s = Math.floor(frame / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
