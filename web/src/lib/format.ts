import { chromeLang } from "./i18n.ts";

const loc = () => (chromeLang() === "fr" ? "fr-CA" : "en-CA");

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Dates without a time are calendar days: show them as such.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleDateString(loc(), dateOnly ? { ...opts, timeZone: "UTC" } : { ...opts, timeZone: "America/Toronto" });
}

export function fmtDateTime(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fmtDate(iso, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(loc(), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** When an event is: date-only values count as the end of that day for deadlines. */
export function when(iso: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(iso + "T23:59:00-05:00").getTime();
  return new Date(iso).getTime();
}

/** "9 days", "5 hours", "today". */
export function countdown(iso: string, now = Date.now()): { text: string; ms: number; past: boolean } {
  const ms = when(iso) - now;
  const past = ms < 0;
  const abs = Math.abs(ms);
  const nf = new Intl.NumberFormat(loc());
  const unit = (n: number, u: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(loc(), { style: "unit", unit: u, unitDisplay: "long" }).format(n);
  let text: string;
  if (abs >= 86_400_000 * 2) text = unit(Math.round(abs / 86_400_000), "day");
  else if (abs >= 3_600_000) text = unit(Math.round(abs / 3_600_000), "hour");
  else text = unit(Math.max(1, Math.round(abs / 60_000)), "minute");
  void nf;
  return { text, ms, past };
}

export function fmtNumber(n: number, digits = 0) {
  return new Intl.NumberFormat(loc(), { maximumFractionDigits: digits }).format(n);
}

/** $86 million, $1.2 million, $840,000, $1,796 */
export function fmtMoney(n: number, opts: { compact?: boolean; currency?: string } = {}) {
  const currency = opts.currency ?? "CAD";
  const abs = Math.abs(n);
  const sym = currency === "USD" ? "US$" : "$";
  if (opts.compact !== false && abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const s = new Intl.NumberFormat(loc(), { maximumFractionDigits: m >= 100 ? 0 : 1 }).format(m);
    const word = chromeLang() === "fr" ? " M" : " million";
    return chromeLang() === "fr" ? `${n < 0 ? "-" : ""}${s}${word} ${sym}` : `${n < 0 ? "-" : ""}${sym}${s}${word}`;
  }
  const s = new Intl.NumberFormat(loc(), { maximumFractionDigits: abs < 10 ? 2 : 0 }).format(abs);
  return chromeLang() === "fr" ? `${n < 0 ? "-" : ""}${s} ${sym}` : `${n < 0 ? "-" : ""}${sym}${s}`;
}

export function fmtCompact(n: number) {
  return new Intl.NumberFormat(loc(), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtPct(share: number) {
  return new Intl.NumberFormat(loc(), { style: "percent", maximumFractionDigits: 0 }).format(share);
}

/** The moment to count down to for a chance to take part: a future deadline, else the start, else the end. */
export function targetOf(e: { date: string; end?: string; participation?: { deadline?: string }[] }, now = Date.now()): string {
  const dl = (e.participation ?? []).map((p) => p.deadline).filter((d): d is string => !!d && when(d) > now).sort((a, b) => when(a) - when(b))[0];
  if (dl) return dl;
  if (when(e.date) > now) return e.date;
  return e.end ?? e.date;
}
