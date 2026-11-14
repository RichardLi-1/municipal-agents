// Staff routes: start a brief, review statements one by one, publish. Every change is
// written to the brief file and to the public log with the reviewer's name, because
// agent output is only a draft until a named person approves it (principle 4).
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AgentEvent, Brief, Statement } from "../../shared/types.ts";
import { type App, briefHash } from "../app.ts";
import { HttpError, openSse, readJsonBody, type Router, sendJson } from "../http.ts";
import { checkDailyCap } from "../limits.ts";
import { failureMessage, logUsageFallback, startRun } from "../runs.ts";
import { handleUpload } from "../upload.ts";

export function requireStaff(app: App, req: IncomingMessage): void {
  if (!app.cfg.staffToken) throw new HttpError(503, "Staff sign-in isn't set up on this server (STAFF_TOKEN is missing).");
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""));
  // Compare digests so the check takes the same time whatever was sent.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!m || !timingSafeEqual(digest(m[1].trim()), digest(app.cfg.staffToken))) {
    throw new HttpError(401, "Staff passcode required.");
  }
}

/** "Ana Silva" -> "staff:ana-silva", the actor name in the log. */
export function staffActor(name: string): string {
  return "staff:" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed");
}

function reviewerName(body: Record<string, unknown>): string {
  const v = body.reviewer ?? body.by;
  return typeof v === "string" ? v.trim().slice(0, 80) : "";
}

/** Every statement in a brief, wherever it sits, so review can find one by id. */
export function allStatements(brief: Brief): Statement[] {
  const out: Statement[] = [...(brief.summary ?? []), ...(brief.whyNow ?? []), ...(brief.haveYourSay ?? []), ...(brief.tradeoffs ?? [])];
  for (const i of brief.impacts ?? []) out.push(...(i.statements ?? []));
  const l = brief.lenses ?? {};
  out.push(...(l.cost?.statements ?? []), ...(l.housing?.statements ?? []));
  for (const c of l.commitments?.commitments ?? []) out.push(...(c.progress ?? []));
  return out;
}

const ACTIONS: Record<string, "approved" | "edited" | "rejected"> = {
  approve: "approved",
  approved: "approved",
  edit: "edited",
  edited: "edited",
  reject: "rejected",
  rejected: "rejected",
};

