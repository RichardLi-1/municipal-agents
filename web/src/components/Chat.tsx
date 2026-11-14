import { useEffect, useRef, useState } from "preact/hooks";
import type { Decision, Figure, Statement } from "../../../shared/types.ts";
import { api } from "../lib/api.ts";
import { useT } from "../lib/i18n.ts";
import { emptyRun, reduceRun, type RunState } from "../lib/run.ts";
import { announce } from "../lib/state.ts";
import { CitationChip, Statements } from "./Citations.tsx";
import { Alert, ArrowUp, Calc, Replay, Spark } from "./icons.tsx";
import { fmtDate } from "../lib/format.ts";
import { StepsPanel } from "./Steps.tsx";

interface Turn {
  id: number;
  question: string;
  run: RunState;
}

const SUGGEST: Record<string, string[]> = {
  base: ["What is being proposed, in short?", "When can I have my say, and how?"],
  cost: ["Will my property taxes go up?"],
  transit: ["Will buses get better near the station?"],
  housing: ["How many of these homes will be affordable?"],
  commitments: ["Does this help the city meet its climate target?"],
};

/** A computed figure in an answer: a chip that explains how it was worked out. */
function ComputedChip({ f }: { f: Figure }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <span class="computed">
      <button
        type="button"
        class="chip-cite chip-cite--computed"
        aria-expanded={open}
        title={f.formula ?? f.label}
        onClick={() => setOpen(!open)}
      >
        <Calc size={12} /> {t("Computed")}
      </button>
      {open ? (
        <span class="computed-pop" role="note">
          <strong>{f.display}</strong> {f.label}
          {f.formula ? <span class="computed-how">{f.formula}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Answer text with its markers turned into chips: [n] is the nth statement (its pages),
 * [Cn] the nth computed figure, and [id] a statement by id.
 */
function AnswerText({ text, statements, figures = [] }: { text: string; statements: Statement[]; figures?: Figure[] }) {
  const byId = new Map(statements.map((s) => [s.id, s]));
  const chipsFor = (s: Statement, key: number) => (
    <span key={key} class="inline-cites">
      {s.citations.map((c, j) => (
        <CitationChip key={j} c={c} />
      ))}
      {!s.verified ? <Alert size={13} class="warn-text" /> : null}
    </span>
  );
  const inline = (para: string) =>
    para.split(/(\[[^\]\s]{1,40}\])/g).map((part, i) => {
              const m = /^\[([^\]\s]+)\]$/.exec(part);
              if (!m) return part;
              const key = m[1];
              const cm = /^C(\d+)$/i.exec(key);
              if (cm) {
                const f = figures[Number(cm[1]) - 1];
                return f ? <ComputedChip key={i} f={f} /> : null;
              }
              if (/^\d+$/.test(key)) {
                const s = statements[Number(key) - 1];
                return s ? chipsFor(s, i) : null;
              }
              const s = byId.get(key);
              return s ? chipsFor(s, i) : part;
            });
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((para, pi) => {
          const lines = para.split("\n");
          const bullets = lines.filter((l) => /^\s*[•\-*]\s+/.test(l));
          if (bullets.length && bullets.length >= lines.length - 1) {
            const lead = lines.filter((l) => !/^\s*[•\-*]\s+/.test(l));
            return (
              <div key={pi}>
                {lead.length ? <p>{inline(lead.join(" "))}</p> : null}
                <ul class="answer-list">
                  {bullets.map((b, bi) => (
                    <li key={bi}>{inline(b.replace(/^\s*[•\-*]\s+/, ""))}</li>
                  ))}
                </ul>
              </div>
            );
          }
          return <p key={pi}>{inline(lines.join(" "))}</p>;
        })}
    </>
  );
}

/** Offline answers start with a line saying so; replays end with their label. Split those off. */
function answerParts(a: NonNullable<RunState["answer"]>) {
  let text = a.text.trim();
  let flag: string | null = null;
  const label = a.replay?.label;
  if (label) {
    const i = text.lastIndexOf(label);
    if (i >= 0 && i >= text.length - label.length - 2) text = text.slice(0, i).trim();
  }
  if (a.offline) {
    const m = /^(.*?can.t be reached right now.*?)(?:\n|$)/i.exec(text);
    if (m) {
      flag = m[1].trim();
      text = text.slice(m[0].length).trim();
    }
  }
  return { text, flag };
}

/** Friendly words for a failed run; the raw message stays one click away. */
function RunError({ message }: { message: string }) {
  const t = useT();
  const unreachable = /402|429|5\d\d|credit|quota|unavailable|fetch|network/i.test(message);
  return (
    <div class="run-error" role="alert">
      <p class="run-error-title">
        <Alert size={16} /> {unreachable ? t("The agents can't be reached right now") : t("Something went wrong")}
      </p>
      <p class="small muted">{t("The brief on the left is still here, with every statement checked against its page.")}</p>
      <details class="small">
        <summary>{t("Show details")}</summary>
        <code>{message}</code>
      </details>
    </div>
  );
}

