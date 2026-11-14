// Builds the Municipal Agents docs site.
//
//   docs/guide/*.md            -> dist/docs/<name>/index.html      (/docs/<name>/)
//   docs/{architecture,design,requirements}.md -> /docs/reference/<name>/
//   docs/company/*.md          -> /docs/company/<name>/
//   CREDITS.md                 -> /docs/credits/
//   styles, script, fonts, diagrams, search index -> dist/docs-assets/ (/docs-assets/)
//
// Run with `npm run build` (Node 24 runs this file directly). No git, no network: the
// Docker build runs it from a copy of the repo without .git.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import http from "highlight.js/lib/languages/http";
import { Marked } from "marked";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("http", http);

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "..");
const DIST = path.join(HERE, "dist");
const ASSETS = path.join(DIST, "docs-assets");
const SITE = "https://municipal-agents.fly.dev";
const GITHUB = "https://github.com/RichardLi-1/municipal-agents";
const BLOB = `${GITHUB}/blob/main/`;
const TREE = `${GITHUB}/tree/main/`;

// ---------------------------------------------------------------------------------
// What the site contains, in nav order. Paths are repo-relative. Missing files are
// skipped with a warning, so the site builds while other docs are still being written.

interface NavItem {
  src: string;
  label?: string; // short label for the sidebar; defaults to the page title
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

function companyItems(): NavItem[] {
  const dir = path.join(REPO, "docs/company");
  if (!fs.existsSync(dir)) return [];
  const order = ["README", "one-pager", "pricing", "go-to-market", "trust-and-compliance", "roadmap"];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b))
    .map((n) => ({ src: `docs/company/${n}.md`, label: n === "README" ? "About the company" : undefined }));
}

const NAV: NavGroup[] = [
  { group: "Start here", items: [{ src: "docs/guide/index.md", label: "Overview" }] },
  {
    group: "Use it",
    items: [
      { src: "docs/guide/residents.md", label: "For residents" },
      { src: "docs/guide/staff.md", label: "For city staff" },
      { src: "docs/guide/planners.md", label: "For planners: the lenses" },
    ],
  },
  {
    group: "Understand it",
    items: [
      { src: "docs/guide/how-it-works.md", label: "How it works" },
      { src: "docs/guide/security-privacy.md", label: "Security and privacy" },
      { src: "docs/guide/evals.md", label: "Evals" },
    ],
  },
  {
    group: "Build on it",
    items: [
      { src: "docs/guide/api.md", label: "API reference" },
      { src: "docs/guide/embed.md", label: "Embed widget" },
      { src: "docs/guide/self-host.md", label: "Self-host" },
      { src: "docs/guide/adapt-your-city.md", label: "Adapt it to your city" },
    ],
  },
  {
    group: "Help",
    items: [
      { src: "docs/guide/faq.md", label: "FAQ" },
      { src: "docs/guide/changelog.md", label: "Changelog" },
    ],
  },
  {
    group: "Reference",
    items: [
      { src: "docs/architecture.md", label: "Architecture" },
      { src: "docs/design.md", label: "Design (UML)" },
      { src: "docs/requirements.md", label: "Requirements" },
      { src: "docs/planner-workflows.md", label: "Planner workflows" },
      { src: "CREDITS.md", label: "Credits and licences" },
    ],
  },
  { group: "Company", items: companyItems() },
];

function urlFor(src: string): string {
  if (src === "docs/guide/index.md") return "/docs/";
  let m = /^docs\/guide\/([^/]+)\.md$/.exec(src);
  if (m) return `/docs/${m[1]}/`;
  if (src === "docs/company/README.md") return "/docs/company/";
  m = /^docs\/company\/([^/]+)\.md$/.exec(src);
  if (m) return `/docs/company/${m[1]}/`;
  m = /^docs\/([^/]+)\.md$/.exec(src);
  if (m) return `/docs/reference/${m[1]}/`;
  if (src === "CREDITS.md") return "/docs/credits/";
  throw new Error(`No URL rule for ${src}`);
}

