// "Add to calendar": the decision's upcoming chances to take part as an iCalendar file
// (RFC 5545). Times are written in UTC so no VTIMEZONE block is needed; date-only
// events become all-day events. Each participation deadline that falls before its
// meeting gets its own short event, because that's the date residents miss.
import type { Decision, Participation, TimelineEvent } from "../shared/types.ts";
import { isDateOnly, startMs, torontoDay, TZ, upcomingParticipation } from "./time.ts";

const CRLF = "\r\n";

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold a content line to at most 75 octets per line, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const max = out.length === 0 ? 75 : 74; // continuation lines start with one space
    if (bytes + n > max) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join(CRLF + " ");
}

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateValue(day: string): string {
  return day.replace(/-/g, "");
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** DTSTART/DTEND lines for a start and optional end. Timed events default to an hour. */
function timing(start: string, end?: string, defaultMinutes = 60): string[] {
  if (isDateOnly(start)) {
    // A date-time end on an all-day start: run the all-day event to that local day.
    const last = end ? (isDateOnly(end) ? end : torontoDay(new Date(Date.parse(end)))) : start;
    return [`DTSTART;VALUE=DATE:${dateValue(start)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(last))}`];
  }
  const s = startMs(start);
  const e = end && !isDateOnly(end) ? Date.parse(end) : s + defaultMinutes * 60_000;
  return [`DTSTART:${utcStamp(s)}`, `DTEND:${utcStamp(Math.max(e, s))}`];
}

const METHOD_LABEL: Record<Participation["method"], string> = {
  speak: "Speak",
  write: "Write",
  survey: "Survey",
  attend: "Attend",
  watch: "Watch",
  "contact-councillor": "Contact your councillor",
};

export function localWhen(iso: string): string {
  if (isDateOnly(iso)) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function describe(decision: Decision, e: TimelineEvent): string {
  const lines = [e.plain, "", "How to take part:"];
  for (const p of e.participation ?? []) {
    let line = `- ${METHOD_LABEL[p.method] ?? p.method}: ${p.instructions}`;
    if (p.deadline) line += ` (by ${localWhen(p.deadline)})`;
    lines.push(line);
    if (p.url) lines.push(`  ${p.url}`);
    if (p.contact) lines.push(`  Contact: ${p.contact}`);
  }
  lines.push("", `About: ${decision.plainTitle}`, `Not the official notice. Official notice: ${decision.officialUrl}`);
  return lines.join("\n");
}

export function decisionCalendar(decision: Decision, opts: { now?: number; siteUrl?: string } = {}): string {
  const now = opts.now ?? Date.now();
  const stamp = utcStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Municipal Agents//Have your say//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(decision.plainTitle)}`,
    `X-WR-TIMEZONE:${TZ}`,
  ];
  const page = opts.siteUrl ? `${opts.siteUrl.replace(/\/$/, "")}/d/${decision.id}` : undefined;

  for (const e of upcomingParticipation(decision, now)) {
    const url = e.participation?.find((p) => p.url)?.url ?? decision.officialUrl;
    // Something already open (a survey running for weeks) goes in on its closing day:
    // a calendar entry in the past would never remind anyone.
    const open = startMs(e.date) < now && !!e.end;
    const when = open ? timing(isDateOnly(e.end!) ? e.end! : torontoDay(new Date(Date.parse(e.end!)))) : timing(e.date, e.end);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${decision.id}.${e.id}@municipal-agents`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${escapeText(`${open ? "Last day: " : ""}${e.title}: ${decision.plainTitle}`)}`,
      `DESCRIPTION:${escapeText(describe(decision, e) + (page ? `\nBrief: ${page}` : ""))}`,
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      ...(url ? [`URL:${url}`] : []),
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.title)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );

    // A separate reminder for each deadline that comes before the meeting itself.
    (e.participation ?? []).forEach((p, i) => {
      if (!p.deadline || startMs(p.deadline) >= startMs(e.date) || startMs(p.deadline) < now) return;
      const start = isDateOnly(p.deadline) ? p.deadline : new Date(startMs(p.deadline) - 30 * 60_000).toISOString();
      lines.push(
        "BEGIN:VEVENT",
        `UID:${decision.id}.${e.id}.deadline-${i}@municipal-agents`,
        `DTSTAMP:${stamp}`,
        ...timing(start, isDateOnly(p.deadline) ? undefined : p.deadline),
        `SUMMARY:${escapeText(`Deadline to ${METHOD_LABEL[p.method]?.toLowerCase() ?? p.method}: ${e.title}`)}`,
        `DESCRIPTION:${escapeText(`${p.instructions}\n${p.url ?? ""}\n\n${describe(decision, e)}`)}`,
        ...(p.url ? [`URL:${p.url}`] : []),
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    });
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
