// Security headers for every response, and the Content-Security-Policy for pages.
//
// Pages (the resident app, the marketing site, the docs, the embed demo) get a CSP that
// allows only this origin's scripts, plus the exact inline scripts each HTML file
// carries: their SHA-256 hashes are computed when the file is served, so a builder can
// keep a small inline theme script without 'unsafe-inline'. MapLibre needs blob:
// workers and OpenFreeMap tiles; pdf.js needs a same-origin worker and may compile
// WebAssembly ('wasm-unsafe-eval'). The API gets the strictest policy: it serves data,
// never pages. PDFs are left without a CSP so the browser's own viewer can open them.
import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";

/** Map tiles, styles, sprites and glyphs (web/src/components/MapView.tsx). */
const TILE_HOSTS = ["https://tiles.openfreemap.org"];
/** Fonts a landing or docs page may load from Google Fonts. */
const FONT_CSS = ["https://fonts.googleapis.com"];
const FONT_FILES = ["https://fonts.gstatic.com"];
/** A demo video may be embedded on the landing page. */
const FRAME_HOSTS = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"];

export function pageCsp(opts: { scriptHashes?: string[]; https?: boolean } = {}): string {
  const hashes = (opts.scriptHashes ?? []).map((h) => `'sha256-${h}'`);
  const d: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'wasm-unsafe-eval'", ...hashes]],
    // Inline style attributes and <style> blocks are common (MapLibre markers, Shadow
    // DOM in the embed, docs syntax highlighting) and can't run code.
    ["style-src", ["'self'", "'unsafe-inline'", ...FONT_CSS]],
    ["img-src", ["'self'", "data:", "blob:", ...TILE_HOSTS]],
    ["font-src", ["'self'", "data:", ...FONT_FILES]],
    ["connect-src", ["'self'", ...TILE_HOSTS]],
    ["worker-src", ["'self'", "blob:"]],
    ["child-src", ["'self'", "blob:"]],
    ["frame-src", ["'self'", ...FRAME_HOSTS]],
    ["media-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
  ];
  const out = d.map(([k, v]) => `${k} ${v.join(" ")}`);
  if (opts.https) out.push("upgrade-insecure-requests");
  return out.join("; ");
}

/** The API serves JSON, events, calendars and PDFs: nothing in it should run as a page. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  // "Near me" on the map may ask for the visitor's location, on this site only.
  "geolocation=(self)",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()",
  "browsing-topics=()",
  "interest-cohort=()",
].join(", ");

/** Headers every response carries, set before any route runs. */
export function setBaseSecurityHeaders(res: ServerResponse, pathname: string): void {
  // Two years, as HSTS preload expects. Browsers ignore it over plain http (local dev).
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (!/^\/api\/sources\/[^/]+\/pdf$/.test(pathname)) res.setHeader("Content-Security-Policy", API_CSP);
  } else {
    // Pages override this with their inline-script hashes when they're served.
    res.setHeader("Content-Security-Policy", pageCsp());
  }
}

const hashCache = new Map<string, string[]>();

/** SHA-256 (base64) of each inline <script> body in an HTML document, for script-src. */
export function inlineScriptHashes(html: string): string[] {
  const key = createHash("sha1").update(html).digest("base64");
  const hit = hashCache.get(key);
  if (hit) return hit;
  const out = new Set<string>();
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.add(createHash("sha256").update(m[2], "utf8").digest("base64"));
  }
  const list = [...out];
  if (hashCache.size > 200) hashCache.clear();
  hashCache.set(key, list);
  return list;
}

/** The security.txt (RFC 9116) for /.well-known/security.txt. */
export function securityTxt(origin: string): string {
  const expires = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 10, 14)).toISOString();
  return [
    "# Municipal Agents: how to report a security problem.",
    "# Please don't test against residents' data or run load tests on the public site.",
    `Contact: ${origin}/contact`,
    "Contact: https://github.com/RichardLi-1/municipal-agents/security/advisories/new",
    `Expires: ${expires}`,
    "Preferred-Languages: en, fr",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/security`,
    "",
  ].join("\n");
}
