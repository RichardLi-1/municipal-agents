// Screenshots of each page and tab at 1920x1080, for planning camera moves.
// node scripts/look.mjs <outDir> [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2];
const base = (process.argv[3] ?? "https://municipal-agents.fly.dev").replace(/\/$/, "");
mkdirSync(out, { recursive: true });
const D = "/d/row-2027-budget";
const pages = [
  ["decisions", "/decisions"],
  ["overview", D],
  ["affects", `${D}?tab=affects`],
  ["say", `${D}?tab=say`],
  ["transit", `${D}?tab=transit`],
  ["costs", `${D}?tab=costs`],
  ["commitments", `${D}?tab=commitments`],
  ["housing", `${D}?tab=housing`],
  ["construction", `${D}?tab=construction`],
  ["unknowns", `${D}?tab=unknowns`],
  ["log", "/log"],
  ["spend", "/spend"],
];
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(name);
}
await browser.close();
