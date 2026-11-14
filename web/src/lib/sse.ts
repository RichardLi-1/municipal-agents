import type { AgentEvent } from "../../../shared/types.ts";

/** POST a JSON body and read the server-sent events in the reply. */
export async function postEvents(
  url: string,
  body: unknown,
  onEvent: (e: AgentEvent) => void,
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<void> {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    headers: form ? { accept: "text/event-stream", ...opts.headers } : { "content-type": "application/json", accept: "text/event-stream", ...opts.headers },
    body: form ? body : JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let msg = res.statusText;
    try {
      const t = await res.text();
      try {
        msg = JSON.parse(t).error ?? t;
      } catch {
        msg = t || msg;
      }
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${msg}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const flush = (chunk: string) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    try {
      onEvent(JSON.parse(data) as AgentEvent);
    } catch {
      /* not JSON: skip */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let m: RegExpExecArray | null;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      flush(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
    }
  }
  if (buf.trim()) flush(buf);
}

/** Play scripted events with delays (sample mode). */
export async function playEvents(
  script: { wait: number; event: AgentEvent }[],
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const s of script) {
    await new Promise((r) => setTimeout(r, reduce ? Math.min(s.wait, 120) : s.wait));
    if (signal?.aborted) return;
    onEvent(s.event);
  }
}
