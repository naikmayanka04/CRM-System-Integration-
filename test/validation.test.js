import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCustomer, parseTask, parseTaskUpdate, parseCommunication, parseListQuery } from '../../server/validation.js';
import { ValidationError } from '../../server/errors.js';

const fails = (fn, field) => assert.throws(fn, (e) => e instanceof ValidationError && field in e.details, `expected error on ${field}`);

test('parseCustomer normalises email and trims names', () => {
  const c = parseCustomer({ email: '  Ana@Example.COM ', first_name: ' Ana ', phone: '+1 555 123 4567' });
  assert.deepEqual(c, { email: 'ana@example.com', first_name: 'Ana', phone: '+1 555 123 4567' });
});

test('parseCustomer rejects bad email, missing name, bad phone, wrong types', () => {
  fails(() => parseCustomer({ email: 'nope', first_name: 'A' }), 'email');
  fails(() => parseCustomer({ email: 'a@b.co' }), 'first_name');
  fails(() => parseCustomer({ email: 'a@b.co', first_name: 'A', phone: 'call me' }), 'phone');
  fails(() => parseCustomer({ email: 'a@b.co', first_name: 42 }), 'first_name');
  fails(() => parseCustomer('x'), 'body');
  fails(() => parseCustomer({ email: 'a@b.co', first_name: 'x'.repeat(101) }), 'first_name');
});

test('parseCustomer partial mode validates only provided fields and rejects empty updates', () => {
  assert.deepEqual(parseCustomer({ phone: '' }, { partial: true }), { phone: '' });
  fails(() => parseCustomer({}, { partial: true }), 'body');
  fails(() => parseCustomer({ email: 'bad' }, { partial: true }), 'email');
});

test('parseCustomer ignores unknown fields (no mass assignment)', () => {
  const c = parseCustomer({ email: 'a@b.co', first_name: 'A', woo_id: 5, source: 'woo', id: 9 });
  assert.deepEqual(Object.keys(c).sort(), ['email', 'first_name']);
});

test('parseTask requires title and valid calendar date', () => {
  assert.deepEqual(parseTask({ title: ' Call ', due_date: '2026-12-01' }), { title: 'Call', due_date: '2026-12-01' });
  fails(() => parseTask({}), 'title');
  fails(() => parseTask({ title: 'x', due_date: '12/01/2026' }), 'due_date');
  fails(() => parseTask({ title: 'x', due_date: '2026-13-45' }), 'due_date');
});

test('parseTaskUpdate only accepts known statuses', () => {
  assert.deepEqual(parseTaskUpdate({ status: 'done' }), { status: 'done' });
  fails(() => parseTaskUpdate({ status: 'archived' }), 'status');
});

test('parseCommunication defaults to internal note and validates enums', () => {
  assert.deepEqual(parseCommunication({ body: 'Left voicemail' }), { channel: 'note', direction: 'internal', body: 'Left voicemail' });
  fails(() => parseCommunication({ body: 'x', channel: 'fax' }), 'channel');
  fails(() => parseCommunication({ body: '  ' }), 'body');
});

test('parseListQuery applies defaults and bounds', () => {
  assert.deepEqual(parseListQuery({}), { q: '', limit: 25, offset: 0 });
  assert.deepEqual(parseListQuery({ q: ' amy ', limit: '10', offset: '20' }), { q: 'amy', limit: 10, offset: 20 });
  fails(() => parseListQuery({ limit: '0' }), 'limit');
  fails(() => parseListQuery({ limit: '101' }), 'limit');
  fails(() => parseListQuery({ offset: '-1' }), 'offset');
  fails(() => parseListQuery({ limit: 'abc' }), 'limit');
});

test('parseListQuery rejects repeated/array parameters instead of crashing', () => {
  fails(() => parseListQuery({ q: ['a', 'b'] }), 'q');
  fails(() => parseListQuery({ limit: ['5'] }), 'limit');
  fails(() => parseListQuery({ offset: { x: '1' } }), 'offset');
  fails(() => parseListQuery({ limit: '' }), 'limit');
});
