// Small HTTP helpers on top of node:http: JSON responses (gzipped when it pays),
// errors as JSON, body reading with a size cap, server-sent events, and a router.
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function acceptsGzip(req: IncomingMessage): boolean {
  return /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
}

/** Send a body, gzipping text over 1 KB when the client accepts it. */
export function sendBody(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void {
  let buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const out: Record<string, string | number> = { "Cache-Control": "no-store", ...headers, Vary: "Accept-Encoding" };
  // Revalidated responses carry an ETag so a repeat fetch of an unchanged brief is a 304.
  if (status === 200 && (req.method === "GET" || req.method === "HEAD") && out["Cache-Control"] !== "no-store") {
    const etag = `W/"${createHash("sha1").update(buf).digest("base64url").slice(0, 27)}"`;
    out.ETag = etag;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, out);
      res.end();
      return;
    }
  }
  if (buf.length > 1024 && acceptsGzip(req)) {
    buf = gzipSync(buf, { level: 6 });
    out["Content-Encoding"] = "gzip";
  }
  out["Content-Length"] = buf.length;
  res.writeHead(status, out);
  res.end(req.method === "HEAD" ? undefined : buf);
}

export function sendJson(req: IncomingMessage, res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  sendBody(req, res, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

export function sendError(req: IncomingMessage, res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(req, res, status, { error: message }, headers);
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, `Body too large (limit ${limit} bytes)`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, `Body too large (limit ${limit} bytes)`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage, limit = 64 * 1024): Promise<T> {
  const buf = await readBody(req, limit);
  if (buf.length === 0) return {} as T;
  try {
    const v = JSON.parse(buf.toString("utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v as T;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

/** The visitor's IP: Fly's proxy header first, then the socket. Used only for rate limits, never stored. */
export function clientIp(req: IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string" && fly) return fly;
  return req.socket.remoteAddress ?? "unknown";
}

// ---- server-sent events -----------------------------------------------------

export interface Sse {
  send(event: { type: string } & Record<string, unknown>): void;
  comment(text: string): void;
  end(): void;
  /** Aborts when the client goes away. */
  signal: AbortSignal;
  closed(): boolean;
}

/** Start an SSE stream. A comment line every 15 s keeps proxies from closing it. */
export function openSse(req: IncomingMessage, res: ServerResponse, heartbeatMs = 15_000): Sse {
  const ac = new AbortController();
  let done = false;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(": stream open\n\n");
  const beat = setInterval(() => {
    if (!done) res.write(": ping\n\n");
  }, heartbeatMs);
  const stop = () => {
    if (done) return;
    done = true;
    clearInterval(beat);
  };
  // "close" on the response before we ended it means the client disconnected.
  res.on("close", () => {
    if (!done) ac.abort(new Error("client disconnected"));
    stop();
  });
  return {
    signal: ac.signal,
    closed: () => done,
    send(event) {
      if (done) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    comment(text) {
      if (!done) res.write(`: ${text.replace(/\n/g, " ")}\n\n`);
    },
    end() {
      if (done) return;
      stop();
      res.end();
    },
  };
}

// ---- router ------------------------------------------------------------------

export interface RouteCtx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
}

export type Handler = (ctx: RouteCtx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const src = pattern
      .split("/")
      .map((seg) => {
        if (!seg.startsWith(":")) return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // ":id" may be followed by a literal suffix, as in ":id.ics".
        const m = seg.match(/^:([a-zA-Z]+)(.*)$/)!;
        keys.push(m[1]);
        return `([^/]+?)${m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      })
      .join("/");
    this.routes.push({ method, pattern, re: new RegExp(`^${src}$`), keys, handler });
    return this;
  }

  get(p: string, h: Handler) {
    return this.add("GET", p, h);
  }
  post(p: string, h: Handler) {
    return this.add("POST", p, h);
  }

  /** Every registered route, in order (the OpenAPI test checks each one is documented). */
  list(): { method: string; pattern: string }[] {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern }));
  }

  /** The handler for a request, or a 404/405 marker. */
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | { status: 404 | 405 } {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === "HEAD" && r.method === "GET")) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { handler: r.handler, params };
    }
    return { status: pathMatched ? 405 : 404 };
  }
}
