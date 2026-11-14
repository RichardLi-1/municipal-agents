// Dates in the data are ISO dates ("2026-11-25") or date-times with an offset. A
// date-only event counts as lasting all day in Toronto, so a meeting dated today is
// still "upcoming" until midnight local time.
import type { Decision, TimelineEvent } from "../shared/types.ts";

export const TZ = "America/Toronto";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(iso: string): boolean {
  return DATE_ONLY.test(iso);
}

/** "-05:00" or "-04:00": Toronto's UTC offset on that calendar day. */
export function torontoOffset(day: string): string {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(noonUtc)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-05:00"
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-05:00";
}

/** The instant an ISO value starts at (date-only: local midnight). NaN if unparseable. */
export function startMs(iso: string): number {
  if (isDateOnly(iso)) return Date.parse(`${iso}T00:00:00${torontoOffset(iso)}`);
  return Date.parse(iso);
}

/** The instant an ISO value ends at (date-only: the end of that local day). */
export function endMs(iso: string): number {
  if (isDateOnly(iso)) return Date.parse(`${iso}T23:59:59${torontoOffset(iso)}`);
  return Date.parse(iso);
}

/** Today's date in Toronto, "2026-11-14": the day the spend cap resets on. */
export function torontoDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function hasParticipation(e: TimelineEvent): boolean {
  return Array.isArray(e.participation) && e.participation.length > 0;
}

/** Events with a way to take part that haven't finished yet, soonest first. */
export function upcomingParticipation(decision: Decision, now = Date.now()): TimelineEvent[] {
  return (decision.timeline ?? [])
    .filter((e) => hasParticipation(e) && endMs(e.end ?? e.date) >= now)
    .sort((a, b) => startMs(a.date) - startMs(b.date));
}

export function nextParticipation(decision: Decision, now = Date.now()): TimelineEvent | undefined {
  return upcomingParticipation(decision, now)[0];
}
