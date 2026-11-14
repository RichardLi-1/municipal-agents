// Screenshots for checking the design: node scripts/shots.mjs [baseUrl] [outDir] [--fixtures]
// Uses the installed Google Chrome through playwright-core.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "./shots";
const fixtures = process.argv.includes("--fixtures");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
mkdirSync(out, { recursive: true });

const q = fixtures ? "?fixtures" : "";
const pages = [
  { name: "home", path: "/" },
  { name: "decision", path: "/d/DECISION" },
  { name: "affects", path: "/d/DECISION?tab=affects", act: async (p) => { const b = p.locator(".chip-toggle"); await b.nth(0).click(); await b.nth(2).click(); } },
  { name: "say", path: "/d/DECISION?tab=say" },
  { name: "transit", path: "/d/DECISION?tab=transit", act: async (p) => { await p.locator(".gap").first().click(); await p.waitForTimeout(1500); } },
  { name: "costs", path: "/d/DECISION?tab=costs" },
  { name: "commitments", path: "/d/DECISION?tab=commitments" },
  { name: "housing", path: "/d/DECISION?tab=housing" },
  { name: "construction", path: "/d/DECISION?tab=construction", act: async (p) => { await p.waitForTimeout(2500); } },
  { name: "chat", path: "/d/DECISION", act: async (p) => { await p.locator(".suggest-btn").nth(1).click(); await p.waitForTimeout(6500); } },
  { name: "source", path: "/d/DECISION", act: async (p) => { await p.locator(".chip-cite").first().click(); await p.waitForTimeout(2500); } },
  { name: "log", path: "/log" },
  { name: "spend", path: "/spend" },
  { name: "staff", path: "/staff" },
];

const decision = process.env.DECISION ?? (fixtures ? "fairway-station-area" : "row-2027-budget");
const browser = await chromium.launch({ channel: "chrome" });
const sizes = [
  { tag: "1920-light", w: 1920, h: 1080, scheme: "light" },
  { tag: "1920-dark", w: 1920, h: 1080, scheme: "dark" },
  { tag: "390", w: 390, h: 844, scheme: "light", mobile: true },
];
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: s.scheme, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${s.tag}] pageerror`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log(`[${s.tag}] console`, m.text()));
  for (const pg of pages) {
    if (only && !only.split(",").includes(pg.name)) continue;
    const path = pg.path.replace("DECISION", decision);
    const url = base + path + (path.includes("?") ? q.replace("?", "&") : q);
    await page.goto(url, { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(3000);
    if (pg.act) await pg.act(page).catch((e) => console.log(`[${s.tag}] ${pg.name} act failed`, e.message));
    await page.screenshot({ path: `${out}/${pg.name}-${s.tag}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log("done");
