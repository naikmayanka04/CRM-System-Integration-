import { readFileSync } from 'node:fs';
import pg from 'pg';

// pg returns NUMERIC/BIGINT as strings and DATE as a local-time Date. Our values are small, so use JS types
// and keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
pg.types.setTypeParser(20, (v) => Number(v)); // bigint
pg.types.setTypeParser(1082, (v) => v); // date

export function createPool({ databaseUrl, dbSsl = 'off', dbSslCa, searchPath } = {}) {
  let ssl = false;
  if (dbSsl === 'require') ssl = dbSslCa ? { ca: readFileSync(dbSslCa, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on('error', (err) => console.error(`[db] idle client error: ${err.message}`));
  if (searchPath) pool.on('connect', (client) => client.query(`SET search_path TO ${searchPath}`)); // tests: isolated schema
  return pool;
}
