// What can go wrong with a model call, and what a resident is told about it. Residents
// get plain, generic words: never the provider's response, a billing link, a URL or a
// stack, and never why the model is unreachable (credit, rate limit, outage). The details
// go to the server's console only (no secrets: provider bodies never contain the key).

/** The one message residents see whenever the model can't be reached, whatever the cause. */
export const UNREACHABLE = "The AI model can't be reached right now.";

/** True for errors that mean the model can't be reached at all, as opposed to a bad request. */
export function isUnreachable(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown } | undefined;
  if (!e || typeof e.status !== "number" || typeof e.message !== "string" || !/^Gemini|GEMINI_API_KEY/.test(e.message)) return false;
  return e.status === 0 || [401, 402, 403, 429].includes(e.status) || e.status >= 500;
}

/** What a resident may be told about any failure. */
export function publicError(err: unknown): string {
  if (isUnreachable(err)) return UNREACHABLE;
  const e = err as { name?: string; message?: string; status?: number } | undefined;
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /aborted|cancelled|timed? ?out/i.test(e?.message ?? "")) return "The run was stopped before it finished.";
  if (typeof e?.status === "number") return "The AI model returned an error. Please try again.";
  return "Something went wrong while the agents were working.";
}

/** Why the model is unreachable: for the server's console only, never for residents. */
export function unreachableReason(err: unknown): string {
  const status = (err as { status?: number })?.status ?? 0;
  const msg = String((err as Error)?.message ?? "");
  if (status === 402) return "the model service's prepaid credit is used up";
  if (status === 429) return "the model service is rate-limiting requests";
  if (status === 401 || status === 403) return "the model service refused the API key";
  if (status >= 500) return "the model service is having an outage";
  if (/GEMINI_API_KEY/.test(msg)) return "no API key is set";
  return "there is no connection to the model service";
}

/** Server-side log of a failure, with the provider's detail. */
export function logFailure(where: string, err: unknown): void {
  const e = err as { message?: string; status?: number; detail?: string };
  const reason = isUnreachable(err) ? ` [${unreachableReason(err)}]` : "";
  console.error(`${where}: ${e?.message ?? String(err)}${e?.status !== undefined ? ` (status ${e.status})` : ""}${reason}${e?.detail ? ` ${e.detail.slice(0, 300)}` : ""}`);
}
