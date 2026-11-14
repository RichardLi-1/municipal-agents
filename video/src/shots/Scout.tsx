// Hard cuts between clips on the beat. Used for the construction scout (the map, the
// long-section with the TBM moving, then the product's seven stage renders zooming past)
// and for short flashes like the "for cities" pages.
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile } from "remotion";
import manifest from "../generated/manifest.json";
import footageSpec from "../../footage.json";
import { Footage, StandIn } from "../components/Footage";
import { glass } from "../components/Words";
import { trimFor, type CameraKey, type Scene } from "../storyboard";
import { cf } from "../timing";
import { color, font } from "../theme";
import { clamp, easeIn, easeOut } from "../motion";

type Cut = { at: string; clip?: string; camera?: CameraKey[]; renders?: string[] | "scout"; in?: number; align?: { mark: string; at: string } };
const images = manifest.images as Record<string, boolean>;
const stills = footageSpec.stills as Record<string, { what: string; file: string; label?: string }>;
type Render = { n: number; id: string; title: string; file: string };
const scoutRenders = (manifest as unknown as { renders: Render[] }).renders ?? [];

/** The scout's renders, one per step, labelled with the product's own step titles. */
const ScoutRenders: React.FC<{ from: number; to: number; frame: number }> = ({ from, to, frame }) => {
  const list = scoutRenders;
  if (!list.length) return <StandIn id="scout-renders" label="the construction scout's seven stage renders" layout="page" />;
  const each = (to - from) / list.length;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor((frame - from) / each)));
  return (
    <AbsoluteFill style={{ background: "#0b0b0c" }}>
      {list.map((r, k) => {
        if (k < i - 1 || k > i) return null;
        const start = from + k * each;
        const zoomIn = interpolate(frame - start, [0, each], [1.18, 1.0], { ...clamp, easing: easeOut });
        const out = k < i ? interpolate(frame - (start + each), [0, 5], [0, 1], { ...clamp, easing: easeIn }) : 0;
        return (
          <AbsoluteFill key={r.id} style={{ opacity: 1 - out, transform: `scale(${zoomIn + out * 0.3})` }}>
            <Img src={staticFile(r.file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
        );
      })}
      <div style={{ position: "absolute", left: 56, top: 130, ...glass, borderRadius: 999, padding: "12px 26px", fontFamily: font.sans, fontSize: 30, color: color.ink, display: "flex", gap: 12 }}>
        <span style={{ fontWeight: 800 }}>Step {list[i].n} of {list.length}</span>
        <span style={{ fontWeight: 500 }}>{list[i].title}</span>
      </div>
      <div style={{ position: "absolute", left: 56, top: 202, display: "flex", gap: 8 }}>
        {list.map((r, k) => (
          <div key={r.id} style={{ width: 54, height: 7, borderRadius: 4, background: k <= i ? "#fff" : "rgba(255,255,255,0.35)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Renders: React.FC<{ ids: string[]; from: number; to: number; frame: number }> = ({ ids, from, to, frame }) => {
  const each = (to - from) / ids.length;
  const i = Math.min(ids.length - 1, Math.max(0, Math.floor((frame - from) / each)));
  return (
    <AbsoluteFill style={{ background: "#0b0b0c" }}>
      {ids.map((id, k) => {
        if (k < i - 1 || k > i) return null;
        const start = from + k * each;
        const local = frame - start;
        const zoomIn = interpolate(local, [0, each], [1.22, 1.0], { ...clamp, easing: easeOut });
        const out = k < i ? interpolate(frame - (start + each), [0, 5], [0, 1], { ...clamp, easing: easeIn }) : 0;
        const s = stills[id];
        const file = s?.file ?? "";
        return (
          <AbsoluteFill key={id} style={{ opacity: 1 - out, transform: `scale(${zoomIn + out * 0.35})` }}>
            {images[file] ? (
              <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <StandIn id={id} label={s?.what ?? id} layout="page" />
            )}
          </AbsoluteFill>
        );
      })}
      <div style={{ position: "absolute", left: 56, top: 130, ...glass, borderRadius: 999, padding: "12px 26px", fontFamily: font.sans, fontWeight: 700, fontSize: 34, color: color.ink }}>
        {stills[ids[i]]?.label ?? ids[i]}
      </div>
      <div style={{ position: "absolute", left: 56, top: 205, display: "flex", gap: 8 }}>
        {ids.map((id, k) => (
          <div key={id} style={{ width: 54, height: 7, borderRadius: 4, background: k <= i ? "#fff" : "rgba(255,255,255,0.35)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Scout: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => {
  const cuts = ((scene.shot as unknown as { cuts: Cut[] }).cuts ?? []).map((c, i, all) => ({
    ...c,
    from: cf(c.at),
    to: i + 1 < all.length ? cf(all[i + 1].at) : scene.end,
  }));
  const cut = cuts.findLast((c) => c.from <= frame) ?? cuts[0];
  const punch = interpolate(frame - cut.from, [0, 6], [1.04, 1], { ...clamp, easing: easeOut });
  return (
    <AbsoluteFill style={{ transform: `scale(${punch})` }}>
      {cut.renders === "scout" ? (
        <ScoutRenders from={cut.from} to={cut.to} frame={frame} />
      ) : cut.renders ? (
        <Renders ids={cut.renders} from={cut.from} to={cut.to} frame={frame} />
      ) : (
        <Sequence from={cut.from - scene.start} layout="none">
          <Footage clip={cut.clip!} camera={cut.camera} start={cut.from} trimFrames={trimFor(cut.clip, cut, cut.from)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
