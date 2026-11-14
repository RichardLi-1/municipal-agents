// Entry point: `node server/main.ts`. Reads settings, mirrors committed data into the
// data volume (on Fly), opens the log, tries to load the agents, and listens.
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { syncCommittedData } from "./data.ts";
import { createServer } from "./server.ts";

const cfg = loadConfig();
const synced = syncCommittedData(cfg.appData, cfg.dataDir);
if (synced.copied || synced.removed) console.log(`data: copied ${synced.copied}, removed ${synced.removed} into ${cfg.dataDir}`);

const app = createApp(cfg);
await app.agents.load();
const agents = app.agents.status();
console.log(`agents: ${agents.available ? "loaded" : agents.error}`);
console.log(`log: ${app.log.count()} entries, chain ${app.log.verifyChain().intact ? "intact" : "BROKEN"}`);
if (!cfg.staffToken) console.warn("STAFF_TOKEN is not set: staff routes will answer 503");

const server = createServer(app);
server.listen(cfg.port, cfg.host, () => {
  console.log(`Municipal Agents on http://localhost:${cfg.port} (data: ${cfg.dataDir})`);
});

// Fly sends SIGINT/SIGTERM on deploy: stop taking requests, then close the log cleanly.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`${sig}: shutting down`);
    server.close();
    server.closeAllConnections();
    app.log.close();
    process.exit(0);
  });
}
