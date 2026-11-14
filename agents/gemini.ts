// One call to the Gemini REST API (generateContent), with retries, a timeout and cost.
// No SDK: the request and response are plain JSON, so the team can read exactly what
// is sent. The key comes from GEMINI_API_KEY and is only ever put in a header.

export interface FunctionCall {
  name: string;
  args?: Record<string, unknown>;
  id?: string;
}

export interface Part {
  text?: string;
  thought?: boolean;
  /** Gemini 3 returns this on model parts; it must be sent back unchanged in the history. */
  thoughtSignature?: string;
  functionCall?: FunctionCall;
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

/** OpenAPI-style schema subset Gemini accepts for tool parameters and JSON output. */
export type Schema = Record<string, unknown>;

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Schema;
}

export interface GeminiRequest {
  model: string;
  system?: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  /** "NONE" forbids tool calls (used to force a final answer). */
  toolMode?: "AUTO" | "ANY" | "NONE";
  /** Ask for JSON matching this schema instead of free text. */
  jsonSchema?: Schema;
  thinking?: "minimal" | "low" | "medium" | "high";
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Usage {
  promptTokens: number;
  candidatesTokens: number;
  thoughtsTokens: number;
}

export interface GeminiResult {
  model: string;
  /** The model's turn exactly as returned, to append to the history. */
  content: Content;
  text: string;
  calls: FunctionCall[];
  finishReason: string;
  usage: Usage;
  costUsd: number;
}

/** What the agent loop calls; tests pass a fake with the same shape. */
export type CallModel = (req: GeminiRequest) => Promise<GeminiResult>;

/** US$ per million tokens. Thinking tokens bill as output. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

// An unknown model is priced like the dearest one we list, so spend is never understated.
const FALLBACK_PRICE = { input: 0.75, output: 3.75 };

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return (u.promptTokens * p.input + (u.candidatesTokens + u.thoughtsTokens) * p.output) / 1e6;
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface CallOptions {
  apiKey?: string;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function buildBody(req: GeminiRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = req.maxOutputTokens;
  if (req.thinking) generationConfig.thinkingConfig = { thinkingLevel: req.thinking };
  if (req.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = req.jsonSchema;
  }
  const body: Record<string, unknown> = { contents: req.contents, generationConfig };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.tools?.length) {
    body.tools = [{ functionDeclarations: req.tools }];
    body.toolConfig = { functionCallingConfig: { mode: req.toolMode ?? "AUTO" } };
  }
  return body;
}

export function parseResponse(model: string, json: any): GeminiResult {
  const cand = json?.candidates?.[0];
  const parts: Part[] = cand?.content?.parts ?? [];
  const usage: Usage = {
    promptTokens: json?.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtsTokens: json?.usageMetadata?.thoughtsTokenCount ?? 0,
  };
  return {
    model,
    content: { role: "model", parts },
    text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(""),
    calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall!),
    finishReason: cand?.finishReason ?? json?.promptFeedback?.blockReason ?? "NO_CANDIDATE",
    usage,
    costUsd: costOf(model, usage),
  };
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One generateContent call. Retries rate limits, server errors and timeouts with backoff. */
export async function callGemini(req: GeminiRequest, opts: CallOptions = {}): Promise<GeminiResult> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set", 0);
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const retries = opts.retries ?? 4;
  const body = JSON.stringify(buildBody(req));
  const url = `${ENDPOINT}/${encodeURIComponent(req.model)}:generateContent`;

  for (let attempt = 0; ; attempt++) {
    if (req.signal?.aborted) throw req.signal.reason ?? new Error("aborted");
    const timeout = AbortSignal.timeout(req.timeoutMs ?? 90_000);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    let status = 0;
    let message = "";
    let retryAfterMs = 0;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal,
      });
      if (res.ok) return parseResponse(req.model, await res.json());
      status = res.status;
      const text = await res.text();
      // Never echo request headers; the error body from Google does not contain the key.
      message = `Gemini ${status}: ${text.slice(0, 300)}`;
      const ra = Number(res.headers.get("retry-after"));
      if (ra > 0) retryAfterMs = ra * 1000;
    } catch (err) {
      if (req.signal?.aborted) throw err; // the caller cancelled: don't retry
      status = 0; // network error or our timeout
      message = `Gemini request failed: ${(err as Error).message}`;
    }
    const retryable = status === 0 || RETRYABLE.has(status);
    if (!retryable || attempt >= retries) throw new GeminiError(message, status);
    const backoff = Math.min(20_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    await sleep(Math.max(backoff, retryAfterMs));
  }
}
