import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** The site's pages: each is landing/<name>.html, served by the app server at /<route>. */
const pages = ["index", "pricing", "security", "company", "contact", "changelog"];

/**
 * Shared header, footer and head bits, without a framework: `<!-- @include name -->`
 * pulls in partials/<name>.html, and the nav link for the current page gets
 * aria-current="page".
 */
function partials(): Plugin {
  return {
    name: "ma-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const page = basename(ctx.filename, ".html");
        let out = html;
        for (let i = 0; i < 3 && out.includes("<!-- @include"); i++) {
          out = out.replace(/<!-- @include ([a-z-]+) -->/g, (_, name: string) =>
            readFileSync(resolve(root, "partials", `${name}.html`), "utf8").trim(),
          );
        }
        return out.replaceAll(`data-nav="${page}"`, `data-nav="${page}" aria-current="page"`);
      },
    },
  };
}

/** The public origin, for the absolute URLs social cards and the sitemap need. */
const site = (process.env.SITE_URL ?? "https://municipal-agents.fly.dev").replace(/\/$/, "");

/** Absolute og:image URLs, and a sitemap.xml at the dist root (the server serves it at /sitemap.xml). */
function seo(): Plugin {
  return {
    name: "ma-seo",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === "asset" && f.fileName.endsWith(".html") && typeof f.source === "string") {
          f.source = f.source.replace(/(<meta property="og:image" content=")\//g, `$1${site}/`);
        }
      }
      const urls = pages.map((p) => `  <url><loc>${site}/${p === "index" ? "" : p}</loc></url>`).join("\n");
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
    },
  };
}

/** In dev, serve /pricing etc. the way the app server does in production. */
function prettyRoutes(): Plugin {
  return {
    name: "ma-pretty-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? "/").split("?")[0];
        const name = path.replace(/^\/|\/$/g, "");
        if (pages.includes(name) && name !== "index") req.url = `/${name}.html`;
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/",
  // Images live in public/ as sources and are referenced from the HTML, so Vite hashes
  // them into /landing-assets/ along with the CSS, JS and fonts. Nothing is copied to
  // the dist root, so nothing can clash with the app's own files.
  publicDir: false,
  plugins: [partials(), prettyRoutes(), seo()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "landing-assets",
    assetsInlineLimit: 0,
    target: "es2022",
    cssMinify: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(root, `${p}.html`)])),
    },
  },
  server: { port: 5180 },
});
