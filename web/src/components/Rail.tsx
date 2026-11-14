import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { sampleMode } from "../lib/api.ts";
import { languageName, useT } from "../lib/i18n.ts";
import { lang, themePref, type ThemePref } from "../lib/prefs.ts";
import { onLinkClick, route } from "../lib/router.ts";
import { cityStore } from "../lib/state.ts";
import { useStore } from "../lib/store.ts";
import { Check, Github, Globe, Lock, Doc, Coins, Sliders, Ledger } from "./icons.tsx";
import { LogoMark } from "./Logo.tsx";

/** A menu that opens beside the rail: closes on Escape, outside click, or Tab away. */
function RailMenu({ id, icon, label, children, labelText }: { id: string; icon: JSX.Element; label: string; labelText: string; children: (close: () => void) => JSX.Element }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("[aria-checked=true],button,input")?.focus();
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div class="rail-menu">
      <button
        type="button"
        ref={btn}
        class="rail-item"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span class="rail-label">{labelText}</span>
        {label !== labelText ? <span class="sr-only">, {label}</span> : null}
      </button>
      {open ? (
        <div
          class="popover"
          id={id}
          ref={box}
          onFocusOut={(e) => {
            const to = (e as FocusEvent).relatedTarget as Node | null;
            if (to && !box.current?.contains(to) && !btn.current?.contains(to)) setOpen(false);
          }}
        >
          {children(() => close())}
        </div>
      ) : null}
    </div>
  );
}

function LanguageList({ close }: { close: () => void }) {
  const t = useT();
  const city = useStore(cityStore);
  const current = useStore(lang);
  const langs = city?.languages?.length ? city.languages : ["en", "fr"];
  const onKey = (e: KeyboardEvent) => {
    const items = [...((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=menuitemradio]"))];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Home") items[0]?.focus();
    else if (e.key === "End") items[items.length - 1]?.focus();
    else return;
    e.preventDefault();
  };
  return (
    <>
      <p class="popover-title">{t("Language")}</p>
      <div role="menu" aria-label={t("Language")} onKeyDown={onKey as never} class="menu-items">
        {langs.map((code) => (
          <button
            key={code}
            type="button"
            role="menuitemradio"
            aria-checked={code === current}
            lang={code}
            onClick={() => {
              lang.set(code);
              close();
            }}
          >
            <span>{languageName(code)}</span>
            {code === current ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
    </>
  );
}

function Appearance() {
  const t = useT();
  const pref = useStore(themePref);
  const opts: { v: ThemePref; label: string }[] = [
    { v: "auto", label: "System" },
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
  ];
  return (
    <>
      <p class="popover-title">{t("Settings")}</p>
      <fieldset class="seg-field">
        <legend class="eyebrow">{t("Appearance")}</legend>
        <div class="seg">
          {opts.map((o) => (
            <label key={o.v} class={pref === o.v ? "is-on" : ""}>
              <input type="radio" name="appearance" value={o.v} checked={pref === o.v} onChange={() => themePref.set(o.v)} />
              {t(o.label)}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function Rail() {
  const t = useT();
  const r = useStore(route);
  const sample = useStore(sampleMode);
  const current = useStore(lang);
  const items = [
    { href: "/decisions", label: "Decisions", icon: <Doc size={20} />, active: r.path === "/" || r.path.startsWith("/decisions") || r.path.startsWith("/d/") },
    { href: "/log", label: "Record", icon: <Ledger size={20} />, active: r.path === "/log" },
    { href: "/spend", label: "Spend", icon: <Coins size={20} />, active: r.path === "/spend" },
    { href: "/staff", label: "Staff", icon: <Lock size={20} />, active: r.path === "/staff" },
  ];
  return (
    <nav class="rail" aria-label={t("Main navigation")}>
      <a href="/" class="brand" aria-label="Municipal Agents" title="Municipal Agents">
        <LogoMark size={34} />
      </a>
      <ul role="list" class="rail-list">
        {items.map((l) => (
          <li key={l.href}>
            <a href={l.href} class="rail-item" onClick={onLinkClick} aria-current={l.active ? "page" : undefined}>
              {l.icon}
              <span class="rail-label">{t(l.label)}</span>
            </a>
          </li>
        ))}
      </ul>
      <div class="rail-foot">
        <RailMenu id="menu-lang" icon={<Globe size={20} />} label={`${t("Language")}: ${languageName(current)}`} labelText={current.toUpperCase()}>
          {(close) => <LanguageList close={close} />}
        </RailMenu>
        <RailMenu id="menu-settings" icon={<Sliders size={20} />} label={t("Settings")} labelText={t("Settings")}>
          {() => <Appearance />}
        </RailMenu>
        <a class="rail-item" href="https://github.com/RichardLi-1/municipal-agents" target="_blank" rel="noopener noreferrer">
          <Github size={20} />
          <span class="rail-label">{t("Code")}</span>
          <span class="sr-only"> ({t("Source code on GitHub")})</span>
        </a>
        <span class={`tag rail-tag ${sample ? "tag--sample" : ""}`} title={sample ? t("Sample data: the live service isn't connected, so this shows a made-up example.") : undefined}>
          {sample ? t("Sample") : t("Live")}
        </span>
      </div>
    </nav>
  );
}
