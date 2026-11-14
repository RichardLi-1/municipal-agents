// "Step N of M" top-left and honesty tags top-right.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { sceneAt } from "../storyboard";
import { cf } from "../timing";
import { color, font } from "../theme";
import { pop } from "../motion";
import { glass } from "./Words";

const small: React.CSSProperties = {
  ...glass,
  borderRadius: 999,
  fontFamily: font.sans,
  fontSize: 24,
  letterSpacing: "-0.01em",
  color: color.ink,
  padding: "10px 20px 11px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  boxShadow: "0 10px 30px rgba(10,12,20,0.14), inset 0 1px 0 rgba(255,255,255,0.95)",
};

const dotFor = (tag: string) =>
  tag.toLowerCase().includes("scenario") ? "#e8a317" : tag.startsWith("Real data") ? color.ok : tag.includes("speed") ? color.accent : "#7a7f87";

/** The step text in force at a frame (a scene can change its step part-way through). */
const stepAt = (frame: number) => {
  const s = sceneAt(frame);
  if (!s) return { text: undefined as string | undefined, since: 0 };
  let text = s.step;
  let since = s.start;
  for (const c of s.steps ?? []) {
    if (frame >= cf(c.at)) {
      text = c.text;
      since = cf(c.at);
    }
  }
  return { text, since };
};

export const Labels: React.FC = () => {
  const frame = useCurrentFrame();
  const scene = sceneAt(frame);
  if (!scene) return null;
  const { text, since } = stepAt(frame);
  // Animate only when the text actually changes from the previous scene.
  const prev = stepAt(since - 1).text;
  const enter = prev === text ? 1 : pop(frame, since, { damping: 20, stiffness: 260 });
  const tags = scene.tags ?? [];
  const prevScene = sceneAt(scene.start - 1);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {text ? (
        <div style={{ position: "absolute", top: 48, left: 56, opacity: enter, transform: `translateY(${(1 - enter) * -16}px)` }}>
          <div style={small}>
            {text.split(" · ").map((part, i) => (
              <span key={i} style={{ fontWeight: i === 0 ? 700 : 500, color: i === 0 ? color.ink : "#3b3f45" }}>
                {i > 0 ? <span style={{ color: "#a0a4ab", marginRight: 10 }}>·</span> : null}
                {part}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 48, right: 56, display: "flex", gap: 12 }}>
        {tags.map((t, i) => {
          const was = (prevScene?.tags ?? []).includes(t);
          const e = was ? 1 : pop(frame, scene.start + i * 3, { damping: 20, stiffness: 260 });
          return (
            <div key={t} style={{ ...small, fontWeight: 600, opacity: e, transform: `translateY(${(1 - e) * -16}px)` }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: dotFor(t) }} />
              {t}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
