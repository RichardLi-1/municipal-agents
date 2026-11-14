// Kinetic type: short phrases that land on the beat, in frosted-glass pills over the
// footage or as big black type on white.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { words } from "../storyboard";
import { color, font } from "../theme";
import { clamp, easeIn, pop } from "../motion";
import { BEAT_FRAMES } from "../timing";

type W = (typeof words)[number];

export const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.68)",
  backdropFilter: "blur(26px) saturate(1.7)",
  WebkitBackdropFilter: "blur(26px) saturate(1.7)",
  border: "1.5px solid rgba(255,255,255,0.9)",
  boxShadow: "0 24px 70px rgba(10,12,20,0.20), 0 2px 6px rgba(10,12,20,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
};

const sizes: Record<W["style"], { size: number; weight: number; track: string }> = {
  pill: { size: 66, weight: 800, track: "-0.035em" },
  hero: { size: 150, weight: 900, track: "-0.045em" },
  hero2: { size: 76, weight: 800, track: "-0.035em" },
  title: { size: 150, weight: 900, track: "-0.05em" },
  subtitle: { size: 50, weight: 500, track: "-0.02em" },
};

const place = (pos: W["pos"], style: W["style"]): React.CSSProperties => {
  if (style === "title") return { top: 360, bottom: 0, left: 0, right: 0, alignItems: "flex-start", justifyContent: "center" };
  if (style === "subtitle") return { top: 590, bottom: 0, left: 0, right: 0, alignItems: "flex-start", justifyContent: "center" };
  switch (pos) {
    case "bottom":
      return { top: 0, bottom: 118, left: 0, right: 0, alignItems: "flex-end", justifyContent: "center" };
    case "top":
      return { top: 150, bottom: 0, left: 0, right: 0, alignItems: "flex-start", justifyContent: "center" };
    case "left":
      return { top: 0, bottom: 0, left: 96, alignItems: "center", justifyContent: "flex-start" };
    case "right":
      return { top: 0, bottom: 0, right: 96, alignItems: "center", justifyContent: "flex-end" };
    default:
      return { top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" };
  }
};

const Phrase: React.FC<{ w: W; frame: number }> = ({ w, frame }) => {
  const s = sizes[w.style];
  const local = frame - w.from;
  const exitStart = w.until - 5;
  const exit = interpolate(frame, [exitStart, w.until], [0, 1], { ...clamp, easing: easeIn });
  const enter = pop(frame, w.from, { damping: 18, stiffness: 260 });
  const tokens = w.text.split(" ");
  const pilled = w.style === "pill";
  const dur = w.until - w.from;
  // perWord: spread the words evenly over the first 80% of the phrase; else a quick stagger.
  const wordStart = (i: number) => (w.perWord ? (i * dur * 0.8) / tokens.length : i * Math.min(3, BEAT_FRAMES / 4));

  const inner = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: w.pos === "right" ? "flex-end" : w.pos === "left" ? "flex-start" : "center",
        gap: `0 ${s.size * 0.24}px`,
        maxWidth: w.style === "hero" ? 1700 : w.pos === "left" || w.pos === "right" ? 1080 : 1500,
        fontFamily: font.sans,
        fontWeight: s.weight,
        fontSize: s.size,
        letterSpacing: s.track,
        lineHeight: 1.06,
        color: w.style === "subtitle" ? color.muted : color.ink,
      }}
    >
      {tokens.map((t, i) => {
        const p = pop(frame, w.from + wordStart(i), { damping: 17, stiffness: 300, mass: 0.6 });
        const o = interpolate(local - wordStart(i), [0, 3], [0, 1], clamp);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: o,
              transform: `translateY(${(1 - p) * s.size * 0.38}px)`,
              filter: `blur(${(1 - Math.min(1, p)) * 6}px)`,
            }}
          >
            {t}
          </span>
        );
      })}
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "row",
        pointerEvents: "none",
        ...(w.y !== undefined ? { top: w.y * 1080 - 60, bottom: "auto", height: 120, left: 0, right: 0, alignItems: "center", justifyContent: "center" } : place(w.pos, w.style)),
      }}
    >
      <div
        style={{
          opacity: 1 - exit,
          transform: `translateY(${-exit * 14}px) scale(${(pilled ? 0.94 + 0.06 * enter : 1) - exit * 0.03})`,
          transformOrigin: w.pos === "right" ? "right center" : w.pos === "left" ? "left center" : "center",
        }}
      >
        {pilled ? (
          <div
            style={{
              ...glass,
              borderRadius: 999,
              padding: "20px 44px 24px",
              display: "flex",
              alignItems: "center",
              gap: 22,
            }}
          >
            {w.tone === "bad" ? <Cross /> : null}
            {inner}
          </div>
        ) : (
          inner
        )}
      </div>
    </AbsoluteFill>
  );
};

const Cross: React.FC = () => (
  <div style={{ width: 54, height: 54, borderRadius: 27, background: color.bad, display: "grid", placeItems: "center", flex: "none" }}>
    <svg width="26" height="26" viewBox="0 0 26 26">
      <path d="M5 5 L21 21 M21 5 L5 21" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  </div>
);

/** All phrases in the video, placed by absolute frame. */
export const Words: React.FC = () => {
  const frame = useCurrentFrame();
  const live = words.filter((w) => frame >= w.from && frame < w.until);
  return (
    <>
      {live.map((w) => (
        <Phrase key={w.id} w={w} frame={frame} />
      ))}
    </>
  );
};

