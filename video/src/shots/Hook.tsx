// The hook: the laptop opens on the real 2026 budget book, the camera pushes into the
// screen, every one of its 191 pages flips past, and the pages pull back into a grid.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import manifest from "../generated/manifest.json";
import { Laptop } from "../components/Laptop";
import { cf, f } from "../timing";
import { color, font, H, W } from "../theme";
import { clamp, easeIn, easeInOut, easeOut, lerp, pop } from "../motion";

const pages = manifest.pages as string[];
const thumbs = manifest.thumbs as string[];
const pageSrc = (i: number) => staticFile(`docs/pages/budget-book/${pages[Math.max(0, Math.min(pages.length - 1, i))]}`);
const TOTAL = pages.length || 191;

/** A plain PDF viewer frame around one page, filling 1920x1080. */
export const PdfDesk: React.FC<{ page: number; children?: React.ReactNode }> = ({ page, children }) => (
  <AbsoluteFill style={{ background: "#2b2d31", fontFamily: font.sans }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 64, background: "#1e1f22", display: "flex", alignItems: "center", padding: "0 28px", color: "#d5d7db", fontSize: 22, gap: 16 }}>
      <div style={{ display: "flex", gap: 9 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
        ))}
      </div>
      <div style={{ marginLeft: 18, fontWeight: 600 }}>2026_final_budget_book.pdf</div>
      <div style={{ flex: 1 }} />
      <div style={{ fontFamily: font.mono, fontSize: 20, color: "#aeb2b8" }}>
        {page + 1} / {TOTAL}
      </div>
    </div>
    {children ?? (
      pages.length ? (
        <div style={{ position: "absolute", top: 88, bottom: 24, left: 0, right: 0, display: "grid", placeItems: "center" }}>
          <Img src={pageSrc(page)} style={{ maxHeight: 968, maxWidth: 1400, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
        </div>
      ) : null
    )}
  </AbsoluteFill>
);

export const LaptopOpen: React.FC<{ frame: number }> = ({ frame }) => {
  const openAt = f(1, 1) - 2;
  const open = interpolate(frame, [openAt, openAt + 26], [0, 1], { ...clamp, easing: easeOut });
  const push = interpolate(frame, [cf("1.3"), f(2, 1)], [0, 1], { ...clamp, easing: easeIn });
  const tilt = lerp(20, 0, interpolate(frame, [cf("1.2"), f(2, 1)], [0, 1], { ...clamp, easing: easeInOut }));
  const glow = interpolate(frame, [openAt + 8, openAt + 22], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: color.ground }}>
      <Laptop open={open} tilt={tilt} push={push} y={(1 - open) * -130} screen={<PdfDesk page={0} />} glow={glow} />
    </AbsoluteFill>
  );
};

/** Grid of all pages: 24 columns x 8 rows. */
const COLS = 24;
const CELL_W = 74;
const CELL_H = 96;
const GAP = 4;
const GRID_W = COLS * (CELL_W + GAP);
const GRID_H = Math.ceil(TOTAL / COLS) * (CELL_H + GAP);
const cellCenter = (i: number) => ({
  x: (W - GRID_W) / 2 + (i % COLS) * (CELL_W + GAP) + CELL_W / 2,
  y: (H - GRID_H) / 2 + Math.floor(i / COLS) * (CELL_H + GAP) + CELL_H / 2 + 30,
});

export const PdfFlip: React.FC<{ frame: number }> = ({ frame }) => {
  const a = f(2, 1);
  const b = f(2, 3);
  const c = f(3, 1);
  if (frame < b) {
    // Riffle: one page per few frames, accelerating, through the whole book.
    const t = interpolate(frame, [a, b], [0, 1], clamp);
    const idx = Math.floor(Math.pow(t, 1.6) * 64);
    const sub = (Math.pow(t, 1.6) * 64) % 1;
    return (
      <PdfDesk page={idx}>
        <div style={{ position: "absolute", top: 88, bottom: 24, left: 0, right: 0, display: "grid", placeItems: "center" }}>
          <Img src={pageSrc(idx + 1)} style={{ gridArea: "1/1", maxHeight: 968, maxWidth: 1400, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
          <Img
            src={pageSrc(idx)}
            style={{
              gridArea: "1/1",
              maxHeight: 968,
              maxWidth: 1400,
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              transformOrigin: "0% 50%",
              transform: `perspective(2400px) rotateY(${-sub * 100}deg)`,
              opacity: 1 - Math.max(0, sub - 0.7) * 3,
            }}
          />
        </div>
      </PdfDesk>
    );
  }
  // Pull back to every page at once.
  const z = interpolate(frame, [b, b + 22], [0, 1], { ...clamp, easing: easeInOut });
  const drift = interpolate(frame, [c, f(4, 1)], [0, 1], clamp);
  const focus = cellCenter(64);
  const s0 = 968 / CELL_H;
  const scale = lerp(s0, 1, z) * (1 + drift * 0.08);
  const tx = lerp(W / 2 - focus.x * s0, 0, z);
  const ty = lerp((88 + (H - 24 - 88) / 2) - focus.y * s0, 0, z);
  const shown = Math.min(TOTAL, Math.floor(interpolate(frame, [b, b + 16], [65, TOTAL], clamp)));
  return (
    <AbsoluteFill style={{ background: lerp(0, 1, z) > 0.5 ? color.ground : "#2b2d31" }}>
      <AbsoluteFill style={{ background: color.ground, opacity: z }} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        {thumbs.slice(0, TOTAL).map((t, i) => {
          const p = cellCenter(i);
          const appear = i < 65 ? 1 : pop(frame, b + (i - 65) * 0.12, { damping: 14, stiffness: 240 });
          if (i >= shown && i >= 65) return null;
          return (
            <Img
              key={t}
              src={staticFile(`docs/pages/budget-book-thumbs/${t}`)}
              style={{
                position: "absolute",
                left: p.x - CELL_W / 2,
                top: p.y - CELL_H / 2,
                width: CELL_W,
                height: CELL_H,
                objectFit: "contain",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                transform: `scale(${appear})`,
              }}
            />
          );
        })}
      </div>
      {/* The last riffled page, fading as the pull-back starts, so the cut is seamless. */}
      <AbsoluteFill style={{ opacity: interpolate(frame, [b, b + 7], [1, 0], clamp), transform: `scale(${1 / (1 + z * 6)})` }}>
        <PdfDesk page={64} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Bar 4: the name. The words come from the storyboard; this draws the mark above them. */
export const Title: React.FC<{ frame: number }> = ({ frame }) => {
  const e = pop(frame, f(4, 1) - 1, { damping: 13, stiffness: 200 });
  return (
    <AbsoluteFill style={{ background: color.ground }}>
      <div style={{ position: "absolute", left: W / 2 - 52, top: 220, width: 104, height: 104, borderRadius: 30, background: color.accent, transform: `scale(${e}) rotate(${(1 - e) * -20}deg)`, display: "grid", placeItems: "center", boxShadow: "0 20px 50px rgba(31,95,214,0.35)" }}>
        <svg width="62" height="62" viewBox="0 0 60 60">
          <rect x="12" y="8" width="36" height="44" rx="5" fill="none" stroke="#fff" strokeWidth="4.5" />
          <path d="M20 31 L27 38 L41 22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
