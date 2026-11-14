// Smoke test against a running deployment:
//   node scripts/smoke.ts [baseUrl] [--ask]
// Checks health, the decision list, one decision, a source PDF and the calendar; with
// --ask, one question must stream an answer within 3 minutes. Exits 1 on any failure.
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith("--")) ?? process.env.SMOKE_URL ?? "https://municipal-agents.fly.dev").replace(/\/$/, "");
const withAsk = args.includes("--ask");

let failures = 0;
async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t = performance.now();
  try {
    const note = await fn();
    console.log(`ok   ${name} (${Math.round(performance.now() - t)} ms)${note ? `: ${note}` : ""}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}: ${(err as Error).message}`);
  }
}

async function getOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(base + path, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

console.log(`Smoke test: ${base}`);
let decisionId: string | undefined;
let sourceId: string | undefined;

await check("health", async () => {
  const h = await (await getOk("/api/health")).json();
  if (!h.ok) throw new Error("health not ok");
  return `${h.decisions} decisions, ${h.logEntries} log entries, agents ${h.agents?.available ? "loaded" : "not loaded"}`;
});

await check("decision list", async () => {
  const cards = await (await getOk("/api/decisions")).json();
  if (!Array.isArray(cards) || cards.length === 0) throw new Error("no decisions");
  decisionId = cards[0].id;
  return `${cards.length} decisions, first ${decisionId}, next: ${cards[0].next?.title ?? "none"}`;
});

await check("one decision", async () => {
  if (!decisionId) throw new Error("no decision id");
  const d = await (await getOk(`/api/decisions/${decisionId}`)).json();
  sourceId = d.sources?.[0]?.id ?? d.decision?.sources?.[0];
  // With a brief, the lenses travel once, merged into brief.lenses.
  if (d.brief && d.lenses) throw new Error("lenses sent twice (top level and in the brief)");
  const lenses = Object.keys((d.brief ?? d).lenses ?? {});
  return `brief: ${d.brief ? d.brief.review?.status : "none"}, ${d.sources?.length ?? 0} sources, lenses: ${lenses.join(", ") || "none"}`;
});

await check("source PDF", async () => {
  if (!sourceId) {
    const all = await (await getOk("/api/sources")).json();
    sourceId = all[0]?.id;
  }
  if (!sourceId) throw new Error("no source");
  const res = await getOk(`/api/sources/${sourceId}/pdf`, { headers: { Range: "bytes=0-4" } });
  const head = await res.text();
  if (!head.startsWith("%PDF")) throw new Error(`not a PDF (${res.headers.get("content-type")})`);
  return `${sourceId} (${res.status})`;
});

await check("calendar", async () => {
  if (!decisionId) throw new Error("no decision id");
  const res = await getOk(`/api/decisions/${decisionId}/calendar.ics`);
  const ics = await res.text();
  if (!ics.startsWith("BEGIN:VCALENDAR\r\n")) throw new Error("not an iCalendar file");
  return `${(ics.match(/BEGIN:VEVENT/g) ?? []).length} events`;
});

await check("web app", async () => {
  const html = await (await getOk("/")).text();
  if (!/<html|<!doctype/i.test(html)) throw new Error("no HTML at /");
  if (html.includes("hasn't been built yet")) throw new Error("the web app isn't in this deploy (web build failed or skipped)");
});

await check("resident app at /decisions", async () => {
  const res = await getOk("/decisions");
  const html = await res.text();
  if (!/<html|<!doctype/i.test(html) || html.includes("hasn't been built yet")) throw new Error("no resident app at /decisions");
  for (const h of ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    if (!res.headers.get(h)) throw new Error(`missing ${h} header`);
  }
});

await check("security.txt", async () => {
  const txt = await (await getOk("/.well-known/security.txt")).text();
  if (!/^Contact: /m.test(txt) || !/^Expires: /m.test(txt)) throw new Error("no Contact or Expires");
});

await check("embed", async () => {
  const js = await getOk("/embed.js");
  if (js.headers.get("access-control-allow-origin") !== "*") throw new Error("embed.js isn't cross-origin");
  if (!(await js.text()).includes("attachShadow")) throw new Error("not the widget");
  if (!decisionId) throw new Error("no decision id");
  const card = await (await getOk(`/api/embed/${decisionId}`)).json();
  await getOk("/embed/demo");
  return `${card.summary?.length ?? 0} statements, next: ${card.next?.title ?? "none"}`;
});

await check("calendar feed", async () => {
  const ics = await (await getOk("/api/calendar.ics")).text();
  if (!ics.includes("REFRESH-INTERVAL")) throw new Error("not a subscription feed");
  return `${(ics.match(/BEGIN:VEVENT/g) ?? []).length} events`;
});

await check("openapi", async () => {
  const doc = await (await getOk("/api/openapi.json")).json();
  if (doc.openapi !== "3.1.0") throw new Error(`openapi ${doc.openapi}`);
  return `${Object.keys(doc.paths).length} paths, ${Object.keys(doc.components?.schemas ?? {}).length} schemas`;
});

if (withAsk) {
  await check("ask (streams an answer within 3 minutes)", async () => {
    if (!decisionId) throw new Error("no decision id");
    const res = await fetch(`${base}/api/decisions/${decisionId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "In one sentence, what is being decided and when can I have a say?" }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok || !res.body) throw new Error(`ask answered ${res.status}: ${await res.text()}`);
    let buf = "";
    const types: string[] = [];
    let answer = "";
    let error = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk as Uint8Array, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split("\n").find((l) => l.startsWith("data: "));
        if (!data) continue;
        const e = JSON.parse(data.slice(6));
        types.push(e.type);
        if (e.type === "answer") answer = e.text;
        if (e.type === "error") error = e.message;
      }
    }
    if (/ai\.studio|generativelanguage|\{"error"|prepayment|RESOURCE_EXHAUSTED/i.test(answer + error)) throw new Error("the model provider's error text reached the client");
    if (!answer) throw new Error(`no answer (events: ${types.join(", ")}${error ? `; error: ${error}` : ""})`);
    return `${types.length} events; "${answer.slice(0, 120)}${answer.length > 120 ? "…" : ""}"`;
  });
}

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
