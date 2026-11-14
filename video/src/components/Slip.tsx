// The recurring checklist: a paper civic form, "CIVIC Hack 2026 · Return slip", whose
// boxes are ticked in blue ballpoint on the beat as each one is shown working.
import React from "react";
import { interpolate } from "remotion";
import { boxes, clock, ticks } from "../storyboard";
import { color, font } from "../theme";
import { clamp, easeIn, easeOut, ramp } from "../motion";

export const SLIP_W = 1500;
export const SLIP_H = 900;
const COL_X = { A: 64, B: 790 };
const COL_W = 650;
const ROW_H = 58;
const LIST_TOP = 268;

/** Where a box's row sits on the slip (top-left, in slip pixels). */
export const rowRect = (id: string) => {
  const b = boxes.find((x) => x.id === id)!;
  const i = boxes.filter((x) => x.group === b.group).findIndex((x) => x.id === id);
  return { x: COL_X[b.group], y: LIST_TOP + i * ROW_H, w: COL_W, h: ROW_H };
};

const tickOf = (id: string) => ticks.find((t) => t.box === id);

/** 0..1 progress of a box's pen stroke at a frame. */
export const tickProgress = (id: string, frame: number) => {
  const t = tickOf(id);
  if (!t) return 0;
  return ramp(frame, t.frame - 4, 8, Easing2);
};
const Easing2 = (x: number) => 1 - Math.pow(1 - x, 2.2);

export const PenTick: React.FC<{ p: number; size: number }> = ({ p, size }) => {
  if (p <= 0) return null;
  const d = "M9 25 C 12 28, 15.5 32, 19.5 38 C 26 25, 36 9, 53 -7";
  return (
    <svg width={size * 1.25} height={size * 1.3} viewBox="0 -10 60 60" style={{ position: "absolute", left: -size * 0.04, top: -size * 0.24, overflow: "visible" }}>
      <path d={d} pathLength={1} fill="none" stroke={color.pen} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - p} />
      <path d={d} pathLength={1} fill="none" stroke="#3a5fd0" strokeOpacity={0.45} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - p} transform="translate(1.2 -0.8)" />
    </svg>
  );
};

export const Checkbox: React.FC<{ p: number; size?: number }> = ({ p, size = 40 }) => {
  const bump = p > 0 && p < 1 ? 1 + Math.sin(p * Math.PI) * 0.08 : 1;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none", transform: `scale(${bump})` }}>
      <div style={{ position: "absolute", inset: 0, border: `2.5px solid ${color.formInk}`, borderRadius: 4, background: "#fffef9" }} />
      <PenTick p={p} size={size} />
    </div>
  );
};

/** Handwritten text that writes itself on, left to right. */
export const Hand: React.FC<{ text: string; p: number; size?: number; style?: React.CSSProperties }> = ({ text, p, size = 36, style }) => (
  <span
    style={{
      fontFamily: font.hand,
      fontWeight: 700,
      fontSize: size,
      color: color.pen,
      clipPath: `inset(-20% ${100 - p * 100}% -20% -5%)`,
      display: "inline-block",
      lineHeight: 1,
      ...style,
    }}
  >
    {text}
  </span>
);

export const SlipRow: React.FC<{ id: string; frame: number; highlight?: number }> = ({ id, frame, highlight = 0 }) => {
  const b = boxes.find((x) => x.id === id)!;
  const t = tickOf(id);
  const p = tickProgress(id, frame);
  const handP = t ? ramp(frame, t.frame + 2, 9, easeOut) : 0;
  return (
    <div style={{ position: "relative", height: ROW_H, display: "flex", alignItems: "center", gap: 20 }}>
      {highlight > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 56,
            top: 12,
            height: ROW_H - 22,
            width: `${highlight * 74}%`,
            background: "rgba(255, 226, 77, 0.55)",
            borderRadius: 3,
            transform: "skewX(-8deg)",
          }}
        />
      ) : null}
      <Checkbox p={p} size={38} />
      <div style={{ position: "relative", fontFamily: font.sans, fontSize: 27, fontWeight: 500, color: color.formInk, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
        {b.label}
      </div>
      <div style={{ flex: 1, borderBottom: `2px dotted ${color.formRule}`, height: 1, marginTop: 18 }} />
      <div style={{ width: 92, position: "relative", height: 40, borderBottom: `1.5px solid ${color.formRule}` }}>
        {t ? <Hand text={clock(t.shown)} p={handP} size={34} style={{ position: "absolute", left: 10, top: 2 }} /> : null}
      </div>
    </div>
  );
};

