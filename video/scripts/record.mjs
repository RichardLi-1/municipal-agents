// Records the product clips the video needs, from the live site (or a local server),
// with a visible synthetic cursor and typing at human speed.
//
//   node scripts/record.mjs [baseUrl] [--only=home,ask] [--decision=row-2027-budget] [--shots]
//                           [--out=<scratch dir> for a trial run] [--query=fixtures]
//                           [--staff-base=http://127.0.0.1:4199]
//
// Resident clips record from the live site. Staff clips (draft, review, publish) record
// only from a local throwaway server: run `sh scripts/staff-server.sh` first (it copies
// data/ to a scratch folder and serves it on port 4199). STAFF_TOKEN comes from the
// repo's .env via `npm run record` and is typed into the password field, never printed.
//
// Each clip is a scripted interaction at 1920x1080, captured with the Chrome DevTools
// screencast (JPEG frames with timestamps, re-timed to 30 fps by ffmpeg), so it is sharper
// than Playwright's recordVideo. Clips land in public/footage/<id>.mp4 (gitignored); the
// time of each action is written to footage-marks.json so scenes can line actions up
// with beats. --shots also takes the 2x stills (dark mode, phone, close-ups).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith("--")) ?? "https://municipal-agents.fly.dev").replace(/\/$/, "");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const decision = args.find((a) => a.startsWith("--decision="))?.slice(11) ?? "row-2027-budget";
const wantShots = args.includes("--shots");
// --dsf=2 records at 3840x2160 for crisper deep zooms (the screencast may drop frames).
const dsf = Number(args.find((a) => a.startsWith("--dsf="))?.slice(6) ?? 2);
const testOut = args.find((a) => a.startsWith("--out="))?.slice(6); // a scratch folder for trial runs
const query = args.find((a) => a.startsWith("--query="))?.slice(8) ?? ""; // e.g. fixtures, for a local dev server
// Staff clips approve, edit, reject and publish. They only ever run against a local
// throwaway server (scripts/staff-server.sh), never the live site.
const staffBase = (args.find((a) => a.startsWith("--staff-base="))?.slice(13) ?? "http://127.0.0.1:4199").replace(/\/$/, "");
const isLocal = (u) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(u).hostname);
const outDir = testOut ? resolve(testOut) : join(root, "public", "footage");
const shotsDir = testOut ? resolve(testOut) : join(root, "public", "shots");
mkdirSync(outDir, { recursive: true });
mkdirSync(shotsDir, { recursive: true });
const marksFile = testOut ? join(outDir, "footage-marks.json") : join(root, "footage-marks.json");
const withQuery = (path) => (query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path);
let marks = {};
try {
  marks = JSON.parse(readFileSync(marksFile, "utf8"));
} catch {}

const D = `/d/${decision}`;

// A cursor drawn into the page, following real mouse events, with a ripple on click.
const cursorScript = () => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.4 L14.4 20.2 L11.4 13.6 L17.6 13.6 Z" fill="#0b0b0c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0px", top: "0px", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-6px,-3px)", transition: "transform 80ms", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, true);
    addEventListener("mousedown", (e) => {
      c.style.transform = "translate(-6px,-3px) scale(0.86)";
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: `${e.clientX - 22}px`, top: `${e.clientY - 22}px`, width: "44px", height: "44px", borderRadius: "50%", background: "rgba(31,95,214,.28)", zIndex: 2147483646, pointerEvents: "none", transition: "transform 420ms ease-out, opacity 420ms ease-out" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(2.2)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener("mouseup", () => { c.style.transform = "translate(-6px,-3px)"; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

/** Helpers each clip script uses. `mark(name)` stores seconds since the clip started. */
const helpers = (page, t0, clipMarks) => {
  let pos = { x: 960, y: 540 };
  const mark = (name) => (clipMarks[name] = Number(((Date.now() - t0) / 1000).toFixed(2)));
  const wait = (ms) => page.waitForTimeout(ms);
  const moveTo = async (target, ms = 650) => {
    const loc = typeof target === "string" ? page.locator(target).first() : target;
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const b = await loc.boundingBox({ timeout: 4000 });
    if (!b) throw new Error(`no box for ${target}`);
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await page.mouse.move(pos.x + (to.x - pos.x) * e, pos.y + (to.y - pos.y) * e);
      await wait(ms / steps);
    }
    pos = to;
  };
  const click = async (target, name) => {
    await moveTo(target);
    await wait(120);
    if (name) mark(name);
    await page.mouse.down();
    await wait(70);
    await page.mouse.up();
  };
  const type = async (target, text, name) => {
    await click(target);
    if (name) mark(name);
    await page.keyboard.type(text, { delay: 75 });
  };
  const moveToXY = async (x, y, ms = 500) => {
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await page.mouse.move(pos.x + (x - pos.x) * e, pos.y + (y - pos.y) * e);
      await wait(ms / steps);
    }
    pos = { x, y };
  };
  /** Wheel-scroll whatever is under a point (the brief pane, not the map). */
  const scrollAt = async (at, dy, ms = 900) => {
    await moveToXY(at.x, at.y, 400);
    await scroll(dy, ms);
  };
  const scroll = async (dy, ms = 900) => {
    const steps = Math.round(ms / 30);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps);
      await wait(30);
    }
  };
  return { mark, wait, moveTo, moveToXY, click, type, scroll, scrollAt, page };
};

