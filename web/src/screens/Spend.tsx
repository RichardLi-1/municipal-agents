import { useEffect, useRef, useState } from "preact/hooks";
import type { UsageSummary } from "../../../shared/types.ts";
import { Expand } from "../components/icons.tsx";
import { api, sampleMode } from "../lib/api.ts";
import { fmtCompact, fmtNumber, fmtTime } from "../lib/format.ts";
import { useT } from "../lib/i18n.ts";
import { useStore } from "../lib/store.ts";

const usd = (n: number) => `$${n < 100 ? n.toFixed(2) : fmtNumber(n, 0)}`;

/** White numbers on black: made to sit full-screen on a display of its own. */
export function SpendScreen() {
  const t = useT();
  const sample = useStore(sampleMode);
  const [u, setU] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = "Spend · Municipal Agents";
    let dead = false;
    const tick = () =>
      api
        .usage()
        .then((x) => {
          if (dead) return;
          setU(x);
          setAt(new Date());
          setError(null);
        })
        .catch((e) => !dead && setError(String(e.message ?? e)));
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  const share = u ? Math.min(1, u.today.costUsd / Math.max(0.0001, u.today.limitUsd)) : 0;
  return (
    <div class="spend" ref={root}>
      <header class="spend-head">
        <h1 class="spend-h1" tabIndex={-1}>{t("What the agents cost")}</h1>
        <div class="spend-tools">
          {sample ? <span class="tag tag--sample">{t("Sample data")}</span> : null}
          {at ? <span class="spend-dim">{t("Updated {time}", { time: fmtTime(at) })}</span> : null}
          {document.fullscreenEnabled ? (
            <button type="button" class="spend-btn" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())}>
              <Expand size={16} /> {t("Full screen")}
            </button>
          ) : null}
        </div>
      </header>
      {error && !u ? <p class="spend-dim" role="alert">{error}</p> : null}
      {u ? (
        <>
          <dl class="spend-grid">
            <div>
              <dt class="spend-label">{t("US dollars spent")}</dt>
              <dd class="spend-num">US{usd(u.costUsd)}</dd>
            </div>
            <div>
              <dt class="spend-label">{t("tokens")} · {fmtCompact(u.inputTokens)} in · {fmtCompact(u.outputTokens)} out</dt>
              <dd class="spend-num">{fmtCompact(u.inputTokens + u.outputTokens)}</dd>
            </div>
            <div>
              <dt class="spend-label">{t("model calls")}</dt>
              <dd class="spend-num">{fmtNumber(u.calls)}</dd>
            </div>
            <div>
              <dt class="spend-label">
                {t("energy, at least")} · {fmtNumber(u.co2eGrams, 1)} g CO₂e · {t("estimate")}
              </dt>
              <dd class="spend-num">≈{fmtNumber(u.energyWh, 1)} Wh</dd>
            </div>
          </dl>
          <div class="spend-today">
            <div class="spend-meter" role="meter" aria-valuemin={0} aria-valuemax={u.today.limitUsd} aria-valuenow={u.today.costUsd} aria-label={t("Spent today")}>
              <span style={{ width: `${share * 100}%` }} class={share > 0.8 ? "is-high" : ""} />
            </div>
            <p class="spend-label">
              <strong>US{usd(u.today.costUsd)}</strong> {t("today, of the {limit} daily limit", { limit: `US${usd(u.today.limitUsd)}` })}
            </p>
          </div>
          {(u as UsageSummary & { method?: { note?: string } }).method?.note ? (
            <p class="spend-note">{(u as UsageSummary & { method?: { note?: string } }).method!.note}</p>
          ) : null}
          <table class="spend-models">
            <caption class="sr-only">{t("By model")}</caption>
            <tbody>
              {Object.entries(u.byModel).map(([m, v]) => (
                <tr key={m}>
                  <th scope="row">{m}</th>
                  <td>{fmtNumber(v.calls)} {t("model calls")}</td>
                  <td>{fmtCompact(v.inputTokens + v.outputTokens)} {t("tokens")}</td>
                  <td>US{usd(v.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : !error ? (
        <p class="spend-dim">{t("Loading…")}</p>
      ) : null}
    </div>
  );
}
