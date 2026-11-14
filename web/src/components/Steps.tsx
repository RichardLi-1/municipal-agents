import { useEffect, useState } from "preact/hooks";
import type { RunState, StepState } from "../lib/run.ts";
import { useT } from "../lib/i18n.ts";
import { Check, Cross } from "./icons.tsx";

const NAMES: Record<string, string> = {
  lead: "Lead",
  explainer: "Explainer",
  "transit-access": "Transit access",
  "lifecycle-cost": "Lifetime cost",
  commitments: "Commitments",
  "housing-pipeline": "Housing pipeline",
  construction: "Construction scout",
  translator: "Translator",
};
export const agentName = (id: string) => NAMES[id] ?? id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Mark({ state }: { state: StepState["status"] | "plan" }) {
  if (state === "plan")
    return (
      <span class="mark mark--plan" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 3h8M2 6h8M2 9h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </span>
    );
  return (
    <span class="mark" data-state={state} aria-hidden="true">
      {state === "done" ? <Check size={11} /> : state === "failed" ? <Cross size={11} /> : null}
    </span>
  );
}

function StepRow({ s }: { s: StepState }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const word = { running: t("working"), done: t("done"), failed: t("failed"), pending: t("waiting") }[s.status];
  return (
    <li class={`step ${open ? "is-open" : ""}`}>
      <button type="button" class="step-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Mark state={s.status} />
        <span class="step-name">
          {agentName(s.specialist)}
          <span class="step-q">{s.question}</span>
        </span>
        <span class="sr-only">, {word}</span>
        {s.tools.length ? <span class="step-count">{s.tools.length}</span> : null}
        <span class="chev" aria-hidden="true" />
      </button>
      {open ? (
        <ul class="step-tools" role="list">
          {s.tools.length === 0 && s.status === "pending" ? <li class="muted">{t("Waiting for the lead")}</li> : null}
          {s.tools.map((x, i) => (
            <li key={i}>
              <code>{x.tool}</code> <span>{x.summary}</span>
            </li>
          ))}
          {s.summary && s.status !== "running" ? <li class={`step-summary ${s.status === "failed" ? "is-failed" : ""}`}>{s.summary}</li> : null}
        </ul>
      ) : s.status === "running" && s.tools.length ? (
        <p class="step-live" aria-hidden="true">
          <code>{s.tools[s.tools.length - 1].tool}</code> {s.tools[s.tools.length - 1].summary}
        </p>
      ) : null}
    </li>
  );
}

/** The lead's plan and each specialist as a row with its status, like a subagent panel. */
export function StepsPanel({ run, collapseWhenDone = true }: { run: RunState; title?: string; collapseWhenDone?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (run.done && collapseWhenDone && !run.error) setOpen(false);
  }, [run.done]);
  if (!run.steps.length && !run.planner) {
    return (
      <ol class="steps" role="list">
        <li class="step">
          <div class="step-head is-static">
            <Mark state={run.done ? (run.error ? "failed" : "done") : "running"} />
            <span class="step-name">
              {agentName("lead")}
              <span class="step-q">{run.error ? t("Stopped") : t("Reading the question and making a plan")}</span>
            </span>
          </div>
        </li>
      </ol>
    );
  }
  const done = run.steps.filter((s) => s.status === "done").length;
  return (
    <section class="steps-wrap" aria-label={t("Agents at work")}>
      <button type="button" class="step-head plan-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Mark state={run.done ? (run.error ? "failed" : "done") : "plan"} />
        <span class="step-name">
          {t("Plan")}
          <span class="step-q">
            {agentName(run.planner ?? "lead")} · {t("{n} of {total} specialists done", { n: done, total: run.steps.length })}
          </span>
        </span>
        {run.replay ? <span class="replay-chip replay-chip--inline">{t("Replay of a real run")}</span> : null}
        <span class="chev" aria-hidden="true" />
      </button>
      {open ? (
        <ol class="steps" role="list">
          {run.steps.map((s) => (
            <StepRow key={s.id} s={s} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
