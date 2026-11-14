// Half-resolution draft render for checking timing and layout.
// npm run preview -- [output.mp4] [--frames=a-b]
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) ?? join(tmpdir(), "municipal-agents-preview.mp4"));
const extra = args.filter((a) => a.startsWith("--"));
execFileSync("node", [join(root, "scripts", "gen.mjs")], { stdio: "inherit" });
execFileSync(
  "npx",
  ["remotion", "render", "src/index.ts", "MunicipalAgents", out, "--scale=0.5", "--codec=h264", "--crf=26", "--concurrency=4", "--log=warn", ...extra],
  { cwd: root, stdio: "inherit" },
);
console.log(`preview: ${out}`);
