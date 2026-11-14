// More than one municipality on one deployment. Each city is a file in cities/<id>.json
// and each decision names its city, so adding a second municipality is one more config
// file plus its decisions and sources: no code changes.
//
//   GET /api/cities                   every city config
//   GET /api/city?city=<id>           one city (default: the CITY env, else the first file)
//   GET /api/decisions?city=<id>      that city's decision cards (?city=all for every city)
//
// These are registered before routes/public.ts, so they answer /api/city and
// /api/decisions; the cards themselves come from public.ts's card().
import type { CityConfig, Decision, DecisionCard, TimelineEvent } from "../../shared/types.ts";
import type { App } from "../app.ts";
import { HttpError, type Router, sendJson } from "../http.ts";
import { nextParticipation, openParticipation, startMs } from "../time.ts";
import * as publicModule from "./public.ts";

type Card = DecisionCard & { open: TimelineEvent[] };

/** Same shape as public.ts's card(); used only if that export ever moves. */
function fallbackCard(app: App, d: Decision, now = Date.now()): Card {
  return {
    id: d.id,
    plainTitle: d.plainTitle,
    decidedBy: d.decidedBy,
    status: d.status,
    next: nextParticipation(d, now),
    open: openParticipation(d, now),
    center: d.center,
    reviewStatus: app.store.brief(d.id)?.review?.status ?? "none",
    lenses: d.lenses ?? [],
  };
}

const toCard: (app: App, d: Decision, now?: number) => Card = (publicModule as { card?: typeof fallbackCard }).card ?? fallbackCard;

/** The city a request is about: `?city=<id>`, else the deployment's default. 404 for an unknown id. */
export function requestCity(app: App, url: URL): CityConfig | undefined {
  const id = url.searchParams.get("city");
  if (id && id !== "all") {
    const c = app.store.cities().find((x) => x.id === id);
    if (!c) throw new HttpError(404, `No city with id "${id}"`);
    return c;
  }
  return app.store.city();
}

/**
 * The decisions that belong to a city. A decision whose `city` matches no config (an old
 * upload, a typo) belongs to the default city, so it never silently disappears.
 */
export function cityDecisions(app: App, city: CityConfig | undefined): Decision[] {
  const all = app.store.decisions();
  if (!city) return all;
  const known = new Set(app.store.cities().map((c) => c.id));
  const fallback = app.store.city()?.id;
  return all.filter((d) => (known.has(d.city) ? d.city : fallback) === city.id);
}

/** `?city=all` means every city; otherwise the request's city. */
export function decisionsFor(app: App, url: URL): Decision[] {
  return url.searchParams.get("city") === "all" ? app.store.decisions() : cityDecisions(app, requestCity(app, url));
}

export function sortCards<T extends DecisionCard>(cards: T[]): T[] {
  // Soonest chance to take part first; decisions with none at the end.
  return cards.sort((a, b) => (a.next ? startMs(a.next.date) : Infinity) - (b.next ? startMs(b.next.date) : Infinity) || a.plainTitle.localeCompare(b.plainTitle));
}

export function cityRoutes(app: App, r: Router): void {
  r.get("/api/cities", ({ req, res }) => {
    const def = app.store.city()?.id;
    const cities = app.store.cities().map((c) => ({ ...c, default: c.id === def, decisions: cityDecisions(app, c).length }));
    sendJson(req, res, 200, cities, { "Cache-Control": "no-cache" });
  });

  r.get("/api/city", ({ req, res, url }) => {
    const city = requestCity(app, url);
    if (!city) throw new HttpError(404, "No city config in cities/");
    sendJson(req, res, 200, city, { "Cache-Control": "no-cache" });
  });

  r.get("/api/decisions", ({ req, res, url }) => {
    const now = Date.now();
    const cards = sortCards(decisionsFor(app, url).map((d) => toCard(app, d, now)));
    sendJson(req, res, 200, cards, { "Cache-Control": "no-cache" });
  });
}
