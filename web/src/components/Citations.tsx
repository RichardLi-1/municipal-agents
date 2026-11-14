import type { Citation, Figure, Statement } from "../../../shared/types.ts";
import { useT } from "../lib/i18n.ts";
import { cityStore, currentDecision, feedbackLink, openSource, sourceIndex } from "../lib/state.ts";
import { useStore } from "../lib/store.ts";
import { Alert, Check, Doc, Flag } from "./icons.tsx";
import { useState } from "preact/hooks";

export function CitationChip({ c }: { c: Citation }) {
  const t = useT();
  const idx = useStore(sourceIndex);
  const title = idx[c.sourceId]?.title ?? c.sourceId;
  return (
    <button type="button" class="chip-cite" onClick={() => openSource(c)} title={`“${c.quote}” — ${title}`}>
      <Doc size={13} />
      {t("p. {page}", { page: c.page })}
      <span class="sr-only">, {title}</span>
    </button>
  );
}

const KIND_LABEL: Partial<Record<Statement["kind"], string>> = {
  estimate: "Estimate",
  assumption: "Assumption",
  unknown: "Unknown",
  tradeoff: "Trade-off",
  harm: "Possible harm",
};

export function StatementView({ s, showKind = true }: { s: Statement; showKind?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const kind = KIND_LABEL[s.kind];
  const pages = [...new Set(s.citations.map((c) => c.page))].join(", ");
  const weak = (s as Statement & { support?: "strong" | "weak" }).support === "weak";
  const qid = `q-${s.id}`;
  return (
    <div class={`stmt ${s.verified ? "" : "stmt--unverified"}`}>
      <p>
        {showKind && kind ? <span class={`kind kind--${s.kind}`}>{t(kind)}</span> : null}
        <span class="stmt-text">{s.text}</span>{" "}
        <span class="stmt-meta">
          {s.citations.map((c, i) => (
            <CitationChip key={i} c={c} />
          ))}
          {s.verified ? (
            <span class="verified" title={t("Quote found on p. {page}", { page: pages })}>
              <Check size={13} />
              <span class="sr-only">{t("Quote found on p. {page}", { page: pages })}</span>
            </span>
          ) : (
            <span class="unverified" title={t("The quote for this statement was not found on the cited page.")}>
              <Alert size={13} />
              {t("Not verified")}
            </span>
          )}
          {weak ? (
            <span class="weak" title={t("Check: the quote may not fully support this")}>
              {t("Check: the quote may not fully support this")}
            </span>
          ) : null}
          {s.review?.action === "edited" ? <span class="edited">{t("Edited by staff")}</span> : null}
          {s.citations.length ? (
            <button type="button" class="quote-toggle" aria-expanded={open} aria-controls={qid} onClick={() => setOpen(!open)}>
              {open ? t("Hide quote") : t("Show quote")}
            </button>
          ) : null}
          <ReportLink s={s} />
        </span>
      </p>
      {open ? (
        <div class="stmt-quotes" id={qid}>
          {s.citations.map((c, i) => (
            <blockquote key={i}>
              “{c.quote}” <CitationChip c={c} />
            </blockquote>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A quiet link to report a mistake in one statement to the team that runs this site. */
function ReportLink({ s }: { s: Statement }) {
  const t = useT();
  const city = useStore(cityStore);
  const d = useStore(currentDecision);
  if (!d) return null;
  const href = feedbackLink(
    city,
    `Error report: ${d.id}/${s.id}`,
    `Decision: ${d.title} (${d.id})\nStatement ${s.id}: "${s.text}"\n\nWhat is wrong:\n`,
  );
  return (
    <a class="report-link" href={href} target="_blank" rel="noopener noreferrer" title={t("Report an error")}>
      <Flag size={12} />
      <span class="sr-only">{t("Report an error in this statement")}</span>
    </a>
  );
}

/** Public statements: rejected ones are left out. */
export function visible(list: Statement[] | undefined) {
  return (list ?? []).filter((s) => s.review?.action !== "rejected");
}

export function Statements({ list, showKind }: { list: Statement[] | undefined; showKind?: boolean }) {
  const items = visible(list);
  if (!items.length) return null;
  return (
    <ul class="stmts" role="list">
      {items.map((s) => (
        <li key={s.id}>
          <StatementView s={s} showKind={showKind} />
        </li>
      ))}
    </ul>
  );
}

/** A number on screen: a button that opens its source page (or explains how it was worked out). */
export function FigureButton({ f, big = true }: { f: Figure; big?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const idx = useStore(sourceIndex);
  if (f.citation) {
    const c = f.citation;
    return (
      <button type="button" class={`figure ${big ? "figure--big" : ""}`} onClick={() => openSource(c)}>
        <span class="figure-label">{f.label}</span>
        <span class="figure-value">{f.display}</span>
        <span class="figure-src">
          <Doc size={12} /> {t("p. {page}", { page: c.page })}
          <span class="sr-only">, {idx[c.sourceId]?.title ?? c.sourceId}</span>
        </span>
      </button>
    );
  }
  return (
    <div class={`figure figure--static ${big ? "figure--big" : ""}`}>
      <button type="button" class="figure-hit" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="figure-label">{f.label}</span>
        <span class="figure-value">{f.display}</span>
        <span class={`figure-src figure-src--${f.kind}`}>{t(f.kind === "assumption" ? "Assumption" : "Computed")}</span>
      </button>
      {open && f.formula ? <p class="figure-formula">{f.formula}</p> : null}
    </div>
  );
}
