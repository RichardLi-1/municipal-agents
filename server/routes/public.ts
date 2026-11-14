// Read-only routes anyone can call: the city, decisions, sources, the record, spend.
import fs from "node:fs";
import type { Brief, Decision, DecisionCard, DecisionDetail, TimelineEvent } from "../../shared/types.ts";
import type { App } from "../app.ts";
import type { Lenses } from "../data.ts";
import { SAFE_LANG } from "../data.ts";
import { HttpError, type Router, sendBody, sendJson } from "../http.ts";
import { decisionCalendar } from "../ics.ts";
import { nextParticipation, openParticipation, startMs } from "../time.ts";
import { publicBrief } from "../statements.ts";
import { summarise } from "../usage.ts";
import { isStaff } from "./staff.ts";

/** A DecisionCard, plus `open`: ways to take part that are open right now (extra field). */
export function card(app: App, d: Decision, now = Date.now()): DecisionCard & { open: TimelineEvent[] } {
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

/** Lenses from data/lenses fill in whatever the brief doesn't carry itself. */
function withLenses(brief: Brief | undefined, lenses: Lenses): Brief | undefined {
  if (!brief) return undefined;
  return { ...brief, lenses: { ...lenses, ...(brief.lenses ?? {}) } };
}

function requireDecision(app: App, id: string): Decision {
  const d = app.store.decision(id);
  if (!d) throw new HttpError(404, `No decision with id "${id}"`);
  return d;
}

export function publicRoutes(app: App, r: Router): void {
  r.get("/api/health", ({ req, res }) => {
    sendJson(req, res, 200, {
      ok: true,
      startedAt: app.startedAt.toISOString(),
      version: process.env.GIT_SHA ?? process.env.FLY_IMAGE_REF ?? "dev",
      decisions: app.store.decisions().length,
      sources: app.store.sources().length,
      logEntries: app.log.count(),
      agents: app.agents.status(),
      runsActive: app.slots.running,
    });
  });

  r.get("/api/city", ({ req, res }) => {
    const city = app.store.city();
    if (!city) throw new HttpError(404, "No city config in cities/");
    sendJson(req, res, 200, city, { "Cache-Control": "no-cache" });
  });

  r.get("/api/decisions", ({ req, res }) => {
    const now = Date.now();
    const cards = app.store.decisions().map((d) => card(app, d, now));
    // Soonest chance to take part first; decisions with none at the end.
    cards.sort((a, b) => (a.next ? startMs(a.next.date) : Infinity) - (b.next ? startMs(b.next.date) : Infinity) || a.plainTitle.localeCompare(b.plainTitle));
    sendJson(req, res, 200, cards, { "Cache-Control": "no-cache" });
  });

  r.get("/api/decisions/:id", ({ req, res, params, url }) => {
    const decision = requireDecision(app, params.id);
    const lang = url.searchParams.get("lang") ?? undefined;
    const lenses = app.store.lenses(decision);
    const original = app.store.brief(decision.id);
    let brief = original;
    // ?lang=fr serves a cached translation if one exists; it never starts a model run.
    if (lang && SAFE_LANG.test(lang) && brief && brief.lang !== lang) brief = app.store.brief(decision.id, lang) ?? brief;
    // Residents get a published brief without the statements staff rejected; staff
    // (with the passcode) get everything so they can change their minds.
    if (brief && original && !isStaff(app, req)) brief = publicBrief(brief, original);
    const sources = decision.sources.map((id) => app.store.source(id)).filter((s) => !!s);
    const detail: DecisionDetail & { lenses: Lenses } = { decision, brief: withLenses(brief, lenses), sources, lenses };
    // no-cache + ETag: staff see their review at once, unchanged briefs cost a 304.
    sendJson(req, res, 200, detail, { "Cache-Control": "no-cache" });
  });

  r.get("/api/decisions/:id/calendar.ics", ({ req, res, params }) => {
    const decision = requireDecision(app, params.id);
    const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0];
    const site = process.env.PUBLIC_URL ?? (req.headers.host ? `${proto}://${req.headers.host}` : undefined);
    sendBody(req, res, 200, decisionCalendar(decision, { siteUrl: site }), {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${decision.id}.ics"`,
      "Cache-Control": "public, max-age=300",
    });
  });

  r.get("/api/sources", ({ req, res }) => {
    sendJson(req, res, 200, app.store.sources(), { "Cache-Control": "no-cache" });
  });

  r.get("/api/sources/:id/pdf", ({ req, res, params }) => {
    const src = app.store.source(params.id);
    const file = app.store.sourcePdfPath(params.id);
    if (!file) throw new HttpError(404, `No PDF for source "${params.id}"`);
    sendFileWithRanges(req, res, file, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${src?.id ?? params.id}.pdf"`,
      // Sources don't change once published; a day is safe and helps pdf.js reloads.
      "Cache-Control": "public, max-age=86400",
    });
  });

  r.get("/api/sources/:id/pages/:n", ({ req, res, params }) => {
    const pages = app.store.sourcePages(params.id);
    if (!pages) throw new HttpError(404, `No page text for source "${params.id}"`);
    const n = Number(params.n);
    if (!Number.isInteger(n) || n < 1 || n > pages.length) throw new HttpError(404, `Page ${params.n} is outside 1-${pages.length}`);
    sendJson(req, res, 200, { sourceId: params.id, page: n, pages: pages.length, text: pages[n - 1] }, { "Cache-Control": "public, max-age=3600" });
  });

  // Construction-lens renders. Names change when an image is regenerated, so a week's
  // cache is safe; the ETag covers a same-name rewrite.
  r.get("/api/renders/:file", ({ req, res, params }) => {
    const file = app.store.renderPath(params.file);
    if (!file) throw new HttpError(404, `No render "${params.file}"`);
    const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    sendFileWithRanges(req, res, file, { "Content-Type": type, "Cache-Control": "public, max-age=604800" });
  });

  r.get("/api/log", ({ req, res, url }) => {
    const q = url.searchParams;
    const int = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
    const entries = app.log.list({
      decisionId: q.get("decision") ?? undefined,
      kind: q.get("kind") ?? undefined,
      after: int("after"),
      before: int("before"),
      limit: int("limit") ?? 10_000,
      order: q.get("order") === "desc" ? "desc" : "asc",
    });
    sendJson(req, res, 200, entries);
  });

  r.get("/api/log/verify", ({ req, res }) => {
    sendJson(req, res, 200, app.log.verifyChain());
  });

  r.get("/api/usage", ({ req, res }) => {
    sendJson(req, res, 200, summarise(app.log, app.cfg.dailyLimitUsd));
  });
}

/** Stream a file, honouring a single `Range: bytes=a-b` (pdf.js fetches PDFs in chunks). */
export function sendFileWithRanges(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  file: string,
  headers: Record<string, string>,
): void {
  const st = fs.statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const base = { ...headers, ETag: etag, "Last-Modified": st.mtime.toUTCString(), "Accept-Ranges": "bytes" };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, base);
    res.end();
    return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) {
      res.writeHead(416, { ...base, "Content-Range": `bytes */${st.size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return void res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, "Content-Length": st.size });
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(file).pipe(res);
}
