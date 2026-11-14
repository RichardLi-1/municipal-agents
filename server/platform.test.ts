// The platform around the API: which site answers which path, security headers, the
// embeddable card, the calendar feed, staff insights and more than one city. Runs
// against a temp copy of server/fixtures with small fake landing and docs builds.
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { gzipSync } from "node:zlib";
import type { Brief, CityConfig, Decision, DecisionCard } from "../shared/types.ts";
import { type App, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { groupSimilar, keywords, redact } from "./routes/insights.ts";
import { inlineScriptHashes } from "./security.ts";
import { createServer } from "./server.ts";

const TOKEN = "test-token";
const THEME_SCRIPT = "document.documentElement.dataset.theme='light'";
let root = "";
const servers: (() => void)[] = [];

async function start(env: Record<string, string> = {}): Promise<{ app: App; base: string }> {
  const app = createApp(loadConfig({ APP_ROOT: root, STAFF_TOKEN: TOKEN, ...env }));
  const server = createServer(app, { quiet: true });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  return { app, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const write = (rel: string, body: string | Buffer) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
};

let app: App;
let base = "";
const get = (p: string, init?: RequestInit) => fetch(base + p, init);
const staff = { Authorization: `Bearer ${TOKEN}` };

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ma-platform-"));
  fs.cpSync(path.join(import.meta.dirname, "fixtures"), root, { recursive: true });
  fs.cpSync(path.join(import.meta.dirname, "..", "embed"), path.join(root, "embed"), { recursive: true });
  write("web/dist/index.html", "<!doctype html><title>app</title>");
  write("web/dist/favicon.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
  write("landing/dist/index.html", `<!doctype html><title>landing</title><script>${THEME_SCRIPT}</script><script src="/landing-assets/app-Ab12Cd34.js"></script>`);
  write("landing/dist/pricing.html", "<!doctype html><title>pricing</title>");
  write("landing/dist/company/index.html", "<!doctype html><title>company</title>");
  write("landing/dist/landing-assets/app-Ab12Cd34.js", "console.log('landing')");
  write("landing/dist/og-image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  write("docs-site/dist/docs/index.html", "<!doctype html><title>docs</title>");
  write("docs-site/dist/docs/api/index.html", "<!doctype html><title>docs api</title>");
  write("docs-site/dist/docs/embed.html", "<!doctype html><title>docs embed</title>");
  write("docs-site/dist/docs/404.html", "<!doctype html><title>docs 404</title>");
  write("docs-site/dist/docs-assets/docs-Zz99Yy88.css", "body{}");

  // A second municipality: one more config file and one decision that names it.
  const second: CityConfig = {
    id: "zeta-county",
    name: "Zeta County",
    municipalities: ["Zetaville"],
    center: [-81, 44],
    zoom: 10,
    languages: ["en"],
    officialNoticeUrl: "https://example.org/zeta",
    clerkContact: "clerk@zeta.example.org",
    openData: [],
  };
  write("cities/zeta-county.json", JSON.stringify(second));
  const zeta: Decision = {
    id: "zeta-bridge",
    city: "zeta-county",
    title: "Bridge renewal",
    plainTitle: "Zetaville's bridge: repair or replace",
    decidedBy: "Zeta County Council",
    status: "proposed",
    officialUrl: "https://example.org/zeta/bridge",
    sources: [],
    timeline: [{ id: "meet", date: "2099-12-01T19:00:00-05:00", kind: "public-input", title: "Open house", plain: "Ask staff questions.", participation: [{ method: "attend", instructions: "Drop in." }] }],
    center: [-81, 44],
    zoom: 12,
    lenses: [],
  };
  write("data/decisions/zeta-bridge.json", JSON.stringify(zeta));

  // A published brief with one statement rejected and a glossary, for the embed and insights.
  const briefFile = path.join(root, "data/briefs/fixture-budget.json");
  const brief = JSON.parse(fs.readFileSync(briefFile, "utf8")) as Brief;
  brief.review = { status: "published", by: "Ana Silva", at: "2026-11-13T15:00:00Z" };
  brief.summary[0].review = { action: "approved", by: "Ana Silva", at: "2026-11-13T15:00:00Z" };
  brief.summary[1].review = { action: "rejected", by: "Ana Silva", at: "2026-11-13T15:00:00Z" };
  brief.glossary = [{ term: "property tax levy", plain: "The tax bill on your property." }];
  fs.writeFileSync(briefFile, JSON.stringify(brief));

  ({ app, base } = await start());
});
after(() => servers.forEach((close) => close()));

describe("site routing", () => {
  test("the marketing site answers /, its pages and its assets", async () => {
    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>landing<\/title>/);
    assert.match(await (await get("/pricing")).text(), /<title>pricing<\/title>/);
    assert.match(await (await get("/pricing/")).text(), /<title>pricing<\/title>/);
    assert.match(await (await get("/company")).text(), /<title>company<\/title>/);
    const asset = await get("/landing-assets/app-Ab12Cd34.js");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
    assert.equal((await get("/landing-assets/nope.js")).status, 404);
    assert.equal((await get("/og-image.png")).headers.get("content-type"), "image/png");
    // A landing page that isn't built yet falls through to the resident app.
    assert.match(await (await get("/changelog")).text(), /<title>app<\/title>/);
  });

  test("the resident app keeps /decisions, /d/:id, /staff, /log, /spend and /source/*", async () => {
    for (const p of ["/decisions", "/d/fixture-budget", "/staff", "/log", "/spend", "/source/fixture-report/2", "/anything-else"]) {
      const res = await get(p);
      assert.equal(res.status, 200, p);
      assert.match(await res.text(), /<title>app<\/title>/, p);
    }
    assert.match(await (await get("/favicon.svg")).text(), /<svg/);
  });

  test("the docs answer /docs and /docs/*, with a 404 page", async () => {
    assert.match(await (await get("/docs")).text(), /<title>docs<\/title>/);
    assert.match(await (await get("/docs/")).text(), /<title>docs<\/title>/);
    assert.match(await (await get("/docs/api")).text(), /<title>docs api<\/title>/);
    assert.match(await (await get("/docs/embed")).text(), /<title>docs embed<\/title>/);
    const missing = await get("/docs/nope");
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /docs 404/);
    const css = await get("/docs-assets/docs-Zz99Yy88.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  });

  test("without landing and docs builds, / and /docs fall back to the resident app", async () => {
    const bare = await start({ LANDING_DIST: path.join(root, "nope"), DOCS_DIST: path.join(root, "nope") });
    assert.match(await (await fetch(bare.base + "/")).text(), /<title>app<\/title>/);
    assert.match(await (await fetch(bare.base + "/docs")).text(), /<title>app<\/title>/);
  });

  test("a flat docs build (dist/index.html) is served under /docs too", async () => {
    write("docs-flat/index.html", "<!doctype html><title>flat docs</title>");
    write("docs-flat/guide/index.html", "<!doctype html><title>flat guide</title>");
    const flat = await start({ DOCS_DIST: path.join(root, "docs-flat") });
    assert.match(await (await fetch(flat.base + "/docs")).text(), /flat docs/);
    assert.match(await (await fetch(flat.base + "/docs/guide/")).text(), /flat guide/);
    assert.equal((await fetch(flat.base + "/docs/nope")).status, 404);
  });

  test("paths can't escape the site folders", async () => {
    assert.equal((await get("/landing-assets/..%2F..%2Fcities%2Fzeta-county.json")).status, 404);
    assert.equal((await get("/docs/..%2F..%2Fcities%2Fzeta-county.json")).status, 404);
  });
});

describe("security headers", () => {
  test("pages get a CSP that allows only their own inline scripts", async () => {
    const res = await get("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    const [hash] = inlineScriptHashes(`<script>${THEME_SCRIPT}</script>`);
    assert.ok(csp.includes(`'sha256-${hash}'`), csp);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp));
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(csp, /connect-src 'self' https:\/\/tiles\.openfreemap\.org/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=\d{8}/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
    assert.match(res.headers.get("permissions-policy") ?? "", /microphone=\(\)/);
  });

  test("the API gets the strictest CSP, except PDFs the browser's viewer opens", async () => {
    const api = await get("/api/health");
    assert.match(api.headers.get("content-security-policy") ?? "", /^default-src 'none'/);
    assert.ok(api.headers.get("strict-transport-security"));
    const pdf = await get("/api/sources/fixture-report/pdf");
    assert.equal(pdf.headers.get("content-security-policy"), null);
    assert.equal(pdf.headers.get("x-content-type-options"), "nosniff");
    const sse = await fetch(base + "/api/nope");
    assert.equal(sse.headers.get("x-content-type-options"), "nosniff");
  });

  test("/.well-known/security.txt follows RFC 9116", async () => {
    const res = await get("/.well-known/security.txt");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    const txt = await res.text();
    assert.match(txt, /^Contact: /m);
    const exp = /^Expires: (.+)$/m.exec(txt)?.[1];
    assert.ok(exp && Date.parse(exp) > Date.now(), "Expires is in the future");
    assert.match(txt, /^Canonical: http:\/\/127\.0\.0\.1:\d+\/\.well-known\/security\.txt$/m);
    assert.match(await (await get("/robots.txt")).text(), /Disallow: \/api\//);
  });
});

describe("embed", () => {
  test("embed.js is served for other sites and stays under 15 KB gzipped", async () => {
    const res = await get("/embed.js");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /javascript/);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
    const js = await res.text();
    const gz = gzipSync(Buffer.from(js)).length;
    assert.ok(gz < 15 * 1024, `embed.js is ${gz} bytes gzipped`);
    assert.ok(js.includes("attachShadow"), "renders into a Shadow DOM");
    assert.ok(!/document\.cookie|localStorage|sessionStorage|innerHTML/.test(js), "no cookies, storage or HTML injection");
    assert.ok(js.includes('credentials: "omit"') && js.includes('referrerPolicy: "no-referrer"'));
  });

  test("the demo page is labelled as a demo and loads the widget", async () => {
    const html = await (await get("/embed/demo")).text();
    assert.match(html, /Demo\./);
    assert.match(html, /not a real city/i);
    assert.match(html, /<script src="\/embed\.js" data-decision="row-2027-budget"/);
  });

  test("the card data: cited summary without rejected statements, next event, review, links", async () => {
    const res = await get("/api/embed/fixture-budget");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const card = await res.json();
    assert.equal(card.plainTitle, "Testville's budget: a 4.9% tax rise");
    assert.deepEqual(card.summary.map((s: { id: string }) => s.id), ["s1"]);
    assert.equal(card.summary[0].citations[0].page, 1);
    assert.equal(card.summary[0].citations[0].source, "Fixture staff report");
    assert.match(card.summary[0].citations[0].url, /\/source\/fixture-report\/1\?q=The%20levy/);
    assert.equal(card.next.id, "input");
    assert.equal(card.next.methods[0].method, "speak");
    assert.deepEqual(card.review, { status: "published", by: "Ana Silva", at: "2026-11-13T15:00:00Z" });
    assert.match(card.links.brief, /\/d\/fixture-budget$/);
    assert.match(card.links.calendar, /\/api\/decisions\/fixture-budget\/calendar\.ics$/);
    assert.match(card.links.subscribe, /^webcal:\/\/.+\/api\/calendar\.ics\?decisions=fixture-budget$/);
    assert.equal(card.links.official, "https://example.org/budget");
    const missing = await get("/api/embed/nope");
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("access-control-allow-origin"), "*");
  });
});

describe("calendar feed", () => {
  test("one feed of every decision, ready to subscribe to", async () => {
    const res = await get("/api/calendar.ics?city=all");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/calendar/);
    assert.match(res.headers.get("content-disposition") ?? "", /^inline/);
    const ics = await res.text();
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
    assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/);
    assert.match(ics, /X-PUBLISHED-TTL:PT6H/);
    const uids = [...ics.matchAll(/^UID:(.+)\r$/gm)].map((m) => m[1]);
    assert.ok(uids.includes("fixture-budget.input@municipal-agents"));
    assert.ok(uids.includes("zeta-bridge.meet@municipal-agents"));
    assert.equal(new Set(uids).size, uids.length, "UIDs are unique");
    for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  });

  test("?decisions= picks decisions, and an unknown id is a 404", async () => {
    const ics = await (await get("/api/calendar.ics?decisions=zeta-bridge")).text();
    assert.match(ics, /zeta-bridge\.meet/);
    assert.ok(!ics.includes("fixture-budget."));
    assert.match(ics, /X-WR-CALNAME:Have your say: Zetaville's bridge/);
    const bad = await get("/api/calendar.ics?decisions=zeta-bridge,nope");
    assert.equal(bad.status, 404);
    assert.match((await bad.json()).error, /"nope"/);
  });

  test("subscription links use webcal:// and carry no personal data", async () => {
    const links = await (await get("/api/calendar?decisions=fixture-budget")).json();
    assert.match(links.webcal, /^webcal:\/\/127\.0\.0\.1:\d+\/api\/calendar\.ics\?decisions=fixture-budget$/);
    assert.match(links.google, /^https:\/\/calendar\.google\.com\/calendar\/render\?cid=webcal/);
    assert.match(links.privacy, /not a sign-up/);
  });
});

describe("staff insights", () => {
  const ask = (question: string, extra: Record<string, unknown> = {}) =>
    app.log.append({ actor: "visitor", kind: "question.asked", decisionId: "fixture-budget", payload: { question, lang: "en", ...extra } });

  before(() => {
    ask("Will my property tax go up?", { audiences: ["homeowner"] });
    ask("Will property taxes go up next year?", { audiences: ["homeowner"] });
    ask("will my property tax go up", { lang: "fr" });
    ask("Is my property tax going up? Email me at jo@example.com or call 519-555-0101");
    ask("When can I speak at council?");
    ask("When can I speak to council about it?");
    ask("My landlord at 42 Elm St is Pat Smith, will my rent rise?");
    app.log.append({
      actor: "agent:lead",
      kind: "answer.given",
      decisionId: "fixture-budget",
      payload: { question: "Will my property tax go up?", text: "It may rise 4.9% [1].", statements: [{ id: "s1", text: "x", kind: "fact", verified: true, citations: [{ sourceId: "fixture-report", page: 1, quote: "The levy rises 4.9 per cent." }] }] },
    });
    app.log.append({
      actor: "agent:lead",
      kind: "answer.given",
      decisionId: "fixture-budget",
      payload: { question: "When can I speak at council?", text: "On 20 November.", offline: true, statements: [] },
    });
  });

  test("needs the staff passcode", async () => {
    assert.equal((await get("/api/staff/insights?decision=fixture-budget")).status, 401);
    assert.equal((await get("/api/staff/insights?decision=nope", { headers: staff })).status, 404);
  });

  test("counts, topics and cited pages, with wording only for groups of 3 or more", async () => {
    const res = await get("/api/staff/insights?decision=fixture-budget", { headers: staff });
    assert.equal(res.status, 200);
    const body = await res.json();
    const text = JSON.stringify(body);
    assert.equal(body.totals.questions, 7);
    assert.equal(body.totals.answered, 2);
    assert.equal(body.totals.unanswered, 5);
    assert.equal(body.totals.offline, 1);
    assert.deepEqual(body.languages, [
      { lang: "en", questions: 6 },
      { lang: "fr", questions: 1 },
    ]);
    assert.equal(body.audiences.find((a: { audience: string }) => a.audience === "homeowner").questions, 2);
    assert.equal(body.perDay.reduce((n: number, d: { questions: number }) => n + d.questions, 0), 7);
    assert.equal(body.topics[0].label, "property tax levy");
    assert.equal(body.topics[0].questions, 4);
    // The four tax questions form one group and are shown; the pairs and the one-off aren't.
    assert.equal(body.similar.length, 1);
    assert.equal(body.similar[0].questions, 4);
    assert.ok(body.similar[0].sharedWords.includes("property"));
    assert.ok(!/jo@example\.com|519-555-0101/.test(text), "contact details never appear");
    assert.ok(!/speak at council|speak to council/i.test(text), "a group of 2 is not shown");
    assert.ok(!/Elm St|Pat Smith|landlord/i.test(text), "a one-off question is not shown");
    assert.deepEqual(body.suppressed, { groups: 2, questions: 3 });
    assert.equal(body.citedPages[0].sourceId, "fixture-report");
    assert.equal(body.citedPages[0].page, 1);
    assert.equal(body.privacy.k, 3);
    assert.match(body.privacy.rule, /at least 3 similar questions/);
  });

  test("redaction and grouping helpers", () => {
    assert.equal(redact("mail a@b.co, call +1 519 555 0101, N2G 4J3, 123 King St, in 2027"), "mail [removed], call [removed], [removed], [removed] King St, in 2027");
    assert.deepEqual(keywords("Will the buses be running? Call 519-555-0101"), ["bus", "runn", "call"]);
    const groups = groupSimilar(["tax go up", "taxes go up", "bus route"].map((q) => ({ words: keywords(q) })));
    assert.equal(groups.length, 2);
  });
});

describe("more than one city", () => {
  test("/api/cities lists every config and marks the default", async () => {
    const cities = await (await get("/api/cities")).json();
    assert.deepEqual(cities.map((c: { id: string }) => c.id), ["test-region", "zeta-county"]);
    assert.equal(cities[0].default, true);
    assert.equal(cities[1].decisions, 1);
  });

  test("/api/city and /api/decisions take ?city=, defaulting to the first config", async () => {
    assert.equal((await (await get("/api/city")).json()).id, "test-region");
    assert.equal((await (await get("/api/city?city=zeta-county")).json()).name, "Zeta County");
    assert.equal((await get("/api/city?city=nowhere")).status, 404);
    const def = (await (await get("/api/decisions")).json()) as DecisionCard[];
    assert.deepEqual(def.map((c) => c.id), ["fixture-budget", "fixture-past"]);
    const zeta = (await (await get("/api/decisions?city=zeta-county")).json()) as DecisionCard[];
    assert.deepEqual(zeta.map((c) => c.id), ["zeta-bridge"]);
    assert.equal(zeta[0].next?.id, "meet");
    const all = (await (await get("/api/decisions?city=all")).json()) as DecisionCard[];
    assert.equal(all.length, 3);
    assert.equal((await get("/api/decisions?city=nowhere")).status, 404);
  });

  test("the CITY setting picks the default city", async () => {
    const before = process.env.CITY;
    process.env.CITY = "zeta-county";
    try {
      assert.equal((await (await get("/api/city")).json()).id, "zeta-county");
      assert.deepEqual(((await (await get("/api/decisions")).json()) as DecisionCard[]).map((c) => c.id), ["zeta-bridge"]);
      const ics = await (await get("/api/calendar.ics")).text();
      assert.match(ics, /X-WR-CALNAME:Have your say: Zetaville's bridge/);
    } finally {
      if (before === undefined) delete process.env.CITY;
      else process.env.CITY = before;
    }
  });
});

describe("records retention", () => {
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  test("staff purge one entry's content; the chain still verifies and shows the purge", async () => {
    const q = app.log.append({ actor: "visitor", kind: "question.asked", decisionId: "fixture-budget", payload: { question: "I live at 9 Oak Ave, will my tax rise?" } });
    assert.equal((await post("/api/staff/purge", { seq: q.seq, reason: "Retention ended" })).status, 401);
    assert.equal((await post("/api/staff/purge", { seq: q.seq }, staff)).status, 400);
    assert.equal((await post("/api/staff/purge", { seq: 99999, reason: "x" }, staff)).status, 404);
    const res = await post("/api/staff/purge", { seq: q.seq, reason: "Retention period ended under By-law 2024-01", reviewer: "Ana Silva" }, staff);
    assert.equal(res.status, 200);
    const { purged, record } = await res.json();
    assert.equal(purged.payload, null);
    assert.equal(purged.hash, q.hash);
    assert.equal(record.kind, "record.purged");
    assert.equal(record.actor, "staff:ana-silva");
    assert.equal((await post("/api/staff/purge", { seq: q.seq, reason: "again" }, staff)).status, 409);
    assert.equal((await post("/api/staff/purge", { seq: record.seq, reason: "hide it" }, staff)).status, 409);
    const verify = await (await get("/api/log/verify")).json();
    assert.equal(verify.intact, true);
    assert.equal(verify.purged, 1);
    const entries = await (await get(`/api/log?after=${q.seq - 1}&limit=1`)).json();
    assert.equal(entries[0].purged.reason, "Retention period ended under By-law 2024-01");
    assert.ok(!JSON.stringify(await (await get("/api/log")).json()).includes("Oak Ave"));
  });
});
