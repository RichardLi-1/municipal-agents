// Bar.beat to frames. Every beat is rounded to its nearest frame on its own, so a cue
// late in the song is never more than half a frame off the music.
import music from "../music.json";

export const FPS = music.fps;
export const BEAT_SEC = 60 / music.bpm;
export const BAR_SEC = BEAT_SEC * music.beatsPerBar;
export const TOTAL_FRAMES = Math.round(music.fileDuration * FPS);

/** Seconds at bar `bar` (1-based), beat `beat` (1-based, fractions allowed: 2.5 is the "and" of 2). */
export const sec = (bar: number, beat = 1): number =>
  music.firstDownbeat + ((bar - 1) * music.beatsPerBar + (beat - 1)) * BEAT_SEC;

/** Frame at bar.beat, rounded to the nearest frame. */
export const f = (bar: number, beat = 1): number => Math.round(sec(bar, beat) * FPS);

/** "12.3" -> bar 12 beat 3; "12.3.5" -> bar 12 beat 3.5; "12" -> bar 12 beat 1. A number is taken as bar.beat too. */
export const parseCue = (cue: string | number): { bar: number; beat: number } => {
  const s = String(cue);
  const [bar, beat = "1", half] = s.split(".");
  return { bar: Number(bar), beat: Number(beat) + (half ? Number(`0.${half}`) : 0) };
};

/** Frame of a cue string like "12.3". */
export const cf = (cue: string | number): number => {
  const { bar, beat } = parseCue(cue);
  return f(bar, beat);
};

/** Frames per beat, for animation lengths (not for positions). */
export const BEAT_FRAMES = BEAT_SEC * FPS;
