import type { JSX } from "preact";
import { createStore } from "./store.ts";

export interface Route {
  path: string;
  search: URLSearchParams;
}

const read = (): Route => ({ path: location.pathname, search: new URLSearchParams(location.search) });

export const route = createStore<Route>(read());

window.addEventListener("popstate", () => route.set(read()));

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  route.set(read());
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

/** Set one query parameter without adding a history entry. */
export function setParam(key: string, value: string | null) {
  const u = new URL(location.href);
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  history.replaceState(null, "", u.pathname + u.search);
  route.set(read());
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  const out: Record<string, string> = {};
  for (let i = 0; i < Math.max(p.length, s.length); i++) {
    const seg = p[i];
    if (seg === undefined) return null;
    if (seg.startsWith(":")) {
      const optional = seg.endsWith("?");
      const name = seg.slice(1, optional ? -1 : undefined);
      if (s[i] === undefined) {
        if (optional) continue;
        return null;
      }
      out[name] = decodeURIComponent(s[i]);
    } else if (seg !== s[i]) return null;
  }
  return out;
}

/** Client-side link: plain anchors, so middle-click and copy link keep working. */
export function onLinkClick(e: JSX.TargetedMouseEvent<HTMLAnchorElement>) {
  const a = e.currentTarget;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === "_blank" || a.origin !== location.origin) return;
  e.preventDefault();
  navigate(a.pathname + a.search);
}
