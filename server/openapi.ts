// The OpenAPI 3.1 description served at /api/openapi.json. The data shapes come from
// shared/types.ts through scripts/openapi-schemas.ts (server/openapi-schemas.json); the
// paths are written here. server/openapi.test.ts fails if a registered route is missing
// from this file or the generated schemas are stale.
import fs from "node:fs";
import path from "node:path";
import { PRIVACY_RULE } from "./routes/insights.ts";

type Obj = Record<string, unknown>;

const generated = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "openapi-schemas.json"), "utf8")) as Record<string, Obj>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Obj, description = "OK") => ({ description, content: { "application/json": { schema } } });
const err = (description: string) => json(ref("Error"), description);
const pathParam = (name: string, description: string, example?: string) => ({ name, in: "path", required: true, description, schema: { type: "string" }, ...(example ? { example } : {}) });
const query = (name: string, description: string, schema: Obj = { type: "string" }) => ({ name, in: "query", required: false, description, schema });
const body = (schema: Obj, description?: string) => ({ required: true, ...(description ? { description } : {}), content: { "application/json": { schema } } });
const staff = [{ staffToken: [] }];

const SSE_EVENTS = `Server-sent events. Each message is \`event: <type>\` and \`data: <JSON>\`, where the JSON is an AgentEvent:
- \`plan\`: the lead's plan, the specialists it will ask and what.
- \`step.start\`: a specialist starts a step.
- \`tool\`: a specialist used a tool (search_pages, read_page, record_statement, a lens tool), with a one-line summary.
- \`statement\`: a statement that passed the citation check.
- \`step.end\`: a step finished (\`done\` or \`failed\`).
- \`answer\`: the answer text with [n] markers and the statements they cite. \`offline: true\` when it was put together from the brief's checked statements without a model; \`replay\` when it is a saved real run (when it was answered, and the label shown).
- \`brief\`: a whole Brief (staff brief runs).
- \`usage\`: running totals of model calls, tokens and US dollars.
- \`error\`: a plain-language message for the resident.
- \`done\`: always last; the server then closes the stream.
Comment lines (\`: ping\`) every 15 s keep proxies from closing the stream.`;

