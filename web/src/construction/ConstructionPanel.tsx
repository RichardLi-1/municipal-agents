// The construction scout panel: the scenario banner, a long-section of the bores, the
// construction steps with illustrative renders (each step flies the map), the ranked
// candidate sites with their scores, reasons and concerns, the scoring rule and limits.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ConstructionLens, ConstructionSite, ConstructionStep } from "../../../shared/types.ts";
import { Profile, type Phase } from "./Profile.tsx";
import "./construction.css";

export interface Focus {
  center: [number, number];
  zoom: number;
  bearing?: number;
  pitch?: number;
  layers?: string[];
}

interface Props {
  lens: ConstructionLens;
  onFocus: (f: Focus) => void;
}

const ROLE: Record<ConstructionSite["role"], { label: string; plural: string }> = {
  "launch-portal": { label: "Launch portal", plural: "Launch portal candidates" },
  "launch-shaft": { label: "Launch site", plural: "Launch site candidates" },
  "extraction-shaft": { label: "Extraction site", plural: "Extraction site candidates" },
  laydown: { label: "Laydown yard", plural: "Laydown yard candidates" },
  "cross-passage": { label: "Cross-passage", plural: "Cross-passages" },
};

const PHASES: Phase[] = ["investigate", "set-up", "shaft", "launch", "bore", "breakthrough", "restore"];

