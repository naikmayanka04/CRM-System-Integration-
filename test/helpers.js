import { randomBytes } from 'node:crypto';
import { createApp, createServices } from '../server/app.js';
import { createDb, migrate } from '../server/db.js';
import { createPool } from '../server/pool.js';
import { seedDemo } from '../server/seed.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
/** Pass as `{ skip }` to DB-backed tests: they are reported as skipped, never silently passed. */
export const dbSkip = TEST_DB_URL ? false : 'TEST_DATABASE_URL not set (needs a throwaway Postgres database; see .env.example)';
const quiet = { error() {}, log() {} };

/** Creates an isolated schema in the test database, migrates it, and returns a db plus a cleanup function. */
export async function freshDb({ seed = false } = {}) {
  const base = { databaseUrl: TEST_DB_URL, dbSsl: process.env.TEST_DB_SSL ?? 'off' };
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = createPool(base);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = createDb(createPool({ ...base, searchPath: schema }));
  await migrate(db);
  if (seed) await seedDemo(db);
  const drop = async () => { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); };
  return { db, drop };
}

export async function listen(app) {
  const server = await new Promise((resolve) => { const sv = app.listen(0, '127.0.0.1', () => resolve(sv)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); });
  const call = async (method, path, body, raw) => {
    const hasBody = body !== undefined || raw !== undefined;
    const res = await fetch(base + path, { method, headers: hasBody ? { 'Content-Type': 'application/json' } : {}, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text };
  };
  return { base, call, stop };
}

/** Real Express app on an ephemeral port, backed by a real (isolated-schema) Postgres database. */
export async function startServer({ seed = true, webDir } = {}) {
  const { db, drop } = await freshDb({ seed });
  const srv = await listen(createApp({ crm: createServices(db), webDir, log: quiet }));
  return { db, base: srv.base, call: srv.call, close: async () => { await srv.stop(); await drop(); } };
}
