import { useMemo, useState } from "preact/hooks";
import type { CommitmentsLens, CostLens, HousingLens, Statement, TransitLens } from "../../../shared/types.ts";
import { CitationChip, FigureButton, Statements, StatementView, visible } from "../components/Citations.tsx";
import { CostChart, PART_LABEL } from "../components/CostChart.tsx";
import { MapPin } from "../components/icons.tsx";
import { mapApi } from "../components/MapView.tsx";
import { PARTS, recompute } from "../lib/cost.ts";
import { fmtDate, fmtMoney, fmtNumber, fmtPct } from "../lib/format.ts";
import { useT } from "../lib/i18n.ts";

// ---------------------------------------------------------------- transit

const DEST_LABEL: Record<string, string> = {
  grocery: "Grocery store",
  pharmacy: "Pharmacy",
  hospital: "Hospital",
  school: "School",
  library: "Library",
  "community-centre": "Community centre",
  clinic: "Clinic",
  "child-care": "Child care",
};
const destLabel = (s: string) => DEST_LABEL[s] ?? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type TransitExtra = TransitLens & {
  statements?: Statement[];
  focus?: { label: string; point: [number, number]; reach: { scenario: string; minutes: number; people: number; share: number }[]; note?: string };
  population?: { total: number };
};

export function Transit({ lens: base, activeGap, setActiveGap }: { lens: TransitLens; activeGap: string | null; setActiveGap: (id: string | null) => void }) {
  const t = useT();
  const lens = base as TransitExtra;
  const [allGaps, setAllGaps] = useState(false);
  const [allFixes, setAllFixes] = useState(false);
  const types = [...new Set(lens.access.map((a) => a.destinationType))];
  const limit = lens.access[0]?.minutesLimit ?? 45;
  const gaps = [...lens.gaps].sort((a, b) => (b.peopleAffected ?? 0) - (a.peopleAffected ?? 0));
  const fixes = [...lens.fixes].sort((a, b) => a.rank - b.rank);
  const reachMinutes = lens.focus ? [...new Set(lens.focus.reach.map((r) => r.minutes))].sort((a, b) => a - b) : [];
  return (
    <div class="tab-body">
      {lens.statements?.length ? <Statements list={lens.statements} /> : null}
      <section>
        <h2 class="section-title">{t("Can people reach what they need by transit?")}</h2>
        <p class="muted small">{t("Share of homes in the area that reach each place within {n} minutes", { n: limit })}</p>
        <ul class="scen-legend" role="list">
          {lens.scenarios.map((s, i) => (
            <li key={s.id}>
              <span class={`swatch swatch--scen${i}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <div class="access">
          {types.map((type) => (
            <div class="access-row" key={type}>
              <p class="access-label">{t(destLabel(type))}</p>
              <div class="access-bars">
                {lens.scenarios.map((s, i) => {
                  const a = lens.access.find((x) => x.destinationType === type && x.scenario === s.id);
                  const v = a?.shareReached ?? 0;
                  return (
                    <div class="bar-line" key={s.id}>
                      <span class="sr-only">{s.label}: </span>
                      <span class="bar-track" aria-hidden="true">
                        <span class={`bar-fill bar-fill--scen${i}`} style={{ width: `${Math.max(v * 100, 0.8)}%` }} />
                      </span>
                      <span class="bar-val">{fmtPct(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      {lens.focus?.reach.length ? (
        <section>
          <h2 class="section-title">{t("Who can get here by transit")}</h2>
          {lens.focus.note ? <p class="muted small">{lens.focus.note}</p> : null}
          <table class="reach">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">{t("Time")}</span></th>
                {reachMinutes.map((m) => (
                  <th scope="col" key={m}>{t("{n} min", { n: m })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lens.scenarios.map((sc) => (
                <tr key={sc.id}>
                  <th scope="row">{sc.label}</th>
                  {reachMinutes.map((m) => {
                    const r = lens.focus!.reach.find((x) => x.scenario === sc.id && x.minutes === m);
                    return <td key={m}>{r ? <><strong>{fmtNumber(r.people)}</strong> <span class="muted">{fmtPct(r.share)}</span></> : "–"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <section>
        <h2 class="section-title">{t("Gaps")} <span class="muted">({gaps.length})</span></h2>
        <ul class="stack" role="list">
          {(allGaps ? gaps : gaps.slice(0, 5)).map((g) => (
            <li key={g.id}>
              <button
                type="button"
                class={`card gap ${activeGap === g.id ? "is-active" : ""}`}
                aria-pressed={activeGap === g.id}
                disabled={!g.location}
                onClick={() => {
                  if (!g.location) return;
                  setActiveGap(g.id);
                  mapApi.flyTo(g.location, 14.2);
                  mapApi.pulse(g.location);
                }}
              >
                <span class="gap-kind">{g.kind.replace(/-/g, " ")}</span>
                <span class="card-title">{g.title}</span>
                <span class="gap-detail">{g.detail}</span>
                <span class="gap-foot">
                  {g.peopleAffected ? <span>≈ {fmtNumber(g.peopleAffected)} {t("people affected")}</span> : <span />}
                  {g.location ? (
                    <span class="link">
                      <MapPin size={14} /> {t("Show on map")}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {gaps.length > 5 ? (
          <button type="button" class="btn btn-ghost btn-sm more-btn" aria-expanded={allGaps} onClick={() => setAllGaps(!allGaps)}>
            {allGaps ? t("Show fewer") : t("Show all {n}", { n: gaps.length })}
          </button>
        ) : null}
      </section>
      <section>
        <h2 class="section-title">{t("Possible fixes, ranked")}</h2>
        <ol class="stack fixes" role="list">
          {(allFixes ? fixes : fixes.slice(0, 4)).map((f) => (
            <li class="card fix" key={f.id}>
              <span class="fix-rank" aria-hidden="true">{f.rank}</span>
              <div>
                <h3 class="card-title">
                  <span class="sr-only">{f.rank}. </span>
                  {f.title}
                </h3>
                <p>{f.benefit}</p>
                <p class="tradeoff"><strong>{t("Trade-off:")}</strong> {f.tradeoff}</p>
                {f.estimate ? <p class="small muted">{f.estimate} <span class="pill pill--quiet">{t("Estimate")}</span></p> : null}
              </div>
            </li>
          ))}
        </ol>
        {fixes.length > 4 ? (
          <button type="button" class="btn btn-ghost btn-sm more-btn" aria-expanded={allFixes} onClick={() => setAllFixes(!allFixes)}>
            {allFixes ? t("Show fewer") : t("Show all {n}", { n: fixes.length })}
          </button>
        ) : null}
      </section>
      <details class="method">
        <summary>{t("How we worked this out")}</summary>
        <p>{lens.method}</p>
        <p class="small muted">
          {lens.feed.name} · {fmtDate(lens.feed.serviceDate)} · {lens.feed.licence}
        </p>
        <h3 class="eyebrow">{t("Limits")}</h3>
        <ul>
          {lens.limits.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- costs

const listOf = (xs: string[]) => {
  const s = xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function Costs({ lens }: { lens: CostLens }) {
  if (!lens.series?.length || !lens.totals) return <CostsPartial lens={lens} />;
  return <CostsFull lens={lens} />;
}

/** When the documents give only some of the costs: what they do say, and what's missing. */
function CostsPartial({ lens }: { lens: CostLens }) {
  const t = useT();
  return (
    <div class="tab-body">
      {lens.asset ? <p class="lede">{lens.asset}</p> : null}
      {lens.figures?.length ? (
        <div class="figures">
          {lens.figures.map((f) => (
            <FigureButton key={f.id} f={f} />
          ))}
        </div>
      ) : null}
      <Statements list={lens.statements} />
      <p class="empty-hint">
        {t("The documents give only part of the cost over time, so there's no lifetime total or chart for this decision yet.")}
      </p>
    </div>
  );
}

function CostsFull({ lens }: { lens: CostLens }) {
  const t = useT();
  const assumptions = lens.assumptions ?? [];
  const defaults = useMemo(() => Object.fromEntries(assumptions.map((a) => [a.id, a.value])), [lens]);
  const [vals, setVals] = useState<Record<string, number>>(defaults);
  const changed = assumptions.some((a) => vals[a.id] !== a.value);
  const model = useMemo(() => (changed ? recompute(lens, vals) : { series: lens.series, totals: lens.totals }), [vals, lens, changed]);
  const tot = model.totals;
  const yearly = tot.operating + tot.maintenance + tot.environmental + tot.renewal;
  const years = Math.max(1, model.series.length);
  // Parts with no cited figure are all zero: leave them out rather than show $0.
  const shown = PARTS.filter((k) => model.series.some((r) => r[k] > 0));
  const missing = PARTS.filter((k) => !shown.includes(k));
  const households = (changed ? vals.households : undefined) ?? lens.households;
  const perHouseholdYear = households ? tot.lifecycle / households / years : undefined;
  const addsParts = (["operating", "maintenance", "renewal", "environmental"] as const).filter((k) => shown.includes(k)).map((k) => t(PART_LABEL[k]).toLowerCase());
  const fmtVal = (v: number, unit: string) =>
    unit === "CAD" ? fmtMoney(v) : unit === "%" ? `${fmtNumber(v, 1)}%` : `${fmtNumber(v, 1)} ${t(unit)}`;
  return (
    <div class="tab-body">
      <p class="lede">{lens.asset}</p>
      <div class="big-pair">
        {perHouseholdYear ? (
          <div class="big-stat big-stat--accent">
            <p class="big-label">{t("Per household, per year")}</p>
            <p class="big-num" aria-live="polite">{fmtMoney(perHouseholdYear, { compact: false })}</p>
          </div>
        ) : null}
        <div class={`big-stat ${perHouseholdYear ? "" : "big-stat--accent"}`}>
          <p class="big-label">{t("Lifetime cost")} · {years} {t("years")}</p>
          <p class="big-num">{fmtMoney(tot.lifecycle)}</p>
        </div>
        <div class="big-stat">
          <p class="big-label">{t("Upfront")}</p>
          <p class="big-num">{fmtMoney(tot.capital)}</p>
        </div>
      </div>
      <p class="muted small">
        {addsParts.length ? t("{parts} add {x} on top of the upfront price.", { parts: listOf(addsParts), x: fmtMoney(yearly) }) + " " : ""}
        {t("Gross cost: fares and other revenue not subtracted.")}
        {changed ? <> <span class="pill pill--warn">{t("With your assumptions")}</span></> : null}
      </p>
      <CostChart series={model.series} parts={shown} />
      <table class="totals">
        <caption class="sr-only">{t("Lifetime cost")}</caption>
        <tbody>
          {shown.map((k) => (
            <tr key={k}>
              <th scope="row"><span class={`swatch swatch--${k}`} aria-hidden="true" /> {t(PART_LABEL[k])}</th>
              <td>{fmtMoney(tot[k])}</td>
            </tr>
          ))}
          {missing.map((k) => (
            <tr key={k} class="totals-missing">
              <th scope="row">{t(PART_LABEL[k])}</th>
              <td>{t("Not included: no cited source")}</td>
            </tr>
          ))}
          <tr class="totals-sum">
            <th scope="row">{t("Lifetime cost")}</th>
            <td>{fmtMoney(tot.lifecycle)}</td>
          </tr>
        </tbody>
      </table>
      <section>
        <h2 class="section-title">{t("Where the figures come from")}</h2>
        <div class="figures figures--small">
          {(lens.figures ?? []).map((f) => (
            <FigureButton key={f.id} f={f} big={false} />
          ))}
        </div>
        <Statements list={lens.statements} />
      </section>
      {assumptions.length ? (
        <section class="assume">
          <div class="row-between">
            <h2 class="section-title">{t("Change the assumptions")}</h2>
            {changed ? (
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => setVals(defaults)}>
                {t("Reset to the report's figures")}
              </button>
            ) : null}
          </div>
          <p class="muted small">{t("These are assumptions, not figures from the report. Move a slider to see the total change.")}</p>
          {assumptions.map((a) => (
            <div class="slider" key={a.id}>
              <div class="slider-top">
                <label for={`as-${a.id}`}>
                  {a.label} <span class="pill pill--warn">{t("assumption")}</span>
                </label>
                <output for={`as-${a.id}`}>{fmtVal(vals[a.id], a.unit)}</output>
              </div>
              <input
                id={`as-${a.id}`}
                type="range"
                min={a.min}
                max={a.max}
                step={a.step}
                value={vals[a.id]}
                aria-describedby={`as-${a.id}-why`}
                aria-valuetext={fmtVal(vals[a.id], a.unit)}
                onInput={(e) => setVals({ ...vals, [a.id]: Number(e.currentTarget.value) })}
                style={{ "--fill": `${((vals[a.id] - a.min) / (a.max - a.min)) * 100}%` }}
              />
              <p class="small muted" id={`as-${a.id}-why`}>{a.why}</p>
            </div>
          ))}
          <p class="small muted">
            {t("Formula: upfront cost + each year's costs × years, each future year divided by (1 + discount rate) for every year from now.")}
          </p>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- commitments

const STATUS: Record<string, string> = { "on-track": "On track", behind: "Behind", done: "Done", unclear: "Unclear" };

export function Commitments({ lens }: { lens: CommitmentsLens }) {
  const t = useT();
  const extra = (lens as CommitmentsLens & { statements?: Statement[] }).statements;
  return (
    <div class="tab-body">
      {extra?.length ? <Statements list={extra} /> : null}
      <ul class="stack" role="list">
        {lens.commitments.map((k) => (
          <li class="card commit" key={k.id}>
            <div class="row-between">
              <span class={`status status--${k.status}`}>{t(STATUS[k.status])}</span>
              {k.madeOn ? <span class="small muted">{fmtDate(k.madeOn, { year: "numeric", month: "short" })}</span> : null}
            </div>
            <h2 class="card-title">{k.title}</h2>
            <p class="small muted">{t("Made by {who}", { who: k.madeBy })}</p>
            <dl class="kv">
              <div>
                <dt>{t("Target")}</dt>
                <dd>{k.target}</dd>
              </div>
              <div>
                <dt>{t("How this decision touches it")}</dt>
                <dd>{k.relation}</dd>
              </div>
            </dl>
            <Statements list={k.progress} />
            {k.unclear.length ? (
              <div class="unclear">
                <p class="eyebrow">{t("Still unclear")}</p>
                <ul>
                  {k.unclear.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- housing

export function Housing({ lens }: { lens: HousingLens }) {
  const t = useT();
  const max = Math.max(1, ...lens.stages.map((s) => s.units ?? 0));
  const completed = lens.stages.find((s) => s.id === "completed")?.units ?? 0;
  return (
    <div class="tab-body">
      <section>
        <h2 class="section-title">{t("From approval to move-in")} · {lens.city.replace(/^\w/, (c) => c.toUpperCase())}</h2>
        <ol class="funnel" role="list">
          {lens.stages.map((s, i) => {
            const gap = lens.timeBetween.find((g) => g.from === s.id);
            return (
              <li key={s.id}>
                <div class={`funnel-row ${s.tracked && s.units !== null ? "" : "is-untracked"}`}>
                  <p class="funnel-label">{s.label}</p>
                  <div class="funnel-track">
                    <span
                      class="funnel-bar"
                      style={{ width: s.units !== null && s.tracked ? `${Math.max((s.units / max) * 100, 2)}%` : "100%" }}
                    />
                    <span class="funnel-val">
                      {s.tracked && s.units !== null ? (
                        <>
                          <strong>{fmtNumber(s.units)}</strong> {t("units")}
                          {s.projects ? <span class="muted"> · {fmtNumber(s.projects)} {t("projects")}</span> : null}
                        </>
                      ) : s.tracked && s.projects ? (
                        <>
                          <strong>{fmtNumber(s.projects)}</strong> {t("projects")} <span class="muted">· {t("no unit counts")}</span>
                        </>
                      ) : (
                        <strong>{s.tracked ? t("No unit counts published") : t("No public data")}</strong>
                      )}
                    </span>
                  </div>
                  {s.source ? (
                    s.source.length > 90 ? (
                      <details class="funnel-src">
                        <summary>{t("Source")}: {s.source.split(/[,(]/)[0]}</summary>
                        <p>{s.source}</p>
                      </details>
                    ) : (
                      <p class="funnel-src">{s.source}</p>
                    )
                  ) : null}
                </div>
                {gap && i < lens.stages.length - 1 ? (
                  <p class={`funnel-gap ${gap.medianDays === null ? "is-unknown" : ""}`}>
                    <span aria-hidden="true">↓</span>{" "}
                    {gap.medianDays !== null ? (
                      <>
                        <strong>{fmtNumber(gap.medianDays)} {t("days")}</strong> <span class="muted">({t("median")}) · {gap.note}</span>
                      </>
                    ) : (
                      <span class="muted">{gap.note}</span>
                    )}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
      {lens.target ? (() => {
        const tg = lens.target!;
        const prog = (tg as typeof tg & { progress?: { units: number; asOf: string; source: string; url?: string; citation?: import("../../../shared/types.ts").Citation } }).progress;
        const done = prog ? prog.units : completed;
        const short = tg.label.length > 90;
        return (
          <section class="card target">
            <div class="row-between">
              <h3 class="card-title">
                {t("Target")}: {fmtNumber(tg.units)} {t("homes")} · {t("target {by}", { by: tg.by })}
              </h3>
              {tg.citation ? <CitationChip c={tg.citation} /> : prog?.citation ? <CitationChip c={prog.citation} /> : null}
            </div>
            <p>
              <strong class="big-inline">{fmtNumber(done)}</strong> {t("of {n} homes", { n: fmtNumber(tg.units) })}
              {prog ? (
                <>
                  {" · "}
                  {prog.url ? (
                    <a class="link" href={prog.url} target="_blank" rel="noopener noreferrer">
                      {t("counted by the province, as of {date}", { date: fmtDate(prog.asOf) })}
                    </a>
                  ) : (
                    t("counted by the province, as of {date}", { date: fmtDate(prog.asOf) })
                  )}
                </>
              ) : (
                <> · {t("completed")}</>
              )}
            </p>
            <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={tg.units} aria-valuenow={done} aria-label={t("Target")}>
              <span style={{ width: `${Math.min(100, (done / tg.units) * 100)}%` }} />
            </div>
            {short || prog?.source ? (
              <details class="small target-more">
                <summary>{t("About this count")}</summary>
                {short ? <p>{tg.label}</p> : null}
                {prog?.source ? <p class="muted">{prog.source}</p> : null}
              </details>
            ) : null}
            {!short ? <p class="small muted">{tg.label}</p> : null}
          </section>
        );
      })() : null}
      {(() => {
        const ctx = (lens as HousingLens & { context?: { id: string; label: string; units: number; asOf?: string; source?: string }[] }).context;
        if (!ctx?.length) return null;
        return (
          <section>
            <h3 class="eyebrow">{t("Context (different area)")}</h3>
            <ul class="context-list" role="list">
              {ctx.map((c) => (
                <li key={c.id}>
                  <strong>{fmtNumber(c.units)}</strong> <span>{c.label}</span>
                  {c.source ? (
                    <details class="small">
                      <summary>{t("Source")}</summary>
                      <p class="muted">{c.source}</p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
      {visible(lens.statements).length ? (
        <section>
          {visible(lens.statements).map((s) => (
            <StatementView key={s.id} s={s} />
          ))}
        </section>
      ) : null}
      {lens.hardToTrack.length ? (
        <section>
          <h2 class="section-title">{t("Where progress gets hard to track")}</h2>
          <ul class="bullets">
            {lens.hardToTrack.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A lens the agents could only partly fill: what they found, and a plain note. */
export function PartialLens({ lens }: { lens: object }) {
  const t = useT();
  const statements = (lens as { statements?: Statement[] }).statements ?? [];
  return (
    <div class="tab-body">
      <Statements list={statements} />
      <p class="empty-hint">{t("The documents only partly cover this, so this section is short.")}</p>
    </div>
  );
}
