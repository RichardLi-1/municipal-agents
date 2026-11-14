// The site's only script: the theme switch (shared with the app through the same
// localStorage key), the small-screen menu, reveal-on-scroll, and the contact form,
// which only opens a pre-filled GitHub issue. Nothing is sent anywhere from here.
import "./styles/site.css";

const root = document.documentElement;

function setTheme(t: "light" | "dark", save: boolean): void {
  root.dataset.theme = t;
  if (save) {
    try {
      localStorage.setItem("ma-theme", t);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
    b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}
setTheme(root.dataset.theme === "dark" ? "dark" : "light", false);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
  b.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
}
// Follow the system while the visitor hasn't chosen.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("ma-theme");
  } catch {
    /* ignore */
  }
  if (!saved) setTheme(e.matches ? "dark" : "light", false);
});

// Small-screen menu
const menuBtn = document.querySelector<HTMLButtonElement>("[data-menu]");
const nav = document.getElementById("site-nav");
if (menuBtn && nav) {
  const close = () => {
    menuBtn.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  };
  menuBtn.addEventListener("click", () => {
    const open = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    if (open) nav.querySelector<HTMLAnchorElement>("a")?.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
      close();
      menuBtn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Node) || menuBtn.contains(e.target) || nav.contains(e.target)) return;
    close();
  });
  nav.addEventListener("click", (e) => {
    if (e.target instanceof HTMLAnchorElement) close();
  });
}

// Reveal on scroll (only when motion is allowed; the inline head script sets .motion)
const reveals = document.querySelectorAll<HTMLElement>(".reveal");
if (root.classList.contains("motion") && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  for (const el of reveals) io.observe(el);
} else {
  for (const el of reveals) el.classList.add("is-in");
}

// Contact: there's no company email yet, so the form builds a pre-filled GitHub issue
// and opens it in a new tab. Nothing is sent from this site.
const form = document.querySelector<HTMLFormElement>("form[data-issue]");
if (form) {
  // /contact?topic=city etc. (from the pricing page) picks the matching topic.
  const want = new URLSearchParams(location.search).get("topic");
  const map: Record<string, string> = { pilot: "A pilot", demo: "A demo call", town: "Pricing", city: "Pricing", region: "Pricing", security: "Security or privacy review", other: "Something else" };
  const value = want ? map[want] : undefined;
  if (value) {
    const r = form.querySelector<HTMLInputElement>(`input[name="topic"][value="${value}"]`);
    if (r) r.checked = true;
  }
  const titles: Record<string, string> = {
    "A pilot": "Pilot enquiry",
    "A demo call": "Demo call request",
    Pricing: "Pricing question",
    "Security or privacy review": "Security or privacy review",
    "Something else": "Question",
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    const org = get("org");
    const title = `${titles[get("topic")] ?? "Pilot enquiry"}${org ? `: ${org}` : ""}`;
    const body = [
      get("message"),
      "",
      "---",
      `Name: ${get("name")}`,
      `Role: ${get("role")}`,
      `Municipality or organisation: ${org}`,
    ].join("\n");
    const url = `${form.dataset.issue}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    // "noopener" would make window.open return null even on success, so cut the
    // opener by hand; fall back to this tab only if a popup blocker stopped it.
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
    else window.location.href = url;
    const done = form.querySelector<HTMLElement>("[data-sent]");
    if (done) done.hidden = false;
  });
}
