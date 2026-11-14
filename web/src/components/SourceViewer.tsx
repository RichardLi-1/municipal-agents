import { useEffect, useRef, useState } from "preact/hooks";
import { api, liveAvailable } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { sourceIndex, sourceView, type SourceRequest } from "../lib/state.ts";
import { useStore } from "../lib/store.ts";
import { fmtDate } from "../lib/format.ts";
import { ChevronLeft, ChevronRight, Cross, External, Check, Alert } from "./icons.tsx";

type PdfLib = typeof import("pdfjs-dist");
let pdfLib: Promise<PdfLib> | null = null;
function loadPdf(): Promise<PdfLib> {
  pdfLib ??= (async () => {
    const lib = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return pdfLib;
}

/**
 * Matching that survives what PDFs do to text: curly quotes, dashes, ligatures, soft and
 * line-end hyphens, spacing. Both sides keep only letters and digits, lowercased, and we
 * remember where each kept character came from.
 */
function keep(raw: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = raw[i].normalize("NFKC").toLowerCase();
    for (const ch of n) {
      if (/[\p{L}\p{N}]/u.test(ch)) {
        text += ch;
        at.push(i);
      }
    }
  }
  return { text, at };
}

/** Where the quote is in the kept text, allowing a shorter leading match when the end differs. */
function findKept(hay: string, quote: string): [number, number] | null {
  const q = keep(quote).text;
  if (q.length < 4) return null;
  let i = hay.indexOf(q);
  if (i >= 0) return [i, i + q.length];
  for (let n = Math.floor(q.length * 0.85); n >= Math.max(16, Math.floor(q.length * 0.5)); n = Math.floor(n * 0.85)) {
    i = hay.indexOf(q.slice(0, n));
    if (i >= 0) return [i, i + n];
  }
  return null;
}

/** Which text-layer pieces the quote covers. */
function locate(pieces: string[], quote: string): number[] {
  let all = "";
  const owner: number[] = [];
  pieces.forEach((p, i) => {
    const k = keep(p).text;
    all += k;
    for (let j = 0; j < k.length; j++) owner.push(i);
  });
  const hit = findKept(all, quote);
  if (!hit) return [];
  return [...new Set(owner.slice(hit[0], hit[1]))];
}

/** True when the quote is somewhere in this text. */
export function quoteIn(text: string, quote: string) {
  return !!findKept(keep(text).text, quote);
}

function highlightText(text: string, quote?: string) {
  if (!quote) return [text];
  const k = keep(text);
  const hit = findKept(k.text, quote);
  if (!hit) return [text];
  const a = k.at[hit[0]];
  const b = k.at[hit[1] - 1] + 1;
  return [text.slice(0, a), <mark class="quote-mark">{text.slice(a, b)}</mark>, text.slice(b)];
}

export function SourceViewer() {
  const req = useStore(sourceView);
  if (!req) return null;
  return <Viewer req={req} key={`${req.sourceId}-${req.page}-${req.quote}`} />;
}

function Viewer({ req }: { req: SourceRequest }) {
  const t = useT();
  const idx = useStore(sourceIndex);
  const doc = idx[req.sourceId];
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(req.page);
  const [total, setTotal] = useState<number | null>(doc?.pages ?? null);
  const [mode, setMode] = useState<"loading" | "pdf" | "text" | "error">("loading");
  const [text, setText] = useState("");
  const [found, setFound] = useState<boolean | "unhighlighted" | null>(null);
  const pdfDoc = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const quote = page === req.page ? req.quote : undefined;

  const close = () => {
    sourceView.set(null);
    const back = req.returnFocus;
    if (back && document.contains(back)) setTimeout(() => back.focus(), 0);
  };

  // Focus in, trap Tab, Esc to close.
  useEffect(() => {
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab" && dialog.current) {
        const f = [...dialog.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),[tabindex='0']")].filter(
          (x) => x.offsetParent !== null,
        );
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "ArrowRight" && e.altKey) setPage((p) => Math.min(total ?? p + 1, p + 1));
      else if (e.key === "ArrowLeft" && e.altKey) setPage((p) => Math.max(1, p - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Load the PDF once.
  useEffect(() => {
    let dead = false;
    (async () => {
      const live = await liveAvailable();
      if (!live) {
        if (!dead) setMode("text");
        return;
      }
      try {
        const lib = await loadPdf();
        const d = await lib.getDocument({ url: api.pdfUrl(req.sourceId) }).promise;
        if (dead) return;
        pdfDoc.current = d;
        setTotal(d.numPages);
        setMode("pdf");
      } catch {
        if (!dead) setMode("text");
      }
    })();
    return () => {
      dead = true;
      pdfDoc.current?.destroy();
    };
  }, []);

  // Render the current page.
  useEffect(() => {
    let dead = false;
    setFound(null);
    if (mode === "text") {
      api
        .pageText(req.sourceId, page)
        .then((s) => {
          if (dead) return;
          setText(s);
          if (quote) setFound(quoteIn(s, quote));
          requestAnimationFrame(() => stage.current?.querySelector("mark")?.scrollIntoView({ block: "center" }));
        })
        .catch(() => !dead && setMode("error"));
    }
    if (mode !== "pdf" || !pdfDoc.current || !stage.current) return;
    const host = stage.current;
    let task: { cancel(): void } | null = null;
    (async () => {
      const lib = await loadPdf();
      const p = await pdfDoc.current!.getPage(page);
      if (dead) return;
      const base = p.getViewport({ scale: 1 });
      const width = Math.min(host.clientWidth - 32, 900);
      const scale = width / base.width;
      const vp = p.getViewport({ scale });
      const dpr = Math.min(devicePixelRatio || 1, 2);
      host.innerHTML = "";
      const sheet = document.createElement("div");
      sheet.className = "pdf-sheet";
      sheet.style.width = `${vp.width}px`;
      sheet.style.height = `${vp.height}px`;
      sheet.style.setProperty("--total-scale-factor", String(scale));
      sheet.style.setProperty("--scale-factor", String(scale));
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      canvas.setAttribute("aria-hidden", "true");
      const layer = document.createElement("div");
      layer.className = "textLayer";
      sheet.append(canvas, layer);
      host.append(sheet);
      const r = p.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = r;
      await r.promise;
      if (dead) return;
      const content = await p.getTextContent();
      const tl = new lib.TextLayer({ textContentSource: content, container: layer, viewport: vp });
      await tl.render();
      if (dead) return;
      const spans = tl.textDivs as HTMLElement[];
      const strs = tl.textContentItemsStr as string[];
      if (quote) {
        const hits = locate(strs, quote);
        hits.forEach((i) => spans[i]?.classList.add("quote-hit"));
        if (hits.length) setFound(true);
        else {
          // Not in the text layer: is it on the page's own text? Then say so plainly.
          const pageText = await api.pageText(req.sourceId, page).catch(() => "");
          if (!dead) setFound(quoteIn(pageText || strs.join(" "), quote) ? "unhighlighted" : false);
        }
        const firstHit = spans[hits[0]];
        if (firstHit) firstHit.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    })().catch(() => {
      if (!dead) setMode("text");
    });
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [mode, page]);

  const title = doc?.title ?? req.sourceId;

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-title" ref={dialog}>
        <header class="viewer-head">
          <div class="viewer-titles">
            <p class="eyebrow">{t("Source page")}</p>
            <h2 id="viewer-title">{title}</h2>
            {doc ? (
              <p class="muted small">
                {doc.publisher} · {t("Published {date}", { date: fmtDate(doc.published) })}
              </p>
            ) : null}
          </div>
          <button type="button" class="icon-btn" ref={closeBtn} onClick={close} aria-label={t("Close")}>
            <Cross />
          </button>
        </header>
        {quote ? (
          <div class={`viewer-quote ${found === false ? "is-missing" : ""}`}>
            <blockquote>“{quote}”</blockquote>
            <p class="small" role="status">
              {found === null ? t("Loading…") : found === "unhighlighted" ? (
                <span class="ok-text"><Check size={14} /> {t("The quote is on this page; we couldn't highlight it.")}</span>
              ) : found ? (
                <span class="ok-text"><Check size={14} /> {t("Quote found and highlighted.")}</span>
              ) : (
                <span class="warn-text"><Alert size={14} /> {t("Quote not found on this page.")}</span>
              )}
              {mode === "text" ? <span class="muted"> {t("Showing the page's text.")}</span> : null}
            </p>
          </div>
        ) : null}
        <div class="viewer-stage" ref={stage} tabIndex={0} aria-label={t("Page {n} of {total}", { n: page, total: total ?? "?" })}>
          {mode === "loading" ? <div class="viewer-loading"><span class="spinner" /> {t("Loading…")}</div> : null}
          {mode === "text" ? (
            <article class="text-sheet" lang="en">
              {text.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{highlightText(para, quote)}</p>
              ))}
            </article>
          ) : null}
          {mode === "error" ? <p class="viewer-loading">{t("Something went wrong")}</p> : null}
        </div>
        <footer class="viewer-foot">
          <div class="pager">
            <button type="button" class="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("Previous page")}>
              <ChevronLeft />
            </button>
            <span class="pager-label" aria-live="polite">{t("Page {n} of {total}", { n: page, total: total ?? "?" })}</span>
            <button type="button" class="btn btn-ghost" disabled={total !== null && page >= total} onClick={() => setPage(page + 1)} aria-label={t("Next page")}>
              <ChevronRight />
            </button>
          </div>
          {doc?.url ? (
            <a class="btn btn-secondary" href={doc.url} target="_blank" rel="noopener noreferrer">
              {t("Open original")} <External size={16} />
            </a>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
