// Serves landing/dist the way the app server does in production:
//   /, /pricing, /security, /company, /contact, /changelog -> dist/<page>.html
//   /landing-assets/*                                       -> dist/landing-assets/*
// Anything else is a 404 here (in production it's the resident app).
//   node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.argv[2] ?? 4180);
const pages = { "/": "index", "/pricing": "pricing", "/security": "security", "/company": "company", "/contact": "contact", "/changelog": "changelog" };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/\/+$/, "") || "/";
  let file;
  if (pages[path]) file = join(dist, `${pages[path]}.html`);
  else if (path.startsWith("/landing-assets/")) file = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  try {
    if (!file) throw new Error("not found");
    const body = await readFile(file);
    const hashed = path.startsWith("/landing-assets/");
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found (the app lives here in production)");
  }
}).listen(port, () => console.log(`landing preview on http://localhost:${port}`));
