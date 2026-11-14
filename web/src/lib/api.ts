import type {
  AgentEvent,
  Brief,
  CityConfig,
  DecisionCard,
  DecisionDetail,
  LogEntry,
  SourceDoc,
  UsageSummary,
} from "../../../shared/types.ts";
import { createStore, safeStorage } from "./store.ts";
import { playEvents, postEvents } from "./sse.ts";

const session = safeStorage("session");
const forced = new URLSearchParams(location.search).has("fixtures");
if (forced) session.set("ma-fixtures", "1");

/** True when showing sample data instead of the live service. */
export const sampleMode = createStore<boolean>(forced || session.get("ma-fixtures") === "1");

const fx = () => import("../fixtures/sample.ts");

let health: Promise<boolean> | null = null;
export function liveAvailable(): Promise<boolean> {
  if (sampleMode.get()) return Promise.resolve(false);
  health ??= (async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch("/api/health", { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      return true;
    } catch {
      sampleMode.set(true);
      return false;
    }
  })();
  return health;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      msg = j.error ?? j.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

/** Use the live service when it answers, otherwise the sample data. */
async function either<T>(path: string, sample: () => Promise<T>): Promise<T> {
  if (await liveAvailable()) return getJson<T>(path);
  return sample();
}

const unwrap = <T>(v: unknown, key: string): T => {
  if (v && typeof v === "object" && !Array.isArray(v) && key in (v as object)) return (v as Record<string, T>)[key];
  return v as T;
};

export const api = {
  city: () => either<CityConfig>("/api/city", async () => (await fx()).city),
  decisions: async () =>
    unwrap<DecisionCard[]>(await either<unknown>("/api/decisions", async () => (await fx()).cards()), "decisions"),
  decision: (id: string) =>
    either<DecisionDetail>(`/api/decisions/${encodeURIComponent(id)}`, async () => {
      const d = (await fx()).detail(id);
      if (!d) throw new ApiError(404, "No decision with that id.");
      return d;
    }),
  sources: async () => unwrap<SourceDoc[]>(await either<unknown>("/api/sources", async () => (await fx()).sources), "sources"),
  log: async (q: { decision?: string } = {}) => {
    const qs = q.decision ? `?decision=${encodeURIComponent(q.decision)}` : "";
    return unwrap<LogEntry[]>(
      await either<unknown>(`/api/log${qs}`, async () => {
        const { chain } = await import("./hash.ts");
        const all = await chain((await fx()).logEntries());
        return q.decision ? all.filter((e) => e.decisionId === q.decision) : all;
      }),
      "entries",
    );
  },
  usage: () => either<UsageSummary>("/api/usage", async () => (await fx()).usage),

  /** Page text (fallback for the source viewer when there's no PDF). */
  pageText: async (sourceId: string, page: number): Promise<string> => {
    if (!(await liveAvailable())) return (await fx()).pageText(sourceId, page);
    const r = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/pages/${page}`);
    if (!r.ok) throw new ApiError(r.status, r.statusText);
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const j = await r.json();
      return typeof j === "string" ? j : (j.text ?? "");
    }
    return r.text();
  },

  pdfUrl: (sourceId: string) => `/api/sources/${encodeURIComponent(sourceId)}/pdf`,

  translate: async (id: string, lang: string): Promise<Brief> => {
    if (!(await liveAvailable())) {
      await new Promise((r) => setTimeout(r, 1200));
      const d = (await fx()).detail(id);
      if (!d?.brief) throw new ApiError(404, "No brief to translate.");
      return { ...d.brief, lang };
    }
    const r = await fetch(`/api/decisions/${encodeURIComponent(id)}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    if (!r.ok) throw new ApiError(r.status, (await r.text()) || r.statusText);
    return unwrap<Brief>(await r.json(), "brief");
  },

  ask: async (
    id: string,
    body: { question: string; audiences?: string[]; lang?: string },
    onEvent: (e: AgentEvent) => void,
    signal?: AbortSignal,
  ) => {
    if (!(await liveAvailable())) return playEvents((await fx()).askScript(body.question), onEvent, signal);
    return postEvents(`/api/decisions/${encodeURIComponent(id)}/ask`, body, onEvent, { signal });
  },

  staff: {
    draft: async (token: string, decisionId: string, reviewer: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) => {
      if (!(await liveAvailable())) return playEvents((await fx()).briefScript(decisionId), onEvent, signal);
      return postEvents("/api/staff/briefs", { decisionId, reviewer: reviewer || undefined }, onEvent, { signal, headers: { authorization: `Bearer ${token}` } });
    },
    /** Upload a PDF: the service adds it as a source and a decision, then drafts a brief. */
    upload: async (token: string, form: FormData, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) => {
      if (!(await liveAvailable())) return playEvents((await fx()).briefScript("fairway-station-area"), onEvent, signal);
      return postEvents("/api/staff/briefs", form, onEvent, { signal, headers: { authorization: `Bearer ${token}` } });
    },
    review: (token: string, body: { decisionId: string; statementId: string; action: "approved" | "edited" | "rejected"; text?: string; note?: string; by?: string }) =>
      staffPost(token, "/api/staff/review", body),
    publish: (token: string, body: { decisionId: string; reviewer: string }) => staffPost(token, "/api/staff/publish", body),
    check: async (token: string) => {
      if (!(await liveAvailable())) return token.length > 0;
      // A review call with no body tells us whether the token is accepted (401 vs 400).
      const r = await fetch("/api/staff/review", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{}",
      });
      return r.status !== 401 && r.status !== 403;
    },
  },

  calendarUrl: (id: string) => `/api/decisions/${encodeURIComponent(id)}/calendar.ics`,
};

async function staffPost(token: string, path: string, body: unknown): Promise<unknown> {
  if (!(await liveAvailable())) {
    await new Promise((r) => setTimeout(r, 250));
    return { ok: true };
  }
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, (await r.text()) || r.statusText);
  return r.json().catch(() => ({ ok: true }));
}
