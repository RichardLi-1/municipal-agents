// Municipal Agents docs: theme, menu, copy buttons, "on this page" highlighting and
// search. No dependencies; the search index is a prebuilt JSON file loaded on first use.
(() => {
  "use strict";
  const doc = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {
        /* private mode: the choice lasts for this page only */
      }
    },
  };

  // ---------- Theme (shares "ma-theme" with the app, so both look the same) ----------
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const effective = () => {
    const t = store.get("ma-theme");
    return t === "dark" || t === "light" ? t : mq.matches ? "dark" : "light";
  };
  const applyTheme = () => {
    const t = effective();
    doc.dataset.theme = t;
    for (const b of $$("[data-theme-toggle]")) b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };
  mq.addEventListener("change", applyTheme);
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const next = effective() === "dark" ? "light" : "dark";
    // Back to "follow the system" when the choice matches it.
    store.set("ma-theme", (next === "dark") === mq.matches ? null : next);
    applyTheme();
  });
  applyTheme();

  // ---------- Menu (narrow screens) ----------
  const menuBtn = $("[data-menu]");
  const scrim = $("[data-scrim]");
  const nav = $("#docs-nav");
  const setNav = (open) => {
    if (!menuBtn) return;
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) document.body.setAttribute("data-nav-open", "");
    else document.body.removeAttribute("data-nav-open");
    if (scrim) scrim.hidden = !open;
    if (open) (nav.querySelector('[aria-current="page"]') || nav.querySelector("a"))?.focus();
  };
  menuBtn?.addEventListener("click", () => setNav(menuBtn.getAttribute("aria-expanded") !== "true"));
  scrim?.addEventListener("click", () => setNav(false));
  $("[data-menu-close]")?.addEventListener("click", () => {
    setNav(false);
    menuBtn?.focus();
  });
  nav?.addEventListener("click", (e) => {
    if (e.target.closest("a")) setNav(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.hasAttribute("data-nav-open")) {
      setNav(false);
      menuBtn.focus();
    }
  });

  // ---------- Copy buttons ----------
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const code = btn.closest(".code")?.querySelector("pre code");
    if (!code) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ""));
      ok = true;
    } catch {
      const r = document.createRange();
      r.selectNodeContents(code);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      ok = document.execCommand && document.execCommand("copy");
      sel.removeAllRanges();
    }
    btn.textContent = ok ? "Copied" : "Press Ctrl+C";
    if (ok) btn.setAttribute("data-done", "");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.textContent = "Copy";
      btn.removeAttribute("data-done");
    }, 1600);
  });

  // ---------- On this page: highlight the section being read ----------
  const tocLinks = $$(".toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const heads = $$(".prose h2[id], .prose h3[id]").filter((h) => byId.has(h.id));
    const visible = new Set();
    const mark = () => {
      let current = heads.find((h) => visible.has(h));
      if (!current) {
        // Between headings: the last one above the fold.
        const above = heads.filter((h) => h.getBoundingClientRect().top < 120);
        current = above[above.length - 1] || heads[0];
      }
      for (const a of tocLinks) a.removeAttribute("aria-current");
      const link = current && byId.get(current.id);
      if (link) {
        link.setAttribute("aria-current", "true");
        const box = link.closest(".toc");
        const r = link.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (r.top < b.top || r.bottom > b.bottom) link.scrollIntoView({ block: "nearest" });
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) en.isIntersecting ? visible.add(en.target) : visible.delete(en.target);
        mark();
      },
      { rootMargin: "-72px 0px -62% 0px" },
    );
    for (const h of heads) io.observe(h);
  }

  // ---------- Search ----------
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  for (const k of $$("[data-kbd]")) k.textContent = isMac ? "⌘K" : "Ctrl K";

  let index = null;
  let loading = null;
  const loadIndex = () =>
    (loading ??= fetch(document.body.dataset.search)
      .then((r) => r.json())
      .then((d) => {
        index = d.map((e) => ({ ...e, _p: fold(e.p), _h: fold(e.h), _x: fold(e.x) }));
      })
      .catch(() => {
        index = [];
      }));

  function fold(s) {
    return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function search(q) {
    const terms = fold(q).split(/[^\p{L}\p{N}_.:/-]+/u).filter((t) => t.length > 0);
    if (!terms.length || !index) return [];
    const phrase = fold(q).trim();
    const out = [];
    for (const e of index) {
      let score = 0;
      let all = true;
      for (const t of terms) {
        const re = new RegExp("(^|[^\\p{L}\\p{N}])" + reEsc(t), "u");
        const inH = re.test(e._h);
        const inP = re.test(e._p);
        const hits = e._x.split(t).length - 1;
        const inX = hits > 0 && re.test(e._x);
        if (!inH && !inP && !inX && hits === 0) {
          all = false;
          break;
        }
        score += (inH ? 12 : 0) + (inP ? 5 : 0) + (inX ? 2 : 0) + Math.min(hits, 6) * 0.6;
      }
      if (!all) continue;
      if (phrase.includes(" ")) {
        if (e._h.includes(phrase)) score += 20;
        else if (e._x.includes(phrase)) score += 8;
      }
      if (!e.h) score += 1; // a page's intro, when it matches, is a good landing spot
      out.push({ e, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 14).map((r) => r.e);
  }

  function highlight(text, terms) {
    let html = escHtml(text);
    for (const t of terms) {
      if (t.length < 2) continue;
      html = html.replace(new RegExp("(" + reEsc(escHtml(t)) + ")", "gi"), "<mark>$1</mark>");
    }
    return html;
  }

  function snippet(e, terms) {
    const x = e.x;
    const fx = e._x;
    let at = -1;
    for (const t of terms) {
      at = fx.indexOf(t);
      if (at >= 0) break;
    }
    if (at < 0) return x.slice(0, 150) + (x.length > 150 ? "..." : "");
    const start = Math.max(0, at - 60);
    const s = (start > 0 ? "..." : "") + x.slice(start, start + 170).replace(/^\S*\s/, start > 0 ? "" : "$&");
    return s + (start + 170 < x.length ? "..." : "");
  }

  let dialog = null;
  let input;
  let list;
  let active = -1;
  let lastFocus = null;

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "search";
    dialog.setAttribute("aria-label", "Search the docs");
    dialog.innerHTML =
      '<div class="search-field"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '<input type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" aria-label="Search the docs">' +
      '<kbd>Esc</kbd></div><ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>' +
      '<p class="search-hint">Try "citations", "passcode", "Connection Scan", "SSE" or "spend cap".</p>' +
      '<div class="search-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span></div>' +
      '<p class="sr-only" aria-live="polite" data-count></p>';
    document.body.appendChild(dialog);
    input = $("input", dialog);
    list = $(".search-results", dialog);
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => {
      const items = $$("li", list);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        select(items);
      } else if (e.key === "Enter") {
        const a = items[active >= 0 ? active : 0]?.querySelector("a");
        if (a) {
          e.preventDefault();
          go(a.href);
        }
      }
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
      const a = e.target.closest("a");
      if (a && list.contains(a)) {
        e.preventDefault();
        go(a.href);
      }
    });
    dialog.addEventListener("close", () => lastFocus?.focus());
  }

  function go(href) {
    dialog.close();
    const u = new URL(href, location.href);
    if (u.pathname === location.pathname && u.hash) {
      location.hash = u.hash;
      document.getElementById(decodeURIComponent(u.hash.slice(1)))?.focus?.({ preventScroll: true });
    } else location.href = href;
  }

  function select(items) {
    items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    const cur = items[active];
    if (cur) {
      input.setAttribute("aria-activedescendant", cur.id);
      cur.scrollIntoView({ block: "nearest" });
    }
  }

  async function run() {
    const q = input.value;
    const hint = $(".search-hint", dialog);
    const count = $("[data-count]", dialog);
    if (!q.trim()) {
      list.innerHTML = "";
      hint.hidden = false;
      input.setAttribute("aria-expanded", "false");
      count.textContent = "";
      return;
    }
    hint.hidden = true;
    if (!index) await loadIndex();
    if (q !== input.value) return;
    const terms = fold(q).split(/[^\p{L}\p{N}_.:/-]+/u).filter(Boolean);
    const results = search(q);
    active = results.length ? 0 : -1;
    list.innerHTML = results.length
      ? results
          .map(
            (e, i) =>
              `<li role="option" id="sr-${i}" aria-selected="${i === 0}"><a href="${escHtml(e.u)}" tabindex="-1"><span class="sr-where">${escHtml(e.g)} › ${escHtml(e.p)}</span><span class="sr-head">${highlight(e.h || e.p, terms)}</span><span class="sr-snip">${highlight(snippet(e, terms), terms)}</span></a></li>`,
          )
          .join("")
      : `<li class="search-empty" role="presentation">No results for “${escHtml(q)}”. Try fewer or different words.</li>`;
    input.setAttribute("aria-expanded", String(results.length > 0));
    if (results.length) input.setAttribute("aria-activedescendant", "sr-0");
    else input.removeAttribute("aria-activedescendant");
    count.textContent = results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "No results";
  }

  function openSearch() {
    if (!dialog) build();
    if (dialog.open) return;
    lastFocus = document.activeElement;
    loadIndex();
    dialog.showModal();
    input.select();
    run();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-search-open]")) {
      e.preventDefault();
      openSearch();
    }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openSearch();
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openSearch();
    }
  });
})();
