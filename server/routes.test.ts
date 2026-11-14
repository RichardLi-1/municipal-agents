// Routes against the fixtures in server/fixtures (copied to a temp folder so writes
// don't touch them), with a fake agents module so no model is called.
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AgentEvent, Brief, DecisionCard, DecisionDetail, LogEntry, Statement } from "../shared/types.ts";
import type { AgentsModule } from "./agents-loader.ts";
import { type App, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createServer } from "./server.ts";

let app: App;
let base = "";
let close: () => void;
let translations = 0;
const TOKEN = "test-token";

let askCalls = 0;
const fakeAgents: AgentsModule = {
  async ask(ctx, req, emit) {
    askCalls++;
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
  assert.deepEqual(d.brief.lenses.construction.sites, []);
  assert.equal(d.lenses, undefined, "with a brief, the lenses are sent once, inside it");
  const again = await get("/api/decisions/fixture-budget", { headers: { "If-None-Match": res.headers.get("etag")! } });
  assert.equal(again.status, 304);
  const missing = await get("/api/decisions/nope");
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /No decision/);
});

test("renders come from the runtime folder first, then the committed one", async () => {
  const committed = await get("/api/renders/fixture-site-1.png");
  assert.equal(committed.status, 200);
  assert.equal(committed.headers.get("content-type"), "image/png");
  assert.match(committed.headers.get("cache-control") ?? "", /max-age=604800/);
  assert.equal((await get("/api/renders/..%2Fdecisions%2Ffixture-budget.json")).status, 404);
  assert.equal((await get("/api/renders/nope.png")).status, 404);
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

test("a live ask is saved to runs/, and the same question later is replayed from it without the agents", async () => {
  // The fake agents' answer cites nothing, so it isn't served from the cache; seed a real-shaped one.
  const res = await post("/api/decisions/fixture-budget/ask", { question: "Where does the levy go?" }, { "Fly-Client-IP": "10.0.0.20" });
  await res.text();
  const asked = app.log.list({ kind: "question.asked" }).at(-1) as LogEntry;
  const runId = (asked.payload as { runId: string }).runId;
  const given = app.log.list({ kind: "answer.given" }).at(-1) as LogEntry;
  assert.equal((given.payload as { runId: string }).runId, runId);
  const file = path.join(app.cfg.dataDir, "runs", `${runId}.jsonl`);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].type, "run");
  assert.equal(lines[0].question, "Where does the levy go?");
  assert.deepEqual(lines.slice(1).map((l: { event: AgentEvent }) => l.event.type), ["plan", "step.start", "tool", "step.end", "usage", "answer", "done"]);

  const st: Statement = { id: "s1", text: "The levy pays for roads.", kind: "fact", verified: true, citations: [{ sourceId: "fixture-report", page: 1, quote: "the levy pays for roads" }] };
  const seeded = [
    { type: "run", runId: "seed-1", kind: "ask", decisionId: "fixture-budget", question: "What does the levy pay for?", startedAt: "2026-11-14T06:55:01Z", model: "gemini-3.6-flash", source: "test" },
    { t: 0, event: { type: "plan", agent: "lead", steps: [{ id: "1", specialist: "explainer", question: "levy" }] } },
    { t: 4000, event: { type: "statement", id: "1", statement: st } },
    { t: 8000, event: { type: "answer", text: "The levy pays for roads [1].", statements: [st] } },
  ];
  fs.writeFileSync(path.join(app.cfg.dataDir, "runs", "seed-1.jsonl"), seeded.map((x) => JSON.stringify(x)).join("\n") + "\n");
  const calls = askCalls;
  const t0 = Date.now();
  const again = await post("/api/decisions/fixture-budget/ask", { question: "what does the levy pay for" }, { "Fly-Client-IP": "10.0.0.21" });
  const events = await sseEvents(again);
  assert.ok(Date.now() - t0 >= 2900, "a replay takes at least about 3 seconds");
  assert.equal(askCalls, calls, "the agents were not called");
  assert.deepEqual(events.map((e) => e.type), ["plan", "statement", "answer", "done"]);
  const a = events.find((e) => e.type === "answer") as Extract<AgentEvent, { type: "answer" }>;
  assert.equal(a.replay?.runId, "seed-1");
  assert.match(a.text, /Answered by the agents on Sat, Nov 14, 1:55 AM ET · replayed from the record$/);
  const log = app.log.list({ kind: "answer.given" }).at(-1) as LogEntry;
  assert.equal((log.payload as { replayOf: string }).replayOf, "seed-1");
});

