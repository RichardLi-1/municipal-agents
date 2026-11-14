import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Brief, DecisionCard, Statement } from "../../../shared/types.ts";
import { CitationChip } from "../components/Citations.tsx";
import { Alert, Check, CheckCircle, Lock, Pen, Cross, Spark } from "../components/icons.tsx";
import { StepsPanel } from "../components/Steps.tsx";
import { api } from "../lib/api.ts";
import { emptyRun, reduceRun, type RunState } from "../lib/run.ts";
import { useT } from "../lib/i18n.ts";
import { rememberSources } from "../lib/state.ts";
import { safeStorage } from "../lib/store.ts";
import { toast } from "../lib/toast.ts";
import { ErrorPane, SampleBadge } from "./common.tsx";

const session = safeStorage("session");

type Action = "approved" | "edited" | "rejected";

function sections(b: Brief): { title: string; items: Statement[] }[] {
  const out: { title: string; items: Statement[] }[] = [
    { title: "What's proposed", items: b.summary },
    { title: "Why now", items: b.whyNow },
    ...b.impacts.map((i) => ({ title: i.label, items: i.statements })),
    { title: "Have your say", items: b.haveYourSay },
    { title: "Trade-offs and possible harms", items: b.tradeoffs },
  ];
  if (b.lenses.cost) out.push({ title: "Costs", items: b.lenses.cost.statements });
  if (b.lenses.housing) out.push({ title: "Housing", items: b.lenses.housing.statements });
  if (b.lenses.commitments)
    for (const k of b.lenses.commitments.commitments) out.push({ title: `Commitments: ${k.title}`, items: k.progress });
  return out.filter((s) => s.items.length);
}

function ReviewRow({ s, decisionId, token, reviewer }: { s: Statement; decisionId: string; token: string; reviewer: string }) {
  const t = useT();
  const [state, setState] = useState<Action | null>(s.review?.action ?? null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.text);
  const [note, setNote] = useState(s.review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: Action) => {
    setBusy(true);
    setErr(null);
    try {
      await api.staff.review(token, { decisionId, statementId: s.id, action, text: action === "edited" ? text : undefined, note: note || undefined, by: reviewer || undefined });
      setState(action);
      setEditing(false);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li class={`review-row ${state ? `is-${state}` : ""} ${s.verified ? "" : "is-unverified"}`}>
      {editing ? (
        <label class="field">
          <span class="field-label">{t("Edit")}</span>
          <textarea rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        </label>
      ) : (
        <p class="review-text">{state === "edited" ? text : s.text}</p>
      )}
      <div class="review-meta">
        <span class={`kind kind--${s.kind}`}>{s.kind}</span>
        {s.citations.map((c, i) => <CitationChip key={i} c={c} />)}
        {s.verified ? (
          <span class="verified"><Check size={13} /> {t("Checked")}</span>
        ) : (
          <span class="unverified"><Alert size={13} /> {t("Not verified")}</span>
        )}
        {state ? <span class={`pill pill--${state}`}>{t(state === "approved" ? "Approve" : state === "edited" ? "Edit" : "Reject")}d</span> : null}
      </div>
      <div class="review-actions">
        <label class="field field--inline">
          <span class="sr-only">{t("Note (optional)")}</span>
          <input type="text" placeholder={t("Note (optional)")} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        {editing ? (
          <>
            <button type="button" class="btn btn-primary btn-sm" disabled={busy} onClick={() => act("edited")}>{t("Save")}</button>
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setText(s.text); }}>{t("Cancel")}</button>
          </>
        ) : (
          <>
            <button type="button" class="btn btn-ok btn-sm" disabled={busy} aria-pressed={state === "approved"} onClick={() => act("approved")}>
              <Check size={15} /> {t("Approve")}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(true)}>
              <Pen size={15} /> {t("Edit")}
            </button>
            <button type="button" class="btn btn-bad btn-sm" disabled={busy} aria-pressed={state === "rejected"} onClick={() => act("rejected")}>
              <Cross size={15} /> {t("Reject")}
            </button>
          </>
        )}
      </div>
      {err ? <p class="error-text small" role="alert">{err}</p> : null}
    </li>
  );
}