function usePrefersReduced(): boolean {
  const q = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [r, setR] = useState(q?.matches ?? false);
  useEffect(() => {
    if (!q) return;
    const on = () => setR(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return r;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-CA");
const ha = (m2: number) => `${(m2 / 10000).toFixed(1)} ha`;
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export function ConstructionPanel({ lens, onFocus }: Props) {
  const reduced = usePrefersReduced();
  const steps = lens.steps ?? [];
  const [active, setActive] = useState(0);
  const [openSite, setOpenSite] = useState<string | null>(lens.proposed?.launch ?? null);
  const stepRef = useRef<HTMLDivElement>(null);
  const n = (lens as ConstructionLens & { numbers?: any }).numbers ?? {};

  // On opening, fly to an overview of the whole stretch with every layer on.
  useEffect(() => {
    const line = lens.alignment?.geometry?.coordinates as [number, number][] | undefined;
    if (!line?.length) return;
    const a = line[0], b = line[line.length - 1];
    const mid = (lens.steps?.find((s) => s.id === "bore")?.mapFocus.center ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) as [number, number];
    const along = (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
    const t = setTimeout(() => onFocus({ center: mid, zoom: 13.75, pitch: 56, bearing: Math.round(along - 65), layers: [] }), 450);
    return () => clearTimeout(t);
  }, [lens]);

  const step: ConstructionStep | undefined = steps[active];
  const phase: Phase = (PHASES.includes(step?.id as Phase) ? step!.id : PHASES[Math.min(active, PHASES.length - 1)]) as Phase;

  const go = (i: number, fly = true) => {
    const k = Math.max(0, Math.min(steps.length - 1, i));
    setActive(k);
    const s = steps[k];
    if (fly && s) onFocus({ ...s.mapFocus });
  };

  const groups = useMemo(() => {
    const order: ConstructionSite["role"][] = ["launch-shaft", "launch-portal", "extraction-shaft", "laydown"];
    return order.map((role) => ({ role, sites: (lens.sites ?? []).filter((s) => s.role === role) })).filter((g) => g.sites.length);
  }, [lens]);

  const stats = [
    { v: `${((n.sectionLengthM ?? lens.bores[0]?.lengthM ?? 0) / 1000).toFixed(1)} km`, k: "what-if tunnel" },
    { v: `2 × ${lens.bores[0]?.diameterM ?? 6.5} m`, k: "bores, side by side" },
    { v: n.coverM ? `${Math.round(n.coverM.minM)}–${Math.round(n.coverM.maxM)} m` : "–", k: "ground above the tunnel" },
    { v: fmt(lens.boreholes.length), k: "boreholes first" },
    { v: fmt(lens.crossPassages.length), k: "cross-passages" },
    { v: n.spoil ? `~${Math.round(n.spoil.trucksPerDay / 10) * 10}` : "–", k: "trucks a day, at peak" },
  ];

  const flySite = (s: ConstructionSite) => onFocus({ center: s.location, zoom: 16.6, pitch: 55, bearing: (step?.mapFocus.bearing ?? 0) - 20, layers: ["cx-stage2", "cx-alignment", "cx-sites", "cx-shafts", "cx-sensitive", "cx-bores"] });

  return (
    <div class="cx">
      {/* Scenario banner: always first, always says what this is */}
      <section class="cx-banner" aria-labelledby="cx-title">
        <p class="cx-label">
          <WarnIcon /> {lens.scenario.label}
        </p>
        <h3 id="cx-title" class="cx-title">
          {lens.scenario.title}
        </h3>
        <p class="cx-basis">{lens.scenario.basis}</p>
        <p class="cx-fine">The scout ranks candidate sites by a stated rule. It does not choose one: engineers and Region staff would evaluate, and Council decides.</p>
      </section>

      <ul class="cx-stats" role="list">
        {stats.map((s) => (
          <li key={s.k}>
            <span class="cx-stat-v">{s.v}</span>
            <span class="cx-stat-k">{s.k}</span>
          </li>
        ))}
      </ul>

      {/* Long-section */}
      <section class="cx-card cx-section" aria-labelledby="cx-ls">
        <div class="cx-card-head">
          <h4 id="cx-ls" class="cx-h">Under the ground</h4>
          <span class="cx-pill">Step {active + 1}: {step?.title ?? ""}</span>
        </div>
        <Profile lens={lens} phase={phase} reduced={reduced} />
      </section>

      {/* Steps */}
      <section class="cx-steps" aria-labelledby="cx-steps-h">
        <div class="cx-card-head">
          <h4 id="cx-steps-h" class="cx-h">How it could be built, step by step</h4>
          <span class="cx-quiet">Pick a step to fly the map there</span>
        </div>
        <ol class="cx-stepper" role="list">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                class={`cx-dot ${i === active ? "is-active" : ""} ${i < active ? "is-done" : ""}`}
                aria-current={i === active ? "step" : undefined}
                aria-label={`Step ${s.n}: ${s.title}`}
                title={s.title}
                onClick={() => go(i)}
              >
                {s.n}
              </button>
            </li>
          ))}
        </ol>
        {step ? (
          <article class="cx-step" ref={stepRef} key={step.id} aria-live="polite">
            {step.render ? (
              <figure class="cx-render">
                <img src={step.render.url} alt={`${step.title}: illustrative render`} width={1600} height={893} loading="lazy" decoding="async" />
                <figcaption class="cx-render-tag">Illustrative render · not a design</figcaption>
              </figure>
            ) : null}
            <div class="cx-step-body">
              <p class="cx-step-n">
                Step {step.n} of {steps.length} · <span>{step.duration}</span>
              </p>
              <h5 class="cx-step-title">{step.title}</h5>
              <p class="cx-step-plain">{step.plain}</p>
              <div class="cx-notice">
                <p class="cx-notice-h">
                  <EarIcon /> What residents would notice
                </p>
                <p>{step.whatResidentsNotice}</p>
              </div>
              <div class="cx-step-nav">
                <button type="button" class="cx-btn" onClick={() => go(active - 1)} disabled={active === 0}>
                  ← Previous
                </button>
                <button type="button" class="cx-btn cx-btn--ghost" onClick={() => onFocus({ ...step.mapFocus })}>
                  Show on map
                </button>
                <button type="button" class="cx-btn cx-btn--primary" onClick={() => go(active + 1)} disabled={active === steps.length - 1}>
                  Next step →
                </button>
              </div>
            </div>
          </article>
        ) : null}
      </section>

      {/* Sites */}
      <section aria-labelledby="cx-sites-h" class="cx-sites">
        <div class="cx-card-head">
          <h4 id="cx-sites-h" class="cx-h">Candidate work sites</h4>
          <span class="cx-quiet">From OpenStreetMap, ranked within each role</span>
        </div>
        {groups.map((g) => (
          <div key={g.role} class="cx-group">
            <p class="cx-eyebrow">{ROLE[g.role].plural}</p>
            <ol class="cx-site-list" role="list">
              {g.sites.map((s, i) => {
                const open = openSite === s.id;
                const top = s.id === lens.proposed.launch || s.id === lens.proposed.extraction;
                return (
                  <li key={s.id} class={`cx-site ${open ? "is-open" : ""} ${top ? "is-top" : ""}`}>
                    <button
                      type="button"
                      class="cx-site-head"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenSite(open ? null : s.id);
                        if (!open) flySite(s);
                      }}
                    >
                      <span class="cx-rank" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span class="cx-site-main">
                        <span class="cx-site-name">{s.name}</span>
                        <span class="cx-site-meta">
                          {ha(s.areaM2)} open · {dist(s.distanceToAlignmentM)} from the line · {s.landUse}
                          {top ? <em class="cx-top"> · ranked first, for engineers to check</em> : null}
                        </span>
                      </span>
                      <span class="cx-score" aria-label={`Score ${s.score} out of 100`}>
                        <span class="cx-score-n">{s.score}</span>
                        <span class="cx-score-bar" aria-hidden="true">
                          <span style={{ width: `${s.score}%`, background: scoreColor(s.score) }} />
                        </span>
                      </span>
                    </button>
                    {open ? (
                      <div class="cx-site-body">
                        <ul class="cx-why" role="list">
                          {s.reasons.map((r) => (
                            <li key={r} class="cx-good">
                              <CheckIcon /> {r}
                            </li>
                          ))}
                          {s.concerns.map((r) => (
                            <li key={r} class="cx-check">
                              <WarnIcon /> {r}
                            </li>
                          ))}
                        </ul>
                        <p class="cx-site-foot">
                          {s.nearestSensitive ? `Nearest ${s.nearestSensitive.kind}${s.nearestSensitive.name ? ` (${s.nearestSensitive.name})` : ""}: ${dist(s.nearestSensitive.distanceM)}. ` : ""}
                          {s.truckAccess ? `Truck access: ${dist(s.truckAccess.distanceM)} to ${s.truckAccess.road}.` : ""}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      {/* The rule */}
      <section class="cx-card" aria-labelledby="cx-rule-h">
        <h4 id="cx-rule-h" class="cx-h">How sites are scored (out of 100)</h4>
        <ul class="cx-weights" role="list">
          {lens.weights.map((w) => (
            <li key={w.label}>
              <span class="cx-w-n">{w.weight}</span>
              <span class="cx-w-bar" aria-hidden="true">
                <span style={{ width: `${(w.weight / 30) * 100}%` }} />
              </span>
              <span class="cx-w-label">{w.label}</span>
            </li>
          ))}
        </ul>
        <p class="cx-quiet cx-rules">
          Bores {lens.bores[0]?.diameterM ?? 6.5} m across, 15 m apart. Top of tunnel at least 2 diameters below ground, more under Highway 401 and the river. Cross-passages no more than 244 m apart (NFPA 130). Boreholes every 75 m (an assumption), at each shaft and crossing, at least 1.5 diameters below the tunnel bottom and 1.5 times the depth of a shaft (FHWA-NHI-10-034, s. 3.5.2.1). Work hours: Kitchener allows construction noise 7 am to 7 pm daily; Cambridge By-law 32-04 bans heavy equipment from 8 pm Saturday to 7 am Monday.
        </p>
      </section>

      <details class="cx-card cx-more">
        <summary class="cx-h">What this can't tell you</summary>
        <ul class="cx-limits">
          {lens.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <details class="cx-card cx-more">
        <summary class="cx-h">Sources and references</summary>
        <p class="cx-quiet">{lens.alignmentSource}</p>
        <ul class="cx-limits">
          {lens.references.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {steps.some((s) => s.render) ? <p class="cx-quiet">Renders made with {[...new Set(steps.map((s) => s.render?.model).filter(Boolean))].join(", ")} from a written prompt. They are illustrations, not designs.</p> : null}
      </details>
    </div>
  );
}

function scoreColor(s: number): string {
  if (s >= 70) return "var(--cx-score-hi)";
  if (s >= 55) return "var(--cx-score-mid)";
  return "var(--cx-score-lo)";
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.6v.01" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
function EarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 9a5 5 0 0110 0c0 3-3 3.6-3 6.5a2.5 2.5 0 01-5 0" />
      <path d="M10 9.5a2 2 0 014 0" />
    </svg>
  );
}
