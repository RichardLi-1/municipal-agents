// Routes against the fixtures in server/fixtures (copied to a temp folder so writes
// don't touch them), with a fake agents module so no model is called.
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AgentEvent, Brief, DecisionCard, LogEntry } from "../shared/types.ts";
import type { AgentsModule } from "./agents-loader.ts";
import { type App, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createServer } from "./server.ts";

let app: App;
let base = "";
let close: () => void;
let translations = 0;
const TOKEN = "test-token";

const fakeAgents: AgentsModule = {
  async ask(ctx, req, emit) {
    emit({ type: "plan", agent: "lead", steps: [{ id: "1", specialist: "explainer", question: req.question }] });
    emit({ type: "step.start", id: "1", specialist: "explainer", question: req.question });
    emit({ type: "tool", id: "1", specialist: "explainer", tool: "search_pages", summary: "levy" });
    emit({ type: "step.end", id: "1", specialist: "explainer", status: "done", summary: "found it" });
    ctx.log({ actor: "agent:lead", kind: "usage", decisionId: req.decisionId, payload: { model: "fake-flash", inputTokens: 1000, outputTokens: 100, costUsd: 0.01 } });
    emit({ type: "usage", calls: 1, inputTokens: 1000, outputTokens: 100, costUsd: 0.01 });
    emit({ type: "answer", text: "The levy rises 4.9%.", statements: [] });
    emit({ type: "done" });
  },
  async generateBrief(ctx, req, emit) {
    emit({ type: "step.start", id: "b", specialist: "explainer", question: "summary" });
    const file = path.join(ctx.dataDir, "briefs", `${req.decisionId}.json`);
    const fallback = path.join(ctx.dataDir, "briefs", "fixture-budget.json");
    const old = JSON.parse(fs.readFileSync(fs.existsSync(file) ? file : fallback, "utf8")) as Brief;
    emit({ type: "usage", calls: 2, inputTokens: 500, outputTokens: 50, costUsd: 0.002 });
    return { ...old, generatedAt: new Date().toISOString(), review: { status: "published", by: "agent" } };
  },
  async translateBrief(_ctx, brief, lang) {
    translations++;
    return { ...brief, lang, summary: brief.summary.map((s) => ({ ...s, text: `[${lang}] ${s.text}` })) };
  },
};

before(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-routes-"));
  fs.cpSync(path.join(import.meta.dirname, "fixtures"), root, { recursive: true });
  fs.mkdirSync(path.join(root, "web/dist/assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "web/dist/index.html"), "<!doctype html><title>app</title>");
  fs.writeFileSync(path.join(root, "web/dist/assets/app-abc123.js"), "console.log(1)");
  const cfg = loadConfig({ APP_ROOT: root, STAFF_TOKEN: TOKEN, ASK_PER_WINDOW: "3", DAILY_LIMIT_USD: "1" });
  app = createApp(cfg);
  app.agents.set(fakeAgents);
  const server = createServer(app, { quiet: true });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => {
    server.closeAllConnections();
    server.close();
  };
});
after(() => close());

const get = (p: string, init?: RequestInit) => fetch(base + p, init);
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const staff = { Authorization: `Bearer ${TOKEN}` };

async function sseEvents(res: Response): Promise<AgentEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((block) => block.split("\n").find((l) => l.startsWith("data: ")))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)));
}

test("health and city", async () => {
  const h = await (await get("/api/health")).json();
  assert.equal(h.ok, true);
  assert.equal(h.decisions, 2);
  assert.equal(h.agents.available, true);
  const city = await (await get("/api/city")).json();
  assert.equal(city.id, "test-region");
});

test("decision cards carry the next chance to take part", async () => {
  const cards = (await (await get("/api/decisions")).json()) as DecisionCard[];
  assert.deepEqual(cards.map((c) => c.id), ["fixture-budget", "fixture-past"]);
  assert.equal(cards[0].next?.id, "input");
  assert.equal(cards[0].reviewStatus, "draft");
  assert.equal(cards[1].next, undefined);
  assert.equal(cards[1].reviewStatus, "none");
});

test("decision detail merges lens files into the brief", async () => {
  const res = await get("/api/decisions/fixture-budget");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-encoding"), "gzip");
  const d = await res.json();
  assert.equal(d.decision.id, "fixture-budget");
  assert.equal(d.sources[0].id, "fixture-report");
  assert.equal(d.brief.lenses.cost.asset, "Testville services");
  assert.deepEqual(d.brief.lenses.housing.hardToTrack, ["Completions"]);
  const missing = await get("/api/decisions/nope");
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /No decision/);
});

