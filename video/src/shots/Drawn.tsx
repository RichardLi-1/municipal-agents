// Drawn shots: who it's for, design, another city, under the hood, and the final drop.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import manifest from "../generated/manifest.json";
import music from "../../music.json";
import { Footage, StandIn } from "../components/Footage";
import { Slip, SLIP_H, SLIP_W } from "../components/Slip";
import { glass } from "../components/Words";
import type { Scene, DropItem } from "../storyboard";
import { ticks, trimFor } from "../storyboard";
import { BEAT_FRAMES, cf, f, TOTAL_FRAMES } from "../timing";
import { color, font, H, W } from "../theme";
import { clamp, easeInOut, easeOut, pop, ramp } from "../motion";

const images = manifest.images as Record<string, boolean>;
type Text = { file: string; text: string } | null;

export const White: React.FC = () => <AbsoluteFill style={{ background: color.ground }} />;

// ---- Who it's for (bars 52-53) -------------------------------------------------------
const residents = ["Renters", "Homeowners", "Transit riders", "Drivers", "People who walk or cycle", "Business owners", "Seniors", "Students", "Parents", "People with a disability", "Newcomers"];
const serving = ["Clerks", "Communications staff", "Planners", "Councillors' offices", "Community groups"];

const Chip: React.FC<{ text: string; p: number; staff?: boolean }> = ({ text, p, staff }) => (
  <div
    style={{
      transform: `scale(${0.6 + 0.4 * p}) translateY(${(1 - p) * 30}px)`,
      opacity: Math.min(1, p * 1.4),
      padding: "16px 30px 18px",
      borderRadius: 999,
      fontFamily: font.sans,
      fontWeight: 650,
      fontSize: 40,
      letterSpacing: "-0.02em",
      ...(staff ? {} : glass),
      background: staff ? color.accent : "rgba(255,255,255,0.7)",
      color: staff ? "#fff" : color.ink,
      boxShadow: staff ? "0 14px 34px rgba(31,95,214,0.32)" : glass.boxShadow,
    }}
  >
    {text}
  </div>
);