const extra: Record<string, Obj> = {
  Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
  Health: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      startedAt: ref("IsoDate"),
      version: { type: "string" },
      decisions: { type: "integer" },
      sources: { type: "integer" },
      logEntries: { type: "integer" },
      agents: { type: "object", properties: { available: { type: "boolean" }, error: { type: "string" } }, required: ["available"] },
      runsActive: { type: "integer" },
    },
    required: ["ok", "startedAt", "version", "decisions", "sources", "logEntries", "agents", "runsActive"],
  },
  City: {
    allOf: [ref("CityConfig"), { type: "object", properties: { default: { type: "boolean", description: "The deployment's default city (CITY env, else the first config)." }, decisions: { type: "integer" } } }],
  },
  DecisionCardWithOpen: {
    allOf: [ref("DecisionCard"), { type: "object", properties: { open: { type: "array", items: ref("TimelineEvent"), description: "Ways to take part that are open right now." } }, required: ["open"] }],
  },
  DecisionDetailWithLenses: {
    allOf: [ref("DecisionDetail"), { type: "object", properties: { lenses: { ...ref("Brief/properties/lenses"), description: "Only when there is no brief yet; otherwise the lenses are in brief.lenses (computed lens files with the brief's additions merged per lens)." } } }],
  },
  PageText: {
    type: "object",
    properties: { sourceId: { type: "string" }, page: { type: "integer", minimum: 1 }, pages: { type: "integer" }, text: { type: "string" } },
    required: ["sourceId", "page", "pages", "text"],
  },
  ChainCheck: {
    type: "object",
    properties: {
      intact: { type: "boolean" },
      count: { type: "integer" },
      headHash: { type: "string", description: "sha256 of the newest entry (64 zeros for an empty log)." },
      purged: { type: "integer", description: "Entries whose content was purged under the records retention by-law (each with its record.purged entry)." },
      brokenAt: { type: "integer", description: "The first entry whose hash or link doesn't match." },
      reason: { type: "string" },
    },
    required: ["intact", "count", "headHash"],
  },
  AskRequest: {
    type: "object",
    properties: {
      question: { type: "string", minLength: 1, maxLength: 1000 },
      audiences: { type: "array", items: ref("AudienceId"), description: "Who is asking; unknown values are dropped." },
      lang: { type: "string", pattern: "^[a-z]{2,3}(-[a-z0-9]{2,8})?$", description: "Answer in this language." },
    },
    required: ["question"],
  },
  TranslateRequest: { type: "object", properties: { lang: { type: "string", pattern: "^[a-z]{2,3}(-[a-z0-9]{2,8})?$" } }, required: ["lang"] },
  BriefRequest: { type: "object", properties: { decisionId: { type: "string" }, reviewer: { type: "string", maxLength: 80 } }, required: ["decisionId"] },
  BriefUpload: {
    type: "object",
    description: "A PDF with a text layer (not a scan), up to the server's page limit. Becomes a source and a new decision.",
    properties: {
      file: { type: "string", contentMediaType: "application/pdf", description: "The PDF." },
      title: { type: "string" },
      plainTitle: { type: "string" },
      decidedBy: { type: "string" },
      officialUrl: { type: "string", format: "uri" },
      url: { type: "string", format: "uri" },
      publisher: { type: "string" },
      published: ref("IsoDate"),
      licence: { type: "string" },
      kind: ref("SourceDoc/properties/kind"),
      reviewer: { type: "string" },
    },
    required: ["file"],
  },
  ReviewRequest: {
    type: "object",
    properties: {
      decisionId: { type: "string" },
      statementId: { type: "string" },
      action: { type: "string", enum: ["approve", "edit", "reject"] },
      text: { type: "string", maxLength: 2000, description: "The new wording (edit only). The citations stay and are checked again." },
      note: { type: "string", maxLength: 2000 },
      reviewer: { type: "string", maxLength: 80 },
    },
    required: ["decisionId", "statementId", "action"],
  },
  ReviewResponse: { type: "object", properties: { statement: ref("Statement"), brief: ref("Brief") }, required: ["statement", "brief"] },
  PublishRequest: { type: "object", properties: { decisionId: { type: "string" }, reviewer: { type: "string", minLength: 1, maxLength: 80 } }, required: ["decisionId", "reviewer"] },
  PurgeRequest: {
    type: "object",
    properties: {
      seq: { type: "integer", minimum: 1, description: "The entry whose content to purge." },
      reason: { type: "string", minLength: 1, maxLength: 500, description: "Why, e.g. the retention by-law and schedule that ended its retention period." },
      reviewer: { type: "string", maxLength: 80 },
    },
    required: ["seq", "reason"],
  },
  PurgeResponse: {
    type: "object",
    properties: {
      purged: { allOf: [ref("LogEntry")], description: "The entry, now with payload null and `purged` set; its header and payloadHash are unchanged." },
      record: { allOf: [ref("LogEntry")], description: "The record.purged entry appended to the chain." },
    },
    required: ["purged", "record"],
  },
  PublishResponse: { type: "object", properties: { brief: ref("Brief") }, required: ["brief"] },
  CalendarLinks: {
    type: "object",
    properties: {
      name: { type: "string" },
      ics: { type: "string", format: "uri" },
      webcal: { type: "string", description: "The same feed with the webcal:// scheme, which calendar apps open as a subscription." },
      google: { type: "string", format: "uri" },
      outlook: { type: "string", format: "uri" },
      decisions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, plainTitle: { type: "string" }, ics: { type: "string", format: "uri" } }, required: ["id", "plainTitle", "ics"] } },
      privacy: { type: "string" },
    },
    required: ["name", "ics", "webcal", "google", "outlook", "decisions", "privacy"],
  },
  EmbedCard: {
    type: "object",
    description: "What the embeddable widget (/embed.js) shows: the plain title, up to 3 summary statements with links to their cited pages, the next chance to have a say, and the review status. Rejected statements are never included.",
    properties: {
      id: { type: "string" },
      plainTitle: { type: "string" },
      decidedBy: { type: "string" },
      status: ref("Decision/properties/status"),
      lang: { type: "string" },
      summary: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            kind: ref("StatementKind"),
            verified: { type: "boolean" },
            edited: { type: "boolean" },
            citations: {
              type: "array",
              items: { type: "object", properties: { sourceId: { type: "string" }, source: { type: "string" }, page: { type: "integer" }, url: { type: "string", format: "uri" } }, required: ["sourceId", "source", "page", "url"] },
            },
          },
          required: ["id", "text", "kind", "verified", "edited", "citations"],
        },
      },
      next: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          plain: { type: "string" },
          date: ref("IsoDate"),
          end: ref("IsoDate"),
          location: { type: "string" },
          open: { type: "boolean", description: "Already begun and still open (a survey that runs for weeks)." },
          estimated: { type: "boolean", description: "The date is worked out from a rule, not published: shown as \"At the latest\"." },
          methods: { type: "array", items: { type: "object", properties: { method: ref("Participation/properties/method"), instructions: { type: "string" }, deadline: ref("IsoDate"), url: { type: "string" } }, required: ["method", "instructions"] } },
        },
        required: ["id", "title", "plain", "date", "open", "estimated", "methods"],
      },
      review: { type: "object", properties: { status: { type: "string", enum: ["draft", "in-review", "published", "none"] }, by: { type: "string" }, at: ref("IsoDate") }, required: ["status"] },
      readingGrade: { type: "number" },
      links: {
        type: "object",
        properties: { brief: { type: "string" }, calendar: { type: "string" }, official: { type: "string" }, subscribe: { type: "string" } },
        required: ["brief", "calendar", "official", "subscribe"],
      },
    },
    required: ["id", "plainTitle", "decidedBy", "status", "lang", "summary", "review", "links"],
  },
  Insights: {
    type: "object",
    description: `Aggregated questions for staff. ${PRIVACY_RULE}`,
    properties: {
      decision: { type: ["string", "null"] },
      decisions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, plainTitle: { type: "string" }, questions: { type: "integer" } } }, description: "Per decision, when no ?decision= is given." },
      period: { type: "object", properties: { from: ref("IsoDate"), to: ref("IsoDate"), days: { type: "integer" } }, required: ["from", "to", "days"] },
      totals: {
        type: "object",
        properties: {
          questions: { type: "integer" },
          answered: { type: "integer" },
          unanswered: { type: "integer", description: "Asked, with no answer in the record (the run failed, was refused or the visitor left)." },
          offline: { type: "integer", description: "Answers given without a model, from the brief's checked statements." },
          replayed: { type: "integer", description: "Answers replayed from a saved real run." },
        },
        required: ["questions", "answered", "unanswered", "offline", "replayed"],
      },
      perDay: { type: "array", items: { type: "object", properties: { day: { type: "string", format: "date" }, questions: { type: "integer" } }, required: ["day", "questions"] } },
      languages: { type: "array", items: { type: "object", properties: { lang: { type: "string" }, questions: { type: "integer" } }, required: ["lang", "questions"] } },
      audiences: { type: "array", items: { type: "object", properties: { audience: { type: "string" }, questions: { type: "integer" } }, required: ["audience", "questions"] } },
      topics: {
        type: "array",
        description: "Questions grouped by the words they share with the decision's glossary terms, its lenses and 'having a say'. No model is used.",
        items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, from: { type: "string", enum: ["glossary", "lens", "have-your-say", "other"] }, questions: { type: "integer" } }, required: ["id", "label", "from", "questions"] },
      },
      similar: {
        type: "array",
        description: "Groups of at least k similar questions, largest first. `example` is the group's most typical question with identifying details removed.",
        items: { type: "object", properties: { questions: { type: "integer", minimum: 3 }, example: { type: "string" }, sharedWords: { type: "array", items: { type: "string" } }, topic: { type: "string" } }, required: ["questions", "example", "sharedWords", "topic"] },
      },
      suppressed: { type: "object", description: "Groups smaller than k: counted, never shown.", properties: { groups: { type: "integer" }, questions: { type: "integer" } }, required: ["groups", "questions"] },
      citedPages: {
        type: "array",
        items: { type: "object", properties: { sourceId: { type: "string" }, source: { type: "string" }, page: { type: "integer" }, citations: { type: "integer" }, url: { type: "string" } }, required: ["sourceId", "source", "page", "citations", "url"] },
      },
      privacy: { type: "object", properties: { k: { type: "integer" }, rule: { type: "string" } }, required: ["k", "rule"] },
    },
    required: ["decision", "period", "totals", "perDay", "languages", "audiences", "topics", "similar", "suppressed", "citedPages", "privacy"],
  },
};

