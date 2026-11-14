// A product clip under a moving camera. Until a clip is recorded, a labelled stand-in
// card ("Footage: <what>") takes its place so the whole video renders end to end.
import React from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import manifest from "../generated/manifest.json";
import footageSpec from "../../footage.json";
import type { CameraKey } from "../storyboard";
import { cf } from "../timing";
import { color, font, H, W } from "../theme";
import { clamp, easeInOut } from "../motion";

type Clip = { file: string; frames: number | null };
const clips = manifest.footage as Record<string, Clip>;
const specs = footageSpec.clips as Record<string, { what: string; layout: string; path: string }>;

/** Camera state at an absolute frame from keyframes: zoom z, focus point x,y (0..1 of the frame). */
export const cameraAt = (keys: CameraKey[] | undefined, frame: number) => {
  if (!keys || keys.length === 0) return { z: 1, x: 0.5, y: 0.5 };
  const ks = keys.map((k) => ({ ...k, f: cf(k.at) }));
  if (frame <= ks[0].f) return ks[0];
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { ...clamp, easing: easeInOut });
      return { z: a.z + (b.z - a.z) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return ks[ks.length - 1];
};

/** Moves a 1920x1080 layer so focus (x,y) is centred at zoom z, never showing an edge. */
export const Camera: React.FC<{ z: number; x: number; y: number; children: React.ReactNode }> = ({ z, x, y, children }) => {
  const zz = Math.max(1, z);
  const fx = Math.min(1 - 0.5 / zz, Math.max(0.5 / zz, x));
  const fy = Math.min(1 - 0.5 / zz, Math.max(0.5 / zz, y));
  const tx = W / 2 - fx * W * zz;
  const ty = H / 2 - fy * H * zz;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${zz})` }}>{children}</div>
    </AbsoluteFill>
  );
};

export const hasClip = (id: string) => Boolean(clips[id]);

/** Stand-in: a quiet wireframe of the screen the clip will show, labelled with what to record. */
export const StandIn: React.FC<{ id: string; label?: string; layout?: string; dark?: boolean }> = ({ id, label, layout, dark }) => {
  const frame = useCurrentFrame();
  const spec = specs[id];
  const lay = layout ?? spec?.layout ?? "page";
  const bg = dark ? "#121417" : "#f5f6f8";
  const block = dark ? "#1f2328" : "#ffffff";
  const line = dark ? "#2c3138" : "#e6e8ec";
  const bar = (w: string | number, h = 14, o = 1) => <div style={{ width: w, height: h, borderRadius: h / 2, background: line, opacity: o, marginBottom: 14 }} />;
  const card = (style: React.CSSProperties, n = 4) => (
    <div style={{ background: block, borderRadius: 24, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", ...style }}>
      {bar("55%", 20)}
      {Array.from({ length: n }).map((_, i) => (
        <React.Fragment key={i}>{bar(`${92 - ((i * 17) % 35)}%`)}</React.Fragment>
      ))}
    </div>
  );
  const map = (style: React.CSSProperties) => (
    <div style={{ borderRadius: 32, overflow: "hidden", background: dark ? "#192029" : "#e9eef3", position: "relative", ...style }}>
      <svg width="100%" height="100%" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 14 }).map((_, i) => (
          <path key={i} d={`M ${-50 + i * 70} 0 C ${100 + i * 40} 300, ${i * 60} 500, ${200 + i * 50} 800`} stroke={dark ? "#26303b" : "#d6dde6"} strokeWidth={i % 4 === 0 ? 9 : 3} fill="none" />
        ))}
        <path d="M120 620 L300 470 L420 430 L560 260 L700 180" stroke={color.accent} strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.55} />
        <circle cx={420} cy={430} r={60} fill={color.accent} opacity={0.12} />
      </svg>
    </div>
  );
  const body =
    lay === "brief" ? (
      <div style={{ display: "grid", gridTemplateColumns: "560px 1fr 420px", gap: 24, height: "100%" }}>
        {card({ height: "100%" }, 14)}
        {map({ height: "100%" })}
        {card({ height: "100%" }, 10)}
      </div>
    ) : lay === "home" ? (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 620px", gap: 24, height: "100%" }}>
        {map({ height: "100%" })}
        <div style={{ display: "grid", gap: 20, gridTemplateRows: "90px 1fr 1fr 1fr" }}>
          {card({}, 0)}
          {card({}, 2)}
          {card({}, 2)}
          {card({}, 2)}
        </div>
      </div>
    ) : lay === "staff" ? (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, height: "100%" }}>
        {card({ height: "100%" }, 14)}
        {card({ height: "100%" }, 14)}
      </div>
    ) : lay === "viewer" ? (
      <div style={{ display: "grid", placeItems: "center", height: "100%", background: dark ? "#0c0e10" : "#3a3d42", borderRadius: 32 }}>
        <div style={{ width: 640, height: 830, background: "#fff", borderRadius: 6, padding: 50 }}>
          {Array.from({ length: 22 }).map((_, i) => (
            <div key={i} style={{ height: 12, borderRadius: 6, marginBottom: 20, width: `${95 - ((i * 13) % 30)}%`, background: i === 11 ? "rgba(255,214,0,0.75)" : "#e8e8e8" }} />
          ))}
        </div>
      </div>
    ) : (
      card({ height: "100%" }, 18)
    );
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: font.sans }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, background: block, borderBottom: `1px solid ${line}`, display: "flex", alignItems: "center", padding: "0 36px", gap: 18 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: color.accent }} />
        <div style={{ fontWeight: 700, fontSize: 22, color: dark ? "#e9ecef" : color.ink }}>Municipal Agents</div>
        <div style={{ flex: 1 }} />
        {bar(120, 14, 0.9)}
        {bar(90, 14, 0.9)}
      </div>
      <div style={{ position: "absolute", top: 96, left: 24, right: 24, bottom: 24 }}>{body}</div>
      <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
        <div
          style={{
            background: "rgba(11,11,12,0.86)",
            color: "#fff",
            borderRadius: 20,
            padding: "22px 34px",
            maxWidth: 1100,
            fontFamily: font.mono,
            fontSize: 26,
            lineHeight: 1.35,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: "0.14em", color: "#9aa0a6", marginBottom: 8 }}>STAND-IN · FOOTAGE TO RECORD · {id.toUpperCase()}</div>
          <div>Footage: {label ?? spec?.what ?? id}</div>
          <div style={{ fontSize: 18, color: "#9aa0a6", marginTop: 8 }}>
            {spec?.path ?? ""} · frame {frame}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The clip (or its stand-in) for a scene, starting at the scene's first frame. */
export const Footage: React.FC<{ clip: string; camera?: CameraKey[]; start: number; rate?: number; trimFrames?: number; veil?: number; blur?: number; holdAfter?: number }> = ({
  clip,
  camera,
  start,
  rate = 1,
  trimFrames = 0,
  veil,
  blur = 0,
  holdAfter,
}) => {
  const frame = useCurrentFrame();
  const cam = cameraAt(camera, frame + start);
  const c = clips[clip];
  // A white veil and blur that hold, then snap away in the last frames before `veil`.
  const v = veil !== undefined ? interpolate(frame + start, [veil - 4, veil], [1, 0], clamp) : 0;
  const b = Math.max(blur, v * 22);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: b > 0 ? `blur(${b}px)` : undefined }}>
        <FootageInner clip={clip} c={c} cam={cam} rate={rate} trimFrames={trimFrames} holdAfter={holdAfter} />
      </AbsoluteFill>
      {v > 0 ? <AbsoluteFill style={{ background: `rgba(255,255,255,${0.72 * v})` }} /> : null}
    </AbsoluteFill>
  );
};

const FootageInner: React.FC<{ clip: string; c: Clip | undefined; cam: { z: number; x: number; y: number }; rate: number; trimFrames: number; holdAfter?: number }> = ({ clip, c, cam, rate, trimFrames, holdAfter }) => {
  const local = useCurrentFrame();
  // If a clip runs out before its scene does, hold its last frame rather than going blank;
  // `holdAfter` (seconds into the clip) holds earlier, on a chosen moment.
  const end = c?.frames ? Math.floor((c.frames - trimFrames) / rate) - 2 : Infinity;
  const last = holdAfter !== undefined ? Math.min(end, Math.round((holdAfter * 30 - trimFrames) / rate)) : end;
  const video = c ? <OffthreadVideo src={staticFile(c.file)} muted playbackRate={rate} trimBefore={trimFrames} style={{ width: W, height: H }} /> : null;
  return (
    <Camera {...cam}>
      {c ? (
        <Sequence from={0} layout="none">
          {local > last ? <Freeze frame={last}>{video}</Freeze> : video}
        </Sequence>
      ) : (
        <StandIn id={clip} />
      )}
    </Camera>
  );
};
