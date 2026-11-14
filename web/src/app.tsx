import { useEffect, useRef } from "preact/hooks";
import { MapView } from "./components/MapView.tsx";
import { SourceViewer } from "./components/SourceViewer.tsx";
import { Rail } from "./components/Rail.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { api } from "./lib/api.ts";
import { chromeLang, useT } from "./lib/i18n.ts";
import { lang } from "./lib/prefs.ts";
import { match, route } from "./lib/router.ts";
import { announcement, cityStore, openSource, rememberSources } from "./lib/state.ts";
import { useStore } from "./lib/store.ts";
import { DecisionScreen } from "./screens/Decision.tsx";
import { HomeScreen } from "./screens/Home.tsx";
import { LogScreen } from "./screens/Log.tsx";
import { SpendScreen } from "./screens/Spend.tsx";
import { StaffScreen } from "./screens/Staff.tsx";
import { Footer } from "./components/Footer.tsx";

export function App() {
  const t = useT();
  const r = useStore(route);
  const l = useStore(lang);
  const said = useStore(announcement);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    api.city().then((c) => cityStore.set(c)).catch(() => {});
    api.sources().then(rememberSources).catch(() => {});
  }, []);

  // The page's language follows the menu, where we have the interface strings for it.
  useEffect(() => {
    document.documentElement.lang = chromeLang(l);
  }, [l]);

  // Move focus to the new page's heading after client-side navigation.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    requestAnimationFrame(() => main.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }));
  }, [r.path]);

  // Deep link: /source/:id/:page?q=quote opens the viewer over the home screen.
  const src = match("/source/:id/:page?", r.path);
  useEffect(() => {
    if (src) openSource({ sourceId: src.id, page: Number(src.page ?? 1), quote: r.search.get("q") ?? undefined });
  }, [r.path]);

  let screen;
  let kind: "map" | "page" | "spend" = "map";
  let p: Record<string, string> | null;
  if (r.path === "/" || r.path === "/decisions" || r.path === "/decisions/" || src) screen = <HomeScreen />;
  else if ((p = match("/d/:id", r.path))) screen = <DecisionScreen id={p.id} key={p.id} />;
  else if (r.path === "/staff") (screen = <StaffScreen />), (kind = "page");
  else if (r.path === "/log") (screen = <LogScreen />), (kind = "page");
  else if (r.path === "/spend") (screen = <SpendScreen />), (kind = "spend");
  else {
    kind = "page";
    screen = (
      <div class="page">
        <h1 class="page-title" tabIndex={-1}>{t("Page not found")}</h1>
        <p>
          <a class="link" href="/decisions">{t("Back to all decisions")}</a>
        </p>
      </div>
    );
  }

  return (
    <div class={`app app--${kind}`}>
      <a class="skip" href="#main">
        {t("Skip to content")}
      </a>
      <MapView hidden={kind !== "map"} />
      <Rail />
      <main id="main" ref={main} tabIndex={-1}>
        {kind === "map" ? (
          screen
        ) : (
          <div class={`workspace workspace--${kind}`}>
            {screen}
            {kind === "page" ? <Footer /> : null}
          </div>
        )}
      </main>
      <Toasts />
      <div class="sr-only" role="status" aria-live="polite">
        {said}
      </div>
      <SourceViewer />
    </div>
  );
}