const ID = pathParam("id", "Decision id", "row-2027-budget");
const CITY = query("city", "City config id (cities/<id>.json). Default: the CITY setting, else the first config. `all` for every city.");
const DECISIONS = query("decisions", "Comma-separated decision ids. Default: every decision of the city.");

export const PATHS: Record<string, Record<string, Obj>> = {
  "/api/health": { get: { tags: ["Service"], summary: "Is the service up", operationId: "health", responses: { 200: json(ref("Health")) } } },
  "/api/openapi.json": { get: { tags: ["Service"], summary: "This description (OpenAPI 3.1)", operationId: "openapi", responses: { 200: json({ type: "object" }) } } },
  "/api/cities": { get: { tags: ["Cities"], summary: "Every municipality this deployment serves", operationId: "listCities", responses: { 200: json({ type: "array", items: ref("City") }) } } },
  "/api/city": {
    get: { tags: ["Cities"], summary: "One city's settings", operationId: "getCity", parameters: [CITY], responses: { 200: json(ref("CityConfig")), 404: err("No such city") } },
  },
  "/api/decisions": {
    get: {
      tags: ["Decisions"],
      summary: "Decision cards, soonest chance to take part first",
      operationId: "listDecisions",
      parameters: [CITY],
      responses: { 200: json({ type: "array", items: ref("DecisionCardWithOpen") }), 404: err("No such city") },
    },
  },
  "/api/decisions/{id}": {
    get: {
      tags: ["Decisions"],
      summary: "A decision, its brief, lenses and sources",
      description: "Residents get the published brief without the statements staff rejected; with the staff passcode, the whole brief. `?lang=` serves a cached translation if one exists (it never starts a model run).",
      operationId: "getDecision",
      parameters: [ID, query("lang", "Language code of a cached translation")],
      responses: { 200: json(ref("DecisionDetailWithLenses")), 304: { description: "Not modified (ETag)" }, 404: err("No such decision") },
    },
  },
  "/api/decisions/{id}/calendar.ics": {
    get: {
      tags: ["Calendar"],
      summary: "The decision's upcoming chances to take part, as a calendar file",
      operationId: "decisionCalendar",
      parameters: [ID],
      responses: { 200: { description: "iCalendar (RFC 5545)", content: { "text/calendar": { schema: { type: "string" } } } }, 404: err("No such decision") },
    },
  },
  "/api/calendar.ics": {
    get: {
      tags: ["Calendar"],
      summary: "Subscription feed of many decisions' chances to take part",
      description: "Open it as webcal://<host>/api/calendar.ics to subscribe. Calendar apps refresh it every 6 hours (REFRESH-INTERVAL). Keeps the last 30 days of events; reminders only for future ones. A subscription, not a sign-up: nothing personal is asked for or stored.",
      operationId: "calendarFeed",
      parameters: [DECISIONS, CITY],
      responses: { 200: { description: "iCalendar (RFC 5545)", content: { "text/calendar": { schema: { type: "string" } } } }, 404: err("A decision or city id doesn't exist") },
    },
  },
  "/api/calendar": {
    get: {
      tags: ["Calendar"],
      summary: "Links to subscribe to the feed (webcal, Google, Outlook)",
      operationId: "calendarLinks",
      parameters: [DECISIONS, CITY],
      responses: { 200: json(ref("CalendarLinks")), 404: err("A decision or city id doesn't exist") },
    },
  },
  "/api/embed/{id}": {
    get: {
      tags: ["Embed"],
      summary: "The compact card the embeddable widget shows",
      description: "Sent with `Access-Control-Allow-Origin: *` so a city's own page can show it (see /embed.js). No cookies, no credentials.",
      operationId: "embedCard",
      parameters: [ID, query("lang", "Show a cached translation of the summary if one exists")],
      responses: { 200: json(ref("EmbedCard")), 404: err("No such decision") },
    },
  },
  "/api/decisions/{id}/ask": {
    post: {
      tags: ["Agents"],
      summary: "Ask a question about a decision",
      description: `Rate-limited per IP and stopped once the day's spend cap is reached. The question is recorded in the public log, not tied to anyone.\n\n${SSE_EVENTS}`,
      operationId: "ask",
      parameters: [ID],
      requestBody: body(ref("AskRequest")),
      responses: {
        200: { description: "A stream of AgentEvents", content: { "text/event-stream": { schema: ref("AgentEvent") } } },
        400: err("Empty or too long question"),
        404: err("No such decision"),
        429: err("Too many questions from this address, or today's budget is spent (Retry-After)"),
        503: err("The agents aren't loaded, or every run slot is busy"),
      },
    },
  },
  "/api/decisions/{id}/translate": {
    post: {
      tags: ["Agents"],
      summary: "The brief in another language (made once, then cached)",
      description: "A slow translation starts the response early and sends spaces to keep the connection open; a failure after that arrives as `{\"error\": \"...\"}` with status 200.",
      operationId: "translate",
      parameters: [ID],
      requestBody: body(ref("TranslateRequest")),
      responses: { 200: json(ref("Brief")), 400: err("Bad language code"), 404: err("No such decision or no brief yet"), 429: err("Rate limit or budget"), 502: err("The translation didn't finish") },
    },
  },
  "/api/sources": { get: { tags: ["Sources"], summary: "Every source document", operationId: "listSources", responses: { 200: json({ type: "array", items: ref("SourceDoc") }) } } },
  "/api/sources/{id}/pdf": {
    get: {
      tags: ["Sources"],
      summary: "The source PDF, as published",
      description: "Honours a single `Range: bytes=a-b` (pdf.js loads PDFs in chunks).",
      operationId: "sourcePdf",
      parameters: [pathParam("id", "Source id")],
      responses: {
        200: { description: "The PDF", content: { "application/pdf": { schema: { type: "string", contentMediaType: "application/pdf" } } } },
        206: { description: "Part of the PDF", content: { "application/pdf": { schema: { type: "string" } } } },
        404: err("No such source"),
        416: { description: "Range not satisfiable" },
      },
    },
  },
  "/api/sources/{id}/pages/{n}": {
    get: {
      tags: ["Sources"],
      summary: "One page's text (what citations are checked against)",
      operationId: "sourcePage",
      parameters: [pathParam("id", "Source id"), { name: "n", in: "path", required: true, description: "1-based page number", schema: { type: "integer", minimum: 1 } }],
      responses: { 200: json(ref("PageText")), 404: err("No such source or page") },
    },
  },
  "/api/renders/{file}": {
    get: {
      tags: ["Sources"],
      summary: "An illustrative construction-lens render",
      operationId: "render",
      parameters: [pathParam("file", "File name (png, jpg or webp)")],
      responses: { 200: { description: "The image", content: { "image/png": {}, "image/jpeg": {}, "image/webp": {} } }, 404: err("No such render") },
    },
  },
  "/api/log": {
    get: {
      tags: ["Record"],
      summary: "The public, hash-chained record",
      description:
        "Each entry's hash is sha256(prevHash + canonical JSON of {seq, at, actor, kind, decisionId, payloadHash}), where payloadHash is sha256(canonical JSON of payload); the first entry's prevHash is 64 zeros. Canonical JSON: keys sorted, no whitespace, undefined keys dropped. A payload purged under the records retention by-law is null, with `purged` set and a later `record.purged` entry naming it; its hash still verifies. Entries written before payload hashing keep their original hash as `legacyHash`.",
      operationId: "log",
      parameters: [
        query("decision", "Only this decision's entries"),
        query("kind", "Only this kind", ref("LogEntry/properties/kind")),
        query("after", "seq greater than", { type: "integer" }),
        query("before", "seq less than", { type: "integer" }),
        query("limit", "At most this many (default 10000)", { type: "integer", maximum: 10000 }),
        query("order", "asc (default) or desc", { type: "string", enum: ["asc", "desc"] }),
      ],
      responses: { 200: json({ type: "array", items: ref("LogEntry") }) },
    },
  },
  "/api/log/verify": { get: { tags: ["Record"], summary: "Recompute every hash in the record", operationId: "verifyLog", responses: { 200: json(ref("ChainCheck")) } } },
  "/api/usage": { get: { tags: ["Record"], summary: "Model spend, tokens, energy and CO2e (estimates), from the record", operationId: "usage", responses: { 200: json(ref("UsageSummary")) } } },
  "/api/staff/check": {
    get: { tags: ["Staff"], summary: "Check the staff passcode", operationId: "staffCheck", security: staff, responses: { 200: json({ type: "object", properties: { ok: { type: "boolean" } } }), 401: err("Wrong or missing passcode"), 503: err("Staff sign-in isn't set up") } },
  },
  "/api/staff/briefs": {
    post: {
      tags: ["Staff"],
      summary: "Draft a brief (for a decision, or from an uploaded PDF)",
      description: `The draft is saved with status \`draft\` and logged; staff then review every statement.\n\n${SSE_EVENTS}`,
      operationId: "draftBrief",
      security: staff,
      requestBody: { required: true, content: { "application/json": { schema: ref("BriefRequest") }, "multipart/form-data": { schema: ref("BriefUpload") } } },
      responses: {
        200: { description: "A stream of AgentEvents ending with a `brief`", content: { "text/event-stream": { schema: ref("AgentEvent") } } },
        401: err("Wrong or missing passcode"),
        404: err("No such decision"),
        413: err("Upload too large or too many pages"),
        415: err("Not a PDF"),
        422: err("The PDF has no text layer"),
        429: err("Today's budget is spent"),
      },
    },
  },
  "/api/staff/review": {
    post: {
      tags: ["Staff"],
      summary: "Approve, edit or reject one statement",
      description: "An edit keeps the citations and re-runs the citation check, so `verified` always says what the checker says. Logged with the reviewer's name.",
      operationId: "review",
      security: staff,
      requestBody: body(ref("ReviewRequest")),
      responses: { 200: json(ref("ReviewResponse")), 400: err("Bad action or missing text"), 401: err("Wrong or missing passcode"), 404: err("No such brief or statement") },
    },
  },
  "/api/staff/publish": {
    post: {
      tags: ["Staff"],
      summary: "Publish a brief once every statement has been reviewed",
      operationId: "publish",
      security: staff,
      requestBody: body(ref("PublishRequest")),
      responses: { 200: json(ref("PublishResponse")), 400: err("Missing reviewer name"), 401: err("Wrong or missing passcode"), 404: err("No brief"), 409: err("Some statements haven't been reviewed") },
    },
  },
  "/api/staff/purge": {
    post: {
      tags: ["Staff"],
      summary: "Purge one entry's content under the records retention by-law",
      description:
        "Removes the entry's payload, keeps its header and payload hash, and appends a `record.purged` entry (which entry, its payload hash, the reason, who). The chain still verifies; the entry shows as purged on that date. The record's own `record.purged` and `record.migrated` entries can't be purged.",
      operationId: "purge",
      security: staff,
      requestBody: body(ref("PurgeRequest")),
      responses: { 200: json(ref("PurgeResponse")), 400: err("Missing seq or reason"), 401: err("Wrong or missing passcode"), 404: err("No such entry"), 409: err("Already purged, or a bookkeeping entry") },
    },
  },
  "/api/staff/insights": {
    get: {
      tags: ["Staff"],
      summary: "What residents are asking (aggregated, privacy-preserving)",
      description: PRIVACY_RULE,
      operationId: "insights",
      security: staff,
      parameters: [query("decision", "One decision (default: all)"), query("days", "Look back this many days (default 30)", { type: "integer", minimum: 1, maximum: 3650 })],
      responses: { 200: json(ref("Insights")), 401: err("Wrong or missing passcode"), 404: err("No such decision") },
    },
  },
};

