import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueState, fullName, initials, money, orderLabel, shortDate } from '../../web/src/format.js';

test('fullName / initials fall back to email, then a placeholder', () => {
  assert.equal(fullName({ first_name: 'Ann', last_name: 'Lee' }), 'Ann Lee');
  assert.equal(fullName({ first_name: '', last_name: '', email: 'x@y.co' }), 'x@y.co');
  assert.equal(fullName({ first_name: '', last_name: '' }), 'Unnamed customer');
  assert.equal(initials({ first_name: 'ann', last_name: 'lee' }), 'AL');
  assert.equal(initials({ first_name: '', last_name: '', email: 'zed@y.co' }), 'Z');
});

test('money formats currency and tolerates missing values', () => {
  assert.equal(money(1234.5), '$1,234.50');
  assert.equal(money(undefined), '$0.00');
  assert.equal(money(5, 'NOPE!'), '5.00 NOPE!');
});

test('shortDate is timezone-stable and tolerant of bad input', () => {
  assert.equal(shortDate('2026-03-01T23:30:00Z'), 'Mar 1, 2026');
  assert.equal(shortDate(null), '–');
  assert.equal(shortDate('garbage'), '–');
});

test('dueState classifies open-task deadlines', () => {
  const today = new Date('2026-06-10T12:00:00Z');
  assert.equal(dueState('2026-06-09', today), 'overdue');
  assert.equal(dueState('2026-06-10', today), 'due-soon');
  assert.equal(dueState('2026-06-13', today), 'due-soon');
  assert.equal(dueState('2026-06-14', today), 'later');
  assert.equal(dueState(null, today), null);
});

test('orderLabel pluralises', () => {
  assert.equal(orderLabel(1), '1 order');
  assert.equal(orderLabel(0), '0 orders');
});