// ---------------------------------------------------------------------------------
// Small helpers

const posix = (p: string) => p.split(path.sep).join("/");
const hash = (s: string | Buffer, n = 10) => createHash("sha256").update(s).digest("hex").slice(0, n);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** GitHub's heading anchors (github-slugger): lower case, punctuation dropped, spaces to dashes. */
function slug(text: string, seen: Map<string, number>): string {
  const base = text.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "").replace(/ /g, "-") || "section";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}

function frontMatter(md: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return { data: {}, body: md };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: md.slice(m[0].length) };
}

/** Plain text of a Markdown snippet, for descriptions taken from a first paragraph. */
function plainMd(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function copyAsset(fromAbs: string, toRel: string): string {
  const to = path.join(ASSETS, toRel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!fs.existsSync(to)) fs.copyFileSync(fromAbs, to);
  return `/docs-assets/${posix(toRel)}`;
}

// ---------------------------------------------------------------------------------
// Icons (inline SVG, decorative)

const ICON = {
  note: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9v5M10 6.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tip: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7 15h6M8 17.5h4M10 2.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5h5c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 10 2.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  important: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3h-.5A1.5 1.5 0 0 1 3 12.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 6v4M10 12.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3 18 16.5H2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 8v4M10 14.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  planned: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  ext: '<svg class="ext" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  github: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mark: '<svg class="mark" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="9" fill="var(--ink)"/><path d="M8 14.2L16 8.5l8 5.7" fill="none" stroke="var(--ground)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16.5h12a1.5 1.5 0 011.5 1.5v4.2a1.5 1.5 0 01-1.5 1.5h-6.2L12.4 26v-2.3H10a1.5 1.5 0 01-1.5-1.5V18a1.5 1.5 0 011.5-1.5z" fill="var(--ground)"/></svg>',
  arrowL: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowR: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const CALLOUTS: Record<string, { title: string; icon: string }> = {
  note: { title: "Note", icon: ICON.note },
  tip: { title: "Tip", icon: ICON.tip },
  important: { title: "Important", icon: ICON.important },
  warning: { title: "Warning", icon: ICON.warning },
  caution: { title: "Caution", icon: ICON.warning },
  planned: { title: "Planned", icon: ICON.planned },
};

const LANG_ALIAS: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "xml",
  svg: "xml",
  toml: "ini",
  jsonc: "json",
  text: "plaintext",
  txt: "plaintext",
  yml: "yaml",
  docker: "dockerfile",
  sse: "plaintext",
};
const LANG_LABEL: Record<string, string> = {
  bash: "Shell",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  xml: "HTML",
  ini: "TOML",
  http: "HTTP",
  dockerfile: "Dockerfile",
  yaml: "YAML",
  plaintext: "Text",
  css: "CSS",
  sql: "SQL",
  diff: "Diff",
  markdown: "Markdown",
};

// ---------------------------------------------------------------------------------
// Pages

interface TocEntry {
  depth: number;
  id: string;
  text: string;
}
interface Page {
  src: string;
  url: string;
  group: string;
  label: string;
  title: string;
  description: string;
  body: string; // Markdown
  html: string;
  toc: TocEntry[];
  words: number;
  lead: boolean; // show the description under the title (only when written for it)
}

const pages: Page[] = [];
const bySrc = new Map<string, Page>();
const warnings: string[] = [];

for (const g of NAV) {
  for (const item of g.items) {
    const abs = path.join(REPO, item.src);
    if (!fs.existsSync(abs)) {
      warnings.push(`missing ${item.src} (skipped)`);
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const { data, body: afterFm } = frontMatter(raw);
    let body = afterFm;
    let title = data.title;
    // Docs without front matter: the first H1 is the title (and is not repeated in the body).
    const h1 = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(body);
    if (!title && h1 && body.slice(0, h1.index).trim() === "") {
      title = h1[1].trim();
      body = body.slice(h1.index + h1[0].length);
    }
    title ??= path.basename(item.src, ".md");
    // "Municipal Agents: architecture and rationale" -> "Architecture and rationale"
    title = title.replace(/^Municipal Agents:\s*/, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    let description = data.description;
    if (!description) {
      const para = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !/^(#|\||>|```|-|\*|!\[|\d+\.|<)/.test(p));
      description = para ? plainMd(para) : "";
      if (description.length > 220) description = description.slice(0, 217).replace(/\s+\S*$/, "") + "...";
    }
    const page: Page = {
      src: item.src,
      url: urlFor(item.src),
      group: g.group,
      label: item.label ?? data.nav ?? title,
      title,
      description,
      body,
      html: "",
      toc: [],
      words: 0,
      lead: !!data.description,
    };
    pages.push(page);
    bySrc.set(item.src, page);
  }
}

// ---------------------------------------------------------------------------------
// Links and images

/** A Markdown href, relative to `fromSrc`, as a site URL: another page, an asset, or GitHub. */
function resolveHref(href: string, fromSrc: string): string {
  if (!href || href.startsWith("#") || href.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;
  const i = href.indexOf("#");
  const p = i >= 0 ? href.slice(0, i) : href;
  const frag = i >= 0 ? href.slice(i) : "";
  let rel: string;
  try {
    rel = posix(path.relative(REPO, path.resolve(path.dirname(path.join(REPO, fromSrc)), decodeURI(p))));
  } catch {
    return href;
  }
  if (rel.startsWith("..")) return href;
  const target = bySrc.get(rel);
  if (target) return target.url + frag;
  const abs = path.join(REPO, rel);
  // Diagrams open as the committed SVG, served with the docs.
  if (/^docs\/uml\/[^/]+\.svg$/.test(rel) && fs.existsSync(abs)) return copyAsset(abs, `uml/${path.basename(rel)}`);
  if (!fs.existsSync(abs)) warnings.push(`${fromSrc}: link to missing ${rel}`);
  else if (fs.statSync(abs).isDirectory()) return TREE + rel;
  return BLOB + rel + frag;
}

function resolveImage(href: string, fromSrc: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) return href;
  let rel = posix(path.relative(REPO, path.resolve(path.dirname(path.join(REPO, fromSrc)), decodeURI(href))));
  // Mermaid diagrams: show the committed SVG rather than the PNG.
  if (/^docs\/uml\/[^/]+\.png$/.test(rel) && fs.existsSync(path.join(REPO, rel.replace(/\.png$/, ".svg")))) rel = rel.replace(/\.png$/, ".svg");
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) {
    warnings.push(`${fromSrc}: image missing ${rel}`);
    return BLOB + rel + "?raw=true";
  }
  if (rel.startsWith("docs/uml/")) return copyAsset(abs, `uml/${path.basename(rel)}`);
  const buf = fs.readFileSync(abs);
  return copyAsset(abs, `img/${hash(buf, 8)}-${path.basename(rel)}`);
}

// ---------------------------------------------------------------------------------
// Markdown -> HTML, one page at a time (anchors and links depend on the page)

function render(page: Page): void {
  const seen = new Map<string, number>();
  const toc: TocEntry[] = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = textOf(inner);
        const id = slug(text, seen);
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: textOf(inner.replace(/<strong>Planned<\/strong>/g, "")) });
        const level = Math.min(6, Math.max(2, depth)); // the page title is the only h1
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${level}>\n`;
      },
      code({ text, lang }) {
        const raw = (lang ?? "").trim().split(/\s+/)[0].toLowerCase();
        const language = LANG_ALIAS[raw] ?? (raw || "plaintext");
        if (raw === "mermaid") {
          return `<details class="mermaid-src"><summary>Diagram source (Mermaid)</summary><pre><code>${esc(text)}</code></pre></details>\n`;
        }
        const known = !!hljs.getLanguage(language);
        const body = known && language !== "plaintext" ? hljs.highlight(text, { language, ignoreIllegals: true }).value : esc(text);
        const label = LANG_LABEL[language] ?? (raw ? raw.toUpperCase() : "Text");
        return `<div class="code"><div class="code-bar"><span class="code-lang">${esc(label)}</span><button type="button" class="copy" data-copy>Copy</button></div><pre tabindex="0"><code class="hljs language-${esc(language)}">${body}</code></pre></div>\n`;
      },
      blockquote({ tokens }) {
        let body = this.parser.parse(tokens);
        const m = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|PLANNED)\][ \t]*(?:\n|<br>\s*)?/i.exec(body);
        if (!m) return `<blockquote>\n${body}</blockquote>\n`;
        const kind = m[1].toLowerCase();
        body = "<p>" + body.slice(m[0].length);
        body = body.replace(/^<p>\s*<\/p>\s*/, "");
        const c = CALLOUTS[kind];
        return `<div class="callout callout-${kind}" role="note" aria-label="${c.title}"><p class="callout-title">${c.icon}<span>${c.title}</span></p>${body}</div>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const url = resolveHref(href, page.src);
        const external = /^https?:/i.test(url) && !url.startsWith(SITE);
        const t = title ? ` title="${esc(title)}"` : "";
        const codeOnly = /^<code>[^<]*<\/code>$/.test(inner);
        if (external) return `<a href="${esc(url)}"${t} rel="noopener"${codeOnly ? ' class="code-link"' : ""}>${inner}${codeOnly ? "" : ICON.ext}</a>`;
        return `<a href="${esc(url)}"${t}>${inner}</a>`;
      },
      html({ text }) {
        // Raw HTML in the Markdown (cards on the overview): rewrite its links like Markdown links.
        return text.replace(/\b(href|src)="([^"]+)"/g, (_m, attr, v) => `${attr}="${esc(attr === "src" ? resolveImage(v, page.src) : resolveHref(v, page.src))}"`);
      },
      image({ href, title, text }) {
        const src = resolveImage(href, page.src);
        const t = title ? ` title="${esc(title)}"` : "";
        return `<img class="doc-img" src="${esc(src)}" alt="${esc(text)}"${t} loading="lazy" decoding="async">`;
      },
    },
  });

  let html = marked.parse(page.body, { async: false }) as string;
  // A paragraph holding only an image becomes a figure (diagrams open full size).
  html = html.replace(/<p>\s*<img class="doc-img" src="([^"]+)" alt="([^"]*)"([^>]*)>\s*<\/p>/g, (_, src, alt, rest) => {
    const caption = alt ? `<figcaption>${alt}</figcaption>` : "";
    const wide = src.includes("/uml/") ? " figure-diagram" : "";
    return `<figure class="figure${wide}"><a class="figure-link" href="${src}" aria-label="Open the image full size: ${alt}"><img class="doc-img" src="${src}" alt="${alt}"${rest}></a>${caption}</figure>`;
  });
  html = html.replace(/<thead>\s*<tr>(?:\s*<th[^>]*>\s*<\/th>)+\s*<\/tr>\s*<\/thead>/g, "");
  html = html.replace(/<table>/g, '<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table>').replace(/<\/table>/g, "</table></div>");
  // "`GET /api/health` · no auth" at the start of a paragraph: an endpoint line.
  html = html.replace(/<p><code>(GET|POST|PUT|PATCH|DELETE) ([^<\s]+)<\/code>/g, (_m, method, route) => `<p class="endpoint"><span class="method method-${method.toLowerCase()}">${method}</span><code class="route">${route}</code>`);
  html = html.replace(/<strong>Planned<\/strong>/g, '<span class="badge badge-planned">Planned</span>');
  page.html = html;
  page.toc = toc;
  page.words = textOf(html).split(" ").length;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(ASSETS, { recursive: true });
for (const p of pages) render(p);

// ---------------------------------------------------------------------------------
// Assets: tokens + styles, the script, fonts, favicon

const tokensFile = path.join(REPO, "web/src/styles/tokens.css");
const tokens = fs.existsSync(tokensFile) ? fs.readFileSync(tokensFile, "utf8") : fs.readFileSync(path.join(HERE, "src/tokens-fallback.css"), "utf8");

const fontCss: string[] = [];
const fontDir = path.join(HERE, "node_modules/@fontsource-variable/inter");
let fontPreload = "";
if (fs.existsSync(path.join(fontDir, "index.css"))) {
  const css = fs.readFileSync(path.join(fontDir, "index.css"), "utf8");
  for (const block of css.match(/@font-face\s*{[^}]+}/g) ?? []) {
    const file = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    if (!file) continue;
    const url = copyAsset(path.join(fontDir, "files", file), `fonts/${file}`);
    fontCss.push(block.replace(/url\(\.\/files\/[^)]+\)/, `url(${url})`));
    if (file === "inter-latin-wght-normal.woff2") fontPreload = url;
  }
} else {
  warnings.push("@fontsource-variable/inter not installed: falling back to system fonts");
}

