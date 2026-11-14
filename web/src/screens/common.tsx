import { sampleMode } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { useStore } from "../lib/store.ts";
import { Alert } from "../components/icons.tsx";

export function SampleBadge() {
  const t = useT();
  const on = useStore(sampleMode);
  if (!on) return null;
  return (
    <span class="sample-badge" title={t("Sample data: the live service isn't connected, so this shows a made-up example.")}>
      {t("Sample data")}
    </span>
  );
}

export function LoadingPane() {
  const t = useT();
  return (
    <div class="loading-pane" role="status">
      <div class="skeleton skeleton--title" />
      <div class="skeleton" />
      <div class="skeleton skeleton--short" />
      <div class="skeleton skeleton--card" />
      <div class="skeleton skeleton--card" />
      <span class="sr-only">{t("Loading…")}</span>
    </div>
  );
}

export function ErrorPane({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div class="error-pane" role="alert">
      <Alert size={22} />
      <h1 class="section-title">{t("Something went wrong")}</h1>
      <p class="muted">{message}</p>
      {onRetry ? (
        <button type="button" class="btn btn-primary" onClick={onRetry}>
          {t("Try again")}
        </button>
      ) : null}
    </div>
  );
}

/** The map's credit line, in the corner of the visible map. */
export function MapCredit() {
  return (
    <p class="map-credit">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> ·{" "}
      <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
    </p>
  );
}
