import { useState } from "preact/hooks";
import type { AudienceId, Brief, Decision, DecisionDetail, Participation, TimelineEvent } from "../../../shared/types.ts";
import { CitationChip, FigureButton, Statements, StatementView, visible } from "../components/Citations.tsx";
import { Calendar, Check, Clipboard, Doc, External, Mic, Pen, People, Person, Play, Alert } from "../components/icons.tsx";
import { api, sampleMode } from "../lib/api.ts";
import { countdown, fmtDate, fmtDateTime, targetOf, when } from "../lib/format.ts";
import { icsFor } from "../lib/ics.ts";
import { useT } from "../lib/i18n.ts";
import { openSource } from "../lib/state.ts";
import { useStore } from "../lib/store.ts";
import { toast } from "../lib/toast.ts";

export function Overview({ brief }: { decision: Decision; brief: Brief }) {
  const t = useT();
  return (
    <div class="tab-body">
      <section>
        <h2 class="section-title">{t("What's proposed")}</h2>
        <Statements list={brief.summary} />
      </section>
      {brief.figures.length ? (
        <section>
          <h2 class="section-title">{t("Key figures")}</h2>
          <div class="figures">
            {brief.figures.map((f) => (
              <FigureButton key={f.id} f={f} />
            ))}
          </div>
        </section>
      ) : null}
      {visible(brief.whyNow).length ? (
        <section>
          <h2 class="section-title">{t("Why now")}</h2>
          <Statements list={brief.whyNow} />
        </section>
      ) : null}
      {brief.glossary.length ? (
        <section>
          <h2 class="section-title">{t("Words to know")}</h2>
          <dl class="glossary">
            {brief.glossary.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.plain}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

const AUDIENCES: { id: AudienceId; label: string }[] = [
  { id: "renter", label: "I rent" },
  { id: "homeowner", label: "I own my home" },
  { id: "transit-rider", label: "I ride transit" },
  { id: "driver", label: "I drive" },
  { id: "walk-cycle", label: "I walk or cycle" },
  { id: "business-owner", label: "I run a business" },
  { id: "senior", label: "I'm a senior" },
  { id: "student", label: "I'm a student" },
  { id: "parent", label: "I'm a parent" },
  { id: "disability", label: "I have a disability" },
  { id: "newcomer", label: "I'm new to Canada" },
];

export function Affects({ brief, audiences, setAudiences }: { brief: Brief; audiences: string[]; setAudiences: (a: string[]) => void }) {
  const t = useT();
  const toggle = (id: string) => setAudiences(audiences.includes(id) ? audiences.filter((a) => a !== id) : [...audiences, id]);
  const chosen = AUDIENCES.filter((a) => audiences.includes(a.id));
  const has = (id: string) => brief.impacts.some((i) => i.audience === id && visible(i.statements).length);
  // What applies to everyone: impacts with no listed audience, and the summary's money figures (taxes, water and sewer rates, fees).
  const known = new Set<string>(AUDIENCES.map((a) => a.id));
  const everyone = [
    ...brief.impacts.filter((i) => !known.has(i.audience)).flatMap((i) => i.statements),
    ...visible(brief.summary).filter((x) => /\$|%|tax|water|sewer|fee|rate/i.test(x.text)),
  ];
  const seen = new Set<string>();
  const general = visible(everyone).filter((x) => !seen.has(x.id) && (seen.add(x.id), true));
  return (
    <div class="tab-body">
      <fieldset class="aud-picker">
        <legend class="section-title">{t("Who are you? Pick all that apply.")}</legend>
        <div class="chips">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              type="button"
              class={`chip-toggle ${has(a.id) ? "" : "is-empty"}`}
              aria-pressed={audiences.includes(a.id)}
              onClick={() => toggle(a.id)}
              title={has(a.id) ? undefined : t("Nothing specific in the documents for this group")}
            >
              {audiences.includes(a.id) ? <Check size={14} /> : null}
              {t(a.label)}
            </button>
          ))}
        </div>
      </fieldset>
      {chosen.length === 0 ? (
        <p class="empty-hint">{t("Pick one or more above to see how this decision may affect you.")}</p>
      ) : (
        <div class="impact-list" aria-live="polite">
          {chosen.map((a) => {
            const imp = brief.impacts.find((i) => i.audience === a.id);
            return (
              <article class="card impact" key={a.id}>
                <h2 class="card-title">{imp?.label ?? t(a.label)}</h2>
                {imp && visible(imp.statements).length ? (
                  <Statements list={imp.statements} />
                ) : (
                  <p class="muted">{t("Nothing specific in the documents for this group. What applies to everyone is below.")}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {general.length ? (
        <section class="card impact">
          <h2 class="card-title">{t("Applies to everyone")}</h2>
          <Statements list={general} />
        </section>
      ) : null}
    </div>
  );
}

const METHOD: Record<Participation["method"], { label: string; icon: (p: { size?: number }) => preact.JSX.Element }> = {
  speak: { label: "Speak", icon: Mic },
  write: { label: "Write", icon: Pen },
  survey: { label: "Survey", icon: Clipboard },
  attend: { label: "Attend", icon: People },
  watch: { label: "Watch", icon: Play },
  "contact-councillor": { label: "Contact your councillor", icon: Person },
};

/** The soonest chance to take part that is still open (an ongoing survey counts until it closes). */
export function nextChance(d: Decision, now = Date.now()): TimelineEvent | undefined {
  return d.timeline
    .filter((e) => e.participation?.length && when(e.end ?? e.date) > now)
    .sort((a, b) => when(targetOf(a, now)) - when(targetOf(b, now)))[0];
}

/** Subscribe to the dates: links from GET /api/calendar (webcal, Google, Outlook). */
function Subscribe({ decisionId }: { decisionId: string }) {
  const t = useT();
  const [links, setLinks] = useState<{ webcal?: string; google?: string; outlook?: string; ics?: string; privacy?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(false);
  const toggle = async () => {
    if (!open && !links) {
      try {
        const r = await fetch(`/api/calendar?decisions=${encodeURIComponent(decisionId)}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        setLinks(j.links ?? j);
      } catch {
        setErr(true);
      }
    }
    setOpen(!open);
  };
  return (
    <div class="subscribe">
      <button type="button" class="btn btn-secondary btn-sm" aria-expanded={open} onClick={toggle}>
        <Calendar size={16} /> {t("Subscribe to all dates")}
      </button>
      {open ? (
        <div class="subscribe-pop" role="group" aria-label={t("Subscribe to all dates")}>
          {err ? <p class="small muted">{t("Subscriptions aren't available right now.")}</p> : null}
          {links?.webcal ? <a class="link" href={links.webcal}>{t("Apple Calendar or any calendar app")}</a> : null}
          {links?.google ? <a class="link" href={links.google} target="_blank" rel="noopener noreferrer">Google Calendar <External size={13} /></a> : null}
          {links?.outlook ? <a class="link" href={links.outlook} target="_blank" rel="noopener noreferrer">Outlook <External size={13} /></a> : null}
          {links?.privacy ? <p class="small muted">{links.privacy}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function HaveYourSay({ decision, brief }: { decision: Decision; brief?: Brief }) {
  const t = useT();
  const sample = useStore(sampleMode);
  const now = Date.now();
  const next = nextChance(decision, now);
  const events = [...decision.timeline].sort((a, b) => when(a.date) - when(b.date));
  const pastEvents = events.filter((e) => when(e.end ?? e.date) < now);
  const upcoming = events.filter((e) => when(e.end ?? e.date) >= now);

  const ways = (e: TimelineEvent) => (
    <ul role="list">
      {(e.participation ?? []).map((p, i) => {
        const M = METHOD[p.method];
        const Icon = M.icon;
        return (
          <li key={i} class="way">
            <span class="way-icon"><Icon size={18} /></span>
            <div>
              <p class="way-title">{t(M.label)}</p>
              <p class="way-text">{p.instructions}</p>
              {p.deadline ? (
                <p class="small"><strong>{t("Deadline")}:</strong> {fmtDateTime(p.deadline)}</p>
              ) : null}
              {p.contact ? (
                <p class="small"><strong>{t("Contact")}:</strong> {p.contact}</p>
              ) : null}
              {p.url ? (
                <a class="link small" href={p.url} target="_blank" rel="noopener noreferrer">
                  {t("More information")} <External size={13} />
                  <span class="sr-only"> ({t(M.label)})</span>
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const item = (e: TimelineEvent) => {
    const past = when(e.end ?? e.date) < now;
    const isNext = e === next;
    const target = targetOf(e, now);
    const cd = countdown(target, now);
    const est = !!(e as TimelineEvent & { estimated?: boolean }).estimated;
    return (
      <li key={e.id} class={`tl-item ${past ? "is-past" : ""} ${isNext ? "is-next" : ""} ${est ? "is-estimated" : ""}`} aria-current={isNext ? "step" : undefined}>
        <span class="tl-dot" aria-hidden="true">{past ? <Check size={12} /> : null}</span>
        <div class="tl-body">
          <p class="tl-date">
            {est ? <span class="tl-est">{t("At the latest")}</span> : null}
            <time dateTime={e.date}>{fmtDateTime(e.date)}</time>
            {e.end && !past ? <span class="muted">– {fmtDateTime(e.end)}</span> : null}
            {past ? <span class="pill pill--quiet">{t("Passed")}</span> : null}
            {!past && e.end && when(e.date) <= now ? <span class="pill pill--approved">{t("Open now")}</span> : null}
            {isNext ? <span class="pill pill--accent">{t("Next chance")}</span> : null}
          </p>
          <h3 class="tl-title">{e.title}</h3>
          <p class="tl-plain">{e.plain}</p>
          {est ? <p class="tl-est-note">{t("Worked out from the rules, not yet published")}</p> : null}
          {e.location ? <p class="small muted">{e.location}</p> : null}
          {isNext ? (
            <p class="countdown" aria-live="off">
              <span class="countdown-num">{cd.text}</span>{" "}
              <span class="muted">{target !== e.date ? t("left to take part") : t("to go")}</span>
            </p>
          ) : null}
          {e.participation?.length && !past ? (
            isNext ? (
              <div class="ways">
                <h4 class="eyebrow">{t("How to take part")}</h4>
                {ways(e)}
              </div>
            ) : (
              <details class="ways ways--more">
                <summary>{t("How to take part")} ({e.participation.length})</summary>
                {ways(e)}
              </details>
            )
          ) : null}
          {e.citation ? <CitationChip c={e.citation} /> : null}
        </div>
      </li>
    );
  };
  const downloadIcs = (e: Event) => {
    toast({ title: t("Added to your calendar file"), body: t("Open the downloaded file to add the dates to your calendar."), tone: "ok" });
    if (!sample) return;
    e.preventDefault();
    const blob = new Blob([icsFor(decision)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${decision.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div class="tab-body">
      {brief ? <Statements list={brief.haveYourSay} /> : null}
      <div class="row-between">
        <h2 class="section-title">{t("Timeline")}</h2>
        <div class="row-gap">
          <a class="btn btn-secondary btn-sm" href={api.calendarUrl(decision.id)} download={`${decision.id}.ics`} onClick={downloadIcs}>
            <Calendar size={16} /> {t("Add to calendar")}
          </a>
          {!sample ? <Subscribe decisionId={decision.id} /> : null}
        </div>
      </div>
      {pastEvents.length ? (
        <details class="tl-past">
          <summary>{t("Earlier steps ({n})", { n: pastEvents.length })}</summary>
          <ol class="timeline" role="list">
            {pastEvents.map(item)}
          </ol>
        </details>
      ) : null}
      <ol class="timeline" role="list">
        {upcoming.map(item)}
      </ol>
    </div>
  );
}

export function Unknowns({ brief }: { brief: Brief }) {
  const t = useT();
  return (
    <div class="tab-body">
      {brief.unknowns.length ? (
        <section>
          <h2 class="section-title">{t("What the documents don't answer")}</h2>
          <div class="stack">
            {brief.unknowns.map((u, i) => (
              <article class="card unknown" key={i}>
                <h3 class="card-title">{/[?.!]$/.test(u.question.trim()) ? u.question.trim() : `${u.question.trim()}?`}</h3>
                <p><strong>{t("Why it matters:")}</strong> {u.why}</p>
                <p>
                  <strong>{t("Who can answer:")}</strong> {u.whoCanAnswer}
                  {u.contact ? (
                    <>
                      {" · "}
                      {(() => {
                        const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(u.contact)?.[0];
                        if (!email) return u.contact;
                        const [before, after] = u.contact.split(email);
                        return (
                          <>
                            {before}
                            <a class="link" href={`mailto:${email}`}>{email}</a>
                            {after}
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {visible(brief.tradeoffs).length ? (
        <section>
          <h2 class="section-title">{t("Trade-offs and possible harms")}</h2>
          <ul class="stmts stmts--cards" role="list">
            {visible(brief.tradeoffs).map((s) => (
              <li key={s.id} class={`card card--${s.kind}`}>
                <StatementView s={s} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function Sources({ detail }: { detail: DecisionDetail }) {
  const t = useT();
  return (
    <div class="tab-body">
      <ul class="stack" role="list">
        {detail.sources.map((s) => (
          <li key={s.id} class="card source">
            <p class="eyebrow">{s.publisher} · {s.kind.replace("-", " ")}</p>
            <h2 class="card-title">{s.title}</h2>
            <p class="small muted">
              {t("Published {date}", { date: fmtDate(s.published) })} · {t("{n} pages", { n: s.pages })} · {t("Licence")}: {s.licence}
            </p>
            <div class="row-gap">
              <button type="button" class="btn btn-secondary btn-sm" onClick={() => openSource({ sourceId: s.id, page: 1 })}>
                <Doc size={15} /> {t("View page 1")}
              </button>
              <a class="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noopener noreferrer">
                {t("Open original")} <External size={14} />
              </a>
            </div>
          </li>
        ))}
      </ul>
      {!detail.sources.length ? (
        <p class="empty-hint"><Alert size={16} /> {t("No sources listed yet.")}</p>
      ) : null}
    </div>
  );
}