export const Audiences: React.FC<{ frame: number; scene: Scene }> = ({ frame, scene }) => {
  const a = cf("52.1.5");
  const step = BEAT_FRAMES / 4.5;
  const b = f(53, 1);
  return (
    <AbsoluteFill style={{ background: color.ground }}>
      {scene.shot.clip ? (
        <AbsoluteFill>
          <Footage clip={scene.shot.clip} start={scene.start} blur={20} camera={[{ at: "52.1", z: 1.1, x: 0.5, y: 0.5 }, { at: "54.1", z: 1.25, x: 0.5, y: 0.5 }]} />
          <AbsoluteFill style={{ background: "rgba(255,255,255,0.62)" }} />
        </AbsoluteFill>
      ) : null}
      <div style={{ position: "absolute", top: 380, left: 120, right: 120, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" }}>
        {residents.map((r, i) => (
          <Chip key={r} text={r} p={pop(frame, a + i * step, { damping: 14, stiffness: 260 })} />
        ))}
      </div>
      <div style={{ position: "absolute", top: 760, left: 120, right: 120, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" }}>
        {serving.map((r, i) => (
          <Chip key={r} text={r} staff p={pop(frame, b + 3 + i * step, { damping: 14, stiffness: 260 })} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---- Design & clarity (bars 54-55) ----------------------------------------------------
const Still: React.FC<{ src: string; id: string; dark?: boolean; label: string }> = ({ src, id, dark, label }) =>
  images[src] ? (
    <Img src={staticFile(src.startsWith("shots/") ? src : `docs/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left" }} />
  ) : (
    <div style={{ width: W, height: H, transform: "scale(var(--s))", transformOrigin: "0 0" }}>
      <StandIn id={id} label={label} dark={dark} layout="brief" />
    </div>
  );

export const Design: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => {
  const split = f(55, 1);
  if (frame < split) {
    return <Footage clip="language" start={scene.start} trimFrames={trimFor("language", { align: { mark: "pick", at: "54.2" } }, scene.start)} camera={[{ at: "54.1", z: 1.4, x: 0.18, y: 0.35 }, { at: "55.1", z: 1.5, x: 0.18, y: 0.45 }]} />;
  }
  const a = pop(frame, split, { damping: 18, stiffness: 220 });
  const b = pop(frame, cf("55.2"), { damping: 18, stiffness: 220 });
  const darkW = 1180;
  const darkH = (darkW * 9) / 16;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #f7f8fa, #e9ecf1)" }}>
      <div style={{ position: "absolute", left: 90, top: 190, width: darkW, height: darkH, borderRadius: 28, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,0.3)", transform: `translateY(${(1 - a) * 80}px) scale(${0.94 + 0.06 * a})`, opacity: a, background: "#121417" }}>
        <div style={{ ["--s" as string]: darkW / W, width: "100%", height: "100%" } as React.CSSProperties}>
          <Still src="shots/dark.png" id="dark" dark label="the brief in dark mode (2x screenshot)" />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1370, top: 120, width: 400, height: 830, borderRadius: 64, background: "#0c0c0e", padding: 16, boxShadow: "0 40px 90px rgba(0,0,0,0.3)", transform: `translateY(${(1 - b) * 120}px) rotate(${(1 - b) * 6}deg)`, opacity: b }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", background: "#fff", position: "relative" }}>
          {images["shots/phone.png"] ? (
            <Img src={staticFile("shots/phone.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, background: "#f5f6f8", fontFamily: font.mono, fontSize: 20, textAlign: "center", color: "#3b3f45" }}>
              STAND-IN
              <br />
              Footage: the brief on a phone (390x844)
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- Code-ish cards -------------------------------------------------------------------
const codeColors = (line: string) => {
  // A light touch of syntax colour: strings, numbers, keys, keywords, comments.
  const parts: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\/\/.*$)|(\b(?:export|const|function|async|await|return|if|for|of|interface|type|import|from|new|throw)\b)|(-?\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const c = m[1] ? "#7aa2ff" : m[2] ? "#9ad48a" : m[3] ? "#7d8590" : m[4] ? "#ff8f6b" : "#f2c46d";
    parts.push(
      <span key={k++} style={{ color: c }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
};

export const CodeCard: React.FC<{ file: string; text: string; reveal?: number; startLine?: number; style?: React.CSSProperties; size?: number }> = ({ file, text, reveal = 1, startLine = 1, style, size = 24 }) => {
  const chars = Math.floor(text.length * reveal);
  const shown = text.slice(0, chars).split("\n");
  return (
    <div style={{ background: "#0f1115", borderRadius: 26, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,0.30)", ...style }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", background: "#171a20", fontFamily: font.mono, fontSize: 20, color: "#c9d1d9" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <span style={{ marginLeft: 14 }}>{file}</span>
      </div>
      <div style={{ padding: "22px 28px", fontFamily: font.mono, fontSize: size, lineHeight: 1.45, color: "#e6edf3", whiteSpace: "pre" }}>
        {shown.map((l, i) => (
          <div key={i} style={{ display: "flex" }}>
            <span style={{ width: 52, color: "#4b535d", flex: "none" }}>{startLine + i}</span>
            <span>{codeColors(l)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Another city (bars 58-59) --------------------------------------------------------
export const Config: React.FC<{ frame: number }> = ({ frame }) => {
  const city = manifest.city as Text;
  const type = manifest.cityType as Text;
  // The real config types out over two beats; then the shape for another city lands.
  const typed = ramp(frame, f(58, 1), cf("58.3") - f(58, 1), (x) => x);
  const secondAt = cf("58.3");
  const second = pop(frame, secondAt, { damping: 17, stiffness: 200 });
  const cityLines = (city?.text ?? "").split("\n").slice(0, 22).join("\n");
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #f7f8fa, #e9ecf1)" }}>
      {city ? (
        <CodeCard file={city.file} text={cityLines} reveal={typed} size={22} style={{ position: "absolute", left: 90, top: 150, width: 980 }} />
      ) : (
        <StandIn id="config" label="cities/<city>.json" />
      )}
      {type && frame >= secondAt ? (
        <CodeCard
          file="cities/<your-city>.json  ·  shape from shared/types.ts"
          text={type.text}
          size={22}
          style={{ position: "absolute", left: 250, top: 330, width: 900, transform: `translateY(${(1 - second) * 500}px) rotate(${(1 - second) * 3}deg)`, border: `2px solid ${color.accent}` }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// ---- Under the hood (bars 60-61) ------------------------------------------------------
export const Requirements: React.FC<{ frame: number }> = ({ frame }) => {
  const doc = manifest.requirements as Text;
  if (frame < f(61, 1)) return <White />;
  const p = pop(frame, f(61, 1), { damping: 18, stiffness: 200 });
  const scroll = interpolate(frame, [f(61, 1), f(62, 1)], [0, 900], { ...clamp, easing: easeInOut });
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #f7f8fa, #e9ecf1)" }}>
      <div style={{ position: "absolute", left: 360, right: 360, top: 90, bottom: -40, background: "#fff", borderRadius: 28, overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,0.18)", transform: `translateY(${(1 - p) * 300}px)` }}>
        {doc ? (
          <div style={{ padding: "50px 70px", transform: `translateY(${-scroll}px)`, fontFamily: font.sans, fontSize: 24, lineHeight: 1.5, color: color.ink, whiteSpace: "pre-wrap" }}>
            <div style={{ fontFamily: font.mono, fontSize: 18, color: color.muted, marginBottom: 16 }}>{doc.file}</div>
            <Markdown text={doc.text.slice(0, 5000)} />
          </div>
        ) : (
          <div style={{ width: W, height: H, transform: `scale(${1200 / W})`, transformOrigin: "0 0" }}>
            <StandIn id="requirements" label="docs/requirements.md scrolling (not written yet)" layout="page" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Just enough Markdown to read: headings bold, table pipes as dots, no asterisks or backticks. */
export const Markdown: React.FC<{ text: string; size?: number }> = ({ text, size = 24 }) => (
  <div style={{ whiteSpace: "normal" }}>
    {text.split("\n").map((raw, i) => {
      if (/^\s*\|?\s*-{3,}/.test(raw)) return null;
      const h = raw.match(/^(#{1,3})\s+(.*)/);
      const clean = (h ? h[2] : raw).replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      const line = clean.trim().startsWith("|") ? clean.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join("  ·  ") : clean;
      if (!line.trim()) return <div key={i} style={{ height: size * 0.6 }} />;
      return (
        <div key={i} style={{ fontSize: h ? size * (h[1].length === 1 ? 1.6 : 1.25) : size, fontWeight: h ? 800 : 400, letterSpacing: h ? "-0.02em" : 0, marginTop: h ? size * 0.6 : 0, lineHeight: 1.45 }}>
          {line}
        </div>
      );
    })}
  </div>
);

// ---- The final drop (bars 62-68) ------------------------------------------------------
const PANE = { x: 56, y: 120, w: 1040, h: 904 };

const SelfFilm: React.FC<{ frame: number }> = ({ frame }) => {
  const sections = music.sections;
  const tone: Record<string, string> = { groove: "#c9d7f5", lift: "#9fb9ef", silence: "#eef0f3", drop: color.accent, quiet: "#e3e7ee", build: "#7f9fe6", "ring-out": "#0b0b0c" };
  const head = frame / TOTAL_FRAMES;
  return (
    <AbsoluteFill style={{ background: "#fff", padding: 60, fontFamily: font.sans }}>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>This video</div>
      <div style={{ fontFamily: font.mono, fontSize: 22, color: color.muted, marginTop: 8 }}>
        Remotion · {TOTAL_FRAMES} frames · {music.bpm} BPM · {music.bars} bars · every cue on the beat
      </div>
      <div style={{ position: "relative", marginTop: 60, height: 160, display: "flex", gap: 3 }}>
        {Array.from({ length: music.bars }).map((_, i) => {
          const sec = sections.find((s) => i + 1 >= s.bars[0] && i + 1 <= s.bars[1]);
          return <div key={i} style={{ flex: 1, borderRadius: 4, background: tone[sec?.energy ?? "groove"] }} />;
        })}
        <div style={{ position: "absolute", top: -14, bottom: -14, left: `${head * 100}%`, width: 5, background: color.bad, borderRadius: 3 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 20, color: color.muted, marginTop: 24 }}>
        <span>bar 1</span>
        <span>first drop · 28</span>
        <span>final drop · 62</span>
        <span>70</span>
      </div>
      <div style={{ marginTop: 50, fontFamily: font.mono, fontSize: 22, lineHeight: 1.6, color: "#3b3f45" }}>
        video/storyboard.json → every scene by bar, every fact with its source page
      </div>
    </AbsoluteFill>
  );
};

const Evidence: React.FC<{ item: DropItem; frame: number; next: number }> = ({ item, frame, next }) => {
  const at = cf(item.at);
  const local = (frame - at) / Math.max(1, next - at);
  const code = manifest.code as { file: string; line: number; text: string }[];
  const text = (key: string) => (manifest as unknown as Record<string, Text>)[key];
  if (item.kind === "image") {
    const src = item.src;
    const has = images[src];
    return has ? (
      <AbsoluteFill style={{ background: "#fff", display: "grid", placeItems: "center" }}>
        <Img src={staticFile(src.startsWith("shots/") ? src : `docs/${src}`)} style={{ maxWidth: "94%", maxHeight: "90%", objectFit: "contain", transform: `scale(${1 + local * 0.08})` }} />
      </AbsoluteFill>
    ) : (
      <div style={{ width: W, height: H, transform: `scale(${PANE.w / W})`, transformOrigin: "0 0" }}>
        <StandIn id={src} label={`${item.label} (${src})`} layout="page" />
      </div>
    );
  }
  if (item.kind === "code") {
    const i = Math.min(code.length - 1, Math.floor(((frame - at) / BEAT_FRAMES) % Math.max(1, code.length)));
    const c = code[i];
    return c ? (
      <AbsoluteFill style={{ background: "#0f1115" }}>
        <CodeCard file={`${c.file}:${c.line}`} text={c.text} startLine={c.line} size={21} style={{ borderRadius: 0, boxShadow: "none", height: "100%" }} />
      </AbsoluteFill>
    ) : (
      <StandIn id="code-tour" label="code tour" />
    );
  }
  if (item.kind === "text") {
    const t = text(item.src);
    return t ? (
      <AbsoluteFill style={{ background: "#0f1115", display: "grid", placeItems: "center" }}>
        <CodeCard file={t.file} text={t.text} size={19} style={{ borderRadius: 0, boxShadow: "none", width: "100%", height: "100%", transform: `scale(${1 + local * 0.06})` }} />
      </AbsoluteFill>
    ) : (
      <StandIn id={item.src} label={item.label} layout="page" />
    );
  }
  if (item.kind === "terminal") {
    const t = text(item.src);
    return (
      <AbsoluteFill style={{ background: "#0b0d10", padding: 40, fontFamily: font.mono, fontSize: 22, lineHeight: 1.5, color: "#d6dde6", whiteSpace: "pre-wrap" }}>
        {t ? (
          <div style={{ transform: `translateY(${-Math.max(0, local - 0.2) * 300}px)` }}>{t.text.slice(-2400)}</div>
        ) : (
          <div style={{ color: "#9aa0a6" }}>
            STAND-IN · capture real output to video/public/docs/{item.src}.txt
            <br />
            Footage: {item.src === "tests" ? "npm test, all passing" : "the eval suite's results"}
          </div>
        )}
      </AbsoluteFill>
    );
  }
  if (item.kind === "scroll") {
    const t = text(item.src);
    return (
      <AbsoluteFill style={{ background: "#fff", padding: "40px 60px", fontFamily: font.sans, fontSize: 24, lineHeight: 1.5, color: color.ink, whiteSpace: "pre-wrap", overflow: "hidden" }}>
        {t ? (
          <div style={{ transform: `translateY(${-local * Math.max(0, t.text.length / 2.2)}px)` }}>
            <Markdown text={t.text} />
          </div>
        ) : (
          <div style={{ fontFamily: font.mono, color: color.muted }}>
            STAND-IN
            <br />
            Footage: CREDITS.md scrolling (not written yet)
          </div>
        )}
      </AbsoluteFill>
    );
  }
  return <SelfFilm frame={frame} />;
};

export const Drop: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => {
  const items = scene.shot.items ?? [];
  const idx = Math.max(0, items.findLastIndex((it) => cf(it.at) <= frame));
  const item = items[idx];
  const next = idx + 1 < items.length ? cf(items[idx + 1].at) : scene.end;
  const at = cf(item.at);
  const punch = interpolate(frame, [at, at + 5], [1.05, 1], { ...clamp, easing: easeOut });
  const enter = pop(frame, scene.start, { damping: 18, stiffness: 200 });
  // The slip's Part B column, with the current row highlighted.
  const dropTicks = ticks.filter((t) => t.scene.id === scene.id);
  const highlight: Record<string, number> = {};
  for (const t of dropTicks) {
    const bar = Number(t.at.split(".")[0]);
    highlight[t.box] = frame >= f(bar, 1) ? ramp(frame, f(bar, 1), BEAT_FRAMES * 0.9, easeOut) : 0;
  }
  const s = 1.08;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #f7f8fa, #e6e9ee)" }}>
      <div style={{ position: "absolute", left: PANE.x, top: PANE.y, width: PANE.w, height: PANE.h, borderRadius: 30, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(0,0,0,0.18)", transform: `scale(${punch}) translateX(${(1 - enter) * -300}px)` }}>
        <Evidence item={item} frame={frame} next={next} />
        <div style={{ position: "absolute", left: 24, bottom: 24, ...glass, borderRadius: 999, padding: "10px 22px", fontFamily: font.sans, fontWeight: 700, fontSize: 26, color: color.ink }}>{item.label}</div>
      </div>
      <div style={{ position: "absolute", left: 1130, top: PANE.y, width: 734, height: PANE.h, borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 80px rgba(30,25,10,0.22)", transform: `translateX(${(1 - enter) * 700}px) rotate(${0.6}deg)`, background: color.paper }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${s}) translate(${-778}px, ${-129}px)`, width: SLIP_W, height: SLIP_H }}>
          <Slip frame={frame} highlight={highlight} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 86, background: color.paper, borderBottom: "3px dashed #b9b3a1", display: "flex", alignItems: "center", padding: "0 26px", fontFamily: font.sans, fontWeight: 800, fontSize: 34, letterSpacing: "-0.03em", color: color.ink }}>
          CIVIC Hack 2026 <span style={{ color: "#a39d8a", fontWeight: 600, margin: "0 10px" }}>·</span> Return slip
        </div>
      </div>
    </AbsoluteFill>
  );
};

