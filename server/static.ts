// Serves the built web app (web/dist). Vite puts content-hashed files under /assets/,
// so those are cached for a year; everything else, index.html included, is revalidated
// so a deploy shows up on the next load. Unknown paths without a file extension get
// index.html, letting the app's router handle /d/:id, /staff and so on.
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { acceptsGzip, sendError } from "./http.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
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

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".svg", ".txt", ".xml", ".webmanifest", ".wasm", ".geojson"]);

// Compressed copies, built on first request and kept until the file changes.
const gzCache = new Map<string, { mtimeMs: number; buf: Buffer }>();

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Municipal Agents</title>
<p>The web app hasn't been built yet. The API is up: <a href="/api/health">/api/health</a>, <a href="/api/decisions">/api/decisions</a>.</p>`;

export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse, pathname: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") return sendError(req, res, 405, "Method not allowed");
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendError(req, res, 400, "Bad path");
  }
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root + path.sep) && file !== root) return sendError(req, res, 404, "Not found");

  let target = file;
  let st = statFile(target);
  if (!st) {
    if (path.extname(rel)) return sendError(req, res, 404, "Not found");
    target = path.join(root, "index.html");
    st = statFile(target);
    if (!st) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return void res.end(NOT_BUILT);
    }
  }

  const ext = path.extname(target).toLowerCase();
  const immutable = rel.startsWith("/assets/");
  const headers: Record<string, string | number> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "Last-Modified": st.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  headers.ETag = etag;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return void res.end();
  }

  if (COMPRESSIBLE.has(ext) && acceptsGzip(req) && st.size > 1024) {
    let hit = gzCache.get(target);
    if (!hit || hit.mtimeMs !== st.mtimeMs) {
      hit = { mtimeMs: st.mtimeMs, buf: gzipSync(fs.readFileSync(target), { level: 9 }) };
      gzCache.set(target, hit);
    }
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": hit.buf.length });
    return void res.end(req.method === "HEAD" ? undefined : hit.buf);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return void res.end();
  fs.createReadStream(target).pipe(res);
}

function statFile(p: string): fs.Stats | undefined {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st : undefined;
  } catch {
    return undefined;
  }
}
