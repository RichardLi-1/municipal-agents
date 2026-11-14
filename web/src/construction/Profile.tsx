// The long-section: ground, the two bores at depth, the shafts, the boreholes and the
// crossings, with a tunnel boring machine that moves along the bore. What is shown
// follows the selected construction step.

import { useMemo } from "preact/hooks";
import type { ConstructionLens } from "../../../shared/types.ts";

export type Phase = "investigate" | "set-up" | "shaft" | "launch" | "bore" | "breakthrough" | "restore";

const W = 640;
const H = 300;
const M = { l: 14, r: 14, t: 46, b: 30 };

interface Props {
  lens: ConstructionLens;
  phase: Phase;
  reduced: boolean;
}

export function Profile({ lens, phase, reduced }: Props) {
  const geo = useMemo(() => build(lens), [lens]);
  if (!geo) return null;
  const { x, y, ground, groundArea, crown, invert, axis, shafts, holes, crossings, cps, maxX, exaggeration, bottom } = geo;

  const boredDone = phase === "breakthrough" || phase === "restore";
  const boring = phase === "bore";
  const showBores = phase !== "investigate" && phase !== "set-up" && phase !== "shaft";
  const shaftsBuilt = phase !== "investigate" && phase !== "set-up";
  const tbmAt = phase === "launch" ? "start" : boredDone ? "end" : null;
  const dur = "9s";

  const label = `Long-section of the illustrative tunnel, ${Math.round(maxX)} m long: ground level, the two bores at depth (top of tunnel ${lens.profile.length ? Math.round(Math.min(...lens.profile.map((p) => p.groundM - p.crownM))) : "?"} to ${lens.profile.length ? Math.round(Math.max(...lens.profile.map((p) => p.groundM - p.crownM))) : "?"} m below ground), ${shafts.length} shafts, ${holes.length} boreholes${crossings.length ? `, passing under ${crossings.map((c) => c.name).join(" and ")}` : ""}. Vertical scale exaggerated ${exaggeration} times.`;

  return (
    <figure class={`cx-profile cx-phase-${phase} ${reduced ? "is-still" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <title>{label}</title>
        <defs>
          <linearGradient id="cx-soil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--cx-soil-top)" />
            <stop offset="1" stop-color="var(--cx-soil-deep)" />
          </linearGradient>
          <linearGradient id="cx-bore-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--cx-bore-hi)" />
            <stop offset="1" stop-color="var(--cx-bore)" />
          </linearGradient>
          <pattern id="cx-strata" width="22" height="9" patternUnits="userSpaceOnUse">
            <path d="M0 6 Q5.5 3 11 6 T22 6" fill="none" stroke="var(--cx-strata)" stroke-width="0.8" />
          </pattern>
          <clipPath id="cx-under">
            <path d={groundArea} />
          </clipPath>
        </defs>

        {/* Ground: soil body with faint strata, then the ground line */}
        <path d={groundArea} fill="url(#cx-soil)" />
        <path d={groundArea} fill="url(#cx-strata)" opacity="0.55" />

        {/* Crossings: the highway deck and the river, labelled above ground */}
        {crossings.map((c) => (
          <g key={c.name} class={`cx-xing cx-xing--${c.kind}`}>
            {c.kind === "river" ? (
              <path d={`M${c.x - 16} ${c.gy - 1} Q${c.x} ${c.gy + 9} ${c.x + 16} ${c.gy - 1} Z`} class="cx-water" />
            ) : (
              <g class="cx-deck">
                <rect x={c.x - 14} y={c.gy - 6} width="28" height="4" rx="1.5" />
                <rect x={c.x - 1} y={c.gy - 2} width="2" height="4" />
              </g>
            )}
            <line x1={c.x} x2={c.x} y1={c.gy - 10} y2={M.t - 14} class="cx-leader" />
            <text x={c.x} y={M.t - 18} text-anchor="middle" class="cx-xing-label">
              {c.name}
            </text>
          </g>
        ))}

        <path d={ground} class="cx-ground" />

        {/* Boreholes: drilled ticks, down past the invert */}
        <g class="cx-holes" clip-path="url(#cx-under)">
          {holes.map((h, i) => (
            <line
              key={h.id}
              x1={h.x}
              x2={h.x}
              y1={h.y0}
              y2={h.y1}
              class="cx-hole"
              pathLength={1}
              style={{ animationDelay: `${(i % 60) * 45}ms` }}
            />
          ))}
        </g>

        {/* The two bores: the far one drawn up and to the right, for depth */}
        <g class={`cx-bores ${showBores ? "" : "is-ghost"}`}>
          <path d={axis.far} class="cx-bore-far" />
          <path d={`${crown} ${invert.replace(/^M/, "L")} Z`} class="cx-bore-band" />
          {showBores ? (
            <path
              d={axis.d}
              class={`cx-bore-done ${boring && !reduced ? "is-animating" : ""} ${boredDone || (boring && reduced) ? "is-full" : ""}`}
              pathLength={1}
              style={{ animationDuration: dur }}
            />
          ) : null}
          {cps.map((c) => (
            <line key={c.id} x1={c.x} x2={c.x + 4} y1={c.y + 3} y2={c.y - 2} class={`cx-cp ${boredDone ? "is-on" : ""}`} />
          ))}
        </g>

        {/* Shafts: boxes from ground to below the invert */}
        {shafts.map((s) => (
          <g key={s.id} class={`cx-shaft ${shaftsBuilt ? "is-built" : ""} ${phase === "shaft" && s.id === "launch" ? "is-active" : ""}`}>
            <rect x={s.x - s.w / 2} y={s.y0} width={s.w} height={s.y1 - s.y0} rx="2" />
            <text x={s.x} y={s.y0 - 8} text-anchor={s.id === "launch" ? "start" : "end"} class="cx-shaft-label" dx={s.id === "launch" ? -s.w / 2 : s.w / 2}>
              {s.id === "launch" ? "Launch shaft" : "Extraction shaft"}
            </text>
          </g>
        ))}

        {/* The boring machine */}
        {showBores && (boring || tbmAt) ? (
          <g class="cx-tbm" aria-hidden="true">
            {boring && !reduced ? (
              <g>
                <TbmShape />
                <animateMotion {...({ dur, repeatCount: "indefinite", rotate: "auto", path: axis.d, calcMode: "paced" } as Record<string, string>)} />
              </g>
            ) : (
              <g transform={tbmTransform(axis.pts, tbmAt === "start" ? 0.02 : tbmAt === "end" ? 0.995 : 0.55)}>
                <TbmShape />
              </g>
            )}
          </g>
        ) : null}

        {/* Scale and ends */}
        <g class="cx-axis">
          <line x1={M.l} x2={W - M.r} y1={bottom + 12} y2={bottom + 12} />
          {ticks(maxX).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={bottom + 9} y2={bottom + 15} />
              <text x={x(t)} y={bottom + 26} text-anchor={t === 0 ? "start" : t >= maxX - 1 ? "end" : "middle"}>
                {t === 0 ? "0" : `${(t / 1000).toFixed(1)} km`}
              </text>
            </g>
          ))}
        </g>
        <text x={M.l} y={14} class="cx-note">
          ← Sportsworld
        </text>
        <text x={W - M.r} y={14} text-anchor="end" class="cx-note">
          Preston →
        </text>
      </svg>
      <figcaption class="cx-caption">
        <span>
          <i class="cx-key cx-key--bore" aria-hidden="true" /> Two bores, {lens.bores[0]?.diameterM ?? 6.5} m across, side by side
        </span>
        <span>
          <i class="cx-key cx-key--hole" aria-hidden="true" /> {holes.length} boreholes
        </span>
        <span>
          <i class="cx-key cx-key--shaft" aria-hidden="true" /> Shafts
        </span>
        <span class="cx-caption-scale">Vertical scale ×{exaggeration}</span>
      </figcaption>
    </figure>
  );
}

function TbmShape() {
  // A small machine pointing along +x: shield, cutterhead disc, trailing gear.
  return (
    <g class="cx-tbm-shape">
      <rect x="-20" y="-5" width="16" height="10" rx="2" class="cx-tbm-gear" />
      <rect x="-5" y="-6.5" width="13" height="13" rx="3" class="cx-tbm-shield" />
      <circle cx="9" cy="0" r="6.8" class="cx-tbm-head" />
      <g class="cx-tbm-spokes">
        <line x1="9" y1="-6" x2="9" y2="6" />
        <line x1="3" y1="0" x2="15" y2="0" />
      </g>
    </g>
  );
}

function tbmTransform(pts: [number, number][], f: number): string {
  // Point and direction at a fraction of the path's length.
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? d / seg[i] : 0;
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const a = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
      return `translate(${(x0 + (x1 - x0) * t).toFixed(1)} ${(y0 + (y1 - y0) * t).toFixed(1)}) rotate(${a.toFixed(1)})`;
    }
    d -= seg[i];
  }
  return "";
}

function ticks(maxX: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= maxX - 250; t += 500) out.push(t);
  out.push(Math.round(maxX));
  return out;
}

function build(lens: ConstructionLens) {
  const p = lens.profile;
  if (!p?.length) return null;
  const n = (lens as ConstructionLens & { numbers?: any }).numbers ?? {};
  const maxX = p[p.length - 1].chainageM;
  const top = Math.max(...p.map((q) => q.groundM)) + 4;
  const holeBottom = Math.min(...lens.boreholes.map((b) => interp(p, b.chainageM, "groundM") - b.depthM));
  const lowest = Math.min(holeBottom, ...p.map((q) => q.invertM)) - 3;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const sx = plotW / maxX;
  const sy = plotH / (top - lowest);
  const x = (c: number) => M.l + c * sx;
  const y = (e: number) => M.t + (top - e) * sy;
  const bottom = H - M.b;
  const line = (key: "groundM" | "crownM" | "invertM") => p.map((q, i) => `${i ? "L" : "M"}${x(q.chainageM).toFixed(1)} ${y(q[key]).toFixed(1)}`).join(" ");
  const ground = line("groundM");
  const groundArea = `${ground} L${x(maxX).toFixed(1)} ${bottom} L${x(0).toFixed(1)} ${bottom} Z`;
  const crown = line("crownM");
  const invertRev = [...p].reverse().map((q, i) => `${i ? "L" : "M"}${x(q.chainageM).toFixed(1)} ${y(q.invertM).toFixed(1)}`).join(" ");

  // Bored stretch, between the shafts' inner walls.
  const shaftsN: { id: string; chainageM: number; depthM: number; lengthM: number }[] = n.shafts ?? [];
  const from = n.shafts ? shaftsN[0].chainageM + shaftsN[0].lengthM / 2 : 0;
  const to = n.shafts ? shaftsN[1].chainageM - shaftsN[1].lengthM / 2 : maxX;
  const axisPts: [number, number][] = [];
  const step = Math.max(10, (to - from) / 120);
  for (let c = from; c <= to + 0.1; c += step) {
    const cc = Math.min(c, to);
    axisPts.push([x(cc), y((interp(p, cc, "crownM") + interp(p, cc, "invertM")) / 2)]);
  }
  const d = axisPts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");
  const far = axisPts.map(([a, b], i) => `${i ? "L" : "M"}${(a + 5).toFixed(1)} ${(b - 4).toFixed(1)}`).join(" ");

  const shafts = shaftsN.map((s) => {
    const g = interp(p, s.chainageM, "groundM");
    return { id: s.id, x: x(s.chainageM), w: Math.max(12, s.lengthM * sx), y0: y(g), y1: y(g - s.depthM) };
  });
  const holes = lens.boreholes.map((b) => {
    const g = interp(p, b.chainageM, "groundM");
    return { id: b.id, x: x(b.chainageM), y0: y(g), y1: y(g - b.depthM) };
  });
  const crossings = p
    .filter((q) => q.feature && !/shaft/i.test(q.feature))
    .map((q) => ({ name: q.feature!, kind: /river|creek/i.test(q.feature!) ? "river" : "highway", x: x(q.chainageM), gy: y(q.groundM) }));
  const cps = lens.crossPassages.map((c) => ({ id: c.id, x: x(c.chainageM), y: y((interp(p, c.chainageM, "crownM") + interp(p, c.chainageM, "invertM")) / 2) }));
  const exaggeration = Math.max(1, Math.round(sy / sx));
  return { x, y, ground, groundArea, crown, invert: invertRev, axis: { d, far, pts: axisPts }, shafts, holes, crossings, cps, maxX, exaggeration, bottom };
}

function interp(p: ConstructionLens["profile"], c: number, k: "groundM" | "crownM" | "invertM"): number {
  if (c <= p[0].chainageM) return p[0][k];
  for (let i = 1; i < p.length; i++)
    if (c <= p[i].chainageM) {
      const t = (c - p[i - 1].chainageM) / (p[i].chainageM - p[i - 1].chainageM || 1);
      return p[i - 1][k] + t * (p[i][k] - p[i - 1][k]);
    }
  return p[p.length - 1][k];
}
