import { useT } from "../lib/i18n.ts";

export function Footer({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <footer class={`footer ${compact ? "footer--compact" : ""}`}>
      <p>
        <strong>{t("Built at CIVIC Hack 2026")}</strong> · Future Cities Institute, University of Waterloo
      </p>
      <p>
        {t("Map data © OpenStreetMap contributors · Tiles OpenFreeMap")} ·{" "}
        <a class="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> ·{" "}
        <a class="link" href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ·{" "}
        <a class="link" href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ·{" "}
        {t("Transit: Grand River Transit GTFS, Region of Waterloo Open Data")}
      </p>
    </footer>
  );
}
