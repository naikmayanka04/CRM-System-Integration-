import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router, errorEnvelope, mapBodyParserError } from '../../server/http/router.js';
import { buildRoutes } from '../../server/http/routes.js';
import { AppError, ConflictError, NotFoundError } from '../../server/errors.js';

test('routes table: every route has method, /api pattern and handler; no duplicates', () => {
  const routes = buildRoutes({}).routes;
  assert.ok(routes.length >= 11);
  const keys = routes.map((r) => `${r.method} ${r.pattern}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of routes) {
    assert.match(r.method, /^(GET|POST|PUT|PATCH|DELETE)$/);
    assert.ok(r.pattern.startsWith('/api/'));
    assert.equal(typeof r.handler, 'function');
  }
});

test('route handlers reject non-numeric and non-positive ids before touching the service', async () => {
  const calls = [];
  const crm = new Proxy({}, { get: () => (...a) => { calls.push(a); return Promise.resolve({}); } });
  const get = buildRoutes(crm).routes.find((r) => r.pattern === '/api/customers/:id' && r.method === 'GET').handler;
  for (const bad of ['abc', '0', '-3', '1.5', '99999999999999999999']) {
    await assert.rejects(Promise.resolve().then(() => get({ params: { id: bad } })), NotFoundError, bad);
  }
  assert.equal(calls.length, 0);
});

test('Router keeps registration order and returns a copy', () => {
  const r = new Router().add('GET', '/a', () => 1).add('POST', '/a', () => 2);
  assert.deepEqual(r.routes.map((x) => x.method), ['GET', 'POST']);
  r.routes.pop();
  assert.equal(r.routes.length, 2);
});

test('body-parser errors map to our envelope (413, invalid JSON, charset)', () => {
  assert.equal(errorEnvelope(mapBodyParserError({ type: 'entity.too.large' })).status, 413);
  const bad = errorEnvelope(mapBodyParserError({ type: 'entity.parse.failed' }));
  assert.deepEqual([bad.status, bad.body.error.code], [400, 'invalid_json']);
  assert.equal(errorEnvelope(mapBodyParserError({ type: 'encoding.unsupported' })).status, 415);
  const other = new Error('x');
  assert.equal(mapBodyParserError(other), other);
});

test('errorEnvelope hides internals of unexpected errors', () => {
  const e = errorEnvelope(new Error('SELECT secret FROM users'));
  assert.equal(e.status, 500);
  assert.doesNotMatch(JSON.stringify(e.body), /secret/);
  assert.equal(errorEnvelope(new ConflictError('dup')).status, 409);
  assert.equal(errorEnvelope(new AppError(405, 'method_not_allowed', 'no')).body.error.code, 'method_not_allowed');
});
