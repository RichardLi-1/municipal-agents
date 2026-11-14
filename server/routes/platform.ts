// Routes for other sites and apps: the calendar subscription feed, the data behind the
// embeddable card, and the OpenAPI description of the whole API.
//
//   GET /api/calendar.ics?decisions=a,b&city=   one feed of many decisions (webcal:// friendly)
//   GET /api/calendar?decisions=a,b&city=       links to subscribe to that feed
//   GET /api/embed/:id?lang=                    the compact card the widget shows (CORS *)
//   GET /api/openapi.json                       OpenAPI 3.1
import type { IncomingMessage } from "node:http";
import type { Brief, Decision, Statement } from "../../shared/types.ts";
import type { App } from "../app.ts";
import { SAFE_LANG } from "../data.ts";
import { HttpError, type Router, sendBody, sendJson } from "../http.ts";
import { calendarFeed } from "../ics.ts";
import { buildOpenApi } from "../openapi.ts";
import { siteOrigin } from "../site.ts";
import { publicBrief } from "../statements.ts";
import { nextParticipation, openParticipation, startMs } from "../time.ts";
import { decisionsFor, requestCity } from "./cities.ts";

/** Cross-origin reads for data meant to be used on other sites. No credentials, ever. */
const CORS = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };

/** `?decisions=a,b` (404 naming any unknown id), else every decision of `?city=`. */
function feedDecisions(app: App, url: URL): Decision[] {
  const ids = (url.searchParams.get("decisions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return decisionsFor(app, url);
  const found = ids.map((id) => app.store.decision(id));
  const missing = ids.filter((_, i) => !found[i]);
  if (missing.length) throw new HttpError(404, `No decision with id ${missing.map((m) => `"${m}"`).join(", ")}`);
  return [...new Map(found.map((d) => [d!.id, d!])).values()];
}

function feedName(app: App, url: URL, decisions: Decision[]): string {
  if (decisions.length === 1) return `Have your say: ${decisions[0].plainTitle}`;
  if (url.searchParams.has("decisions") || url.searchParams.get("city") === "all") return "Have your say: municipal decisions";
  const city = requestCity(app, url);
  return city ? `Have your say: ${city.name}` : "Have your say: municipal decisions";
}

/** The feed's query string, kept so subscription links point at the same selection. */
function feedQuery(url: URL): string {
  const q = new URLSearchParams();
  for (const k of ["decisions", "city"]) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface EmbedCard {
  id: string;
  plainTitle: string;
  decidedBy: string;
  status: Decision["status"];
  /** The language the summary is in: the requested one if a translation is cached, else the brief's. */
  lang: string;
  summary: { id: string; text: string; kind: Statement["kind"]; verified: boolean; edited: boolean; citations: { sourceId: string; source: string; page: number; url: string }[] }[];
  next?: { id: string; title: string; plain: string; date: string; end?: string; location?: string; open: boolean; estimated: boolean; methods: { method: string; instructions: string; deadline?: string; url?: string }[] };
  review: { status: Brief["review"]["status"] | "none"; by?: string; at?: string };
  readingGrade?: number;
  links: { brief: string; calendar: string; official: string; subscribe: string };
}

export function embedCard(app: App, req: IncomingMessage, decision: Decision, lang?: string, now = Date.now()): EmbedCard {
  const origin = siteOrigin(app, req);
  const original = app.store.brief(decision.id);
  let brief = original;
  if (lang && original && (original.lang ?? "en") !== lang) brief = app.store.brief(decision.id, lang) ?? original;
  if (brief && original) brief = publicBrief(brief, original);
  const titles = new Map(app.store.sources().map((s) => [s.id, s.title]));
  const summary = (brief?.summary ?? [])
    .filter((s) => s.review?.action !== "rejected")
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      text: s.text,
      kind: s.kind,
      verified: !!s.verified,
      edited: s.review?.action === "edited",
      citations: (s.citations ?? []).slice(0, 3).map((c) => ({
        sourceId: c.sourceId,
        source: titles.get(c.sourceId) ?? c.sourceId,
        page: c.page,
        url: `${origin}/source/${encodeURIComponent(c.sourceId)}/${c.page}?q=${encodeURIComponent(c.quote.slice(0, 160))}`,
      })),
    }));
  const e = nextParticipation(decision, now);
  const openIds = new Set(openParticipation(decision, now).map((x) => x.id));
  return {
    id: decision.id,
    plainTitle: decision.plainTitle,
    decidedBy: decision.decidedBy,
    status: decision.status,
    lang: brief?.lang ?? "en",
    summary,
    ...(e
      ? {
          next: {
            id: e.id,
            title: e.title,
            plain: e.plain,
            date: e.date,
            ...(e.end ? { end: e.end } : {}),
            ...(e.location ? { location: e.location } : {}),
            open: openIds.has(e.id) || startMs(e.date) < now,
            // Worked out from a rule, not published: the card says "At the latest".
            estimated: !!e.estimated,
            methods: (e.participation ?? []).map((p) => ({ method: p.method, instructions: p.instructions, ...(p.deadline ? { deadline: p.deadline } : {}), ...(p.url ? { url: p.url } : {}) })),
          },
        }
      : {}),
    review: original?.review ? { status: original.review.status, ...(original.review.by ? { by: original.review.by } : {}), ...(original.review.at ? { at: original.review.at } : {}) } : { status: "none" },
    ...(brief ? { readingGrade: Math.round(brief.readingGrade * 10) / 10 } : {}),
    links: {
      brief: `${origin}/d/${encodeURIComponent(decision.id)}`,
      calendar: `${origin}/api/decisions/${encodeURIComponent(decision.id)}/calendar.ics`,
      official: decision.officialUrl,
      subscribe: `${origin.replace(/^https?:/, "webcal:")}/api/calendar.ics?decisions=${encodeURIComponent(decision.id)}`,
    },
  };
}

