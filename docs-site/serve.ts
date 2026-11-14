// Preview the built docs: serves dist/ the way server/site.ts does in production
// (/docs/<page> -> <page>.html or <page>/index.html, 404s get docs/404.html).
//   node serve.ts [port]     (default 4791)  ->  http://localhost:4791/docs/
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.join(import.meta.dirname, "dist");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4791);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function find(rel: string): string | undefined {
  const clean = rel.replace(/\/+$/, "") || "/";
  const tries = path.extname(clean) ? [clean] : [`${clean}.html`, `${clean}/index.html`];
  for (const t of tries) {
    const f = path.join(root, path.normalize(t));
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return undefined;
}

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (rel === "/") {
      res.writeHead(302, { Location: "/docs/" });
      return res.end();
    }
    let file = find(rel);
    let status = 200;
    if (!file && rel.startsWith("/docs")) {
      file = find("/docs/404");
      status = 404;
    }
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found (this preview serves only /docs and /docs-assets)");
    }
    res.writeHead(status, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`docs preview on http://localhost:${port}/docs/`));
