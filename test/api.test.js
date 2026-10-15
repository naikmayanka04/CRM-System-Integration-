import { test as baseTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbSkip, startServer } from '../helpers.js';

let s;
before(async () => { if (!dbSkip) s = await startServer({ seed: true }); });
after(async () => { await s?.close(); });

const test = (name, fn) => baseTest(name, { skip: dbSkip }, fn); // reported as skipped (not passed) without a database

const newCustomer = (over = {}) => ({ email: `t${Math.random().toString(36).slice(2)}@example.com`, first_name: 'Test', last_name: 'User', ...over });

test('GET /api/health', async () => {
  const r = await s.call('GET', '/api/health');
  assert.deepEqual([r.status, r.json], [200, { status: 'ok' }]);
});

test('list returns seeded customers with order summary and paging metadata', async () => {
  const r = await s.call('GET', '/api/customers?limit=5');
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 12);
  assert.equal(r.json.items.length, 5);
  assert.equal(r.json.limit, 5);
  assert.ok('order_count' in r.json.items[0] && 'total_spent' in r.json.items[0]);
  const page2 = await s.call('GET', '/api/customers?limit=5&offset=5');
  assert.notEqual(page2.json.items[0].id, r.json.items[0].id);
});

test('search matches name, email and phone (digits only), case-insensitively', async () => {
  assert.equal((await s.call('GET', '/api/customers?q=OKAFOR')).json.total, 1);
  assert.equal((await s.call('GET', '/api/customers?q=amara%20okafor')).json.total, 1);
  assert.equal((await s.call('GET', '/api/customers?q=ben.larsen@')).json.total, 1);
  assert.equal((await s.call('GET', '/api/customers?q=5550101003')).json.total, 1);
  assert.equal((await s.call('GET', '/api/customers?q=zzzz')).json.total, 0);
});

test('search treats % and _ literally and is not SQL-injectable', async () => {
  assert.equal((await s.call('GET', '/api/customers?q=%25')).json.total, 0);
  assert.equal((await s.call('GET', `/api/customers?q=${encodeURIComponent("' OR 1=1 --")}`)).json.total, 0);
  assert.equal((await s.call('GET', '/api/customers?q=O%27Brien')).json.total, 1);
});

test('invalid paging parameters return 400 with field details', async () => {
  const r = await s.call('GET', '/api/customers?limit=1000');
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'validation_failed');
  assert.ok(r.json.error.details.limit);
});

test('AC-2: profile shows order summary; revenue excludes cancelled/refunded orders', async () => {
  const [{ id }] = await s.db.query("INSERT INTO customers (email, first_name, created_at, updated_at) VALUES ('rev@example.com','Rev', now(), now()) RETURNING id");
  await s.db.query(`INSERT INTO orders (customer_id, status, total, placed_at) VALUES
    ($1,'completed',100,'2026-03-01T00:00:00Z'), ($1,'processing',50.5,'2026-04-01T00:00:00Z'),
    ($1,'cancelled',999,'2026-05-01T00:00:00Z'), ($1,'refunded',25,'2026-02-01T00:00:00Z')`, [id]);
  const r = await s.call('GET', `/api/customers/${id}`);
  assert.deepEqual(r.json.summary, { order_count: 4, total_spent: 150.5, last_order_at: '2026-05-01T00:00:00.000Z' });
  assert.equal(typeof r.json.summary.total_spent, 'number'); // NUMERIC must reach the client as a number, not a string
  const orders = await s.call('GET', `/api/customers/${id}/orders`);
  assert.deepEqual(orders.json.items.map((o) => o.status), ['cancelled', 'processing', 'completed', 'refunded']); // newest first
});

test('orders include their line items', async () => {
  const r = await s.call('GET', '/api/customers/1/orders');
  assert.ok(r.json.items.length >= 1);
  assert.ok(r.json.items[0].items.length >= 1 && r.json.items[0].items[0].name);
});

test('FR-1: create (201), duplicate email rejected (409), edit, then retrieve', async () => {
  const body = newCustomer({ email: 'Create.Me@Example.com' });
  const created = await s.call('POST', '/api/customers', body);
  assert.equal(created.status, 201);
  assert.equal(created.json.email, 'create.me@example.com');
  assert.equal(created.json.source, 'manual');
  const dup = await s.call('POST', '/api/customers', newCustomer({ email: 'CREATE.me@example.com' }));
  assert.equal(dup.status, 409);
  const put = await s.call('PUT', `/api/customers/${created.json.id}`, { phone: '+44 20 7946 0000', last_name: 'Edited' });
  assert.equal(put.status, 200);
  assert.equal(put.json.phone, '+44 20 7946 0000');
  assert.equal(put.json.first_name, 'Test'); // untouched field preserved
  const get = await s.call('GET', `/api/customers/${created.json.id}`);
  assert.equal(get.json.last_name, 'Edited');
});

