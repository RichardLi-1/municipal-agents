import React from "react";
import { AbsoluteFill, Composition, Sequence } from "remotion";
import { Video } from "./Video";
import { f, FPS, TOTAL_FRAMES } from "./timing";
import { H, W } from "./theme";

// The showcase loop: 60 silent seconds of the resident's journey, bars 5 to 34
// (29 bars at 116 BPM is exactly 60 s), cut out of the main video.
const LOOP_FROM = f(5, 1);
const LOOP_FRAMES = 60 * FPS;
const Loop: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={-LOOP_FROM}>
      <Video withMusic={false} />
    </Sequence>
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <>
    <Composition id="MunicipalAgents" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{ withMusic: true }} />
    <Composition id="ShowcaseLoop" component={Loop} durationInFrames={LOOP_FRAMES} fps={FPS} width={W} height={H} />
  </>
);
