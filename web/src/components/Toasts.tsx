import { dismiss, toasts } from "../lib/toast.ts";
import { useStore } from "../lib/store.ts";
import { useT } from "../lib/i18n.ts";
import { Alert, CheckCircle, Bell, Cross } from "./icons.tsx";

export function Toasts() {
  const t = useT();
  const list = useStore(toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((x) => (
        <div key={x.id} class={`toast toast--${x.tone ?? "info"}`}>
          <span class="toast-mark" aria-hidden="true">
            {x.tone === "ok" ? <CheckCircle size={18} /> : x.tone === "warn" ? <Alert size={18} /> : <Bell size={18} />}
          </span>
          <div class="toast-text">
            <p class="toast-title">{x.title}</p>
            {x.body ? <p class="toast-body">{x.body}</p> : null}
          </div>
          {x.action ? (
            <button type="button" class="btn btn-sm btn-quiet" onClick={() => { x.action!.run(); dismiss(x.id); }}>
              {x.action.label}
            </button>
          ) : null}
          <button type="button" class="icon-btn icon-btn--sm" aria-label={t("Close")} onClick={() => dismiss(x.id)}>
            <Cross size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
