import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Decision, DecisionCard } from "../../../shared/types.ts";
import { Bus, Coins, Flag, House, MapPin, Search, Cross, CheckCircle, Tunnel } from "../components/icons.tsx";
import { mapApi, mapState } from "../components/MapView.tsx";
import { api } from "../lib/api.ts";
import { countdown, fmtDateTime, targetOf, when } from "../lib/format.ts";
import { useT } from "../lib/i18n.ts";
import { inArea, km, searchPlaces, PLACES } from "../lib/places.ts";
import { navigate, onLinkClick } from "../lib/router.ts";
import { cityStore } from "../lib/state.ts";
import { useStore } from "../lib/store.ts";
import { ErrorPane, LoadingPane, MapCredit, SampleBadge } from "./common.tsx";
import { Footer } from "../components/Footer.tsx";

export const DEADLINE_VERB: Record<string, string> = {
  speak: "Register to speak by",
  write: "Send comments by",
  survey: "Answer the survey by",
};

const LENS_ICON = { transit: Bus, cost: Coins, commitments: Flag, housing: House, construction: Tunnel } as const;
const LENS_NAME = { transit: "Transit", cost: "Costs", commitments: "Commitments", housing: "Housing", construction: "Construction" } as const;

function Card({ c, onHover, near }: { c: DecisionCard; onHover: (id: string | null) => void; near?: number }) {
  const t = useT();
  const cd = c.next ? countdown(targetOf(c.next)) : null;
  const status = c.status === "in-consultation" ? "In consultation" : c.status === "decided" ? "Decided" : "Proposed";
  return (
    <article class="card dcard" onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)} onFocusCapture={() => onHover(c.id)} onBlurCapture={() => onHover(null)}>
      <div class="row-between">
        <span class={`status status--${c.status}`}>{t(status)}</span>
        <span class="dcard-lenses">
          {c.lenses.map((l) => {
            const I = LENS_ICON[l as keyof typeof LENS_ICON];
            if (!I) return null;
            return (
              <span key={l} class="lens-dot" title={t(LENS_NAME[l as keyof typeof LENS_NAME])}>
                <I size={15} />
                <span class="sr-only">{t(LENS_NAME[l as keyof typeof LENS_NAME])}</span>
              </span>
            );
          })}
        </span>
      </div>
      <h2 class="dcard-title">
        <a href={`/d/${c.id}`} onClick={onLinkClick} class="stretched">
          {c.plainTitle}
        </a>
      </h2>
      <p class="muted small">
        {t("Decided by {who}", { who: c.decidedBy })}
        {near !== undefined ? <> · {near === 0 ? t("covers this place") : near < 1 ? "< 1 km" : `${Math.round(near)} km`}</> : null}
      </p>
      {c.next && cd ? (
        <div class="dcard-next">
          <p class="eyebrow">{t("Next chance to have a say")}</p>
          <div class="row-between dcard-next-row">
            <div>
              <p class="dcard-next-title">{c.next.title}</p>
              {(() => {
                const target = targetOf(c.next!);
                if (target === c.next!.date) return null;
                const p = c.next!.participation?.find((x) => x.deadline === target);
                return (
                  <p class="small dcard-deadline">
                    {t(DEADLINE_VERB[p?.method ?? ""] ?? "Take part by")} <time dateTime={target}>{fmtDateTime(target)}</time>
                  </p>
                );
              })()}
              <p class="small muted">
                {targetOf(c.next) !== c.next.date && when(c.next.date) > Date.now() && ["committee", "council", "budget-vote", "public-input"].includes(c.next.kind) ? `${t("Meeting")} ` : ""}
                <time dateTime={c.next.date}>{fmtDateTime(c.next.date)}</time>
              </p>
            </div>
            <span class={`countdown-pill ${cd.ms < 86_400_000 * 7 ? "is-soon" : ""}`}>{cd.text}</span>
          </div>
        </div>
      ) : (
        <p class="dcard-next dcard-next--none small muted">{t("No upcoming chance to have a say")}</p>
      )}
      {c.reviewStatus === "published" ? (
        <p class="small ok-text dcard-review">
          <CheckCircle size={14} /> {t("Approved by staff")}
        </p>
      ) : c.reviewStatus === "draft" || c.reviewStatus === "in-review" ? (
        <p class="small warn-text dcard-review">{t("Draft")}</p>
      ) : null}
    </article>
  );
}

