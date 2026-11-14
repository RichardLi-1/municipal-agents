// Staff PDF upload: a multipart form with the PDF and a few details becomes a new
// source and a new (proposed) decision, so the agents can draft a brief from it.
//
// Uploads are kept in $DATA_DIR/uploads (the source of truth on the volume) and copied
// into decisions/ and sources/, where the agents read. The boot-time mirror of the
// committed data leaves files named "upload-*" alone and re-applies uploads after it
// runs, so they survive redeploys.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import type { Decision, SourceDoc } from "../shared/types.ts";
import type { App } from "./app.ts";
import { readJson, writeJson } from "./data.ts";
import { HttpError, readBody } from "./http.ts";

const run = promisify(execFile);
const MAX_UPLOAD = 30 * 1024 * 1024;
const MAX_PAGES = 600;
const KINDS: SourceDoc["kind"][] = ["staff-report", "agenda", "budget", "plan", "progress-report", "dataset", "notice", "other"];

export interface Part {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

/** A small multipart/form-data parser: enough for one file and a few text fields. */
export function parseMultipart(body: Buffer, contentType: string): Part[] {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!m) throw new HttpError(400, "Multipart body without a boundary");
  const delim = Buffer.from(`--${m[1] ?? m[2]}`);
  const parts: Part[] = [];
  let pos = body.indexOf(delim);
  while (pos >= 0) {
    let start = pos + delim.length;
    if (body.subarray(start, start + 2).toString() === "--") break; // closing delimiter
    if (body.subarray(start, start + 2).toString() === "\r\n") start += 2;
    const next = body.indexOf(delim, start);
    if (next < 0) break;
    const part = body.subarray(start, next - 2); // drop the CRLF before the delimiter
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd >= 0) {
      const head = part.subarray(0, headEnd).toString("utf8");
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      const ct = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1];
      if (name) parts.push({ name, filename, contentType: ct, data: part.subarray(headEnd + 4) });
    }
    pos = next;
  }
  return parts;
}

/** Page texts from pdftotext -layout; each page ends with a form feed. */
export async function pdfPages(file: string): Promise<string[]> {
  try {
    const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
    const pages = stdout.split("\f");
    if (pages.length > 1 && pages[pages.length - 1].trim() === "") pages.pop();
    return pages;
  } catch (err) {
    throw new HttpError(422, `Couldn't read text from that PDF (${(err as Error).message.split("\n")[0]}).`);
  }
}

function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "document";
}

/** Copy uploads into decisions/ and sources/ (and the sources index) where agents read. */
export function materializeUploads(dataDir: string): number {
  const up = path.join(dataDir, "uploads");
  const uploaded = readJson<SourceDoc[]>(path.join(up, "index.json")) ?? [];
  if (!uploaded.length) return 0;
  const srcDir = path.join(dataDir, "sources");
  fs.mkdirSync(srcDir, { recursive: true });
  for (const s of uploaded) {
    for (const ext of [".pdf", ".pages.json"]) {
      const from = path.join(up, s.id + ext);
      const to = path.join(srcDir, s.id + ext);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
    }
  }
  const indexFile = path.join(srcDir, "index.json");
  const index = readJson<SourceDoc[]>(indexFile) ?? [];
  const have = new Set(index.map((s) => s.id));
  const missing = uploaded.filter((s) => !have.has(s.id));
  if (missing.length) writeJson(indexFile, [...index, ...missing]);
  const decDir = path.join(up, "decisions");
  let n = 0;
  for (const f of fs.existsSync(decDir) ? fs.readdirSync(decDir) : []) {
    const to = path.join(dataDir, "decisions", f);
    if (f.endsWith(".json") && !fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(decDir, f), to);
      n++;
    }
  }
  return n;
}

/** Save an uploaded PDF as a source and a new decision; returns the decision to brief. */
export async function handleUpload(app: App, req: IncomingMessage): Promise<{ decisionId: string; reviewer: string }> {
  const body = await readBody(req, MAX_UPLOAD);
  const parts = parseMultipart(body, String(req.headers["content-type"]));
  const field = (n: string) => parts.find((p) => p.name === n && p.filename === undefined)?.data.toString("utf8").trim() || undefined;
  const file = parts.find((p) => p.filename !== undefined);
  if (!file || file.data.length === 0) throw new HttpError(400, 'Attach the PDF as a file field (e.g. "file").');
  if (file.data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "That file isn't a PDF.");

  const title = (field("title") ?? file.filename?.replace(/\.pdf$/i, "") ?? "Uploaded document").slice(0, 200);
  const reviewer = (field("reviewer") ?? "").slice(0, 80);
  const city = app.store.city();
  const id = `upload-${slug(title)}-${randomBytes(3).toString("hex")}`;
  const dir = path.join(app.cfg.dataDir, "uploads");
  fs.mkdirSync(path.join(dir, "decisions"), { recursive: true });
  const pdfFile = path.join(dir, `${id}.pdf`);
  fs.writeFileSync(pdfFile, file.data);

  const pages = await pdfPages(pdfFile);
  if (pages.length > MAX_PAGES) throw new HttpError(413, `That PDF has ${pages.length} pages; the limit is ${MAX_PAGES}.`);
  if (!pages.some((p) => p.trim().length > 40)) throw new HttpError(422, "That PDF has no text layer (it may be a scan), so the agents can't cite it.");
  writeJson(path.join(dir, `${id}.pages.json`), pages);

  const today = new Date().toISOString().slice(0, 10);
  const kind = field("kind") as SourceDoc["kind"] | undefined;
  const source: SourceDoc = {
    id,
    title,
    publisher: field("publisher") ?? "Uploaded by city staff",
    url: field("url") ?? "",
    published: field("published") ?? today,
    retrieved: today,
    pages: pages.length,
    licence: field("licence") ?? "Public record",
    kind: kind && KINDS.includes(kind) ? kind : "staff-report",
  };
  const index = readJson<SourceDoc[]>(path.join(dir, "index.json")) ?? [];
  writeJson(path.join(dir, "index.json"), [...index, source]);

  const decision: Decision = {
    id,
    city: city?.id ?? "unknown",
    title,
    plainTitle: field("plainTitle") ?? title,
    decidedBy: field("decidedBy") ?? "To be confirmed by staff",
    status: "proposed",
    officialUrl: field("officialUrl") ?? source.url ?? city?.officialNoticeUrl ?? "",
    sources: [id],
    timeline: [],
    center: city?.center ?? [0, 0],
    zoom: city?.zoom ?? 11,
    lenses: [],
    tags: ["uploaded"],
  };
  writeJson(path.join(dir, "decisions", `${id}.json`), decision);
  materializeUploads(app.cfg.dataDir);

  app.log.append({
    actor: reviewer ? `staff:${slug(reviewer)}` : "staff",
    kind: "source.added",
    decisionId: id,
    payload: { sourceId: id, title, pages: pages.length, bytes: file.data.length, sha256: createHash("sha256").update(file.data).digest("hex") },
  });
  return { decisionId: id, reviewer };
}
