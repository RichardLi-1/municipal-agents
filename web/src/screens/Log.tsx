import { useEffect, useMemo, useState } from "preact/hooks";
import type { LogEntry } from "../../../shared/types.ts";
import { CheckCircle, Alert, Lock } from "../components/icons.tsx";
import { api } from "../lib/api.ts";
import { fmtDate, fmtDateTime, fmtNumber } from "../lib/format.ts";

const purgedOf = (e: LogEntry) => (e as LogEntry & { purged?: { at: string; reason: string; bySeq: number } }).purged;
import { verifyChain, type ChainResult } from "../lib/hash.ts";
import { useT } from "../lib/i18n.ts";
import { ErrorPane, SampleBadge } from "./common.tsx";

const KIND_LABEL: Record<string, string> = {
  "record.purged": "Content purged",
  "record.migrated": "Record upgraded to purgeable content",
};

function summary(e: LogEntry): string {
  const p = e.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return p === null || p === undefined ? "" : String(p);
  if (typeof p.question === "string") return `“${p.question}”`;
  if (typeof p.reason === "string") return p.reason;
  return Object.entries(p)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function LogScreen() {
  const t = useT();
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [kind, setKind] = useState("");
  const [dec, setDec] = useState("");
  const [q, setQ] = useState("");

  const load = () => {
    setError(null);
    api
      .log()
      .then(async (es) => {
        setEntries(es);
        setChain(await verifyChain(es));
      })
      .catch((e) => setError(String(e.message ?? e)));
  };
  useEffect(() => {
    document.title = "The record · Municipal Agents";
    load();
  }, []);

  const kinds = useMemo(() => [...new Set(entries?.map((e) => e.kind) ?? [])].sort(), [entries]);
  const decisions = useMemo(() => [...new Set(entries?.map((e) => e.decisionId).filter(Boolean) as string[])].sort(), [entries]);
  const shown = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => (!kind || e.kind === kind) && (!dec || e.decisionId === dec))
        .filter((e) => !q || `${e.actor} ${e.kind} ${JSON.stringify(e.payload ?? "")}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.seq - a.seq),
    [entries, kind, dec, q],
  );

  return (
    <div class="page">
      <header class="page-head">
        <div class="row-between">
          <p class="eyebrow">Municipal Agents</p>
          <SampleBadge />
        </div>
        <h1 class="plain-title" tabIndex={-1}>{t("The record")}</h1>
        <p class="lede">
          {t("Every brief, check, question, answer, approval and spend, in order. Each entry's fingerprint covers the one before it, so a quiet edit breaks the chain.")}
        </p>
      </header>
      {error ? <ErrorPane message={error} onRetry={load} /> : null}
      {entries ? (
        <div class={`chain-banner ${chain === null ? "" : chain.ok ? "is-ok" : "is-bad"}`} role="status">
          {chain === null ? (
            <><span class="spinner spinner--sm" aria-hidden="true" /> {t("Checking the chain…")}</>
          ) : chain.ok ? (
            <><CheckCircle size={22} /> <strong>{t("Chain intact: {n} entries", { n: fmtNumber(chain.count) })}</strong> <span class="muted small">SHA-256 · {t("checked in your browser")}</span></>
          ) : (
            <><Alert size={22} /> <strong>{t("Chain broken at entry {n}", { n: chain.brokenSeq })}</strong> <span class="small">{chain.reason}</span></>
          )}
        </div>
      ) : null}
      <div class="filters">
        <label>
          <span class="field-label">{t("Filter by kind")}</span>
          <select value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
            <option value="">{t("All kinds")}</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          <span class="field-label">{t("Filter by decision")}</span>
          <select value={dec} onChange={(e) => setDec(e.currentTarget.value)}>
            <option value="">{t("All decisions")}</option>
            {decisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label class="grow">
          <span class="field-label">{t("Search")}</span>
          <input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
      </div>
      {entries ? (
        <ol class="log" role="list">
          {shown.map((e) => (
            <li key={e.seq} class={`log-row ${chain && !chain.ok && chain.brokenSeq === e.seq ? "is-broken" : ""}`}>
              <span class="log-seq">#{e.seq}</span>
              <div class="log-main">
                <p class="log-top">
                  <span class={`kind-pill kind-pill--${e.kind.split(".")[0]}`}>{e.kind}</span>
                  {KIND_LABEL[e.kind] ? <span class="small muted">{t(KIND_LABEL[e.kind])}</span> : null}
                  <span class="log-actor">{e.actor}</span>
                  {e.decisionId ? <span class="muted small">{e.decisionId}</span> : null}
                </p>
                {purgedOf(e) || e.payload === null ? (
                  <p class="log-sum log-purged">
                    {purgedOf(e)
                      ? t("Content purged under retention by-law on {date}: {reason}", { date: fmtDate(purgedOf(e)!.at), reason: purgedOf(e)!.reason })
                      : t("Content purged under retention by-law")}
                  </p>
                ) : (
                  <p class="log-sum">{summary(e)}</p>
                )}
                <details class="log-more">
                  <summary>{t("Show details")}</summary>
                  {purgedOf(e) || e.payload === null ? null : <pre>{JSON.stringify(e.payload, null, 2)}</pre>}
                  {(e as LogEntry & { payloadHash?: string }).payloadHash ? (
                    <p class="hash">payload sha256 {(e as LogEntry & { payloadHash?: string }).payloadHash!.slice(0, 16)}…</p>
                  ) : null}
                  <p class="hash"><Lock size={12} /> prev {e.prevHash.slice(0, 16)}… → {e.hash.slice(0, 16)}…</p>
                </details>
              </div>
              <time class="log-time small muted" dateTime={e.at}>{fmtDateTime(e.at)}</time>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p class="muted"><span class="spinner spinner--sm" aria-hidden="true" /> {t("Loading…")}</p>
      ) : null}
    </div>
  );
}