test("calendar is served as text/calendar", async () => {
  const res = await get("/api/decisions/fixture-budget/calendar.ics");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/calendar/);
  assert.match(await res.text(), /BEGIN:VEVENT/);
});

test("sources, PDF ranges and page text", async () => {
  const sources = await (await get("/api/sources")).json();
  assert.equal(sources.length, 1);
  const pdf = await get("/api/sources/fixture-report/pdf");
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(pdf.headers.get("cache-control") ?? "", /max-age/);
  assert.equal((await pdf.arrayBuffer()).byteLength > 100, true);
  const part = await get("/api/sources/fixture-report/pdf", { headers: { Range: "bytes=0-7" } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), "%PDF-1.4");
  const page = await (await get("/api/sources/fixture-report/pages/2")).json();
  assert.match(page.text, /25 November/);
  assert.equal((await get("/api/sources/fixture-report/pages/3")).status, 404);
  assert.equal((await get("/api/sources/..%2Fx/pdf")).status, 404);
});

test("ask streams steps then an answer, and logs question, answer and usage", async () => {
  const res = await post("/api/decisions/fixture-budget/ask", { question: "How much will taxes go up?", audiences: ["renter", "bogus"] }, { "Fly-Client-IP": "10.0.0.1" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const events = await sseEvents(res);
  assert.deepEqual(events.map((e) => e.type), ["plan", "step.start", "tool", "step.end", "usage", "answer", "done"]);
  const kinds = app.log.list({ decisionId: "fixture-budget" }).map((e) => e.kind);
  assert.deepEqual(kinds.slice(-3), ["question.asked", "usage", "answer.given"]);
  const q = app.log.list({ kind: "question.asked" }).at(-1) as LogEntry;
  assert.deepEqual((q.payload as { audiences: string[] }).audiences, ["renter"]);
});

test("ask rejects empty questions and rate-limits per IP", async () => {
  assert.equal((await post("/api/decisions/fixture-budget/ask", { question: " " })).status, 400);
  const ip = { "Fly-Client-IP": "10.0.0.2" };
  for (let i = 0; i < 3; i++) await (await post("/api/decisions/fixture-budget/ask", { question: `q${i}` }, ip)).text();
  const res = await post("/api/decisions/fixture-budget/ask", { question: "one too many" }, ip);
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"));
  assert.match((await res.json()).error, /wait/);
});

test("staff routes need the passcode", async () => {
  assert.equal((await post("/api/staff/publish", { decisionId: "fixture-budget", reviewer: "Ana" })).status, 401);
  assert.equal((await post("/api/staff/publish", { decisionId: "fixture-budget", reviewer: "Ana" }, { Authorization: "Bearer wrong" })).status, 401);
  assert.equal((await get("/api/staff/check", { headers: staff })).status, 200);
});

test("translate makes a translation once and reuses it until the brief changes", async () => {
  const before = translations;
  const fr = (await (await post("/api/decisions/fixture-budget/translate", { lang: "fr" }, { "Fly-Client-IP": "10.0.0.3" })).json()) as Brief;
  assert.equal(fr.lang, "fr");
  assert.match(fr.summary[0].text, /^\[fr\]/);
  await post("/api/decisions/fixture-budget/translate", { lang: "fr" }, { "Fly-Client-IP": "10.0.0.3" });
  assert.equal(translations, before + 1);
  const detail = await (await get("/api/decisions/fixture-budget?lang=fr")).json();
  assert.equal(detail.brief.lang, "fr");
  assert.equal((await post("/api/decisions/fixture-budget/translate", { lang: "../x" })).status, 400);
});

test("review approves, edits and rejects statements; publish names the reviewer", async () => {
  let r = await post("/api/staff/review", { decisionId: "fixture-budget", statementId: "s1", action: "approve", reviewer: "Ana Silva" }, staff);
  assert.equal(r.status, 200);
  r = await post("/api/staff/review", { decisionId: "fixture-budget", statementId: "i1", action: "edit", text: "Rent may go up.", note: "simpler", reviewer: "Ana Silva" }, staff);
  const edited = (await r.json()) as { brief: Brief };
  const i1 = edited.brief.impacts[0].statements[0];
  assert.equal(i1.text, "Rent may go up.");
  assert.equal(i1.review?.originalText, "Rent may rise if landlords pass on the tax.");
  assert.equal(edited.brief.review.status, "in-review");
  assert.equal((await post("/api/staff/review", { decisionId: "fixture-budget", statementId: "zz", action: "approve" }, staff)).status, 404);
  assert.equal((await post("/api/staff/review", { decisionId: "fixture-budget", statementId: "s2", action: "edit" }, staff)).status, 400);
  assert.equal((await post("/api/staff/publish", { decisionId: "fixture-budget" }, staff)).status, 400);
  const pub = (await (await post("/api/staff/publish", { decisionId: "fixture-budget", reviewer: "Ana Silva" }, staff)).json()) as { brief: Brief };
  assert.equal(pub.brief.review.status, "published");
  assert.equal(pub.brief.review.by, "Ana Silva");
  const stored = app.store.brief("fixture-budget")!;
  assert.equal(stored.review.status, "published");
  const last = app.log.list({ order: "desc", limit: 1 })[0];
  assert.equal(last.kind, "brief.published");
  assert.equal(last.actor, "staff:ana-silva");
  // The brief changed, so the French copy is made again.
  const before = translations;
  await (await post("/api/decisions/fixture-budget/translate", { lang: "fr" }, { "Fly-Client-IP": "10.0.0.4" })).text();
  assert.equal(translations, before + 1);
});

test("staff brief run streams, saves a draft and logs it", async () => {
  const res = await post("/api/staff/briefs", { decisionId: "fixture-budget", reviewer: "Ana" }, staff);
  const events = await sseEvents(res);
  assert.deepEqual(events.map((e) => e.type), ["step.start", "usage", "brief", "done"]);
  const saved = app.store.brief("fixture-budget")!;
  assert.equal(saved.review.status, "draft");
  const kinds = app.log.list({ decisionId: "fixture-budget", order: "desc", limit: 3 }).map((e) => e.kind);
  assert.deepEqual(kinds, ["usage", "brief.generated", "brief.started"]);
});

test("a staff PDF upload becomes a source and a decision, then gets a draft brief", async () => {
  const pdf = fs.readFileSync(path.join(import.meta.dirname, "fixtures/data/sources/fixture-report.pdf"));
  const form = new FormData();
  form.set("title", "Bike lanes on King Street");
  form.set("reviewer", "Ana");
  form.set("file", new Blob([pdf], { type: "application/pdf" }), "king-st.pdf");
  const res = await fetch(base + "/api/staff/briefs", { method: "POST", headers: staff, body: form });
  assert.equal(res.status, 200);
  const events = await sseEvents(res);
  const brief = events.find((e) => e.type === "brief") as Extract<AgentEvent, { type: "brief" }>;
  assert.match(brief.brief.decisionId, /^upload-bike-lanes-on-king-street-[0-9a-f]{6}$/);
  const id = brief.brief.decisionId;
  const page = await (await get(`/api/sources/${id}/pages/1`)).json();
  assert.match(page.text, /levy rises/);
  const detail = await (await get(`/api/decisions/${id}`)).json();
  assert.equal(detail.decision.plainTitle, "Bike lanes on King Street");
  assert.equal(detail.sources[0].pages, 2);
  assert.equal(detail.brief.review.status, "draft");
  assert.ok(app.log.list({ decisionId: id }).some((e) => e.kind === "source.added"));
  const notPdf = new FormData();
  notPdf.set("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  assert.equal((await fetch(base + "/api/staff/briefs", { method: "POST", headers: staff, body: notPdf })).status, 415);
});

test("the log endpoint returns a chain that verifies", async () => {
  const entries = (await (await get("/api/log")).json()) as LogEntry[];
  assert.ok(entries.length > 5);
  assert.equal(entries[0].seq, 1);
  assert.equal((await (await get("/api/log/verify")).json()).intact, true);
  const usage = await (await get("/api/usage")).json();
  assert.ok(usage.calls >= 3);
  assert.ok(usage.byModel["fake-flash"].costUsd > 0);
  assert.ok(usage.energyWh > 0);
  assert.equal(usage.today.limitUsd, 1);
});

test("static app: hashed assets are immutable, other paths fall back to index.html", async () => {
  const asset = await get("/assets/app-abc123.js");
  assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
  const spa = await get("/d/fixture-budget");
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /<title>app<\/title>/);
  assert.equal((await get("/missing.png")).status, 404);
  const api404 = await get("/api/nope");
  assert.equal(api404.status, 404);
  assert.deepEqual(await api404.json(), { error: "Not found" });
  assert.equal(api404.headers.get("access-control-allow-origin"), null);
});

test("the daily cap stops new runs once today's spend reaches the limit", async () => {
  app.log.append({ actor: "system", kind: "usage", payload: { model: "fake-flash", costUsd: 5 } });
  const res = await post("/api/decisions/fixture-budget/ask", { question: "Still there?" }, { "Fly-Client-IP": "10.0.0.9" });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /budget/);
});
