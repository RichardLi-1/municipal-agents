// Routes that start a model run for a visitor: ask a question, translate a brief.
// Both are rate-limited per IP and stop once the day's budget is spent.
import type { AgentEvent, AudienceId, Brief } from "../../shared/types.ts";
import { type App, briefHash } from "../app.ts";
import { SAFE_LANG } from "../data.ts";
import { clientIp, HttpError, openSse, readJsonBody, type Router, sendJson, type Sse } from "../http.ts";
import { checkDailyCap } from "../limits.ts";
import { failureMessage, logUsageFallback, safeEvent, startRun } from "../runs.ts";
import { findCachedAnswer, replayRun, RunWriter } from "../runfiles.ts";
import { publicBrief } from "../statements.ts";

export const AUDIENCES: AudienceId[] = [
  "renter",
  "homeowner",
  "transit-rider",
  "driver",
  "walk-cycle",
  "business-owner",
  "senior",
  "student",
  "parent",
  "disability",
  "newcomer",
];

const MAX_QUESTION = 1000;

/** An SSE stream that also saves every event it sends to the run's file. */
export function recorded(sse: Sse, record: RunWriter): Sse {
  return {
    ...sse,
    send(e) {
      record.write(e as unknown as AgentEvent);
      sse.send(e);
    },
  };
}

export function agentRoutes(app: App, r: Router): void {
  r.post("/api/decisions/:id/ask", async ({ req, res, params }) => {
    const decision = app.store.decision(params.id);
    if (!decision) throw new HttpError(404, `No decision with id "${params.id}"`);
    const body = await readJsonBody(req);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) throw new HttpError(400, "Please type a question.");
    if (question.length > MAX_QUESTION) throw new HttpError(400, `Please keep questions under ${MAX_QUESTION} characters.`);
    const audiences = Array.isArray(body.audiences)
      ? (body.audiences.filter((a) => AUDIENCES.includes(a as AudienceId)) as AudienceId[])
      : undefined;
    const lang = typeof body.lang === "string" && SAFE_LANG.test(body.lang) ? body.lang : undefined;

    // The answer cache: a question a real run already answered is replayed from the
    // record (labelled with when it was answered). It costs nothing, so it skips the
    // daily cap and the model, but not the per-visitor limit.
    const cached = findCachedAnswer(app.cfg.dataDir, { decisionId: decision.id, question, lang, audiences });
    if (cached) {
      app.visitorLimiter.take(clientIp(req), "questions");
      const replayOf = cached.header.runId;
      app.log.append({ actor: "visitor", kind: "question.asked", decisionId: decision.id, payload: { question, audiences, lang, replayOf } });
      const sse = openSse(req, res);
      try {
        const answer = await replayRun(cached, (e) => sse.send(e as AgentEvent & Record<string, unknown>), { signal: sse.signal });
        app.log.append({
          actor: "agent:lead",
          kind: "answer.given",
          decisionId: decision.id,
          payload: { question, text: answer.text, statements: answer.statements, replayOf, replay: answer.replay, costUsd: 0 },
        });
      } catch (err) {
        sse.send({ type: "error", message: "That saved answer couldn't be replayed. Please ask again." });
        console.error("replay failed:", (err as Error).message);
      } finally {
        sse.send({ type: "done" });
        sse.end();
      }
      return;
    }

    // Cheap checks first, so a refused request costs nothing.
    const agents = await app.agents.require();
    checkDailyCap(app.log, app.cfg.dailyLimitUsd);
    app.visitorLimiter.take(clientIp(req), "questions");
    const release = app.slots.acquire();

    try {
      // Every live run's events are saved, so what the agents said can be checked later.
      const record = new RunWriter(app.cfg.dataDir, { kind: "ask", decisionId: decision.id, question, lang, audiences, model: process.env.LEAD_MODEL || "gemini-3.6-flash" });
      app.log.append({ actor: "visitor", kind: "question.asked", decisionId: decision.id, payload: { question, audiences, lang, runId: record.runId } });
      const sse = recorded(openSse(req, res), record);
      const run = startRun(app, { signal: sse.signal, serverKinds: ["question.asked"], runId: record.runId });
      let answer: Extract<AgentEvent, { type: "answer" }> | undefined;
      let reportedError = false;
      const emit = (e: AgentEvent) => {
        if (e.type === "answer") answer = e;
        if (e.type === "error") reportedError = true;
        if (e.type === "usage") run.lastUsage = e;
        if (e.type === "done") return; // the server sends the one "done", last
        sse.send(safeEvent(e) as AgentEvent & Record<string, unknown>);
      };
      try {
        await agents.ask(run.ctx, { decisionId: decision.id, question, audiences, lang }, emit);
        if (!answer && !reportedError && !run.signal.aborted) sse.send({ type: "error", message: "The agents finished without an answer. Please try rephrasing." });
      } catch (err) {
        sse.send({ type: "error", message: failureMessage(err, run) });
      } finally {
        if (run.signal.aborted && !reportedError && !answer) sse.send({ type: "error", message: failureMessage(undefined, run) });
        if (answer && !run.loggedKinds.has("answer.given")) {
          app.log.append({
            actor: "agent:lead",
            kind: "answer.given",
            decisionId: decision.id,
            payload: { question, text: answer.text, statements: answer.statements, runId: record.runId },
          });
        }
        logUsageFallback(app, run, decision.id, "agent:lead");
        sse.send({ type: "done" });
        sse.end();
      }
    } finally {
      release();
    }
  });

  r.post("/api/decisions/:id/translate", async ({ req, res, params }) => {
    const decision = app.store.decision(params.id);
    if (!decision) throw new HttpError(404, `No decision with id "${params.id}"`);
    const body = await readJsonBody(req);
    const lang = typeof body.lang === "string" ? body.lang.trim().toLowerCase() : "";
    if (!SAFE_LANG.test(lang)) throw new HttpError(400, 'Send {"lang": "fr"} with a language code.');
    const source = app.store.brief(decision.id);
    if (!source) throw new HttpError(404, "There's no brief for this decision yet.");
    if ((source.lang ?? "en") === lang) return sendJson(req, res, 200, publicBrief(source));

    const cached = cachedTranslation(app, decision.id, lang, source);
    if (cached) return sendJson(req, res, 200, publicBrief(cached, source));

    const key = `${decision.id}:${lang}`;
    let pending = app.translating.get(key);
    if (!pending) {
      const agents = await app.agents.require();
      checkDailyCap(app.log, app.cfg.dailyLimitUsd);
      app.visitorLimiter.take(clientIp(req), "requests");
      const release = app.slots.acquire();
      pending = translate(app, agents, source, lang)
        .then((t) => publicBrief(t, source))
        .finally(() => {
          release();
          app.translating.delete(key);
        });
      app.translating.set(key, pending);
    }
    await respondSlowJson(req, res, pending);
  });
}

