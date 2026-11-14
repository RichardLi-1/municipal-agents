/*! Municipal Agents embed. A city drops this on its own page:
 *
 *   <script src="https://municipal-agents.fly.dev/embed.js" data-decision="row-2027-budget" data-lang="en"></script>
 *
 * and gets a compact card about one proposed decision: the plain title, three cited
 * summary statements, the next chance to have a say (countdown, Add to calendar), the
 * staff review status, and a link to the full brief. For several cards with one script:
 *   <div data-municipal-agents data-decision="row-2027-budget"></div>
 *
 * Options (data- attributes): decision (required), lang ("en", "fr"; default the page's
 * language), theme ("auto", "light", "dark").
 *
 * The card lives in a Shadow DOM, so its styles don't touch the page and the page's
 * don't break it. It sets no cookies, stores nothing, sends no referrer and loads
 * nothing but one JSON file from the same server as this script.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var base = script && script.src ? new URL(script.src).origin : location.origin;

  var TEXT = {
    en: {
      proposed: "Proposed decision",
      consult: "In consultation",
      decided: "Decided",
      decides: "Decided by",
      what: "What's proposed",
      say: "Next chance to have your say",
      none: "No upcoming meetings or deadlines are listed yet.",
      open: "Open now",
      closes: "closes",
      cal: "Add to calendar",
      brief: "Read the full brief",
      official: "Official notice",
      approved: "Reviewed and approved by city staff",
      by: "by",
      draft: "Draft: not yet reviewed by city staff",
      review: "Being reviewed by city staff",
      nobrief: "A plain-language brief is being prepared.",
      unverified: "Citation not checked",
      edited: "Edited by staff",
      page: "page",
      source: "Source",
      newtab: "(opens in a new tab)",
      footer: "Explained by Municipal Agents. This is not the official notice.",
      loading: "Loading decision…",
      error: "This decision couldn't be loaded.",
      today: "today",
      deadline: "by",
      dl: "Deadline",
      latest: "At the latest",
      methods: { speak: "Speak", write: "Write", survey: "Survey", attend: "Attend", watch: "Watch", "contact-councillor": "Contact your councillor" },
    },
    fr: {
      proposed: "Décision proposée",
      consult: "En consultation",
      decided: "Décision prise",
      decides: "Décidé par",
      what: "Ce qui est proposé",
      say: "Prochaine occasion de donner votre avis",
      none: "Aucune réunion ni échéance n'est encore annoncée.",
      open: "Ouvert maintenant",
      closes: "ferme",
      cal: "Ajouter au calendrier",
      brief: "Lire le résumé complet",
      official: "Avis officiel",
      approved: "Révisé et approuvé par le personnel municipal",
      by: "par",
      draft: "Ébauche : pas encore révisée par le personnel municipal",
      review: "En cours de révision par le personnel municipal",
      nobrief: "Un résumé en langage clair est en préparation.",
      unverified: "Citation non vérifiée",
      edited: "Modifié par le personnel",
      page: "page",
      source: "Source",
      newtab: "(s'ouvre dans un nouvel onglet)",
      footer: "Expliqué par Municipal Agents. Ceci n'est pas l'avis officiel.",
      loading: "Chargement…",
      error: "Impossible de charger cette décision.",
      today: "aujourd'hui",
      deadline: "avant le",
      dl: "Échéance",
      latest: "Au plus tard le",
      methods: { speak: "Prendre la parole", write: "Écrire", survey: "Sondage", attend: "Assister", watch: "Regarder", "contact-councillor": "Contacter votre conseiller" },
    },
  };

  var CSS =
    ":host{all:initial;display:block;contain:content;--bg:#fff;--fg:#141416;--mut:#55565c;--line:#e3e2de;--soft:#f5f4f1;--acc:#1f5fd6;--acc-fg:#fff;--ok:#16794a;--warn:#8a5a00;color-scheme:light}" +
    ":host([data-theme=dark]){--bg:#1b1b1e;--fg:#f2f1ee;--mut:#b4b4ba;--line:#34343a;--soft:#242428;--acc:#7aa7ff;--acc-fg:#0d1530;--ok:#6fd49e;--warn:#f0c46b;color-scheme:dark}" +
    "@media (prefers-color-scheme:dark){:host([data-theme=auto]){--bg:#1b1b1e;--fg:#f2f1ee;--mut:#b4b4ba;--line:#34343a;--soft:#242428;--acc:#7aa7ff;--acc-fg:#0d1530;--ok:#6fd49e;--warn:#f0c46b;color-scheme:dark}}" +
    ".c{box-sizing:border-box;max-width:36rem;font:15px/1.5 Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:20px 22px;text-align:left}" +
    ".c *{box-sizing:border-box}" +
    ".ey{margin:0 0 4px;font-size:12.5px;color:var(--mut);letter-spacing:.01em}" +
    "h2{margin:0 0 8px;font-size:19px;line-height:1.3;font-weight:650}" +
    "h3{margin:16px 0 6px;font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}" +
    "p{margin:0 0 6px}" +
    ".rv{display:inline-flex;gap:6px;align-items:center;font-size:13px;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--warn)}" +
    ".rv.ok{color:var(--ok)}" +
    ".rv::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}" +
    "ul{margin:0;padding:0 0 0 18px}" +
    "li{margin:0 0 6px}" +
    ".ci{font-size:12.5px;white-space:nowrap}" +
    ".tag{font-size:12px;color:var(--mut)}" +
    "a{color:var(--acc);text-underline-offset:2px}" +
    "a:focus-visible{outline:3px solid var(--acc);outline-offset:2px;border-radius:4px}" +
    ".say{margin-top:14px;padding:14px 16px;border-radius:14px;background:var(--soft)}" +
    ".say h3{margin-top:0}" +
    ".ev{font-weight:600}" +
    ".cd{display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:var(--acc);color:var(--acc-fg);font-size:12.5px;font-weight:600}" +
    ".how{font-size:13.5px;color:var(--mut)}" +
    ".row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:10px}" +
    ".btn{display:inline-block;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);text-decoration:none;font-weight:600;font-size:14px}" +
    ".btn.pr{background:var(--acc);border-color:var(--acc);color:var(--acc-fg)}" +
    ".fine{margin-top:12px;font-size:12px;color:var(--mut)}" +
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    "@media (prefers-reduced-motion:no-preference){.btn{transition:filter .15s}.btn:hover{filter:brightness(1.08)}}";

  var sheet;
  function styles(root) {
    try {
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
      }
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      var s = document.createElement("style");
      s.textContent = CSS;
      root.appendChild(s);
    }
  }

  /** Build an element; text children are always text nodes (no HTML from data). */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function link(href, text, t, cls) {
    var a = h("a", { href: href, target: "_blank", rel: "noopener noreferrer", class: cls }, text);
    a.appendChild(h("span", { class: "sr" }, " " + t.newtab));
    return a;
  }

  var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  function ms(iso) {
    // A date-only value is a whole day in Toronto: count to its local midnight (EST/EDT ~ -5/-4 h).
    return DATE_ONLY.test(iso) ? Date.parse(iso + "T00:00:00-05:00") : Date.parse(iso);
  }
  function when(iso, lang) {
    try {
      if (DATE_ONLY.test(iso)) return new Intl.DateTimeFormat(lang, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T12:00:00Z"));
      return new Intl.DateTimeFormat(lang, { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }
  function until(iso, lang, t) {
    var diff = ms(iso) - Date.now();
    if (DATE_ONLY.test(iso) && diff <= 0 && diff > -86400000) return t.today;
    var rtf;
    try {
      rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    } catch (e) {
      return "";
    }
    var hours = diff / 3600000;
    if (Math.abs(hours) < 36 && !DATE_ONLY.test(iso)) return rtf.format(Math.round(hours), "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }

  /** Count down like the resident app: to the soonest future deadline, else the start, else the close. */
  function badge(n, lang, t) {
    var now = Date.now();
    var end = function (iso) {
      return DATE_ONLY.test(iso) ? ms(iso) + 86340000 : ms(iso);
    };
    var dls = (n.methods || [])
      .map(function (m) {
        return m.deadline;
      })
      .filter(function (d) {
        return d && end(d) > now;
      })
      .sort(function (a, b) {
        return end(a) - end(b);
      });
    if (dls.length) return t.dl + " " + until(dls[0], lang, t);
    if (ms(n.date) > now) return until(n.date, lang, t);
    return t.open + (n.end ? ", " + t.closes + " " + until(n.end, lang, t) : "");
  }

  function render(root, d, lang, t) {
    var c = h("article", { class: "c", lang: d.lang || lang, "aria-labelledby": "ma-t" });
    var status = d.status === "decided" ? t.decided : d.status === "in-consultation" ? t.consult : t.proposed;
    c.appendChild(h("p", { class: "ey" }, status + " · " + t.decides + " " + d.decidedBy));
    c.appendChild(h("h2", { id: "ma-t" }, d.plainTitle));

    var r = d.review || { status: "none" };
    var rv =
      r.status === "published"
        ? t.approved + (r.by ? " " + t.by + " " + r.by : "") + (r.at ? ", " + when(r.at.slice(0, 10), lang) : "")
        : r.status === "in-review"
          ? t.review
          : r.status === "draft"
            ? t.draft
            : t.nobrief;
    c.appendChild(h("p", { class: "rv" + (r.status === "published" ? " ok" : ""), role: "status" }, rv));

    if (d.summary && d.summary.length) {
      c.appendChild(h("h3", { id: "ma-w" }, t.what));
      var ul = h("ul", { "aria-labelledby": "ma-w" });
      d.summary.forEach(function (s) {
        var li = h("li", null, s.text + " ");
        (s.citations || []).forEach(function (ci, i) {
          if (i) li.appendChild(document.createTextNode(" "));
          li.appendChild(
            h("a", { href: ci.url, target: "_blank", rel: "noopener noreferrer", class: "ci", "aria-label": t.source + ": " + ci.source + ", " + t.page + " " + ci.page + " " + t.newtab, title: ci.source }, "[" + t.source + ", p. " + ci.page + "]"),
          );
        });
        if (!s.verified) li.appendChild(h("span", { class: "tag" }, " · " + t.unverified));
        if (s.edited) li.appendChild(h("span", { class: "tag" }, " · " + t.edited));
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }

    var say = h("section", { class: "say", "aria-labelledby": "ma-s" }, h("h3", { id: "ma-s" }, t.say));
    var n = d.next;
    if (n) {
      var label = function () {
        return badge(n, lang, t);
      };
      var line = h("p", null, h("span", { class: "ev" }, n.title), " · ", h("time", { datetime: n.date }, (n.estimated ? t.latest + " " : "") + when(n.date, lang)));
      var cd = h("span", { class: "cd" }, label());
      line.appendChild(cd);
      say.appendChild(line);
      if (n.location) say.appendChild(h("p", { class: "how" }, n.location));
      say.appendChild(h("p", null, n.plain));
      (n.methods || []).slice(0, 3).forEach(function (m) {
        var p = h("p", { class: "how" }, (t.methods[m.method] || m.method) + ": " + m.instructions + (m.deadline ? " (" + t.deadline + " " + when(m.deadline, lang) + ")" : ""));
        say.appendChild(p);
      });
      say.appendChild(h("div", { class: "row" }, h("a", { class: "btn", href: d.links.calendar, rel: "noopener" }, t.cal)));
      setInterval(function () {
        cd.textContent = label();
      }, 60000);
    } else {
      say.appendChild(h("p", { class: "how" }, t.none));
    }
    c.appendChild(say);

    c.appendChild(h("div", { class: "row" }, link(d.links.brief, t.brief, t, "btn pr"), link(d.links.official, t.official, t)));
    c.appendChild(h("p", { class: "fine" }, t.footer));
    root.replaceChildren(c);
  }

  function mount(host, opts) {
    if (host.getAttribute("data-ma-ready")) return;
    host.setAttribute("data-ma-ready", "1");
    var lang = (opts.lang || document.documentElement.lang || "en").toLowerCase();
    var t = TEXT[lang.split("-")[0]] || TEXT.en;
    host.setAttribute("data-theme", opts.theme === "light" || opts.theme === "dark" ? opts.theme : "auto");
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    styles(root);
    var box = h("div", { "aria-busy": "true" }, h("p", { class: "c" }, t.loading));
    root.appendChild(box);
    if (!opts.decision) return box.replaceChildren(h("p", { class: "c" }, t.error));
    var url = base + "/api/embed/" + encodeURIComponent(opts.decision) + (lang !== "en" ? "?lang=" + encodeURIComponent(lang) : "");
    fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (d) {
        render(box, d, lang, t);
        box.removeAttribute("aria-busy");
      })
      .catch(function () {
        box.removeAttribute("aria-busy");
        box.replaceChildren(h("p", { class: "c", role: "alert" }, t.error + " ", link(base + "/decisions", "Municipal Agents", t)));
      });
  }

  function opts(el) {
    return { decision: el.getAttribute("data-decision"), lang: el.getAttribute("data-lang"), theme: el.getAttribute("data-theme") };
  }

  if (script && script.getAttribute("data-decision")) {
    var host = document.createElement("div");
    host.className = "municipal-agents-embed";
    script.parentNode.insertBefore(host, script);
    mount(host, opts(script));
  }
  function scan() {
    var els = document.querySelectorAll("[data-municipal-agents]");
    for (var i = 0; i < els.length; i++) mount(els[i], opts(els[i]));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
