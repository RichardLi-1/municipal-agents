// Entry point: `node server/main.ts`. Reads settings, mirrors committed data into the
// data volume (on Fly), opens the log, tries to load the agents, and listens.
import { createApp } from "./app.ts";
import { syncCorrections } from "./corrections.ts";
import { loadConfig } from "./config.ts";
import { syncCommittedData } from "./data.ts";
import { createServer } from "./server.ts";
import { materializeUploads } from "./upload.ts";

const cfg = loadConfig();
const synced = syncCommittedData(cfg.appData, cfg.dataDir);
if (synced.copied || synced.removed) console.log(`data: copied ${synced.copied}, removed ${synced.removed} into ${cfg.dataDir}`);
// The mirror rewrote sources/index.json from the image; put staff uploads back in.
materializeUploads(cfg.dataDir);

const app = createApp(cfg);
// Operator corrections go on the public record the first time they're applied.
const corrected = syncCorrections(app);
if (corrected.logged || corrected.refused) console.log(`corrections: ${corrected.logged} logged, ${corrected.refused} refused`);
await app.agents.load();
const agents = app.agents.status();
console.log(`agents: ${agents.available ? "loaded" : agents.error}`);
if (app.log.migrated) console.log(`log: migrated ${app.log.migrated.entries} entries to payload hashing (old head ${app.log.migrated.legacyHeadHash.slice(0, 12)}…)`);
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
