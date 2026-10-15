import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK = 727274; // arbitrary constant: serialises concurrent migrators

const run = async (client, text, params) => (await client.query(text, params?.length ? params : undefined)).rows;

/**
 * Executor used by every repository: query(sql, params) -> rows, tx(fn) -> atomic work.
 * Inside tx(), the executor handed to fn is bound to one connection; nested tx() uses savepoints.
 */
export function createDb(pool) {
  return {
    query: (text, params) => run(pool, text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(txExecutor(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

function txExecutor(client) {
  let n = 0;
  const ex = {
    query: (text, params) => run(client, text, params),
    async tx(fn) {
      const sp = `sp_${++n}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        const result = await fn(ex);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        throw err;
      }
    },
  };
  return ex;
}

/** Applies pending *.sql files in name order, each in its own transaction. Safe to re-run and to run concurrently. */
export async function migrate(db, dir = MIGRATIONS_DIR) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL)');
  await db.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY'); // no public API access (Supabase exposes public schema)
  const applied = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.tx(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      const done = await tx.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (done.length) return;
      try {
        await tx.query(readFileSync(join(dir, file), 'utf8'));
        await tx.query('INSERT INTO schema_migrations (name, applied_at) VALUES ($1, now())', [file]);
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
      applied.push(file);
    });
  }
  return applied;
}