export function Chat({ decision, audiences, lang }: { decision: Decision; audiences: string[]; lang: string }) {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [turns]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    const id = Date.now();
    const ctl = new AbortController();
    abort.current = ctl;
    setTurns((ts) => [...ts, { id, question: text, run: emptyRun() }]);
    const patch = (f: (r: RunState) => RunState) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, run: f(x.run) } : x)));
    try {
      await api.ask(decision.id, { question: text, audiences, lang }, (e) => {
        patch((r) => reduceRun(r, e));
        if (e.type === "answer") announce(t("Answer ready"));
      }, ctl.signal);
    } catch (err) {
      if (!ctl.signal.aborted) patch((r) => ({ ...r, error: String((err as Error).message ?? err) }));
    } finally {
      patch((r) => reduceRun(r, { type: "done" }));
      setBusy(false);
      abort.current = null;
    }
  };

  const suggestions = [
    ...SUGGEST.base.slice(0, 1),
    ...decision.lenses.flatMap((l) => SUGGEST[l === "cost" ? "cost" : l] ?? []),
    ...SUGGEST.base.slice(1),
  ].slice(0, 4);

  return (
    <section class="chat" aria-labelledby="chat-title">
      <header class="chat-head">
        <h2 id="chat-title" class="chat-title">{t("Ask about this decision")}</h2>
        <p class="chat-sub">{t("Ask in plain words, in any language. Answers cite their pages.")}</p>
      </header>
      <div class="chat-log" ref={log}>
        {turns.length === 0 ? (
          <div class="suggest">
            <span class="suggest-art" aria-hidden="true"><Spark size={22} /></span>
            <h3 class="suggest-title">{t("Some things I can do")}</h3>
            <ul role="list">
              {suggestions.map((s, i) => (
                <li key={s}>
                  <button type="button" class={`suggest-btn ${i === 0 ? "is-first" : ""}`} onClick={() => ask(t(s))}>
                    {t(s)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {turns.map((turn) => (
          <article class="turn" key={turn.id}>
            <p class="bubble-user">{turn.question}</p>
            {turn.run.steps.length || turn.run.planner || !(turn.run.done && (turn.run.answer?.offline || turn.run.error)) ? <StepsPanel run={turn.run} /> : null}
            {turn.run.answer ? (
              <div class={`answer ${turn.run.answer.offline ? "answer--offline" : ""}`} lang={lang}>
                {(() => {
                  const a = turn.run.answer!;
                  const { text, flag } = answerParts(a);
                  return (
                    <>
                      {a.offline ? (
                        <p class="answer-flag">
                          <Alert size={14} /> {flag ?? t("The agents can't be reached right now, so here is what the checked brief says.")}
                        </p>
                      ) : null}
                      <AnswerText text={text} statements={a.statements} figures={a.figures} />
                      {a.replay ? (
                        <p class="replay-chip">
                          <Replay size={13} /> {a.replay.label ?? t("Answered by the agents on {date} · replayed from the record", { date: fmtDate(a.replay.at) })}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
                {turn.run.answer.statements.length ? (
                  <details class="answer-sources">
                    <summary>
                      {t("Sources")} ({turn.run.answer.statements.length})
                    </summary>
                    <Statements list={turn.run.answer.statements} />
                  </details>
                ) : null}
              </div>
            ) : !turn.run.done && !turn.run.error ? (
              <div class="typing" aria-label={t("Thinking…")} role="status">
                <span /> <span /> <span />
              </div>
            ) : null}
            {turn.run.error && !turn.run.answer ? <RunError message={turn.run.error} /> : null}
          </article>
        ))}
      </div>
      <form
        class="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label for="chat-q" class="sr-only">
          {t("Your question")}
        </label>
        <textarea
          id="chat-q"
          enterkeyhint="send"
          ref={input}
          rows={1}
          value={q}
          placeholder={t("Your question")}
          onInput={(e) => {
            const el = e.currentTarget;
            setQ(el.value);
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 140) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              ask(q);
            }
          }}
        />
        {busy ? (
          <button type="button" class="send-btn" onClick={() => abort.current?.abort()} aria-label={t("Stop")}>
            <span class="stop-square" />
          </button>
        ) : (
          <button type="submit" class="send-btn" disabled={!q.trim()} aria-label={t("Ask")}>
            <ArrowUp size={18} />
          </button>
        )}
      </form>
      <p class="chat-note">{t("Answers explain; they never tell you what to think. Check the cited pages.")}</p>
    </section>
  );
}