test("raw provider errors from the agents are replaced before they reach the visitor", async () => {
  const raw = 'Gemini 402: {"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects"}}';
  const saved = fakeAgents.ask;
  fakeAgents.ask = async (_ctx, req, emit) => {
    emit({ type: "step.end", id: "1", specialist: "explainer", status: "failed", summary: `Stopped: ${raw}` });
    emit({ type: "error", message: raw });
    throw Object.assign(new Error("Gemini 402"), { status: 402, detail: raw });
  };
  try {
    const res = await post("/api/decisions/fixture-budget/ask", { question: "Will this leak?" }, { "Fly-Client-IP": "10.0.0.30" });
    const text = await res.text();
    assert.doesNotMatch(text, /ai\.studio|https?:|prepayment|\{\\"error/);
    assert.match(text, /The AI model returned an error/);
  } finally {
    fakeAgents.ask = saved;
  }
});

test("staff can replay a saved real brief run: every event labelled, ending with the current brief, nothing written", async () => {
  const current = app.store.brief("fixture-budget")!;
  const file = path.join(app.cfg.dataDir, "briefs", "fixture-budget.json");
  const before = fs.statSync(file).mtimeMs;
  const seeded = [
    { type: "run", runId: "seed-brief", kind: "brief", decisionId: "fixture-budget", startedAt: "2026-11-14T06:49:13Z", model: "gemini-3.6-flash", source: "test", costUsd: 0.37 },
    { t: 0, event: { type: "plan", agent: "lead", steps: [{ id: "overview", specialist: "explainer", question: "q" }] } },
    { t: 4000, event: { type: "tool", id: "overview", specialist: "explainer", tool: "search_pages", summary: "Searched the documents" } },
    { t: 6000, event: { type: "usage", calls: 3, inputTokens: 10, outputTokens: 1, costUsd: 0.01 } },
    { t: 8000, event: { type: "brief", brief: current } },
    { t: 8001, event: { type: "done" } },
  ];
  fs.mkdirSync(path.join(app.cfg.dataDir, "runs"), { recursive: true });
  fs.writeFileSync(path.join(app.cfg.dataDir, "runs", "seed-brief.jsonl"), seeded.map((x) => JSON.stringify(x)).join("\n") + "\n");
  assert.equal((await post("/api/staff/briefs", { decisionId: "fixture-budget", replay: true })).status, 401);
  const res = await post("/api/staff/briefs", { decisionId: "fixture-budget", replay: true }, staff);
  const events = (await sseEvents(res)) as (AgentEvent & { replay?: { runId: string; label: string } })[];
  assert.deepEqual(events.map((e) => e.type), ["plan", "tool", "brief", "done"]);
  for (const e of events.slice(0, -1)) {
    assert.equal(e.replay?.runId, "seed-brief");
    assert.equal(e.replay?.label, "Replay of the agents' real run on Sat, Nov 14, 1:49 AM ET");
  }
  assert.equal((events[2] as Extract<AgentEvent, { type: "brief" }>).brief.generatedAt, current.generatedAt);
  assert.equal(fs.statSync(file).mtimeMs, before, "the brief file is not rewritten");
});

test("ask rejects empty questions and rate-limits per IP", async () => {
  assert.equal((await post("/api/decisions/fixture-budget/ask", { question: " " })).status, 400);
  const ip = { "Fly-Client-IP": "10.0.0.2" };
  for (let i = 0; i < 3; i++) await (await post("/api/decisions/fixture-budget/ask", { question: `q${i}` }, ip)).text();
  const res = await post("/api/decisions/fixture-budget/ask", { question: "one too many" }, ip);
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"));
  assert.match((await res.json()).error, /shared Wi-Fi counts together\)\. Please wait/);
});

test("replayed and offline answers don't count against the per-network limit", async () => {
  const ip = { "Fly-Client-IP": "10.0.0.40" };
  // seed-1 (written by an earlier test) answers this question from the record.
  for (let i = 0; i < 5; i++) {
    const res = await post("/api/decisions/fixture-budget/ask", { question: "What does the levy pay for?" }, ip);
    assert.equal(res.status, 200, `replay ${i}`);
    await res.text();
  }
  const saved = fakeAgents.ask;
  fakeAgents.ask = async (_ctx, _req, emit) => {
    emit({ type: "answer", text: "The agents can't be reached right now.", statements: [], offline: true });
    emit({ type: "done" });
  };
  try {
    for (let i = 0; i < 5; i++) {
      const res = await post("/api/decisions/fixture-budget/ask", { question: `offline ${i}` }, ip);
      assert.equal(res.status, 200, `offline ${i}`);
      await res.text();
    }
  } finally {
    fakeAgents.ask = saved;
  }
});

test("a translation carries the computed lenses, and a failed one is a plain JSON error", async () => {
  const es = (await (await post("/api/decisions/fixture-budget/translate", { lang: "es" }, { "Fly-Client-IP": "10.0.0.41" })).json()) as Brief;
  assert.ok((es.lenses as Record<string, unknown>).construction, "lens files merged in, like GET /api/decisions/:id");
  const saved = fakeAgents.translateBrief;
  fakeAgents.translateBrief = async () => {
    throw Object.assign(new Error("Gemini 402"), { status: 402, detail: '{"error":{"message":"https://ai.studio"}}' });
  };
  try {
    const res = await post("/api/decisions/fixture-budget/translate", { lang: "de" }, { "Fly-Client-IP": "10.0.0.41" });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "Translation isn't available right now. The brief is shown in English.");
  } finally {
    fakeAgents.translateBrief = saved;
  }
});

