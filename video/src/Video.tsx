// The whole video: scenes from storyboard.json on the music's grid, with the kinetic
// words, step labels, tags and the return slip laid over them.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { scenes, trimFor, type Scene } from "./storyboard";
import { Footage } from "./components/Footage";
import { Words } from "./components/Words";
import { Labels } from "./components/Labels";
import { CornerSlip } from "./components/CornerSlip";
import { LaptopOpen, PdfFlip, Title } from "./shots/Hook";
import { EndCard, SlipFinal, SlipView } from "./shots/SlipShots";
import { Audiences, Config, Design, Drop, Requirements, White } from "./shots/Drawn";
import { Scout } from "./shots/Scout";
import { color } from "./theme";
import { clamp, easeOut } from "./motion";
import music from "../music.json";
import { BEAT_SEC, FPS } from "./timing";

const Shot: React.FC<{ scene: Scene }> = ({ scene }) => {
  const rel = useCurrentFrame();
  const frame = rel + scene.start;
  const s = scene.shot;
  switch (s.type) {
    case "laptop-open":
      return <LaptopOpen frame={frame} />;
    case "pdf-flip":
      return <PdfFlip frame={frame} />;
    case "title":
      return <Title frame={frame} />;
    case "footage":
      return <Footage clip={s.clip!} camera={s.camera} start={scene.start} rate={s.rate} trimFrames={trimFor(s.clip, s, scene.start)} veil={s.veil ? scene.end : undefined} />;
    case "slip":
      return <SlipView scene={scene} frame={frame} />;
    case "slip-final":
      return <SlipFinal scene={scene} frame={frame} />;
    case "endcard":
      return <EndCard frame={frame} />;
    case "audiences":
      return <Audiences frame={frame} scene={scene} />;
    case "design":
      return <Design scene={scene} frame={frame} />;
    case "config":
      return <Config frame={frame} />;
    case "requirements":
      return <Requirements frame={frame} />;
    case "drop":
      return <Drop scene={scene} frame={frame} />;
    case "scout":
    case "cuts":
      return <Scout scene={scene} frame={frame} />;
    default:
      return <White />;
  }
};

/** In the drops, every beat kicks the picture a little. */
const dropBars = music.sections.filter((x) => x.energy === "drop").flatMap((x) => Array.from({ length: x.bars[1] - x.bars[0] + 1 }, (_, i) => x.bars[0] + i));
const kickAt = (frame: number) => {
  const t = frame / FPS - music.firstDownbeat;
  if (t < 0) return 1;
  const beatIdx = Math.floor(t / BEAT_SEC);
  const bar = Math.floor(beatIdx / 4) + 1;
  if (!dropBars.includes(bar)) return 1;
  const since = (t - beatIdx * BEAT_SEC) * FPS;
  return 1 + 0.016 * Math.exp(-since / 3.2);
};
const Kick: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${kickAt(frame)})` }}>{children}</AbsoluteFill>;
};

/** Footage cuts land with a small punch-in, so each downbeat is felt. */
const Punch: React.FC<{ scene: Scene; children: React.ReactNode }> = ({ scene, children }) => {
  const rel = useCurrentFrame();
  const on = scene.shot.type === "footage";
  const k = on ? interpolate(rel, [0, 6], [1.035, 1], { ...clamp, easing: easeOut }) : 1;
  return <AbsoluteFill style={{ transform: `scale(${k})` }}>{children}</AbsoluteFill>;
};

export const Video: React.FC<{ withMusic?: boolean }> = ({ withMusic = true }) => (
  <AbsoluteFill style={{ background: color.ground }}>
    <Kick>
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.start} durationInFrames={s.end - s.start} name={s.id}>
          <Punch scene={s}>
            <Shot scene={s} />
          </Punch>
        </Sequence>
      ))}
    </Kick>
    <Labels />
    <Words />
    <CornerSlip />
    {withMusic ? <Audio src={staticFile(music.file)} /> : null}
  </AbsoluteFill>
);
