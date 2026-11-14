import { useState } from "preact/hooks";
import { PARTS, type Part, type Row } from "../lib/cost.ts";
import { fmtMoney } from "../lib/format.ts";
import { useT } from "../lib/i18n.ts";

export const PART_LABEL: Record<Part, string> = {
  capital: "Upfront",
  operating: "Operating",
  maintenance: "Maintenance",
  renewal: "Renewal",
  environmental: "Environmental",
};

/** Running total, stacked by kind of cost: shows when upkeep overtakes the upfront price. */
export function CostChart({ series }: { series: Row[] }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 280, L = 56, R = 12, T = 14, B = 30;
  const cum: Record<Part, number>[] = [];
  const run = { capital: 0, operating: 0, maintenance: 0, renewal: 0, environmental: 0 };
  for (const s of series) {
    for (const k of PARTS) run[k] += s[k];
    cum.push({ ...run });
  }
  const total = (i: number) => PARTS.reduce((a, k) => a + cum[i][k], 0);
  const max = Math.max(1, ...cum.map((_, i) => total(i)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const n = series.length;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);

  const paths = PARTS.map((k, pi) => {
    const lower = (i: number) => PARTS.slice(0, pi).reduce((a, kk) => a + cum[i][kk], 0);
    const upper = (i: number) => lower(i) + cum[i][k];
    let d = "";
    for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(upper(i)).toFixed(1)}`;
    for (let i = n - 1; i >= 0; i--) d += `L${x(i).toFixed(1)},${y(lower(i)).toFixed(1)}`;
    return { k, d: d + "Z" };
  });

  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);
  const yearTicks = series.filter((s, i) => i === 0 || i === n - 1 || s.year % 10 === 0).map((s) => s.year);
  const last = n - 1;
  const capitalShare = n ? cum[last].capital / Math.max(1, total(last)) : 0;

  const onMove = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <figure class="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${t("Running total over {n} years", { n })}: ${fmtMoney(total(last))}. ${t("Upfront")}: ${fmtMoney(cum[last]?.capital ?? 0)} (${Math.round(capitalShare * 100)}%).`}
        onPointerMove={onMove as never}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
            <text x={L - 8} y={y(v) + 4} class="tick" text-anchor="end">
              {fmtMoney(v)}
            </text>
          </g>
        ))}
        {yearTicks.map((yr) => {
          const i = series.findIndex((s) => s.year === yr);
          return (
            <text key={yr} x={x(i)} y={H - 8} class="tick" text-anchor={i === 0 ? "start" : i === last ? "end" : "middle"}>
              {yr}
            </text>
          );
        })}
        {paths.map((p) => (
          <path key={p.k} d={p.d} class={`area area--${p.k}`} />
        ))}
        {hover !== null ? (
          <g class="hover">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <circle cx={x(hover)} cy={y(total(hover))} r={4.5} />
          </g>
        ) : null}
      </svg>
      <figcaption class="chart-caption">
        {hover !== null ? (
          <span>
            <strong>{series[hover].year}</strong>: {fmtMoney(total(hover))} {t("so far")}
          </span>
        ) : (
          <span>{t("Running total over {n} years", { n })}</span>
        )}
      </figcaption>
      <ul class="legend" role="list">
        {PARTS.map((k) => (
          <li key={k}>
            <span class={`swatch swatch--${k}`} aria-hidden="true" />
            {t(PART_LABEL[k])}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
