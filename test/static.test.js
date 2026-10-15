import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/app.js';
import { listen } from '../helpers.js';

// No database needed: the CRM service is never reached by these requests.
test('serves the built web app, falls back to index.html, never swallows /api, blocks path traversal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(dir, 'index.html'), '<h1>app</h1>');
  const srv = await listen(createApp({ crm: {}, webDir: dir, log: { error() {} } }));
  try {
    assert.match((await srv.call('GET', '/')).text, /app/);
    assert.match((await srv.call('GET', '/customers/12')).text, /app/);
    const api = await srv.call('GET', '/api/nope');
    assert.equal(api.status, 404);
    assert.equal(api.json.error.code, 'not_found');
    assert.equal((await srv.call('DELETE', '/api/customers/1')).status, 405);
    const trav = await fetch(`${srv.base}/..%2f..%2f..%2fetc%2fpasswd`);
    assert.doesNotMatch(await trav.text(), /root:/);
    const bad = await srv.call('POST', '/api/customers', undefined, '{not json');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'invalid_json');
  } finally { await srv.stop(); }
});
