import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrmService } from '../../server/services/crm.js';
import { ConflictError, NotFoundError, ValidationError } from '../../server/errors.js';

// Async fake repositories prove the service holds business rules without any SQL or database.
function setup({ insertError } = {}) {
  const store = { customers: new Map(), seq: 0, calls: [] };
  const customers = {
    get: async (id) => store.customers.get(id),
    findByEmail: async (e) => [...store.customers.values()].find((c) => c.email === e.toLowerCase()),
    list: async () => ({ items: [...store.customers.values()], total: store.customers.size }),
    insert: async (c, now) => {
      if (insertError) throw insertError;
      const id = ++store.seq; store.customers.set(id, { id, ...c, created_at: now, order_count: 0, total_spent: 0, last_order_at: null }); return id;
    },
    update: async (id, f, now) => { store.customers.set(id, { ...store.customers.get(id), ...f, updated_at: now }); store.calls.push(['update', id, f]); },
  };
  const activity = { listTasks: async () => [], listCommunications: async () => [], insertTask: async (cid, t) => ({ id: 1, ...t }), getTask: async () => undefined, insertCommunication: async (cid, c) => ({ id: 1, ...c }) };
  const svc = createCrmService({ customers, orders: { listByCustomer: async () => [] }, activity, clock: () => new Date('2026-02-01T00:00:00Z') });
  return { svc, store };
}

test('createCustomer stores a normalised customer stamped with the injected clock', async () => {
  const { svc } = setup();
  const c = await svc.createCustomer({ email: 'A@B.CO', first_name: 'Ann' });
  assert.equal(c.email, 'a@b.co');
  assert.equal(c.created_at, '2026-02-01T00:00:00.000Z');
  assert.equal(c.source, 'manual');
});

test('createCustomer rejects a duplicate email regardless of case', async () => {
  const { svc } = setup();
  await svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' });
  await assert.rejects(svc.createCustomer({ email: 'A@B.CO', first_name: 'Other' }), ConflictError);
});

test('a unique-violation from the database (race past the pre-check) becomes a 409 Conflict', async () => {
  const { svc } = setup({ insertError: Object.assign(new Error('duplicate key'), { code: '23505' }) });
  await assert.rejects(svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' }), ConflictError);
});

test('other database errors are not disguised as conflicts', async () => {
  const { svc } = setup({ insertError: Object.assign(new Error('connection lost'), { code: '08006' }) });
  await assert.rejects(svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' }), /connection lost/);
});

test('updateCustomer allows keeping own email but not taking another customer\'s', async () => {
  const { svc } = setup();
  const a = await svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' });
  const b = await svc.createCustomer({ email: 'b@b.co', first_name: 'Bob' });
  assert.equal((await svc.updateCustomer(a.id, { email: 'a@b.co', phone: '555 1234' })).phone, '555 1234');
  await assert.rejects(svc.updateCustomer(b.id, { email: 'a@b.co' }), ConflictError);
});

test('unknown customer yields NotFound; invalid payload yields Validation (and no write)', async () => {
  const { svc, store } = setup();
  await assert.rejects(svc.getCustomer(99), NotFoundError);
  await assert.rejects(svc.addTask(99, { title: 'x' }), NotFoundError);
  const a = await svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' });
  await assert.rejects(svc.updateCustomer(a.id, { email: 'bad' }), ValidationError);
  assert.equal(store.calls.length, 0);
});

test('getCustomer exposes the order summary as a nested object', async () => {
  const { svc } = setup();
  const a = await svc.createCustomer({ email: 'a@b.co', first_name: 'Ann' });
  assert.deepEqual((await svc.getCustomer(a.id)).summary, { order_count: 0, total_spent: 0, last_order_at: null });
});