/** A stored translation is reused unless the brief it came from has changed since. */
function cachedTranslation(app: App, decisionId: string, lang: string, source: Brief): Brief | undefined {
  const t = app.store.brief(decisionId, lang) as (Brief & { sourceHash?: string }) | undefined;
  if (!t) return undefined;
  if (t.sourceHash) return t.sourceHash === briefHash(source) ? t : undefined;
  // Committed translations made before sourceHash existed: fall back to file times.
  return app.store.briefMtime(decisionId, lang) >= app.store.briefMtime(decisionId) ? t : undefined;
}

async function translate(app: App, agents: Awaited<ReturnType<App["agents"]["require"]>>, source: Brief, lang: string): Promise<Brief> {
  const run = startRun(app, { timeoutMs: app.cfg.briefTimeoutMs });
  const out = await agents.translateBrief(run.ctx, source, lang);
  const sourceHash = briefHash(source);
  const brief: Brief & { sourceHash: string } = { ...out, decisionId: source.decisionId, lang, sourceHash };
  app.store.writeBrief(brief, lang);
  if (!run.loggedKinds.has("translation.made")) {
    app.log.append({
      actor: "agent:translator",
      kind: "translation.made",
      decisionId: source.decisionId,
      payload: { lang, sourceHash, briefHash: briefHash(brief), costUsd: out.costUsd },
    });
  }
  return brief;
}

/**
 * Translation can take a minute. If it's quick we answer normally; if not, we send
 * the headers and a space every 10 s (JSON allows leading whitespace) so proxies keep
 * the connection open. A failure after that point arrives as {"error": "..."} with 200.
 */
async function respondSlowJson(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, p: Promise<unknown>): Promise<void> {
  let streaming = false;
  let timer: NodeJS.Timeout | undefined;
  const startStreaming = () => {
    streaming = true;
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.write(" ");
    timer = setInterval(() => res.write(" "), 10_000);
  };
  const first = setTimeout(startStreaming, 10_000);
  try {
    const value = await p;
    if (!streaming) return sendJson(req, res, 200, value);
    res.end(JSON.stringify(value));
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "The translation didn't finish. Please try again.";
    if (!(err instanceof HttpError)) console.error("translation failed:", (err as Error).message);
    if (!streaming) throw err instanceof HttpError ? err : new HttpError(502, message);
    res.end(JSON.stringify({ error: message }));
  } finally {
    clearTimeout(first);
    if (timer) clearInterval(timer);
  }
}
