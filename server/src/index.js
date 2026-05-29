import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './lib/log.js';
import { initDb } from './db/index.js';
import { hydrateFromDisk } from './db/hydrate.js';
import { sweepIncompleteNodes } from './store/sweep.js';

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

async function main() {
  ensureDirs();
  await initDb();
  // BEFORE hydrate: drop any half-generated nodes left over from a prior
  // crash / SIGINT mid-pipeline so the DB never indexes the broken rows.
  await sweepIncompleteNodes();
  await hydrateFromDisk();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log.info(`Flipbook server listening on http://${config.host}:${config.port}`);
    log.info(`  data dir: ${config.dataDir}`);
    log.info(`  prompts:  ${config.promptsDir}`);
    log.info(`  codebuddy: ${config.enableCodebuddy ? 'enabled' : 'disabled (stub mode)'}`);
  });

  // Graceful shutdown: on SIGTERM/SIGINT, sweep again to clean any node
  // that was mid-flight at shutdown time so the next boot's tree is
  // self-consistent without relying solely on boot-time cleanup.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`[shutdown] ${signal} received — sweeping in-flight nodes`);
    try { await sweepIncompleteNodes(); } catch (e) { log.warn(`[shutdown] sweep failed: ${e?.message}`); }
    server.close(() => {
      log.info('[shutdown] http server closed');
      process.exit(0);
    });
    // Hard-exit if cleanup hangs > 5s (won't normally happen).
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  log.error('fatal startup error', e?.stack || e);
  process.exit(1);
});
