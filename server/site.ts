// Everything that isn't /api: which built site answers which path.
//
//   /, /pricing, /security, /company, /contact, /changelog   landing/dist (marketing site)
//   /landing-assets/*                                       landing/dist/landing-assets/*
//   /docs, /docs/*                                          docs-site/dist/docs/**
//   /docs-assets/*                                          docs-site/dist/docs-assets/*
//   /embed.js, /embed/demo                                  embed/ (the widget cities embed)
//   /.well-known/security.txt, /robots.txt                  generated here
//   anything else (/decisions, /d/:id, /staff, /log, ...)   web/dist, the resident app (SPA)
//
// A site that hasn't been built yet falls back to the resident app, so a deploy without
// landing/ or docs-site/ still serves something useful at / and /docs.
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { App } from "./app.ts";
import { sendBody, sendError } from "./http.ts";
import { securityTxt } from "./security.ts";
import { resolveIn, safeRel, sendStaticFile, serveStatic, statFile } from "./static.ts";

export const LANDING_PAGES = ["/", "/pricing", "/security", "/company", "/contact", "/changelog"];

/** Files named like Vite's output (`name-AbC123xy.js`) never change, so they're cached for a year. */
const HASHED = /[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/** The public origin: PUBLIC_URL, else what the request (behind Fly's proxy) came in on. */
export function siteOrigin(app: App, req: IncomingMessage): string {
  if (app.cfg.publicUrl) return app.cfg.publicUrl;
  const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim();
  return `${proto}://${req.headers.host ?? "localhost"}`;
}

/** The first of `<page>`, `<page>.html`, `<page>/index.html` that exists under root. */
export function findPage(root: string, rel: string): string | undefined {
  const clean = rel.replace(/\/+$/, "") || "/";
  const candidates = clean === "/" ? ["/index.html"] : path.extname(clean) ? [clean] : [`${clean}.html`, `${clean}/index.html`];
  for (const c of candidates) {
    const f = resolveIn(root, c);
    if (f && statFile(f)) return f;
  }
  return undefined;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const ROBOTS = "User-agent: *\nDisallow: /api/\nDisallow: /staff\nAllow: /\n";

export function serveSite(app: App, req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") return sendError(req, res, 405, "Method not allowed");
  const rel = safeRel(pathname);
  if (rel === undefined || rel.includes("\0")) return sendError(req, res, 400, "Bad path");
  const { landingDist, docsDist, embedDir, webDist } = app.cfg;
  const page = rel.replace(/\/+$/, "") || "/";

  if (page === "/.well-known/security.txt" || page === "/security.txt") {
    return sendBody(req, res, 200, securityTxt(siteOrigin(app, req)), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
  }

  // The widget: loaded by other sites, so it says it may be used cross-origin.
  if (page === "/embed.js") {
    return sendStaticFile(req, res, path.join(embedDir, "embed.js"), {
      maxAge: 300,
      headers: { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" },
    });
  }
  if (page === "/embed" || page === "/embed/demo") return sendStaticFile(req, res, path.join(embedDir, "demo.html"));

  // Marketing site.
  if (rel.startsWith("/landing-assets/")) return sendAsset(req, res, landingDist, rel);
  if (LANDING_PAGES.includes(page)) {
    const f = findPage(landingDist, page);
    if (f) return sendStaticFile(req, res, f);
  }

  // Docs.
  if (rel.startsWith("/docs-assets/")) return sendAsset(req, res, docsDist, rel);
  if (page === "/docs" || page.startsWith("/docs/")) {
    // docs-site/dist/docs/** (the agreed layout), or a flat docs-site/dist/** built for /docs.
    const nested = isDir(path.join(docsDist, "docs"));
    const flat = !nested && !!statFile(path.join(docsDist, "index.html"));
    if (nested || flat) {
      const rel = nested ? page : page.slice("/docs".length) || "/";
      const f = findPage(docsDist, rel);
      if (f) return sendStaticFile(req, res, f, { immutable: HASHED.test(f) && !f.endsWith(".html") });
      const notFound = (nested ? findPage(docsDist, "/docs/404") : undefined) ?? findPage(docsDist, "/404");
      if (notFound) return sendStaticFile(req, res, notFound, { status: 404 });
      return sendError(req, res, 404, "No such docs page");
    }
  }

  if (page === "/robots.txt") {
    const f = findPage(landingDist, "/robots.txt") ?? findPage(webDist, "/robots.txt");
    if (f) return sendStaticFile(req, res, f);
    return sendBody(req, res, 200, ROBOTS, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
  }

  // A root-level file the resident app doesn't have (og-image.png, sitemap.xml) may be the landing site's.
  if (path.extname(page) && !page.slice(1).includes("/")) {
    const inWeb = resolveIn(webDist, page);
    if (!(inWeb && statFile(inWeb))) {
      const f = findPage(landingDist, page) ?? findPage(docsDist, page);
      if (f) return sendStaticFile(req, res, f);
    }
  }

  // Everything else is the resident app (it routes /decisions, /d/:id, /staff, /log, /spend, /source/*).
  return serveStatic(webDist, req, res, pathname);
}

function sendAsset(req: IncomingMessage, res: ServerResponse, root: string, rel: string): void {
  const f = resolveIn(root, rel);
  if (!f || !statFile(f)) return sendError(req, res, 404, "Not found");
  sendStaticFile(req, res, f, { immutable: HASHED.test(f), maxAge: 3600 });
}