export function StaffScreen() {
  const t = useT();
  const [token, setToken] = useState<string | null>(session.get("ma-staff-token"));
  const [pass, setPass] = useState("");
  const [signErr, setSignErr] = useState<string | null>(null);
  const [cards, setCards] = useState<DecisionCard[] | null>(null);
  const [decisionId, setDecisionId] = useState<string>("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [reviewer, setReviewer] = useState(session.get("ma-reviewer") ?? "");
  const [published, setPublished] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    document.title = "Staff review · Municipal Agents";
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!token) return;
    api.decisions().then((cs) => {
      setCards(cs);
      if (!decisionId && cs[0]) setDecisionId(cs[0].id);
    }).catch((e) => setErr(String(e.message)));
  }, [token]);
  useEffect(() => {
    if (!decisionId) return;
    setBrief(null);
    setRun(null);
    setPublished(null);
    api.decision(decisionId).then((d) => {
      rememberSources(d.sources);
      setBrief(d.brief ?? null);
    }).catch(() => {});
  }, [decisionId]);

  const signIn = async (e: Event) => {
    e.preventDefault();
    setSignErr(null);
    const ok = await api.staff.check(pass).catch(() => false);
    if (!ok) {
      setSignErr(t("That passcode was not accepted."));
      return;
    }
    session.set("ma-staff-token", pass);
    setToken(pass);
  };

  const draft = async () => {
    if (!token || !decisionId) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setRun(emptyRun());
    setPublished(null);
    try {
      await api.staff.draft(token, decisionId, reviewer, (ev) => {
        setRun((r) => reduceRun(r ?? emptyRun(), ev));
        if (ev.type === "brief") {
          setBrief(ev.brief);
          toast({ title: t("Draft ready for review"), body: t("Approve, edit or reject each statement, then publish."), tone: "ok" });
        }
      }, ctl.signal);
    } catch (e) {
      setRun((r) => ({ ...(r ?? emptyRun()), error: String((e as Error).message) }));
    } finally {
      setRun((r) => reduceRun(r ?? emptyRun(), { type: "done" }));
    }
  };

  const upload = async (e: Event) => {
    e.preventDefault();
    if (!token) return;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    if (reviewer) form.set("reviewer", reviewer);
    const ctl = new AbortController();
    abort.current = ctl;
    setRun(emptyRun());
    setPublished(null);
    setBrief(null);
    try {
      await api.staff.upload(token, form, (ev) => {
        setRun((r) => reduceRun(r ?? emptyRun(), ev));
        if (ev.type === "brief") {
          setBrief(ev.brief);
          api.decisions().then((cs) => {
            setCards(cs);
            setDecisionId(ev.brief.decisionId);
          });
          toast({ title: t("Draft ready for review"), body: t("Approve, edit or reject each statement, then publish."), tone: "ok" });
        }
      }, ctl.signal);
    } catch (err) {
      setRun((r) => ({ ...(r ?? emptyRun()), error: String((err as Error).message) }));
    } finally {
      setRun((r) => reduceRun(r ?? emptyRun(), { type: "done" }));
    }
  };

  const publish = async () => {
    if (!token || !reviewer.trim()) return;
    session.set("ma-reviewer", reviewer);
    try {
      await api.staff.publish(token, { decisionId, reviewer: reviewer.trim() });
      setPublished(reviewer.trim());
      toast({ title: t("Published"), body: reviewer.trim(), tone: "ok" });
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const secs = useMemo(() => (brief ? sections(brief) : []), [brief]);
  const count = secs.reduce((a, s) => a + s.items.length, 0);
  const unverified = secs.reduce((a, s) => a + s.items.filter((x) => !x.verified).length, 0);

  if (!token)
    return (
      <div class="page page--narrow">
        <header class="page-head">
          <p class="eyebrow"><Lock size={14} /> {t("Staff")}</p>
          <h1 class="plain-title" tabIndex={-1}>{t("Staff review")}</h1>
          <p class="lede">{t("Agents draft. Staff approve every statement before it's published.")}</p>
        </header>
        <form class="card form" onSubmit={signIn}>
          <label class="field">
            <span class="field-label">{t("Staff passcode")}</span>
            <input type="password" autocomplete="current-password" value={pass} onInput={(e) => setPass(e.currentTarget.value)} required aria-describedby={signErr ? "sign-err" : undefined} />
          </label>
          {signErr ? <p id="sign-err" class="error-text small" role="alert">{signErr}</p> : null}
          <button class="btn btn-primary" type="submit">{t("Sign in")}</button>
        </form>
      </div>
    );

  return (
    <div class="page">
      <header class="page-head">
        <div class="row-between">
          <p class="eyebrow"><Lock size={14} /> {t("Staff")}</p>
          <div class="row-gap">
            <SampleBadge />
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => { session.set("ma-staff-token", null); setToken(null); }}>{t("Sign out")}</button>
          </div>
        </div>
        <h1 class="plain-title" tabIndex={-1}>{t("Staff review")}</h1>
      </header>
      {err ? <ErrorPane message={err} /> : null}
      <section class="card staff-controls">
        <label class="field">
          <span class="field-label">{t("Your name")}</span>
          <input type="text" autocomplete="name" value={reviewer} onInput={(e) => setReviewer(e.currentTarget.value)} />
        </label>
        <label class="field grow">
          <span class="field-label">{t("Decision")}</span>
          <select value={decisionId} onChange={(e) => setDecisionId(e.currentTarget.value)}>
            {(cards ?? []).map((c) => <option key={c.id} value={c.id}>{c.plainTitle}</option>)}
          </select>
        </label>
        <button type="button" class="btn btn-primary" onClick={draft} disabled={!decisionId || (run !== null && !run.done)}>
          <Spark size={17} /> {t("Draft brief with agents")}
        </button>
      </section>
      <details class="card staff-upload">
        <summary>{t("Or upload a PDF and draft a new brief")}</summary>
        <form class="upload-form" onSubmit={upload}>
          <label class="field">
            <span class="field-label">{t("PDF file")}</span>
            <input type="file" name="file" accept="application/pdf" required />
          </label>
          <label class="field">
            <span class="field-label">{t("Document title")}</span>
            <input type="text" name="title" />
          </label>
          <label class="field">
            <span class="field-label">{t("Who decides")}</span>
            <input type="text" name="decidedBy" placeholder="Kitchener City Council" />
          </label>
          <button class="btn btn-primary" type="submit" disabled={run !== null && !run.done}>
            {t("Upload and draft")}
          </button>
        </form>
      </details>
      {run ? (
        <section class="staff-run">
          <StepsPanel run={run} collapseWhenDone={false} />
          {run.usage ? (
            <p class="small muted">
              {run.usage.calls} calls · {(run.usage.inputTokens + run.usage.outputTokens).toLocaleString()} tokens · US${run.usage.costUsd.toFixed(2)}
            </p>
          ) : null}
          {run.error ? <p class="error-text" role="alert">{run.error}</p> : null}
        </section>
      ) : null}
      {brief ? (
        <section class="review">
          <div class="row-between">
            <h2 class="section-title">{t("Statements to review")} <span class="muted">({count})</span></h2>
            <span class="small">
              {unverified ? <span class="warn-text"><Alert size={14} /> {unverified} {t("Not verified").toLowerCase()}</span> : <span class="ok-text"><CheckCircle size={14} /> {t("All quotes checked")}</span>}
            </span>
          </div>
          {secs.map((sec) => (
            <div key={sec.title} class="review-sec">
              <h3 class="eyebrow">{sec.title}</h3>
              <ul role="list" class="review-list">
                {sec.items.map((s) => <ReviewRow key={`${brief.generatedAt}-${s.id}`} s={s} decisionId={decisionId} token={token} reviewer={reviewer} />)}
              </ul>
            </div>
          ))}
          <div class="card publish">
            <p class="grow">
              {reviewer.trim() ? t("Publishing as {name}", { name: reviewer.trim() }) : t("Type your name above to publish.")}
            </p>
            <button type="button" class="btn btn-primary" disabled={!reviewer.trim()} onClick={publish}>
              {t("Publish")}
            </button>
            {published ? <p class="ok-text" role="status"><CheckCircle size={16} /> {t("Published")} · {published}</p> : null}
          </div>
        </section>
      ) : !run ? (
        <p class="empty-hint">{t("No brief yet")}. {t("Draft brief with agents")}.</p>
      ) : null}
    </div>
  );
}
