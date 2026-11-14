// Screenshots of the built docs for a visual check: desktop light and dark, and phone.
//   node serve.ts &  then  node shots.ts [outDir] [baseUrl]
// Uses the Chrome already installed (playwright-core, channel "chrome").
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "shots"));
const base = process.argv[3] ?? "http://localhost:4791";
const only = process.env.PAGES?.split(",");
const pages = only ?? ["/docs/", "/docs/residents/", "/docs/api/", "/docs/how-it-works/", "/docs/planners/", "/docs/staff/"];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const views = [
  { name: "desktop-light", viewport: { width: 1920, height: 1080 }, scheme: "light" as const, mobile: false },
  { name: "desktop-dark", viewport: { width: 1920, height: 1080 }, scheme: "dark" as const, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, scheme: "light" as const, mobile: true },
];
const errors: string[] = [];
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.scheme, deviceScaleFactor: v.mobile ? 2 : 1, isMobile: v.mobile, hasTouch: v.mobile });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.name} ${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${v.name} ${page.url()}: ${e.message}`));
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    const slug = p.replace(/^\/docs\/?/, "").replace(/\/$/, "").replace(/\//g, "-") || "index";
    await page.screenshot({ path: path.join(out, `${slug}-${v.name}.png`), fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) errors.push(`${v.name} ${p}: page scrolls sideways by ${overflow}px`);
  }
  await ctx.close();
}
await browser.close();
console.log(`screenshots in ${out}`);
for (const e of errors) console.log("  " + e);
