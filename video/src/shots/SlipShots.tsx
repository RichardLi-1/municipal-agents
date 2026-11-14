// Full views of the return slip, and the finale: every box ticked, the slip on the
// laptop's screen, the lid closing on the last hit, the end card.
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Slip, SLIP_H, SLIP_W, Stamp } from "../components/Slip";
import { Laptop } from "../components/Laptop";
import type { Scene } from "../storyboard";
import { cf, f, TOTAL_FRAMES } from "../timing";
import { color, font, H, W } from "../theme";
import { clamp, easeIn, easeInOut, easeOut, lerp, pop } from "../motion";
import { links } from "../config";

const desk: React.CSSProperties = { background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef0f3 100%)" };

/** The slip filling the frame (1920x1080), as it appears full-screen and on the laptop. */
export const SlipScreen: React.FC<{ frame: number; enter: number; stamp?: { at: number; text: string } }> = ({ frame, enter, stamp }) => {
  const s = 1.1;
  return (
    <AbsoluteFill style={desk}>
      <div
        style={{
          position: "absolute",
          left: (W - SLIP_W * s) / 2,
          top: (H - SLIP_H * s) / 2,
          transformOrigin: "50% 50%",
          transform: `translateY(${(1 - enter) * 700}px) rotate(${-0.8 - (1 - enter) * 4}deg) scale(${s})`,
          width: SLIP_W,
          height: SLIP_H,
        }}
      >
        <Slip frame={frame}>
          {stamp ? <Stamp text={stamp.text} frame={frame} at={stamp.at} style={{ left: 70, top: 716 }} /> : null}
        </Slip>
      </div>
    </AbsoluteFill>
  );
};

export const SlipView: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => {
  const enter = pop(frame, scene.start, { damping: 17, stiffness: 190 });
  const stamp = scene.shot.stamp ? { at: cf(scene.shot.stamp.at), text: scene.shot.stamp.text } : undefined;
  // A little shake when the stamp lands.
  const shake = stamp ? Math.sin((frame - stamp.at) * 2.4) * interpolate(frame, [stamp.at, stamp.at + 8], [6, 0], clamp) : 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
      <SlipScreen frame={frame} enter={enter} stamp={stamp} />
    </AbsoluteFill>
  );
};

/** Bar 69: all ticked, the stamp, then the pull back to the laptop. */
export const SlipFinal: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => {
  const enter = pop(frame, scene.start, { damping: 17, stiffness: 190 });
  const stamp = scene.shot.stamp ? { at: cf(scene.shot.stamp.at), text: scene.shot.stamp.text } : undefined;
  const back = interpolate(frame, [cf("69.3"), f(70, 1) - 1], [0, 1], { ...clamp, easing: easeInOut });
  return (
    <AbsoluteFill style={{ background: color.ground }}>
      <Laptop open={1} tilt={lerp(0, 16, back)} push={1 - back} screen={<SlipScreen frame={frame} enter={enter} stamp={stamp} />} />
    </AbsoluteFill>
  );
};

/** Bar 70: the lid shuts on the last hit and the end card holds while it rings out. */
export const EndCard: React.FC<{ frame: number }> = ({ frame }) => {
  const hit = f(70, 1);
  const close = interpolate(frame, [hit - 3, hit + 7], [0, 1], { ...clamp, easing: easeIn });
  const settle = interpolate(frame, [hit + 7, hit + 22], [0, 1], { ...clamp, easing: easeOut });
  const bounce = Math.sin(Math.min(1, Math.max(0, (frame - hit - 7) / 8)) * Math.PI) * 0.025;
  const line = (i: number) => {
    const p = pop(frame, hit + 8 + i * 4, { damping: 18, stiffness: 220 });
    return { opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 24}px)` };
  };
  const fade = interpolate(frame, [TOTAL_FRAMES - 4, TOTAL_FRAMES - 1], [1, 1], clamp);
  return (
    <AbsoluteFill style={{ background: color.ground, opacity: fade }}>
      <Laptop
        open={Math.max(0, 1 - close - bounce)}
        tilt={lerp(16, 26, settle)}
        push={0}
        y={lerp(0, 175, settle)}
        scale={lerp(1, 0.56, settle)}
        screen={<SlipScreen frame={frame} enter={1} stamp={{ at: cf("69.2"), text: "All boxes ticked" }} />}
        glow={1 - close * 0.6}
      />
      <AbsoluteFill style={{ alignItems: "center", fontFamily: font.sans, color: color.ink }}>
        <div style={{ marginTop: 150, fontSize: 132, fontWeight: 900, letterSpacing: "-0.05em", ...line(0) }}>Municipal Agents</div>
        <div style={{ marginTop: 18, display: "flex", gap: 22, fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", ...line(1) }}>
          <span style={{ color: color.accent }}>{links.live}</span>
          <span style={{ color: "#b0b4ba" }}>·</span>
          <span>{links.github}</span>
        </div>
        <div style={{ marginTop: 22, fontSize: 30, fontWeight: 500, color: "#3b3f45", ...line(2) }}>Built by Richard Li for CIVIC Hack 2026</div>
        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 500, color: color.muted, ...line(3) }}>Music: “Bass Brain”, Dresage x Hark Madley</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
