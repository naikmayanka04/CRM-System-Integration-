import { createApp, createServices } from './app.js';
import { loadConfig, requireDatabaseUrl } from './config.js';
import { createDb, migrate } from './db.js';
import { createPool } from './pool.js';

const cfg = loadConfig();
requireDatabaseUrl(cfg);
const db = createDb(createPool(cfg));
await migrate(db);

const server = createApp({ crm: createServices(db), webDir: cfg.webDir }).listen(cfg.port, () => {
  console.log(`CRM listening on http://localhost:${cfg.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(async () => { await db.end(); process.exit(0); }));
}
