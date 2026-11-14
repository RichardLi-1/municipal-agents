// A torn-off strip of the return slip that slides in bottom-right whenever a box is
// ticked over footage, so the ticks land on the beat without leaving the product.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { boxes, sceneAt, ticks } from "../storyboard";
import { color, font } from "../theme";
import { BEAT_FRAMES } from "../timing";
import { clamp, easeIn, pop } from "../motion";
import { SlipRow } from "./Slip";

const corner = ticks.filter((t) => !["slip", "drop", "slip-final"].includes(t.scene.shot.type));

export const CornerSlip: React.FC = () => {
  const frame = useCurrentFrame();
  const t = corner.find((c) => frame >= c.frame - BEAT_FRAMES * 1.1 && frame < c.frame + BEAT_FRAMES * 1.6);
  if (!t) return null;
  // Never over a full view of the slip itself.
  const here = sceneAt(frame)?.shot.type ?? "";
  if (["slip", "drop", "slip-final", "endcard"].includes(here)) return null;
  const inAt = t.frame - BEAT_FRAMES * 1.1;
  const outAt = t.frame + BEAT_FRAMES * 1.6;
  const e = pop(frame, inAt, { damping: 15, stiffness: 200 });
  const x = interpolate(frame, [outAt - 7, outAt], [0, 1], { ...clamp, easing: easeIn });
  const b = boxes.find((bb) => bb.id === t.box)!;
  const group = b.group === "A" ? "Part A · The five challenges" : "Part B · Judging criteria";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          right: 56,
          bottom: 56,
          width: 760,
          transform: `translateY(${(1 - e) * 300 + x * 320}px) rotate(${-2.2 + e * 0.8}deg) scale(1.22)`,
          transformOrigin: "right bottom",
          background: `linear-gradient(180deg, #fdfcf7, ${color.paper})`,
          borderRadius: 8,
          boxShadow: "0 30px 70px rgba(20,18,10,0.28), 0 2px 6px rgba(20,18,10,0.12)",
          padding: "16px 30px 18px",
        }}
      >
        <div style={{ position: "absolute", top: -1, left: 10, right: 10, borderTop: "3px dashed #b9b3a1" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 16, color: "#8b8676", letterSpacing: "0.08em", marginBottom: 2 }}>
          <span style={{ fontWeight: 700, color: color.formInk }}>CIVIC HACK 2026 · RETURN SLIP</span>
          <span>{group.toUpperCase()}</span>
        </div>
        <SlipRow id={t.box} frame={frame} />
      </div>
    </AbsoluteFill>
  );
};