test("purging a question also blanks its words in the run's file, and the purge entry says so", async () => {
  const res = await post("/api/decisions/fixture-budget/ask", { question: "My name is Jo Smith, will my tax rise?" }, { "Fly-Client-IP": "10.0.0.42" });
  await res.text();
  const asked = app.log.list({ kind: "question.asked" }).at(-1) as LogEntry;
  const runId = (asked.payload as { runId: string }).runId;
  const out = await (await post("/api/staff/purge", { seq: asked.seq, reason: "Retention ended", reviewer: "Ana" }, staff)).json();
  assert.equal(out.record.payload.runTextBlanked, true);
  assert.equal(out.record.payload.runFile, `runs/${runId}.jsonl`);
  const text = fs.readFileSync(path.join(app.cfg.dataDir, "runs", `${runId}.jsonl`), "utf8");
  assert.doesNotMatch(text, /Jo Smith/);
  assert.match(text.split("\n")[0], /"purged":\{"at":/);
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

test("review approves, edits and rejects statements; publish needs every one reviewed", async () => {
  const review = (body: Record<string, string>) => post("/api/staff/review", { decisionId: "fixture-budget", reviewer: "Ana Silva", ...body }, staff);
  assert.equal((await review({ statementId: "s1", action: "approve" })).status, 200);
  // An edit keeps the citations and is re-checked: i1 cites nothing, so it stays unverified.
  const edited = (await (await review({ statementId: "i1", action: "edit", text: "Rent may go up.", note: "simpler" })).json()) as { brief: Brief };
  const i1 = edited.brief.impacts[0].statements[0];
  assert.equal(i1.text, "Rent may go up.");
  assert.equal(i1.review?.action, "edited");
  assert.equal(i1.review?.originalText, "Rent may rise if landlords pass on the tax.");
  assert.equal(i1.verified, false);
  assert.equal(edited.brief.review.status, "in-review");
  // Approving an edited statement keeps it marked as edited for residents.
  const again = (await (await review({ statementId: "i1", action: "approve" })).json()) as { statement: Statement };
  assert.equal(again.statement.review?.action, "edited");
  assert.equal(again.statement.review?.originalText, "Rent may rise if landlords pass on the tax.");
  // w1 claimed to be verified, but its quote isn't on the page: the re-check says so.
  const w1 = (await (await review({ statementId: "w1", action: "approve" })).json()) as { statement: Statement };
  assert.equal(w1.statement.verified, false);
  assert.equal((await review({ statementId: "zz", action: "approve" })).status, 404);
  assert.equal((await review({ statementId: "s2", action: "edit" })).status, 400);

  // s2 has no decision yet, so publishing is refused with a count.
  assert.equal((await post("/api/staff/publish", { decisionId: "fixture-budget" }, staff)).status, 400);
  const early = await post("/api/staff/publish", { decisionId: "fixture-budget", reviewer: "Ana Silva" }, staff);
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /^1 of 4 statements hasn't been reviewed yet/);

  assert.equal((await review({ statementId: "s2", action: "reject", note: "date not final" })).status, 200);
  const pub = (await (await post("/api/staff/publish", { decisionId: "fixture-budget", reviewer: "Ana Silva" }, staff)).json()) as { brief: Brief };
  assert.equal(pub.brief.review.status, "published");
  assert.equal(pub.brief.review.by, "Ana Silva");
  const last = app.log.list({ order: "desc", limit: 1 })[0];
  assert.equal(last.kind, "brief.published");
  assert.equal(last.actor, "staff:ana-silva");
  assert.equal((last.payload as { unreviewed: number }).unreviewed, 0);

  // Residents don't see the rejected statement; staff still do.
  const pubView = (await (await get("/api/decisions/fixture-budget")).json()) as DecisionDetail;
  assert.deepEqual(pubView.brief!.summary.map((s) => s.id), ["s1"]);
  const staffView = (await (await get("/api/decisions/fixture-budget", { headers: staff })).json()) as DecisionDetail;
  assert.deepEqual(staffView.brief!.summary.map((s) => s.id), ["s1", "s2"]);

  // The brief changed, so the French copy is made again, and it leaves out s2 too.
  const before = translations;
  const fr = (await (await post("/api/decisions/fixture-budget/translate", { lang: "fr" }, { "Fly-Client-IP": "10.0.0.4" })).json()) as Brief;
  assert.equal(translations, before + 1);
  assert.deepEqual(fr.summary.map((s) => s.id), ["s1"]);
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