export function staffRoutes(app: App, r: Router): void {
  /** Lets the staff screen check a passcode before showing the tools. */
  r.get("/api/staff/check", ({ req, res }) => {
    requireStaff(app, req);
    sendJson(req, res, 200, { ok: true });
  });

  r.post("/api/staff/briefs", async ({ req, res }) => {
    requireStaff(app, req);
    let decisionId: string;
    let reviewer = "";
    if (/^multipart\/form-data/i.test(String(req.headers["content-type"] ?? ""))) {
      const up = await handleUpload(app, req);
      decisionId = up.decisionId;
      reviewer = up.reviewer;
    } else {
      const body = await readJsonBody(req);
      decisionId = typeof body.decisionId === "string" ? body.decisionId : "";
      reviewer = reviewerName(body);
    }
    const decision = app.store.decision(decisionId);
    if (!decision) throw new HttpError(404, `No decision with id "${decisionId}"`);

    const agents = await app.agents.require();
    checkDailyCap(app.log, app.cfg.dailyLimitUsd);
    const release = app.slots.acquire();
    const actor = reviewer ? staffActor(reviewer) : "staff";
    try {
      app.log.append({ actor, kind: "brief.started", decisionId, payload: { sources: decision.sources } });
      const sse = openSse(req, res);
      const run = startRun(app, { signal: sse.signal, serverKinds: ["brief.started"] });
      let emitted: Brief | undefined;
      const emit = (e: AgentEvent) => {
        if (e.type === "brief") emitted = e.brief;
        if (e.type === "usage") run.lastUsage = e;
        if (e.type === "done") return;
        sse.send(e as AgentEvent & Record<string, unknown>);
      };
      try {
        const result = (await agents.generateBrief(run.ctx, { decisionId }, emit)) ?? emitted;
        if (!result) throw new Error("The agents finished without a brief.");
        const brief: Brief = {
          ...result,
          decisionId,
          lang: result.lang || "en",
          generatedAt: result.generatedAt || new Date().toISOString(),
          // A new draft always starts unreviewed, whatever the agents set.
          review: { status: "draft" },
        };
        const file = app.store.writeBrief(brief);
        if (!run.loggedKinds.has("brief.generated")) {
          const stmts = allStatements(brief);
          app.log.append({
            actor: "agent:lead",
            kind: "brief.generated",
            decisionId,
            payload: {
              briefHash: briefHash(brief),
              statements: stmts.length,
              verified: stmts.filter((s) => s.verified).length,
              readingGrade: brief.readingGrade,
              costUsd: brief.costUsd,
              models: brief.models,
              file: file.slice(app.cfg.dataDir.length + 1),
            },
          });
        }
        if (!emitted) sse.send({ type: "brief", brief } as AgentEvent & Record<string, unknown>);
      } catch (err) {
        sse.send({ type: "error", message: failureMessage(err, run) });
      } finally {
        logUsageFallback(app, run, decisionId, "agent:lead");
        sse.send({ type: "done" });
        sse.end();
      }
    } finally {
      release();
    }
  });

  r.post("/api/staff/review", async ({ req, res }) => {
    requireStaff(app, req);
    const body = await readJsonBody(req);
    const decisionId = String(body.decisionId ?? "");
    const statementId = String(body.statementId ?? "");
    const action = ACTIONS[String(body.action ?? "")];
    if (!action) throw new HttpError(400, 'action must be "approve", "edit" or "reject"');
    const reviewer = reviewerName(body) || "staff";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : undefined;
    const current = app.store.brief(decisionId);
    if (!current) throw new HttpError(404, `No brief for decision "${decisionId}"`);
    // Work on a copy: the store's cached object must not change unless the write succeeds.
    const brief = structuredClone(current);
    const st = allStatements(brief).find((s) => s.id === statementId);
    if (!st) throw new HttpError(404, `No statement "${statementId}" in this brief`);

    const before = st.text;
    let originalText = st.review?.originalText;
    if (action === "edited") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) throw new HttpError(400, "An edit needs the new text.");
      if (text.length > 2000) throw new HttpError(400, "Please keep a statement under 2000 characters.");
      originalText ??= st.text;
      st.text = text;
    }
    st.review = { action, by: reviewer, at: new Date().toISOString(), ...(note ? { note } : {}), ...(originalText ? { originalText } : {}) };
    if (brief.review?.status !== "published") brief.review = { ...brief.review, status: "in-review" };
    app.store.writeBrief(brief);
    app.log.append({
      actor: staffActor(reviewer),
      kind: "statement.reviewed",
      decisionId,
      payload: { statementId, action, by: reviewer, note, ...(action === "edited" ? { from: before, to: st.text } : {}), briefHash: briefHash(brief) },
    });
    sendJson(req, res, 200, { statement: st, brief });
  });

  r.post("/api/staff/publish", async ({ req, res }) => {
    requireStaff(app, req);
    const body = await readJsonBody(req);
    const decisionId = String(body.decisionId ?? "");
    const reviewer = reviewerName(body);
    if (!reviewer) throw new HttpError(400, "Publishing needs the reviewer's name.");
    const current = app.store.brief(decisionId);
    if (!current) throw new HttpError(404, `No brief for decision "${decisionId}"`);
    const brief = structuredClone(current);
    brief.review = { status: "published", by: reviewer, at: new Date().toISOString() };
    app.store.writeBrief(brief);
    const stmts = allStatements(brief);
    const count = (a?: string) => stmts.filter((s) => s.review?.action === a).length;
    app.log.append({
      actor: staffActor(reviewer),
      kind: "brief.published",
      decisionId,
      payload: {
        by: reviewer,
        briefHash: briefHash(brief),
        statements: stmts.length,
        approved: count("approved"),
        edited: count("edited"),
        rejected: count("rejected"),
        unreviewed: count(undefined),
      },
    });
    sendJson(req, res, 200, { brief });
  });
}
