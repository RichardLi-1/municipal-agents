// Records retention: staff purge one entry's content when its retention period under
// the city's records retention by-law has ended. The entry's header and payload hash
// stay on the chain, a `record.purged` entry says which entry, why and who, and the
// chain still verifies (server/log.ts).
import type { App } from "../app.ts";
import { HttpError, readJsonBody, type Router, sendJson } from "../http.ts";
import { PurgeError } from "../log.ts";
import { requireStaff, staffActor } from "./staff.ts";

export function recordRoutes(app: App, r: Router): void {
  r.post("/api/staff/purge", async ({ req, res }) => {
    requireStaff(app, req);
    const body = await readJsonBody(req);
    const seq = Number(body.seq);
    if (!Number.isInteger(seq) || seq < 1) throw new HttpError(400, 'Send {"seq": <entry number>, "reason": "..."}.');
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) throw new HttpError(400, 'A purge needs a reason, e.g. "Retention period ended under By-law 2024-123, schedule A".');
    const by = typeof body.reviewer === "string" ? body.reviewer.trim().slice(0, 80) : typeof body.by === "string" ? body.by.trim().slice(0, 80) : "";
    try {
      const out = app.log.purge(seq, { reason, actor: by ? staffActor(by) : "staff", by: by || undefined });
      sendJson(req, res, 200, out);
    } catch (err) {
      if (err instanceof PurgeError) throw new HttpError(err.status, err.message);
      throw err;
    }
  });
}
