import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./timing";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

/** 0 to 1 over [from, from + dur], eased. */
export const ramp = (frame: number, from: number, dur: number, ease = easeOut) =>
  interpolate(frame, [from, from + Math.max(1, dur)], [0, 1], { ...clamp, easing: ease });

/** A snappy spring that starts at `from`. */
export const pop = (frame: number, from: number, opts: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  spring({ frame: frame - from, fps: FPS, config: { damping: opts.damping ?? 16, stiffness: opts.stiffness ?? 220, mass: opts.mass ?? 0.7 } });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
