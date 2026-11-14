import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Brief, DecisionDetail, LensId } from "../../../shared/types.ts";
import { Chat } from "../components/Chat.tsx";
import { CitationChip } from "../components/Citations.tsx";
import { ArrowLeft, Bus, CheckCircle, Alert, External, Layers, Spark, Doc, Flag, Access } from "../components/icons.tsx";
import { mapApi, mapState, type MapLayer, type LayerKind } from "../components/MapView.tsx";
import { api } from "../lib/api.ts";
import { countdown, fmtDate, fmtDateTime, targetOf } from "../lib/format.ts";
import { DEADLINE_VERB } from "./Home.tsx";
import { languageName, useT } from "../lib/i18n.ts";
import { lang, RTL } from "../lib/prefs.ts";
import { onLinkClick, route, setParam } from "../lib/router.ts";
import { cityStore, currentDecision, feedbackLink, operatorOf, rememberSources } from "../lib/state.ts";
import { toast } from "../lib/toast.ts";
import { useStore } from "../lib/store.ts";
import { Affects, HaveYourSay, nextChance, Overview, Sources, Unknowns } from "./tabs-brief.tsx";
import { Commitments, Costs, Housing, PartialLens, Transit } from "./tabs-lenses.tsx";
import { ErrorPane, LoadingPane, MapCredit, SampleBadge } from "./common.tsx";
import { loadConstruction, normaliseLayers, type CameraFocus, type ConstructionModule } from "../lib/construction.ts";

const arr = (v: unknown) => Array.isArray(v);
/** A lens can arrive partial ({statements, partial: true}); these say whether it is whole. */
const complete = {
  transit: (l: object) => ["scenarios", "access", "gaps", "fixes"].every((k) => arr((l as Record<string, unknown>)[k])),
  commitments: (l: object) => arr((l as Record<string, unknown>).commitments),
  housing: (l: object) => arr((l as Record<string, unknown>).stages),
  construction: (l: object) => ["steps", "sites"].every((k) => arr((l as Record<string, unknown>)[k])),
};

type TabId = "overview" | "affects" | "say" | "transit" | "costs" | "commitments" | "housing" | "construction" | "unknowns" | "sources";

const TABS: { id: TabId; label: string; lens?: LensId; needsBrief?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "affects", label: "Affects you", needsBrief: true },
  { id: "say", label: "Have your say" },
  { id: "transit", label: "Transit", lens: "transit" },
  { id: "costs", label: "Costs", lens: "cost" },
  { id: "commitments", label: "Commitments", lens: "commitments" },
  { id: "housing", label: "Housing", lens: "housing" },
  { id: "construction", label: "Construction", lens: "construction" },
  { id: "unknowns", label: "Unknowns & trade-offs", needsBrief: true },
  { id: "sources", label: "Sources" },
];

const LAYER_KIND = (name: string): LayerKind => {
  const n = name.toLowerCase();
  if (/access|grid|isochrone|travel/.test(n)) return "access";
  if (/stop/.test(n)) return "stops";
  if (/dest/.test(n)) return "destinations";
  if (/gap/.test(n)) return "gaps";
  if (/project|permit|application|site/.test(n)) return "projects";
  return "generic";
};
const LAYER_LABEL: Record<LayerKind, string> = {
  access: "Travel time to a hospital",
  stops: "Bus and ION stops",
  destinations: "Everyday places",
  gaps: "Gaps",
  projects: "Housing projects",
  generic: "",
};