// The clips. Selectors follow web/ (see web/scripts/shots.mjs); the first that matches wins.
const any = (...sels) => sels.join(", ");
const Q_TRANSIT = "How much of my regional tax bill goes to public transit?";
const Q_OPINION = "Should I support this budget or oppose it?";
const REVIEWER = "Jordan Lee"; // the fictional clerk, local server only
const askBox = any('textarea[placeholder="Your question"]', 'input[placeholder="Your question"]');
const ask = async (h, q) => {
  await h.type(askBox, q, "typed");
  await h.page.keyboard.press("Enter");
  h.mark("asked");
  await h.page.waitForSelector("text=/Answered by the agents on/i", { timeout: 60000 }).catch(() => {});
  h.mark("answer");
};
// Before recording: bring the brief's tabs to the top of its pane, so a tab's content is in view.
const toTabs = async (page, extra = 0) => {
  await page.locator('[role="tablist"]').first().evaluate((el, dy) => {
    el.scrollIntoView({ block: "start" });
    let p = el.parentElement;
    while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement;
    if (p) p.scrollTop += dy - 8;
  }, extra).catch(() => {});
  await page.waitForTimeout(400);
};
const centre = async (page, sel) => {
  await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await page.waitForTimeout(400);
};
const signIn = async (page) => {
  const pass = page.locator('input[type="password"]');
  if (await pass.count()) {
    await pass.fill(process.env.STAFF_TOKEN ?? "");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
  }
  await page.locator("select").first().selectOption(decision).catch(() => {});
  await page.locator('label:has-text("Your name") input').first().fill(REVIEWER).catch(() => {});
  await page.waitForTimeout(800);
};
const BRIEF_PANE = { x: 400, y: 800 };
const FIGURE_CITE = 'button.figure:has-text("3,473.86")';
const clips = {
  home: { path: "/decisions", act: async (h) => {
    await h.wait(700);
    await h.type(any('input[type="search"]', 'input[placeholder*="xample"]', 'input[placeholder*="treet"]'), "King Street", "typed");
    await h.wait(1100);
    await h.page.keyboard.press("Escape").catch(() => {});
    const card = any(`a.stretched[href="${D}"]`, `a[href="${D}"]`);
    await h.moveTo(card, 900);
    h.mark("card");
    await h.wait(900);
    await h.click(card, "open");
    await h.wait(1800);
  } },
  overview: { path: D, act: async (h) => {
    await h.wait(500);
    await h.moveTo(':text("reading level")', 800);
    h.mark("grade");
    await h.wait(900);
    await h.scrollAt(BRIEF_PANE, 560, 1400);
    await h.wait(1400);
  } },
  // A key figure: the 2026 total regional bill for an average home ($3,473.86, budget book p. 11).
  source: { path: D, prep: (page) => centre(page, FIGURE_CITE), act: async (h) => { await h.wait(500); await h.click(FIGURE_CITE, "cite"); await h.wait(3800); } },
  affects: { path: `${D}?tab=affects`, prep: (page) => toTabs(page), act: async (h) => {
    await h.wait(500);
    await h.click(".chip-toggle >> nth=0", "chip1");
    await h.wait(500);
    await h.click(".chip-toggle >> nth=2", "chip2");
    await h.wait(1200);
    await h.scrollAt(BRIEF_PANE, 320, 1000);
    await h.wait(1200);
  } },
  "ask-opinion": { path: D, act: async (h) => { await h.wait(500); await ask(h, Q_OPINION); await h.wait(4000); } },
  say: { path: `${D}?tab=say`, prep: (page) => toTabs(page), act: async (h) => {
    await h.wait(900);
    h.mark("timeline");
    const smooth = (sel) => h.page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => {});
    await smooth(':text("Next chance")');
    await h.wait(1300);
    h.mark("next");
    await h.wait(1500);
    await smooth(':text("Add to calendar")');
    await h.wait(1100);
    await h.click(any('a:has-text("Add to calendar")', 'button:has-text("Add to calendar")', 'a[download$=".ics"]'), "calendar");
    await h.wait(1800);
  } },
  // A real agent run replayed from the record: plan, steps, checked statements, answer. Sped up 2x.
  ask: { path: D, speed: 2, act: async (h) => { await h.wait(500); await ask(h, Q_TRANSIT); await h.wait(4000); } },
  transit: { path: `${D}?tab=transit`, prep: (page) => toTabs(page), act: async (h) => {
    await h.wait(1000);
    await h.click(".gap >> nth=0", "gap");
    await h.wait(2200);
    await h.scrollAt(BRIEF_PANE, 520, 1200);
    h.mark("gaps");
    await h.wait(1300);
    await h.moveTo(':text("Possible fixes, ranked")', 700);
    h.mark("fixes");
    await h.scrollAt(BRIEF_PANE, 250, 800);
    await h.wait(2200);
  } },
  // Chart and figures first, then a slider, then back up to the recomputed figures.
  costs: { path: `${D}?tab=costs`, prep: (page) => toTabs(page), act: async (h) => {
    h.mark("chart");
    await h.wait(1600);
    const slider = h.page.locator('input[type="range"]').first();
    await h.moveTo(slider, 600);
    const b = await slider.boundingBox();
    if (b) {
      h.mark("slide");
      await h.page.mouse.down();
      for (let i = 0; i < 28; i++) { await h.page.mouse.move(b.x + b.width / 2 + i * (b.width / 60), b.y + b.height / 2); await h.wait(34); }
      await h.page.mouse.up();
    }
    // Back up to the headline figures, which have recomputed.
    await h.page.locator(':text-matches("per household", "i")').first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => {});
    h.mark("result");
    await h.wait(2200);
  } },
  "scout-map": { path: D, prep: (page) => toTabs(page), act: async (h) => {
    await h.wait(500);
    await h.click('[role="tab"]:has-text("Construction")', "tab");
    await h.wait(4000);
  } },
  "scout-section": { path: `${D}?tab=construction`, prep: (page) => centre(page, "#cx-ls"), act: async (h) => { h.mark("section"); await h.wait(4000); } },
  "scout-steps": { path: `${D}?tab=construction`, prep: (page) => centre(page, ".cx-stepper"), act: async (h) => {
    await h.wait(600);
    const steps = h.page.locator(".cx-stepper button");
    const n = await steps.count();
    for (let i = 0; i < n; i++) { await h.click(steps.nth(i), `step${i + 1}`); await h.wait(1400); }
  } },
  commitments: { path: `${D}?tab=commitments`, prep: (page) => toTabs(page), act: async (h) => {
    await h.wait(600);
    await h.moveTo(".commit .status >> nth=0", 600);
    h.mark("status");
    await h.wait(900);
    await h.moveTo(".commit .unclear >> nth=0", 700);
    h.mark("unclear");
    await h.wait(1600);
  } },
  housing: { path: `${D}?tab=housing`, prep: (page) => toTabs(page), act: async (h) => { await h.wait(1000); await h.scrollAt(BRIEF_PANE, 260, 1200); await h.wait(1600); } },
  unknowns: { path: `${D}?tab=unknowns`, prep: (page) => toTabs(page), act: async (h) => { await h.wait(900); await h.scrollAt(BRIEF_PANE, 900, 6000); await h.wait(800); } },
  // Staff, LOCAL ONLY: a replay of the agents' real brief run, then review and publish.
  "staff-draft": { path: "/staff", staff: true, prep: signIn, act: async (h) => {
    await h.wait(900);
    await h.click('button:has-text("Replay the agents")', "start");
    await h.page.waitForSelector(':text("Draft ready for review")', { timeout: 120000 }).catch(() => {});
    h.mark("drafted");
    await h.scrollAt({ x: 960, y: 700 }, 500, 1500);
    await h.wait(2500);
  } },
  // Every statement reviewed: one edited and one rejected at readable speed at the top,
  // the rest approved quickly, then a named person publishes.
  "staff-review": { path: "/staff", staff: true, prep: async (page) => {
    await signIn(page);
    await page.locator('button:has-text("Replay the agents")').first().click().catch(() => {});
    await page.waitForSelector(':text("Draft ready for review")', { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator(".review-row").first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, -140)).catch(() => {});
    await page.waitForTimeout(400);
  }, act: async (h) => {
    await h.wait(400);
    const rows = h.page.locator(".review-row");
    await h.moveTo(rows.nth(0).locator('button:has-text("Edit")'), 500);
    h.mark("edit");
    await h.click(rows.nth(0).locator('button:has-text("Edit")'));
    await rows.nth(0).locator("textarea").press("End").catch(() => {});
    await h.page.keyboard.type(" (a forecast)", { delay: 45 });
    await h.wait(250);
    await h.click(rows.nth(0).locator('button:has-text("Save")'), "saved");
    await h.wait(500);
    await h.moveTo(rows.nth(1).locator('button:has-text("Reject")'), 500);
    h.mark("reject");
    await h.click(rows.nth(1).locator('button:has-text("Reject")'));
    await h.wait(700);
    const n = await rows.count();
    h.mark("approve");
    await h.moveTo(rows.nth(2).locator('button:has-text("Approve")'), 450);
    for (let i = 2; i < n; i++) {
      await rows.nth(i).locator('button:has-text("Approve")').click({ timeout: 3000 }).catch(() => {});
      await h.wait(40);
    }
    h.mark("approved-all");
    await h.wait(400);
    await h.click('button:has-text("Publish")', "publish");
    await h.page.waitForSelector(':text("Published ·")', { timeout: 20000 }).catch(() => {});
    h.mark("published");
    await h.wait(3000);
  } },
  log: { path: "/log", act: async (h) => { await h.wait(2800); h.mark("chain"); await h.scrollAt({ x: 960, y: 700 }, 380, 1000); await h.wait(1000); } },
  spend: { path: "/spend", act: async (h) => { await h.wait(4500); } },
  language: { path: D, act: async (h) => {
    await h.wait(500);
    await h.click(any('select[aria-label*="anguage" i]', 'button[aria-label*="anguage" i]', '[class*="lang"] button', 'button:has-text("EN")'), "menu");
    await h.wait(600);
    const fr = h.page.locator(any('[role="menuitem"]:has-text("Français")', 'button:has-text("Français")', 'li:has-text("Français")')).first();
    if (await fr.count()) await h.click(fr, "pick");
    else { await h.page.keyboard.press("ArrowDown"); await h.page.keyboard.press("Enter"); h.mark("pick"); }
    await h.wait(3500);
  } },
  a11y: { path: D, noCursor: true, act: async (h) => { await h.wait(500); for (let i = 0; i < 10; i++) { await h.page.keyboard.press("Tab"); await h.wait(380); } h.mark("tabbed"); } },
  // For cities: a quick flash of each (record after they're polished).
  landing: { path: "/", act: async (h) => { await h.wait(1500); await h.scrollAt({ x: 960, y: 600 }, 300, 800); await h.wait(500); } },
  docs: { path: "/docs", act: async (h) => { await h.wait(1500); await h.scrollAt({ x: 960, y: 600 }, 300, 800); await h.wait(500); } },
  embed: { path: "/embed/demo", act: async (h) => { await h.wait(2500); await h.scrollAt({ x: 960, y: 600 }, 200, 600); await h.wait(500); } },
};