export const Stamp: React.FC<{ text: string; frame: number; at: number; style?: React.CSSProperties }> = ({ text, frame, at, style }) => {
  if (frame < at - 4) return null;
  const s = interpolate(frame, [at - 4, at], [2.2, 1], { ...clamp, easing: easeIn });
  const o = interpolate(frame, [at - 4, at - 1], [0, 0.9], clamp);
  return (
    <div
      style={{
        position: "absolute",
        transform: `rotate(-9deg) scale(${s})`,
        opacity: o,
        border: `7px solid ${color.bad}`,
        outline: `2.5px solid ${color.bad}`,
        outlineOffset: 5,
        borderRadius: 14,
        padding: "14px 34px 16px",
        color: color.bad,
        fontFamily: font.sans,
        fontWeight: 900,
        fontSize: 54,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        mixBlendMode: "multiply",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

const Perforation: React.FC = () => (
  <div style={{ position: "absolute", top: 34, left: 28, right: 28, display: "flex", alignItems: "center", gap: 14 }}>
    <svg width="34" height="24" viewBox="0 0 34 24" style={{ flex: "none" }}>
      <circle cx="7" cy="6" r="5" fill="none" stroke="#8b8676" strokeWidth="2" />
      <circle cx="7" cy="18" r="5" fill="none" stroke="#8b8676" strokeWidth="2" />
      <path d="M11 9 L32 20 M11 15 L32 4" stroke="#8b8676" strokeWidth="2" />
    </svg>
    <div style={{ flex: 1, borderTop: "3px dashed #b9b3a1" }} />
    <div style={{ fontFamily: font.mono, fontSize: 15, color: "#8b8676", letterSpacing: "0.12em" }}>DETACH AND RETURN</div>
  </div>
);

/** The whole form. `frame` is the absolute frame, so ticks accumulate across the video. */
export const Slip: React.FC<{ frame: number; highlight?: Record<string, number>; children?: React.ReactNode }> = ({ frame, highlight = {}, children }) => {
  const group = (g: "A" | "B") => boxes.filter((b) => b.group === g);
  const doneA = group("A").filter((b) => tickProgress(b.id, frame) >= 1).length;
  const doneB = group("B").filter((b) => tickProgress(b.id, frame) >= 1).length;
  return (
    <div
      style={{
        position: "relative",
        width: SLIP_W,
        height: SLIP_H,
        background: `linear-gradient(180deg, #fdfcf7 0%, ${color.paper} 60%, #f6f3ea 100%)`,
        borderRadius: 10,
        boxShadow: "0 40px 90px rgba(30,25,10,0.22), 0 3px 10px rgba(30,25,10,0.10)",
        overflow: "hidden",
      }}
    >
      <Perforation />
      <div style={{ position: "absolute", top: 86, left: 64, right: 64, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: font.sans, fontWeight: 800, fontSize: 50, letterSpacing: "-0.03em", color: color.ink }}>
            CIVIC Hack 2026 <span style={{ color: "#a39d8a", fontWeight: 600 }}>·</span> Return slip
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 34, fontFamily: font.sans, fontSize: 22, color: "#6d6858" }}>
            <span>
              Project <Hand text="Municipal Agents" p={1} size={34} style={{ marginLeft: 8, borderBottom: `1.5px solid ${color.formRule}`, padding: "0 10px" }} />
            </span>
            <span>
              Built by <Hand text="Richard Li" p={1} size={34} style={{ marginLeft: 8, borderBottom: `1.5px solid ${color.formRule}`, padding: "0 10px" }} />
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 17, color: "#6d6858", lineHeight: 1.5 }}>
          <div>FORM CH-26 · PLEASE TICK EACH BOX</div>
          <div>FUTURE CITIES INSTITUTE · WATERLOO</div>
        </div>
      </div>
      {(["A", "B"] as const).map((g) => (
        <div key={g} style={{ position: "absolute", left: COL_X[g], top: LIST_TOP - 52, width: COL_W }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `2px solid ${color.formInk}`, paddingBottom: 6, height: 46, boxSizing: "border-box" }}>
            <div style={{ fontFamily: font.sans, fontWeight: 800, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: color.formInk }}>
              {g === "A" ? "Part A · The five challenges" : "Part B · Judging criteria"}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 16, color: "#8b8676" }}>
              {g === "A" ? doneA : doneB}/{group(g).length} · SHOWN AT
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            {group(g).map((b) => (
              <SlipRow key={b.id} id={b.id} frame={frame} highlight={highlight[b.id] ?? 0} />
            ))}
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 40, display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 16, color: "#8b8676", letterSpacing: "0.06em" }}>
        <span>TIMES ARE WHERE EACH ONE IS SHOWN IN THIS VIDEO</span>
        <span>DEADLINE SAT 14 NOV 2026, 10:00 ET</span>
      </div>
      {children}
    </div>
  );
};

