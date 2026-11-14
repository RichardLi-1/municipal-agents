import type { Decision } from "../../../shared/types.ts";

/** A calendar file built in the browser (sample mode only; the service makes the real one). */
export function icsFor(d: Decision): string {
  const stamp = (iso: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.replaceAll("-", "");
    return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Municipal Agents//EN", "CALSCALE:GREGORIAN"];
  for (const t of d.timeline) {
    if (new Date(t.date).getTime() < Date.now()) continue;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(t.date);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.id}-${t.id}@municipal-agents`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      dateOnly ? `DTSTART;VALUE=DATE:${stamp(t.date)}` : `DTSTART:${stamp(t.date)}`,
      `SUMMARY:${esc(`${t.title}: ${d.plainTitle}`)}`,
      `DESCRIPTION:${esc(t.plain + "\n" + d.officialUrl)}`,
      ...(t.location ? [`LOCATION:${esc(t.location)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
