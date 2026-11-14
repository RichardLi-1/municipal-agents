// The HTTP server: routes /api/* through the router, everything else to the web app.
// Errors become JSON `{error}` with the right status; no CORS headers are sent, since
// the web app is served from the same origin.
import http from "node:http";
import type { App } from "./app.ts";
import { HttpError, Router, sendError } from "./http.ts";
import { agentRoutes } from "./routes/agents.ts";
import { publicRoutes } from "./routes/public.ts";
import { staffRoutes } from "./routes/staff.ts";
import { serveStatic } from "./static.ts";

export function buildRouter(app: App): Router {
  const r = new Router();
  publicRoutes(app, r);
  agentRoutes(app, r);
  staffRoutes(app, r);
  return r;
}

export function createServer(app: App, opts: { quiet?: boolean } = {}): http.Server {
  const router = buildRouter(app);
  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (!opts.quiet) {
      // Method, path and status only: no IPs or query strings in the server's logs.
      res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Math.round(performance.now() - started)}ms`));
    }
    try {
      if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") {
        return serveStatic(app.cfg.webDist, req, res, url.pathname);
      }
      const m = router.match(req.method ?? "GET", url.pathname);
      if ("status" in m) return sendError(req, res, m.status, m.status === 404 ? "Not found" : "Method not allowed");
      await m.handler({ req, res, url, params: m.params });
    } catch (err) {
      if (err instanceof HttpError) {
        const retry = (err as HttpError & { retryAfter?: number }).retryAfter;
        return sendError(req, res, err.status, err.message, retry ? { "Retry-After": String(retry) } : {});
      }
      console.error(`${req.method} ${url.pathname} failed:`, err);
      sendError(req, res, 500, "Something went wrong on the server.");
    }
  });
  // Long SSE runs: don't let Node's defaults cut them off.
  server.requestTimeout = 0;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  return server;
}
