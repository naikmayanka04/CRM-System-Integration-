import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, migrate } from '../../server/db.js';

// A fake pool records every statement so we can assert transaction/savepoint behaviour without a database.
function fakePool({ failOn, existing = [] } = {}) {
  const log = [];
  const exec = async (text, params) => {
    log.push(params ? [text, params] : text);
    if (failOn && text.includes(failOn)) throw new Error(`fail:${failOn}`);
    if (text.startsWith('SELECT 1 FROM schema_migrations')) return { rows: existing.includes(params[0]) ? [{}] : [] };
    return { rows: [{ ok: true }] };
  };
  let released = 0;
  return { log, get released() { return released; }, query: exec, connect: async () => ({ query: exec, release: () => { released++; } }) };
}

test('tx commits on success and releases the connection', async () => {
  const pool = fakePool();
  await createDb(pool).tx(async (tx) => { await tx.query('INSERT 1'); });
  assert.deepEqual(pool.log, ['BEGIN', 'INSERT 1', 'COMMIT']);
  assert.equal(pool.released, 1);
});

test('tx rolls back on error, rethrows it, and still releases the connection', async () => {
  const pool = fakePool({ failOn: 'BOOM' });
  await assert.rejects(createDb(pool).tx((tx) => tx.query('BOOM')), /fail:BOOM/);
  assert.deepEqual(pool.log, ['BEGIN', 'BOOM', 'ROLLBACK']);
  assert.equal(pool.released, 1);
});

test('nested tx uses savepoints: inner failure rolls back only the inner work', async () => {
  const pool = fakePool({ failOn: 'INNER_BOOM' });
  await createDb(pool).tx(async (tx) => {
    await tx.query('OUTER');
    await assert.rejects(tx.tx((t2) => t2.query('INNER_BOOM')), /INNER_BOOM/);
  });
  assert.deepEqual(pool.log, ['BEGIN', 'OUTER', 'SAVEPOINT sp_1', 'INNER_BOOM', 'ROLLBACK TO SAVEPOINT sp_1', 'COMMIT']);
});

test('query() omits the params argument when empty (keeps multi-statement SQL on the simple protocol)', async () => {
  const seen = [];
  const pool = { query: async (...a) => { seen.push(a); return { rows: [] }; }, connect: async () => { throw new Error('unused'); } };
  await createDb(pool).query('SELECT 1', []);
  await createDb(pool).query('SELECT $1', [7]);
  assert.deepEqual(seen, [['SELECT 1', undefined], ['SELECT $1', [7]]]);
});

function migrationsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

test('migrate applies pending files in name order, takes an advisory lock, records each one', async () => {
  const pool = fakePool();
  const dir = migrationsDir({ '002_b.sql': 'SQL_B', '001_a.sql': 'SQL_A', 'notes.txt': 'ignored' });
  assert.deepEqual(await migrate(createDb(pool), dir), ['001_a.sql', '002_b.sql']);
  const text = pool.log.map((l) => (Array.isArray(l) ? l[0] : l));
  assert.ok(text.indexOf('SQL_A') < text.indexOf('SQL_B'));
  assert.ok(text.some((t) => t.includes('pg_advisory_xact_lock')));
  assert.equal(text.filter((t) => t.startsWith('INSERT INTO schema_migrations')).length, 2);
  assert.ok(text.includes('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY'));
});

test('migrate skips files already recorded (repeatable)', async () => {
  const pool = fakePool({ existing: ['001_a.sql'] });
  const dir = migrationsDir({ '001_a.sql': 'SQL_A', '002_b.sql': 'SQL_B' });
  assert.deepEqual(await migrate(createDb(pool), dir), ['002_b.sql']);
  assert.ok(!pool.log.some((l) => l === 'SQL_A'));
});

test('a failing migration is rolled back, named in the error, and not recorded', async () => {
  const pool = fakePool({ failOn: 'BAD_SQL' });
  const dir = migrationsDir({ '001_bad.sql': 'BAD_SQL' });
  await assert.rejects(migrate(createDb(pool), dir), /Migration 001_bad\.sql failed: fail:BAD_SQL/);
  assert.ok(pool.log.includes('ROLLBACK'));
  assert.ok(!pool.log.some((l) => Array.isArray(l) && l[0].startsWith('INSERT INTO schema_migrations')));
});

test('real migration files: every table enables row level security (Supabase exposes the public schema)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../server/migrations/', import.meta.url);
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const tables = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 5);
  for (const t of tables) assert.match(sql, new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`), t);
});
