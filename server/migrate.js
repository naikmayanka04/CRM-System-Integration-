import { loadConfig, requireDatabaseUrl } from './config.js';
import { createDb, migrate } from './db.js';
import { createPool } from './pool.js';

const cfg = loadConfig();
requireDatabaseUrl(cfg);
const db = createDb(createPool(cfg));
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.end();
}
