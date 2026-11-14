// A thin-bezel laptop in CSS 3D. `open` is the lid angle (0 closed, 1 open), `tilt` how
// far we look down on it, and `push` the camera's push into the screen (0 at rest, 1 when
// the screen exactly fills the frame, so a hard cut to full-frame content is seamless).
import React from "react";
import { AbsoluteFill } from "remotion";
import { H, W } from "../theme";

export const LID_W = 960;
export const SCREEN_W = 920;
export const SCREEN_H = (SCREEN_W * 9) / 16; // 517.5
const BEZEL_X = (LID_W - SCREEN_W) / 2;
const BEZEL_TOP = 22;
const BEZEL_BOTTOM = 24;
export const LID_H = SCREEN_H + BEZEL_TOP + BEZEL_BOTTOM;
const HINGE_Y = 700; // where the hinge sits in the frame
const BASE_D = 640; // depth of the base
const BASE_W = 1010;
export const SCREEN_CY = HINGE_Y - BEZEL_BOTTOM - SCREEN_H / 2;

export const Laptop: React.FC<{
  open: number;
  tilt: number;
  push: number;
  y?: number;
  scale?: number;
  screen: React.ReactNode;
  glow?: number;
}> = ({ open, tilt, push, y = 0, scale = 1, screen, glow = 1 }) => {
  // Lid: -90deg lies flat on the base (closed), 0deg stands upright facing us.
  const lidAngle = -90 * (1 - open);
  const k = 1 + (W / SCREEN_W - 1) * push;
  const dy = (H / 2 - SCREEN_CY) * push;
  const keys = Array.from({ length: 5 * 14 });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `${W / 2}px ${SCREEN_CY}px`,
          transform: `translateY(${dy + y}px) scale(${k * scale})`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, perspective: 2600, perspectiveOrigin: `50% ${SCREEN_CY}px` }}>
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: HINGE_Y,
              transformStyle: "preserve-3d",
              transform: `rotateX(${-tilt}deg)`,
              transformOrigin: "0 0",
            }}
          >
            {/* Shadow under the machine */}
            <div
              style={{
                position: "absolute",
                left: -BASE_W / 2 - 40,
                top: 0,
                width: BASE_W + 80,
                height: BASE_D + 60,
                transformOrigin: "50% 0",
                transform: "rotateX(90deg) translateZ(-14px)",
                background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.20), rgba(0,0,0,0) 65%)",
                filter: "blur(18px)",
              }}
            />
            {/* Base: lies flat, extending toward us from the hinge. */}
            <div
              style={{
                position: "absolute",
                left: -BASE_W / 2,
                top: 0,
                width: BASE_W,
                height: BASE_D,
                transformOrigin: "50% 0",
                transform: "rotateX(90deg)",
                borderRadius: "10px 10px 26px 26px",
                background: "linear-gradient(180deg, #d9dce1 0%, #e4e6ea 40%, #d3d6dc 100%)",
                boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.6), inset 0 -6px 12px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ position: "absolute", left: 70, right: 70, top: 46, height: 300, display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 7 }}>
                {keys.map((_, i) => (
                  <div key={i} style={{ background: "#26282c", borderRadius: 6, boxShadow: "0 1px 0 rgba(255,255,255,0.25)" }} />
                ))}
              </div>
              <div style={{ position: "absolute", left: "50%", marginLeft: -190, width: 380, top: 380, height: 230, borderRadius: 18, background: "linear-gradient(180deg, #d0d3d9, #d8dbe0)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
            </div>
            {/* Lid: hinged at its bottom edge. */}
            <div
              style={{
                position: "absolute",
                left: -LID_W / 2,
                top: -LID_H,
                width: LID_W,
                height: LID_H,
                transformOrigin: "50% 100%",
                // The hinge sits a little above the deck, so the shut lid never z-fights the keys.
                transform: `translateY(-10px) translateZ(4px) rotateX(${lidAngle}deg)`,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Inside: bezel and screen */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 26,
                  background: "#0c0c0e",
                  boxShadow: "0 0 0 2px #b9bcc2",
                  backfaceVisibility: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: BEZEL_X,
                    top: BEZEL_TOP,
                    width: SCREEN_W,
                    height: SCREEN_H,
                    overflow: "hidden",
                    borderRadius: 6,
                    background: "#000",
                  }}
                >
                  <div style={{ width: W, height: H, transform: `scale(${SCREEN_W / W})`, transformOrigin: "0 0", opacity: glow }}>{screen}</div>
                </div>
              </div>
              {/* Outside: the aluminium back, seen once the lid is shut */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 26,
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                  background: "linear-gradient(160deg, #e6e8ec 0%, #cfd2d8 55%, #c3c6cc 100%)",
                  boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.7)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