test('mass assignment is ignored: client cannot set id, woo_id or source', async () => {
  const r = await s.call('POST', '/api/customers', newCustomer({ id: 9999, woo_id: 77, source: 'woocommerce' }));
  assert.equal(r.status, 201);
  assert.notEqual(r.json.id, 9999);
  assert.equal(r.json.woo_id, null);
  assert.equal(r.json.source, 'manual');
});

test('validation errors are 400 with field messages; malformed JSON is 400', async () => {
  const bad = await s.call('POST', '/api/customers', { email: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error.details.email);
  const broken = await s.call('POST', '/api/customers', undefined, '{not json');
  assert.equal(broken.status, 400);
  assert.equal(broken.json.error.code, 'invalid_json');
});

test('unknown ids and routes: 404; wrong method: 405; non-numeric id: 404', async () => {
  assert.equal((await s.call('GET', '/api/customers/99999')).status, 404);
  assert.equal((await s.call('GET', '/api/customers/abc')).status, 404);
  assert.equal((await s.call('GET', '/api/nope')).status, 404);
  assert.equal((await s.call('DELETE', '/api/customers/1')).status, 405);
  assert.equal((await s.call('POST', '/api/customers/99999/tasks', { title: 'x' })).status, 404);
});

test('FR-5: tasks can be created, listed (open first), and completed', async () => {
  const id = (await s.call('POST', '/api/customers', newCustomer())).json.id;
  const t1 = await s.call('POST', `/api/customers/${id}/tasks`, { title: 'Later', due_date: '2026-12-31' });
  const t2 = await s.call('POST', `/api/customers/${id}/tasks`, { title: 'Sooner', due_date: '2026-11-01' });
  assert.equal(t1.status, 201);
  assert.equal(t1.json.status, 'open');
  assert.deepEqual((await s.call('GET', `/api/customers/${id}/tasks`)).json.items.map((t) => t.title), ['Sooner', 'Later']);
  const done = await s.call('PATCH', `/api/tasks/${t2.json.id}`, { status: 'done' });
  assert.equal(done.json.status, 'done');
  assert.deepEqual((await s.call('GET', `/api/customers/${id}/tasks`)).json.items.map((t) => t.title), ['Later', 'Sooner']);
  assert.equal((await s.call('PATCH', `/api/tasks/${t2.json.id}`, { status: 'bogus' })).status, 400);
  assert.equal((await s.call('PATCH', '/api/tasks/99999', { status: 'done' })).status, 404);
  assert.equal((await s.call('POST', `/api/customers/${id}/tasks`, { title: '' })).status, 400);
});

test('FR-5: communications are logged newest-first and appear on the profile', async () => {
  const id = (await s.call('POST', '/api/customers', newCustomer())).json.id;
  await s.call('POST', `/api/customers/${id}/communications`, { body: 'First note' });
  const second = await s.call('POST', `/api/customers/${id}/communications`, { body: 'Phoned back', channel: 'phone', direction: 'outbound' });
  assert.equal(second.status, 201);
  const profile = (await s.call('GET', `/api/customers/${id}`)).json;
  assert.equal(profile.communications.length, 2);
  assert.equal(profile.communications[0].body, 'Phoned back');
  assert.equal((await s.call('POST', `/api/customers/${id}/communications`, { body: 'x', channel: 'pigeon' })).status, 400);
});

test('stored markup is returned verbatim as data (escaping is the UI\'s job) and never executed server-side', async () => {
  const id = (await s.call('POST', '/api/customers', newCustomer())).json.id;
  const r = await s.call('POST', `/api/customers/${id}/communications`, { body: '<img src=x onerror=alert(1)>' });
  assert.equal(r.json.body, '<img src=x onerror=alert(1)>');
});

test('oversized body is rejected with 413', async () => {
  const r = await s.call('POST', '/api/customers', undefined, JSON.stringify({ email: 'a@b.co', first_name: 'x'.repeat(1_100_000) }));
  assert.equal(r.status, 413);
});

test('unexpected failures return a generic 500 without leaking internals', async () => {
  await s.db.query('ALTER TABLE tasks RENAME TO tasks_gone');
  try {
    const r = await s.call('GET', '/api/customers/1');
    assert.equal(r.status, 500);
    assert.equal(r.json.error.code, 'internal_error');
    assert.doesNotMatch(r.text, /tasks|SELECT|relation|postgres/i);
  } finally { await s.db.query('ALTER TABLE tasks_gone RENAME TO tasks'); }
});

test('repeated query parameters are a 400, not a crash', async () => {
  const r = await s.call('GET', '/api/customers?q=a&q=b');
  assert.equal(r.status, 400);
  assert.ok(r.json.error.details.q);
});

test('security headers are set and the framework is not advertised', async () => {
  const res = await fetch(s.base + '/api/health');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
