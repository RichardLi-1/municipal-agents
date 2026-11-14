import type { Citation, CityConfig, SourceDoc } from "../../../shared/types.ts";
import { createStore } from "./store.ts";

export interface SourceRequest {
  sourceId: string;
  page: number;
  quote?: string;
  /** Element to give focus back to when the viewer closes. */
  returnFocus?: HTMLElement | null;
}

export const sourceView = createStore<SourceRequest | null>(null);
export const sourceIndex = createStore<Record<string, SourceDoc>>({});
export const cityStore = createStore<CityConfig | null>(null);

export function rememberSources(list: SourceDoc[]) {
  sourceIndex.set((prev) => {
    const next = { ...prev };
    for (const s of list) next[s.id] = s;
    return next;
  });
}

export function openSource(c: Citation | { sourceId: string; page: number; quote?: string }) {
  sourceView.set({ ...c, returnFocus: document.activeElement as HTMLElement | null });
}

/** A short live message for screen readers. */
export const announcement = createStore<string>("");
export function announce(msg: string) {
  announcement.set("");
  setTimeout(() => announcement.set(msg), 30);
}

/** The decision on screen, for "Report an error" links. */
export const currentDecision = createStore<{ id: string; title: string } | null>(null);

/** The clerk's email from the city settings ("…; regionalclerk@…; 519-…"). */
export function clerkEmail(city: CityConfig | null): string | null {
  const m = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(city?.clerkContact ?? "");
  return m ? m[0] : null;
}

export function mailto(to: string, subject: string, body: string) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Where residents report a mistake: the operator's feedback page (a GitHub new-issue form). */
export const DEFAULT_FEEDBACK = "https://github.com/RichardLi-1/municipal-agents/issues/new";
export function feedbackLink(city: CityConfig | null, title: string, body: string) {
  const base = (city as (CityConfig & { feedbackUrl?: string }) | null)?.feedbackUrl || DEFAULT_FEEDBACK;
  return `${base}${base.includes("?") ? "&" : "?"}title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
export function operatorOf(city: CityConfig | null) {
  return (city as (CityConfig & { operator?: string }) | null)?.operator || "the Municipal Agents team";
}