const css = [fontCss.join("\n"), tokens, fs.readFileSync(path.join(HERE, "src/docs.css"), "utf8")].join("\n\n");
const cssName = `docs-${hash(css)}.css`;
fs.writeFileSync(path.join(ASSETS, cssName), css);

const js = fs.readFileSync(path.join(HERE, "src/docs.js"), "utf8");
const jsName = `docs-${hash(js)}.js`;
fs.writeFileSync(path.join(ASSETS, jsName), js);

const favicon = path.join(REPO, "web/public/favicon.svg");
const faviconUrl = fs.existsSync(favicon) ? copyAsset(favicon, "favicon.svg") : "";

// ---------------------------------------------------------------------------------
// Search index: one entry per section (intro, each h2 and h3)

interface SearchEntry {
  p: string; // page title
  g: string; // group
  h: string; // section heading ("" for the intro)
  u: string; // url with anchor
  x: string; // section text
}
const index: SearchEntry[] = [];
for (const p of pages) {
  const parts = p.html.split(/(?=<h[23] id=")/);
  for (const part of parts) {
    const m = /^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/.exec(part);
    const heading = m ? textOf(m[2].replace(/<a class="anchor"[^>]*>#<\/a>/, "")) : "";
    const text = textOf((m ? part.slice(m[0].length) : part).replace(/<div class="code-bar">[\s\S]*?<\/div>/g, " ").replace(/<pre[\s\S]*?<\/pre>/g, " "));
    if (!heading && !text) continue;
    index.push({ p: p.title, g: p.group, h: heading, u: m ? `${p.url}#${m[1]}` : p.url, x: text.slice(0, 1400) });
  }
}
const indexJson = JSON.stringify(index);
const searchName = `search-${hash(indexJson)}.json`;
fs.writeFileSync(path.join(ASSETS, searchName), indexJson);

// ---------------------------------------------------------------------------------
// The page template

const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("ma-theme")}catch(e){}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"})();`;

function sidebar(current: Page | undefined): string {
  const groups = NAV.map((g) => {
    const items = g.items.map((i) => bySrc.get(i.src)).filter((p): p is Page => !!p);
    if (!items.length) return "";
    const links = items
      .map((p) => {
        const cur = current?.src === p.src;
        return `<li><a href="${p.url}"${cur ? ' aria-current="page"' : ""}>${esc(p.label)}</a></li>`;
      })
      .join("");
    return `<div class="nav-group"><p class="nav-title">${esc(g.group)}</p><ul>${links}</ul></div>`;
  }).join("");
  return `<nav class="sidebar" id="docs-nav" aria-label="Documentation"><button class="icon-btn nav-close" type="button" data-menu-close aria-label="Close menu"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>${groups}
  <div class="nav-group nav-out"><p class="nav-title">Elsewhere</p><ul>
    <li><a href="/decisions">Open the app</a></li>
    <li><a href="/api/openapi.json">OpenAPI (JSON)</a></li>
    <li><a href="${GITHUB}" rel="noopener">Source on GitHub${ICON.ext}</a></li>
  </ul></div></nav>`;
}

function tocHtml(toc: TocEntry[]): string {
  if (toc.length < 2) return "";
  return `<ul>${toc.map((t) => `<li class="toc-${t.depth}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul>`;
}

function layout(opts: { page?: Page; title: string; description: string; url: string; content: string; toc?: TocEntry[] }): string {
  const { page, title, description, url } = opts;
  const fullTitle = page?.src === "docs/guide/index.md" ? "Municipal Agents docs" : `${title} · Municipal Agents docs`;
  const toc = opts.toc ? tocHtml(opts.toc) : "";
  return `<!doctype html>
<html lang="en-CA" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Municipal Agents">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f2f1ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161618" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<script>${THEME_SCRIPT}</script>
${faviconUrl ? `<link rel="icon" href="${faviconUrl}" type="image/svg+xml">` : ""}
${fontPreload ? `<link rel="preload" href="${fontPreload}" as="font" type="font/woff2" crossorigin>` : ""}
<link rel="stylesheet" href="/docs-assets/${cssName}">
<script src="/docs-assets/${jsName}" defer></script>
</head>
<body data-search="/docs-assets/${searchName}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner glass">
    <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="docs-nav" data-menu><span class="sr-only">Menu</span>${ICON.menu}</button>
    <a class="brand" href="/docs/" aria-label="Municipal Agents docs home">${ICON.mark}<span class="brand-name">Municipal Agents</span><span class="brand-tag">Docs</span></a>
    <button class="search-btn" type="button" data-search-open aria-haspopup="dialog" aria-label="Search the docs">${ICON.search}<span class="search-label">Search the docs</span><kbd class="search-kbd" data-kbd>Ctrl K</kbd></button>
    <nav class="top-links" aria-label="Site">
      <a href="/">Product</a>
      <a href="/docs/api/">API</a>
      <a href="${GITHUB}" rel="noopener" class="icon-link" aria-label="Source on GitHub">${ICON.github}</a>
    </nav>
    <button class="icon-btn theme-btn" type="button" data-theme-toggle aria-label="Switch to dark theme">${ICON.moon}${ICON.sun}</button>
    <a class="btn btn-primary" href="/decisions">See it live</a>
  </div>
</header>
<div class="shell">
${sidebar(page)}
<div class="scrim" data-scrim hidden></div>
<main id="main" tabindex="-1">
${opts.content}
</main>
<aside class="toc" aria-label="On this page">${toc ? `<p class="toc-title">On this page</p>${toc}` : ""}</aside>
</div>
</body>
</html>
`;
}

function pager(p: Page): string {
  const i = pages.indexOf(p);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const a = (q: Page, dir: "prev" | "next") =>
    `<a class="pager-${dir}" href="${q.url}" rel="${dir}"><span class="pager-k">${dir === "prev" ? ICON.arrowL + "Previous" : "Next" + ICON.arrowR}</span><span class="pager-t">${esc(q.label)}</span></a>`;
  return `<nav class="pager" aria-label="Previous and next page">${prev ? a(prev, "prev") : "<span></span>"}${next ? a(next, "next") : "<span></span>"}</nav>`;
}

function article(p: Page): string {
  const minutes = Math.max(1, Math.round(p.words / 230));
  const mobileToc = p.toc.length >= 2 ? `<details class="toc-mobile"><summary>On this page</summary>${tocHtml(p.toc)}</details>` : "";
  return `<article class="pane">
  <header class="doc-head">
    <p class="eyebrow">${esc(p.group)}</p>
    <h1 tabindex="-1">${esc(p.title)}</h1>
    ${p.lead && p.description ? `<p class="lead">${esc(p.description)}</p>` : ""}
    <p class="doc-meta"><span>${minutes} min read</span><a href="${BLOB}${p.src}" rel="noopener">${ICON.edit}Edit on GitHub</a></p>
  </header>
  ${mobileToc}
  <div class="prose">
${p.html}
  </div>
  <footer class="doc-foot">
    <p class="doc-foot-meta"><a href="${BLOB}${p.src}" rel="noopener">${ICON.edit}Edit this page on GitHub</a><span>Source: <code>${esc(p.src)}</code></span></p>
    ${pager(p)}
  </footer>
</article>
<footer class="site-foot"><p>Municipal Agents explains proposed municipal decisions with citations. It is not the official notice: each decision page links to the city's own.</p><p><a href="/">Product</a> · <a href="/docs/security-privacy/">Security and privacy</a> · <a href="/log">Public record</a> · <a href="/spend">Spend</a> · <a href="${GITHUB}" rel="noopener">GitHub</a></p></footer>`;
}

for (const p of pages) {
  const out = path.join(DIST, p.url, "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, layout({ page: p, title: p.title, description: p.description, url: p.url, content: article(p), toc: p.toc }));
}

// 404, served by the server for unknown /docs/* paths.
fs.writeFileSync(
  path.join(DIST, "docs", "404.html"),
  layout({
    title: "Page not found",
    description: "That docs page doesn't exist.",
    url: "/docs/404",
    content: `<article class="pane"><header class="doc-head"><p class="eyebrow">404</p><h1 tabindex="-1">Page not found</h1><p class="lead">That page isn't in the docs. Try searching, or start from one of these.</p></header><div class="prose"><p><button type="button" class="btn btn-primary" data-search-open>Search the docs</button></p><ul>${pages
      .filter((p) => p.group !== "Company")
      .slice(0, 12)
      .map((p) => `<li><a href="${p.url}">${esc(p.label)}</a>: ${esc(p.description)}</li>`)
      .join("")}</ul></div></article>`,
  }),
);

// Plain-text copies for people and tools that read docs as text.
const llms = [
  "# Municipal Agents documentation",
  "",
  "> AI agents read a city's own documents and turn a proposed municipal decision into a brief a resident can read in five minutes, with every figure linked to its source page and nothing official until a named staff member approves each statement.",
  "",
  ...NAV.flatMap((g) => {
    const ps = g.items.map((i) => bySrc.get(i.src)).filter((p): p is Page => !!p);
    return ps.length ? [`## ${g.group}`, "", ...ps.map((p) => `- [${p.title}](${SITE}${p.url}): ${p.description}`), ""] : [];
  }),
].join("\n");
fs.writeFileSync(path.join(DIST, "docs", "llms.txt"), llms);
fs.writeFileSync(path.join(DIST, "docs", "llms-full.txt"), pages.map((p) => `# ${p.title}\n\nSource: ${BLOB}${p.src}\nURL: ${SITE}${p.url}\n\n${p.body.trim()}\n`).join("\n\n---\n\n"));
fs.writeFileSync(
  path.join(DIST, "docs", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p.url}</loc></url>`).join("\n")}\n</urlset>\n`,
);

// ---------------------------------------------------------------------------------

const size = (f: string) => fs.statSync(path.join(ASSETS, f)).size;
console.log(`docs: ${pages.length} pages -> ${posix(path.relative(REPO, DIST))}/docs/`);
console.log(`  css ${cssName} ${(size(cssName) / 1024).toFixed(1)} KB, js ${jsName} ${(size(jsName) / 1024).toFixed(1)} KB, search ${searchName} ${(size(searchName) / 1024).toFixed(1)} KB (${index.length} sections)`);
for (const w of [...new Set(warnings)]) console.warn(`  warning: ${w}`);
