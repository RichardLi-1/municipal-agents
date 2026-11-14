// Captures the product screenshots the landing site shows, from the live app.
//   node scripts/shots.mjs [baseUrl] [--only=home,decision]
// Uses the installed Google Chrome through playwright-core, 1920x1080 at 2x, light and
// dark, then compresses each to WebP with cwebp into public/shots/.
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "https://municipal-agents.fly.dev").replace(/\/$/, "");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const out = join(here, "..", "public", "shots");
const tmp = join(tmpdir(), `ma-landing-shots-${process.pid}`);
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const budget = "row-2027-budget";
const water = "row-water-supply-2051";
// Full views get a large and a small size; lens views are cropped to the brief pane
// and a little map (CSS px, before the 2x), with the open tab scrolled to the top.
const lensCrop = [84, 0, 760, 570]; // the brief pane (after the rail) and a strip of map, 4:3
const wideCrop = [0, 0, 1440, 810]; // rail, pane and map, 16:9
const panel = async (p) => {
  await p.waitForSelector('[role="tablist"]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const tabs = document.querySelector('[role="tablist"]');
    if (!tabs) return;
    let sc = tabs.parentElement;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc && sc !== document.body) sc.scrollTop += tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
  });
  await p.waitForTimeout(500);
};
const shots = [
  { name: "brief", path: [`/d/${budget}`], sizes: [2400, 1200] },
  { name: "affects", path: [`/d/${budget}?tab=affects`], crop: wideCrop, sizes: [1440], act: async (p) => { const b = p.locator(".chip-toggle"); if (await b.count()) { await b.nth(0).click(); await b.nth(2).click().catch(() => {}); } await panel(p); } },
  { name: "transit", path: [`/d/${budget}?tab=transit`], crop: lensCrop, sizes: [960], act: panel },
  { name: "costs", path: [`/d/${water}?tab=costs`, `/d/${budget}?tab=costs`], crop: lensCrop, sizes: [960], act: panel },
  { name: "commitments", path: [`/d/${budget}?tab=commitments`], crop: lensCrop, sizes: [960], act: panel },
  { name: "housing", path: [`/d/${budget}?tab=housing`], crop: lensCrop, sizes: [960], act: panel },
];

const browser = await chromium.launch({ channel: "chrome" });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ma-theme", t); } catch {} }, scheme);
  const page = await ctx.newPage();
  for (const s of shots) {
    if (only && !only.includes(s.name)) continue;
    let ok = false;
    for (const p of s.path) {
      const res = await page.goto(base + p, { waitUntil: "load", timeout: 30000 }).catch(() => null);
      if (!res || !res.ok()) continue;
      const html = await page.content();
      if (html.includes("hero-map") || html.includes("data-nav=")) continue; // the marketing site, not the app
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(2200);
      if (await page.getByText("Page not found").count()) continue; // the app's 404: try the next path
      if (s.needs) {
        const tab = await page.locator(`[role="tab"]:has-text("Construction"), button:has-text("Construction")`).count();
        if (!tab) continue;
      }
      if (s.act) await s.act(page).catch((e) => console.log(`${s.name}: act failed`, e.message));
      await page.mouse.move(1919, 1079);
      await page.waitForTimeout(500);
      const png = join(tmp, `${s.name}-${scheme}.png`);
      await page.screenshot({ path: png });
      const crop = s.crop ? ["-crop", ...s.crop.map((v) => String(v * 2))] : [];
      s.sizes.forEach((w, i) => {
        const webp = join(out, `${s.name}-${scheme}${i ? "-sm" : ""}.webp`);
        execFileSync("cwebp", ["-quiet", "-q", i ? "76" : "80", "-m", "6", ...crop, "-resize", String(w), "0", png, "-o", webp]);
      });
      console.log(`${s.name}-${scheme}: ${base + p}`);
      ok = true;
      break;
    }
    if (!ok) console.log(`${s.name}-${scheme}: skipped (not available)`);
  }
  await ctx.close();
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log("done");
