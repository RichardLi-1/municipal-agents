import { createStore, safeStorage } from "./store.ts";

const local = safeStorage("local");

export type ThemePref = "auto" | "light" | "dark";
const storedTheme = local.get("ma-theme");
export const themePref = createStore<ThemePref>(storedTheme === "light" || storedTheme === "dark" ? storedTheme : "auto");

const mq = matchMedia("(prefers-color-scheme: dark)");
export const systemDark = createStore<boolean>(mq.matches);
mq.addEventListener("change", () => systemDark.set(mq.matches));

export function effectiveTheme(): "light" | "dark" {
  const p = themePref.get();
  return p === "auto" ? (systemDark.get() ? "dark" : "light") : p;
}

/** The page always carries data-theme, so the tokens need one definition per theme. */
function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
}
themePref.subscribe(() => {
  const p = themePref.get();
  local.set("ma-theme", p === "auto" ? null : p);
  applyTheme();
});
systemDark.subscribe(applyTheme);
applyTheme();

export const reducedMotion = createStore<boolean>(matchMedia("(prefers-reduced-motion: reduce)").matches);
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => reducedMotion.set(e.matches));

/** The language a resident picked. Chrome strings fall back to English where we have no dictionary. */
const urlLang = new URLSearchParams(location.search).get("lang");
export const lang = createStore<string>(urlLang || local.get("ma-lang") || "en");
lang.subscribe(() => local.set("ma-lang", lang.get()));

export const RTL = new Set(["ar", "fa", "ur", "he", "ps", "yi"]);