export function DecisionScreen({ id }: { id: string }) {
  const t = useT();
  const r = useStore(route);
  const want = useStore(lang);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Brief | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [activeGap, setActiveGap] = useState<string | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"brief" | "ask">("brief");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [cmod, setCmod] = useState<ConstructionModule | null | undefined>(undefined);
  const [cLayers, setCLayers] = useState<string[] | null>(null);

  const load = () => {
    setError(null);
    setDetail(null);
    api
      .decision(id)
      .then((d) => {
        rememberSources(d.sources);
        setDetail(d);
        currentDecision.set({ id: d.decision.id, title: d.decision.plainTitle });
        document.title = `${d.decision.plainTitle} · Municipal Agents`;
      })
      .catch((e) => setError(String(e.message ?? e)));
  };
  useEffect(load, [id]);

  // Translation of the brief (the agents do it; we cache per language in state).
  useEffect(() => {
    const b = detail?.brief;
    setShowOriginal(false);
    if (!b || want === b.lang || want === "en") {
      setTranslated(null);
      return;
    }
    let dead = false;
    setTranslating(true);
    api
      .translate(id, want)
      .then((tb) => {
        if (dead) return;
        setTranslated(tb);
        toast({ title: t("Translated into {lang}", { lang: languageName(want) }), body: t("Machine translation by AI. The English brief is the reference."), tone: "ok" });
      })
      .catch((e) => {
        if (dead) return;
        setTranslated(null);
        toast({ title: t("Translation isn't available right now"), body: String(e.message ?? e).slice(0, 140), tone: "warn" });
      })
      .finally(() => !dead && setTranslating(false));
    return () => {
      dead = true;
    };
  }, [detail, want]);

  const decision = detail?.decision;
  const original = detail?.brief;
  const brief = translated && !showOriginal ? translated : original;
  const briefLang = brief?.lang ?? "en";

  const tabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (tab.needsBrief && !brief) return false;
        if (tab.lens) {
          const key = tab.lens as keyof Brief["lenses"];
          return !!brief?.lenses?.[key];
        }
        return true;
      }),
    [brief],
  );
  const reqTab = (r.search.get("tab") ?? "overview") as TabId;
  const tab: TabId = tabs.some((x) => x.id === reqTab) ? reqTab : "overview";

  // The construction lens is a separate module, loaded only when a brief has one.
  const cLens = brief?.lenses.construction;
  useEffect(() => {
    if (cLens && cmod === undefined) loadConstruction().then(setCmod);
  }, [cLens]);
  const cExtra = useMemo(() => {
    if (tab !== "construction" || !cLens || !cmod || !complete.construction(cLens)) return undefined;
    try {
      return normaliseLayers(cmod.constructionMapLayers(cLens));
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }, [tab, cLens, cmod]);
  const onConstructionFocus = (f: CameraFocus) => {
    mapApi.focus(f);
    setCLayers(f.layers?.length ? f.layers : null);
  };

  // The map: this decision's area, and the layers for the open lens.
  const lensLayers: MapLayer[] = useMemo(() => {
    if (!brief) return [];
    const src = tab === "transit" ? brief.lenses.transit?.layers : tab === "housing" ? brief.lenses.housing?.layers : undefined;
    if (src && typeof src !== "object") return [];
    if (!src) return [];
    return Object.entries(src).map(([name, data]) => {
      const kind = LAYER_KIND(name);
      return {
        id: `${tab}-${name}`,
        label: LAYER_LABEL[kind] || name.replace(/[-_]/g, " "),
        kind,
        data,
        visible: !hiddenLayers.has(`${tab}-${name}`),
      };
    });
  }, [brief, tab, hiddenLayers]);

  useEffect(() => {
    if (!decision) return;
    mapState.set({
      areas: decision.area ? [{ id: decision.id, geo: decision.area, selected: true }] : [],
      pins: decision.area ? [] : [{ id: decision.id, at: decision.center, label: decision.plainTitle, selected: true }],
      layers: lensLayers,
      extra: cExtra ? { ...cExtra, visible: cLayers } : undefined,
      focus: { key: `d-${decision.id}-${tab === "construction" ? "c" : "n"}`, center: decision.center, zoom: decision.zoom, fit: !!decision.area },
    });
  }, [decision, lensLayers, cExtra, cLayers, tab === "construction"]);

  useEffect(
    () => () => {
      mapApi.pulse(null);
      currentDecision.set(null);
    },
    [],
  );
  const city = useStore(cityStore);
  useEffect(() => {
    if (tab !== "transit") {
      mapApi.pulse(null);
      setActiveGap(null);
    }
  }, [tab]);

  if (error)
    return (
      <div class="layout layout-decision">
        <aside class="pane pane-left" data-cover="left">
          <ErrorPane message={error} onRetry={load} />
        </aside>
      </div>
    );
  if (!detail || !decision) return <div class="layout layout-decision"><aside class="pane pane-left" data-cover="left"><LoadingPane /></aside></div>;

  const selectTab = (next: TabId, focus = false) => {
    setParam("tab", next === "overview" ? null : next);
    if (focus) tabRefs.current[next]?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.id === tab);
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n >= 0) {
      e.preventDefault();
      selectTab(tabs[n].id, true);
    }
  };

  const review = original?.review;
  const next = nextChance(decision);
  const nextCd = next ? countdown(targetOf(next)) : null;

  return (
    <div class={`layout layout-decision show-${mobileView}`}>
      <div class="mobile-switch" role="group" aria-label={t("Brief")}>
        <button type="button" aria-pressed={mobileView === "brief"} onClick={() => setMobileView("brief")}>
          <Doc size={16} /> {t("Brief")}
        </button>
        <button type="button" aria-pressed={mobileView === "ask"} onClick={() => setMobileView("ask")}>
          <Spark size={16} /> {t("Ask")}
        </button>
      </div>
      <aside class="pane pane-left" data-cover="left" aria-labelledby="decision-title">
        <div class="pane-scroll">
          <header class="brief-head">
            <div class="row-between">
              <a href="/decisions" class="back-link" onClick={onLinkClick}>
                <ArrowLeft size={16} /> {t("Back to all decisions")}
              </a>
              <SampleBadge />
            </div>
            <p class="eyebrow">
              {decision.decidedBy} · {t(decision.status === "in-consultation" ? "In consultation" : decision.status === "decided" ? "Decided" : "Proposed")}
            </p>
            <h1 id="decision-title" class="plain-title" tabIndex={-1} lang={briefLang === want ? undefined : "en"}>
              {decision.plainTitle}
            </h1>
            <p class="official-title">{decision.title}</p>
            <div class="badges">
              {review?.status === "published" ? (
                <span class="banner banner--ok">
                  <CheckCircle size={16} />
                  {t("Approved by {name} on {date}", { name: review.by ?? "staff", date: review.at ? fmtDate(review.at) : "" })}
                </span>
              ) : original ? (
                <span class="banner banner--warn">
                  <Alert size={16} />
                  {review?.status === "in-review" ? t("In review by city staff") : t("Draft: not yet reviewed by city staff")}
                </span>
              ) : null}
              {original ? <span class="grade">{t("Grade {n} reading level", { n: Math.round(original.readingGrade) })}</span> : null}
            </div>
            {original ? (
              <p class="ai-note">
                <Spark size={14} /> {t("Drafted by AI agents from the city's documents; every quote checked in code.")}
              </p>
            ) : null}
            <div class="badges-end" hidden>
            </div>
            <p class="notice">
              {t("Not the official notice.")}{" "}
              <a class="link" href={decision.officialUrl} target="_blank" rel="noopener noreferrer">
                {t("Read the official notice")} <External size={13} />
              </a>
            </p>
            {next && nextCd && tab !== "say" ? (
              <button type="button" class="next-cta" onClick={() => selectTab("say")}>
                <span class="next-cta-k">{t("Next chance to have a say")}</span>
                <span class="next-cta-t">
                  {next.title}
                  {(() => {
                    const target = targetOf(next);
                    if (target === next.date) return null;
                    const p = next.participation?.find((x) => x.deadline === target);
                    return (
                      <span class="next-cta-d">
                        {t(DEADLINE_VERB[p?.method ?? ""] ?? "Take part by")} {fmtDateTime(target)}
                      </span>
                    );
                  })()}
                </span>
                <span class="next-cta-cd">{t("in {n}", { n: nextCd.text })}</span>
              </button>
            ) : null}
            {translating ? (
              <p class="translating" role="status">
                <span class="spinner spinner--sm" aria-hidden="true" /> {t("Translating…")} {languageName(want)}
              </p>
            ) : translated ? (
              <p class="translated small">
                {t("Machine translation by AI. The English brief is the reference.")}{" "}
                <button type="button" class="link-btn" onClick={() => setShowOriginal(!showOriginal)}>
                  {showOriginal ? languageName(translated.lang) : t("Show the original")}
                </button>
              </p>
            ) : null}
          </header>
          {(decision.notices ?? []).map((n) => (
            <aside class="notice-callout" key={n.id} aria-labelledby={`notice-${n.id}`}>
              <p class="notice-callout-head">
                <Alert size={14} /> {t("Notice")} · <time dateTime={n.date}>{fmtDate(n.date)}</time>
              </p>
              <h2 id={`notice-${n.id}`}>{n.title}</h2>
              <p>
                {n.text} {n.citation ? <CitationChip c={n.citation} /> : null}
              </p>
              <p class="notice-foot">{t("Hand-checked by the Municipal Agents team")}</p>
            </aside>
          ))}
          <div class="tabs" role="tablist" aria-label={t("Brief sections")} onKeyDown={onTabKey as never}>
            {tabs.map((x) => (
              <button
                key={x.id}
                ref={(el) => { tabRefs.current[x.id] = el; }}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={tab === x.id}
                aria-controls={`panel-${x.id}`}
                tabIndex={tab === x.id ? 0 : -1}
                class="tab"
                onClick={() => selectTab(x.id)}
              >
                {t(x.label)}
              </button>
            ))}
          </div>
          <div
            class={`tab-panel ${translating ? "is-dim" : ""}`}
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
            lang={briefLang}
            dir={RTL.has(briefLang) ? "rtl" : undefined}
            key={tab}
          >
            {!brief && tab === "overview" ? (
              <div class="empty-card">
                <h2 class="section-title">{t("No brief yet")}</h2>
                <p class="muted">{t("City staff haven't asked the agents to draft a brief for this decision yet. The dates to have your say are below.")}</p>
              </div>
            ) : null}
            {brief && tab === "overview" ? <Overview decision={decision} brief={brief} /> : null}
            {brief && tab === "affects" ? <Affects brief={brief} audiences={audiences} setAudiences={setAudiences} /> : null}
            {tab === "say" || (!brief && tab === "overview") ? <HaveYourSay decision={decision} brief={brief} /> : null}
            {brief?.lenses.transit && tab === "transit" ? (
              complete.transit(brief.lenses.transit) ? <Transit lens={brief.lenses.transit} activeGap={activeGap} setActiveGap={setActiveGap} /> : <PartialLens lens={brief.lenses.transit} />
            ) : null}
            {brief?.lenses.cost && tab === "costs" ? <Costs lens={brief.lenses.cost} /> : null}
            {brief?.lenses.commitments && tab === "commitments" ? (
              complete.commitments(brief.lenses.commitments) ? <Commitments lens={brief.lenses.commitments} /> : <PartialLens lens={brief.lenses.commitments} />
            ) : null}
            {brief?.lenses.housing && tab === "housing" ? (
              complete.housing(brief.lenses.housing) ? <Housing lens={brief.lenses.housing} /> : <PartialLens lens={brief.lenses.housing} />
            ) : null}
            {cLens && tab === "construction" ? (
              !complete.construction(cLens) ? (
                <PartialLens lens={cLens} />
              ) : cmod ? (
                <cmod.ConstructionPanel lens={cLens} onFocus={onConstructionFocus} />
              ) : cmod === null ? (
                <p class="empty-hint">{t("The construction view isn't available in this build.")}</p>
              ) : (
                <LoadingPane />
              )
            ) : null}
            {brief && tab === "unknowns" ? <Unknowns brief={brief} /> : null}
            {tab === "sources" ? <Sources detail={detail} /> : null}
          </div>
          <footer class="brief-foot">
            <a
              class="link"
              href={feedbackLink(city, `Error report: ${decision.id}`, `Decision: ${decision.plainTitle} (${decision.id})\n\nWhat is wrong, and where:\n`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Flag size={14} /> {t("Report an error")}
            </a>
            <a
              class="link"
              href={feedbackLink(
                city,
                `Accessible format request: ${decision.id}`,
                `Decision: ${decision.plainTitle} (${decision.id})\n\nThe format or support I need (for example large print, braille, audio, plain text, an interpreter):\n`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Access size={14} /> {t("Request another format")}
            </a>
            <p class="small muted">
              {t("Accessible formats and communication supports are available on request.")} {t("Run by {who}.", { who: operatorOf(city) })}
            </p>
            {city?.clerkContact ? (
              <p class="small muted">
                {t("Official questions about the decision:")} {city.clerkContact}
              </p>
            ) : null}
          </footer>
        </div>
      </aside>

      <div class="map-hole">
      {lensLayers.length ? (
        <div class="map-legend" role="group" aria-label={t("Layers")}>
          <p class="eyebrow">
            {tab === "transit" ? <Bus size={14} /> : <Layers size={14} />} {t("Layers")}
          </p>
          {lensLayers.map((l) => (
            <label key={l.id} class="legend-item">
              <input
                type="checkbox"
                checked={l.visible}
                onChange={() => {
                  const s = new Set(hiddenLayers);
                  if (s.has(l.id)) s.delete(l.id);
                  else s.add(l.id);
                  setHiddenLayers(s);
                }}
              />
              <span class={`legend-key legend-key--${l.kind}`} aria-hidden="true" />
              {t(l.label)}
            </label>
          ))}
          {lensLayers.some((l) => l.kind === "access" && l.visible) ? (
            <div class="ramp" aria-hidden="true">
              <span class="ramp-a">&lt; 20</span>
              <span class="ramp-b">20–30</span>
              <span class="ramp-c">30–45</span>
              <span class="ramp-d">45+ min</span>
            </div>
          ) : null}
        </div>
      ) : null}
        <MapCredit />
      </div>

      <aside class="pane pane-right" data-cover="right">
        <Chat decision={decision} audiences={audiences} lang={want} />
      </aside>
    </div>
  );
}
