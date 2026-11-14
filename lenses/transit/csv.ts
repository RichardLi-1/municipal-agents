// A small CSV reader for GTFS files (RFC 4180: quoted fields, doubled quotes, CRLF, BOM).

/** Parse CSV text into rows of fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let quoted = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** A parsed table: column lookup by name, rows as string arrays. */
export interface Table {
  header: string[];
  rows: string[][];
  col: (name: string) => number; // -1 when absent
}

export function parseTable(text: string): Table {
  const all = parseCsv(text);
  const header = (all[0] ?? []).map((h) => h.trim());
  const rows = all.slice(1);
  return { header, rows, col: (name: string) => header.indexOf(name) };
}

/** "25:10:00" -> seconds after the service day's noon-minus-12h. Empty -> -1. */
export function gtfsTime(s: string): number {
  if (!s) return -1;
  const parts = s.trim().split(":");
  if (parts.length < 2) return -1;
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2] ?? 0);
}

/** Seconds -> "HH:MM" (hours may exceed 24 for after-midnight service). */
export function hhmm(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "none";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