const browser = await chromium.launch({ channel: "chrome", args: ["--hide-scrollbars"] });

async function record(id, spec) {
  const root = spec.staff ? staffBase : base;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dsf, colorScheme: "light" });
  if (!spec.noCursor) await ctx.addInitScript(cursorScript);
  const page = await ctx.newPage();
  await page.goto(root + withQuery(spec.path), { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(2200);
  if (spec.prep) await spec.prep(page);
  await page.mouse.move(960, 540);
  const cdp = await ctx.newCDPSession(page);
  const tmp = mkdtempSync(join(tmpdir(), `clip-${id}-`));
  const frames = [];
  let stopped = false;
  cdp.on("Page.screencastFrame", async (f) => {
    if (stopped) return;
    const n = frames.length;
    try {
      writeFileSync(join(tmp, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(f.data, "base64"));
    } catch {
      return;
    }
    frames.push(f.metadata.timestamp);
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920 * dsf, maxHeight: 1080 * dsf, everyNthFrame: 1 });
  const t0 = Date.now();
  const clipMarks = {};
  try {
    await spec.act(helpers(page, t0, clipMarks));
  } catch (e) {
    console.log(`  ${id}: ${e.message}`);
  }
  await page.waitForTimeout(300);
  // The screencast only sends a frame when the page changes, so the last frame lasts
  // until the moment recording stopped.
  const endAt = Date.now() / 1000;
  stopped = true;
  await cdp.send("Page.stopScreencast");
  frames.push(Math.max(endAt, frames.at(-1) + 1 / 30));
  // Re-time: each frame lasts until the next one arrived.
  const list = frames.slice(0, -1).map((t, i) => `file '${join(tmp, `${String(i).padStart(5, "0")}.jpg`)}'\nduration ${Math.max(0.001, frames[i + 1] - t).toFixed(4)}`);
  // ffconcat ignores the last entry's duration unless that file is listed once more.
  const lastFile = `file '${join(tmp, `${String(frames.length - 2).padStart(5, "0")}.jpg`)}'`;
  writeFileSync(join(tmp, "list.txt"), `ffconcat version 1.0\n${list.join("\n")}\n${lastFile}\n`);
  const speed = spec.speed ?? 1;
  const out = join(outDir, `${id}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-vf", `setpts=PTS/${speed},fps=30,scale=${1920 * dsf}:${1080 * dsf}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-an", out]);
  rmSync(tmp, { recursive: true, force: true });
  for (const k of Object.keys(clipMarks)) clipMarks[k] = Number((clipMarks[k] / speed).toFixed(2));
  marks[id] = { ...clipMarks, speed, recordedAt: new Date().toISOString(), url: root + spec.path };
  writeFileSync(marksFile, JSON.stringify(marks, null, 2) + "\n");
  console.log(`  ${id}: ${frames.length - 1} frames -> ${out}`);
  await ctx.close();
}

for (const [id, spec] of Object.entries(clips)) {
  if (only && !only.includes(id)) continue;
  if (spec.staff && !isLocal(staffBase)) {
    console.log(`  ${id}: skipped. Staff clips run only against a local throwaway server (scripts/staff-server.sh), not ${staffBase}`);
    continue;
  }
  if (spec.staff && (await fetch(`${staffBase}/api/health`).then((r) => !r.ok).catch(() => true))) {
    console.log(`  ${id}: skipped. Start the local staff server first: sh scripts/staff-server.sh`);
    continue;
  }
  console.log(`recording ${id} (${spec.staff ? staffBase : base}${spec.path})`);
  await record(id, spec);
}

if (wantShots) {
  const shot = async (name, path, opts, act) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(base + withQuery(path), { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(2000);
    if (act) await act(page).catch(() => {});
    await page.screenshot({ path: join(shotsDir, `${name}.png`) });
    await ctx.close();
    console.log(`  shot ${name}`);
  };
  await shot("dark", D, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await shot("phone", D, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await shot("overview-2x", D, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
}
await browser.close();