function PlaceSearch({ onPick, picked, onClear }: { onPick: (p: (typeof PLACES)[number]) => void; picked: string | null; onClear: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPlaces(q), [q]);
  const input = useRef<HTMLInputElement>(null);
  const pick = (p: (typeof PLACES)[number]) => {
    setQ(p.name);
    setOpen(false);
    onPick(p);
  };
  return (
    <div class="search" role="search">
      <label for="place-q" class="search-label">
        {t("Find your neighbourhood or street")}
      </label>
      <div class="search-box">
        <Search size={18} />
        <input
          id="place-q"
          ref={input}
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls="place-list"
          aria-activedescendant={open && results[active] ? `place-${active}` : undefined}
          placeholder={t("For example: Fairview, King Street, Hespeler")}
          value={q}
          onInput={(e) => {
            setQ(e.currentTarget.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {q || picked ? (
          <button
            type="button"
            class="icon-btn icon-btn--sm"
            aria-label={t("Clear")}
            onClick={() => {
              setQ("");
              onClear();
              input.current?.focus();
            }}
          >
            <Cross size={16} />
          </button>
        ) : null}
      </div>
      {open && q.trim() ? (
        results.length ? (
          <ul id="place-list" role="listbox" class="search-list" aria-label={t("Find your neighbourhood or street")}>
            {results.map((p, i) => (
              <li
                key={p.name}
                id={`place-${i}`}
                role="option"
                aria-selected={i === active}
                class={i === active ? "is-active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                <MapPin size={15} /> <span>{p.name}</span> <span class="muted small">{p.area}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="search-none small muted" role="status">{t("No match. Try a neighbourhood name.")}</p>
        )
      ) : null}
    </div>
  );
}

/** Pins closer than ~4 km would sit on top of each other: lift each extra one on a leader line. */
function stackPins(cards: DecisionCard[]) {
  const placed: { c: DecisionCard; stack: number }[] = [];
  for (const c of cards) {
    const near = placed.filter((p) => km(p.c.center, c.center) < 4);
    placed.push({ c, stack: near.length ? Math.max(...near.map((p) => p.stack)) + 1 : 0 });
  }
  return placed;
}

export function HomeScreen() {
  const t = useT();
  const city = useStore(cityStore);
  const [cards, setCards] = useState<DecisionCard[] | null>(null);
  const [areas, setAreas] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [place, setPlace] = useState<(typeof PLACES)[number] | null>(null);

  const load = () => {
    setError(null);
    api
      .decisions()
      .then((cs) => {
        setCards(cs);
        // Fetch the areas for the map (small: a handful of decisions).
        cs.forEach((c) =>
          api
            .decision(c.id)
            .then((d) => setAreas((a) => ({ ...a, [c.id]: d.decision })))
            .catch(() => {}),
        );
      })
      .catch((e) => setError(String(e.message ?? e)));
  };
  useEffect(() => {
    document.title = "Municipal Agents · What's being decided near you";
    load();
  }, []);

  useEffect(() => {
    if (!cards) return;
    const c = city?.center ?? [-80.49, 43.44];
    mapState.set({
      areas: cards.filter((x) => areas[x.id]?.area).map((x) => ({ id: x.id, geo: areas[x.id].area!, selected: hover === x.id })),
      pins: stackPins(cards).map(({ c: x, stack }) => {
        const cd = x.next ? countdown(targetOf(x.next)) : null;
        return {
          id: x.id,
          at: x.center,
          label: x.plainTitle,
          sub: cd ? cd.text : undefined,
          selected: hover === x.id,
          stack,
          onClick: () => navigate(`/d/${x.id}`),
        };
      }),
      layers: [],
      focus: place ? { key: `p-${place.name}`, center: place.at, zoom: 13 } : { key: "home", center: c as [number, number], zoom: city?.zoom ?? 10.6 },
      onAreaClick: (id) => navigate(`/d/${id}`),
    });
  }, [cards, areas, hover, city, place]);

  const sorted = useMemo(() => {
    if (!cards) return null;
    if (!place) return { near: cards, far: [] as DecisionCard[], dist: {} as Record<string, number> };
    // Inside a decision's area counts as 0 km (a region-wide budget covers Elmira); else distance.
    const dist: Record<string, number> = {};
    for (const c of cards) dist[c.id] = inArea(place.at, areas[c.id]?.area) ? 0 : km(place.at, c.center);
    const byDist = [...cards].sort((a, b) => dist[a.id] - dist[b.id]);
    return { near: byDist.filter((c) => dist[c.id] <= 5), far: byDist.filter((c) => dist[c.id] > 5), dist };
  }, [cards, place, areas]);

  return (
    <div class="layout layout-home">
      <aside class="pane pane-left" data-cover="left" aria-labelledby="home-title">
        <div class="pane-scroll">
          <header class="home-head">
            <div class="row-between">
              <p class="eyebrow">{city?.name ?? "Waterloo Region"}</p>
              <SampleBadge />
            </div>
            <h1 id="home-title" class="plain-title" tabIndex={-1}>
              {t("What's being decided near you")}
            </h1>
            <p class="lede">
              {t("Proposed decisions in {city}, explained in plain words. Every figure links to the page it came from.", {
                city: city?.name ?? "Waterloo Region",
              })}
            </p>
            <PlaceSearch
              picked={place?.name ?? null}
              onPick={(p) => {
                setPlace(p);
                mapApi.flyTo(p.at, 13);
              }}
              onClear={() => setPlace(null)}
            />
          </header>
          {error ? <ErrorPane message={error} onRetry={load} /> : !sorted ? <LoadingPane /> : (
            <>
              {place ? <h2 class="group-title">{t("Near {place}", { place: place.name })}</h2> : null}
              <ul class="cards" role="list">
                {sorted.near.map((c) => (
                  <li key={c.id}>
                    <Card c={c} onHover={setHover} near={place ? sorted.dist[c.id] : undefined} />
                  </li>
                ))}
              </ul>
              {place && !sorted.near.length ? <p class="empty-hint">{t("Nothing being decided within 5 km yet.")}</p> : null}
              {sorted.far.length ? (
                <>
                  <h2 class="group-title">{t("Elsewhere in the region")}</h2>
                  <ul class="cards" role="list">
                    {sorted.far.map((c) => (
                      <li key={c.id}>
                        <Card c={c} onHover={setHover} near={sorted.dist[c.id]} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
          <Footer compact />
        </div>
      </aside>
      <div class="map-hole">
        <MapCredit />
      </div>
    </div>
  );
}
