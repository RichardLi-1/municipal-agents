// Screenshots of every landing page for a design check, in the installed Chrome:
// 1920x1080 light and dark (full page), and 390x844 (full page).
//   node scripts/check.mjs [baseUrl] [outDir] [--only=index,pricing] [--og]
// --og also writes public/og.jpg (1200x630) from the home page hero.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = (args[0] ?? "http://localhost:4180").replace(/\/$/, "");
const out = args[1] ?? join(here, "..", ".shots");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const og = process.argv.includes("--og");
mkdirSync(out, { recursive: true });

const pages = [
  ["index", "/"],
  ["pricing", "/pricing"],
  ["security", "/security"],
  ["company", "/company"],
  ["contact", "/contact"],
  ["changelog", "/changelog"],
];
const sizes = [
  { tag: "1920-light", w: 1920, h: 1080, scheme: "light", dpr: 1 },
  { tag: "1920-dark", w: 1920, h: 1080, scheme: "dark", dpr: 1 },
  { tag: "390", w: 390, h: 844, scheme: "light", dpr: 2, mobile: true },
];

const browser = await chromium.launch({ channel: "chrome" });
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, colorScheme: s.scheme, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${s.tag}] pageerror`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log(`[${s.tag}] console`, m.text()));
  for (const [name, path] of pages) {
    if (only && !only.includes(name)) continue;
    await page.goto(base + path, { waitUntil: "networkidle" });
    // Load lazy images before the full-page capture.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll("img[loading=lazy]")) img.loading = "eager";
      await Promise.all([...document.images].filter((i) => !i.complete && i.offsetParent).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) console.log(`[${s.tag}] ${name}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: join(out, `${name}-${s.tag}.png`), fullPage: true });
    // Viewport-sized slices of the full page, easier to review one at a time.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const sliceH = s.mobile ? s.h * 2 : s.h;
    for (let i = 0, y = 0; y < total; i++, y += sliceH) {
      await page.screenshot({ path: join(out, `${name}-${s.tag}-s${i}.png`), fullPage: true, clip: { x: 0, y, width: s.w, height: Math.min(sliceH, total - y) } });
    }
  }
  await ctx.close();
}
if (og) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: ".site-header,.hero-proof,.hero-actions,.eyebrow--chip,.hero .lead,.callouts{display:none!important}.hero{padding-top:40px!important}.hero-inner{padding-top:56px!important;gap:20px!important}.hero .display{font-size:80px!important;max-width:none!important}.hero .lead{font-size:20px!important;max-width:820px!important}.hero-visual{margin-top:36px!important}" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(here, "..", "public", "og.jpg"), type: "jpeg", quality: 86 });
  await ctx.close();
}
await browser.close();
console.log("done", out);