/** "/api/decisions/:id/calendar.ics" -> "/api/decisions/{id}/calendar.ics" */
export function openApiPath(pattern: string): string {
  return pattern.replace(/:([a-zA-Z]+)/g, "{$1}");
}

export function buildOpenApi(origin?: string): Obj {
  return {
    openapi: "3.1.0",
    info: {
      title: "Municipal Agents API",
      version: "1.0.0",
      summary: "Proposed municipal decisions explained in plain words, every figure linked to its source page.",
      description:
        "Read-only routes are open to anyone. `/ask` and `/translate` start model runs and are rate-limited per IP with a daily spend cap. Staff routes need `Authorization: Bearer <staff passcode>`. Every brief, check, question, answer, approval and spend is in the hash-chained public record (`/api/log`). Data shapes are generated from shared/types.ts.",
      license: { name: "Code: see repository", url: "https://github.com/RichardLi-1/municipal-agents" },
    },
    ...(origin ? { servers: [{ url: origin }] } : {}),
    tags: [
      { name: "Decisions" },
      { name: "Agents", description: "Routes that spend money on model calls" },
      { name: "Calendar" },
      { name: "Embed" },
      { name: "Sources" },
      { name: "Record" },
      { name: "Cities" },
      { name: "Staff", description: "Need the staff passcode" },
      { name: "Service" },
    ],
    paths: PATHS,
    components: {
      // Nested refs such as "Brief/properties/lenses" are JSON pointers into these.
      schemas: { ...generated, ...extra },
      securitySchemes: { staffToken: { type: "http", scheme: "bearer", description: "The staff passcode (STAFF_TOKEN)." } },
    },
  };
}
