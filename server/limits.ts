// Guards on what costs money: a per-IP sliding window for visitors, a cap on runs at
// once, and the daily spend cap read from the log. IPs live only in memory, for the
// window, and are never logged (principle 7).
import { HttpError } from "./http.ts";
import type { Log } from "./log.ts";
import { spentTodayUsd } from "./usage.ts";

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Count one use; throws 429 with a plain message when the window is full. */
  take(key: string, what = "questions", now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      const waitMin = Math.max(1, Math.ceil((this.windowMs - (now - recent[0])) / 60_000));
      this.hits.set(key, recent);
      // Plain words the web can show as they are. Everyone on a shared network (venue
      // Wi-Fi) counts as one visitor, so say so.
      const err = new HttpError(
        429,
        `Lots of ${what} have come from this network in the last ${Math.round(this.windowMs / 60_000)} minutes (everyone on a shared Wi-Fi counts together). Please wait ${waitMin} minute${waitMin === 1 ? "" : "s"} and try again.`,
      );
      (err as HttpError & { retryAfter?: number }).retryAfter = waitMin * 60;
      throw err;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Keep the map small on a long-running server.
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
  /** Give back the latest use: a run that turned out to cost nothing (an offline answer). */
  refund(key: string): void {
    const recent = this.hits.get(key);
    if (recent?.length) recent.pop();
  }

}

export class RunSlots {
  private active = 0;
  private max: number;

  constructor(max: number) {
    this.max = max;
  }

  /** Reserve a slot; returns the release function. Throws 503 when all are busy. */
  acquire(): () => void {
    if (this.active >= this.max) throw new HttpError(503, "The agents are busy with other questions. Please try again in a minute.");
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }

  get running(): number {
    return this.active;
  }
}

/** Throws 429 once today's logged spend has reached the daily limit. */
export function checkDailyCap(log: Log, limitUsd: number): void {
  const spent = spentTodayUsd(log);
  if (spent >= limitUsd) {
    throw new HttpError(
      429,
      `Today's budget for the AI agents (US$${limitUsd.toFixed(2)}) has been used. The briefs are still here to read; questions open again after midnight Toronto time.`,
    );
  }
}