export function platformRoutes(app: App, r: Router): void {
  r.get("/api/calendar.ics", ({ req, res, url }) => {
    const decisions = feedDecisions(app, url);
    const ics = calendarFeed(decisions, {
      siteUrl: siteOrigin(app, req),
      name: feedName(app, url, decisions),
      description: "Public meetings, deadlines and surveys where residents can have a say, from Municipal Agents. Not the official notice: each event links to it.",
    });
    sendBody(req, res, 200, ics, {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline, not attachment: calendar apps subscribe to this URL rather than download it.
      "Content-Disposition": 'inline; filename="have-your-say.ics"',
      "Cache-Control": "public, max-age=900",
      ...CORS,
    });
  });

  r.get("/api/calendar", ({ req, res, url }) => {
    const decisions = feedDecisions(app, url);
    const origin = siteOrigin(app, req);
    const https = `${origin}/api/calendar.ics${feedQuery(url)}`;
    const webcal = https.replace(/^https?:/, "webcal:");
    const name = feedName(app, url, decisions);
    sendJson(
      req,
      res,
      200,
      {
        name,
        ics: https,
        webcal,
        google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
        outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(name)}`,
        decisions: decisions.map((d) => ({ id: d.id, plainTitle: d.plainTitle, ics: `${origin}/api/decisions/${encodeURIComponent(d.id)}/calendar.ics` })),
        privacy: "A subscription, not a sign-up: the feed is the same public file for everyone. No account, email or personal data is asked for or stored.",
      },
      { "Cache-Control": "no-cache", ...CORS },
    );
  });

  r.get("/api/embed/:id", ({ req, res, params, url }) => {
    const decision = app.store.decision(params.id);
    if (!decision) return sendJson(req, res, 404, { error: `No decision with id "${params.id}"` }, CORS);
    const raw = url.searchParams.get("lang") ?? undefined;
    const lang = raw && SAFE_LANG.test(raw) ? raw.toLowerCase() : undefined;
    sendJson(req, res, 200, embedCard(app, req, decision, lang), { "Cache-Control": "public, max-age=60", ...CORS });
  });

  r.get("/api/openapi.json", ({ req, res }) => {
    sendJson(req, res, 200, buildOpenApi(siteOrigin(app, req)), { "Cache-Control": "public, max-age=300", ...CORS });
  });
}
