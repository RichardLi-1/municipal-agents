// Serves the built web app (web/dist). Vite puts content-hashed files under /assets/,
// so those are cached for a year; everything else, index.html included, is revalidated
// so a deploy shows up on the next load. Unknown paths without a file extension get
// index.html, letting the app's router handle /d/:id, /staff and so on.
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { acceptsGzip, sendError } from "./http.ts";
import { inlineScriptHashes, pageCsp } from "./security.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".geojson": "application/geo+json",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

const COMPRESSIBLE = new Set([".html", ".htm", ".js", ".mjs", ".css", ".json", ".map", ".svg", ".txt", ".xml", ".webmanifest", ".wasm", ".geojson"]);

// Compressed copies, built on first request and kept until the file changes.
const gzCache = new Map<string, { mtimeMs: number; buf: Buffer }>();
// Inline-script hashes of HTML files, for their Content-Security-Policy.
const htmlCache = new Map<string, { mtimeMs: number; hashes: string[] }>();

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Municipal Agents</title>
<p>The web app hasn't been built yet. The API is up: <a href="/api/health">/api/health</a>, <a href="/api/decisions">/api/decisions</a>.</p>`;

/** The SPA: a file under root, or index.html for any extension-less path. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") return sendError(req, res, 405, "Method not allowed");
  const rel = safeRel(pathname);
  if (rel === undefined) return sendError(req, res, 400, "Bad path");
  const file = resolveIn(root, rel);
  if (!file) return sendError(req, res, 404, "Not found");

  let target = file;
  if (!statFile(target)) {
    if (path.extname(rel)) return sendError(req, res, 404, "Not found");
    target = path.join(root, "index.html");
    if (!statFile(target)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return void res.end(NOT_BUILT);
    }
  }
  sendStaticFile(req, res, target, { immutable: rel.startsWith("/assets/") });
}

/** The decoded path, or undefined when it can't be decoded. */
export function safeRel(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/** root + rel, or undefined if that would leave root. */
export function resolveIn(root: string, rel: string): string | undefined {
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root + path.sep) && file !== root) return undefined;
  return file;
}

/**
 * Send one file: gzip for text, ETag revalidation, a year's cache for content-hashed
 * assets, and for HTML a CSP that allows exactly the inline scripts the file carries.
 */
export function sendStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  target: string,
  opts: { immutable?: boolean; status?: number; maxAge?: number; headers?: Record<string, string> } = {},
): void {
  const st = statFile(target);
  if (!st) return sendError(req, res, 404, "Not found");
  const status = opts.status ?? 200;
  const ext = path.extname(target).toLowerCase();
  const headers: Record<string, string | number> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": opts.immutable ? "public, max-age=31536000, immutable" : opts.maxAge ? `public, max-age=${opts.maxAge}` : "no-cache",
    "Last-Modified": st.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
    ...opts.headers,
  };
  if (ext === ".html" || ext === ".htm") {
    let hit = htmlCache.get(target);
    if (!hit || hit.mtimeMs !== st.mtimeMs) {
      hit = { mtimeMs: st.mtimeMs, hashes: inlineScriptHashes(fs.readFileSync(target, "utf8")) };
      htmlCache.set(target, hit);
    }
    const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0];
    headers["Content-Security-Policy"] = pageCsp({ scriptHashes: hit.hashes, https: proto === "https" });
  }
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  headers.ETag = etag;
  if (status === 200 && req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return void res.end();
  }

  if (COMPRESSIBLE.has(ext) && acceptsGzip(req) && st.size > 1024) {
    let hit = gzCache.get(target);
    if (!hit || hit.mtimeMs !== st.mtimeMs) {
      hit = { mtimeMs: st.mtimeMs, buf: gzipSync(fs.readFileSync(target), { level: 9 }) };
      gzCache.set(target, hit);
    }
    res.writeHead(status, { ...headers, "Content-Encoding": "gzip", "Content-Length": hit.buf.length });
    return void res.end(req.method === "HEAD" ? undefined : hit.buf);
  }
  res.writeHead(status, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(target).pipe(res);
}

export function statFile(p: string): fs.Stats | undefined {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st : undefined;
  } catch {
    return undefined;
  }
}
