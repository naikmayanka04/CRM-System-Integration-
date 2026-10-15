import { ValidationError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ()\-.]{5,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CHANNELS = ['note', 'email', 'phone', 'sms'];
export const DIRECTIONS = ['internal', 'inbound', 'outbound'];
export const TASK_STATUSES = ['open', 'done'];

function collect(fn) {
  const errors = {};
  fn((field, msg) => { errors[field] ??= msg; });
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function str(body, field, fail, { required = false, max = 200 } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null) { if (required) fail(field, 'is required'); return undefined; }
  if (typeof raw !== 'string') { fail(field, 'must be a string'); return undefined; }
  const v = raw.trim();
  if (required && !v) { fail(field, 'is required'); return undefined; }
  if (v.length > max) { fail(field, `must be at most ${max} characters`); return undefined; }
  return v;
}

/** Customer payload. partial=true (PUT) validates only the provided fields. */
export function parseCustomer(body, { partial = false } = {}) {
  if (!isObject(body)) throw new ValidationError({ body: 'must be a JSON object' });
  const out = {};
  collect((fail) => {
    const email = str(body, 'email', fail, { required: !partial, max: 254 });
    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) fail('email', 'must be a valid email address');
      else out.email = email.toLowerCase();
    }
    for (const f of ['first_name', 'last_name']) {
      const v = str(body, f, fail, { max: 100 });
      if (v !== undefined) out[f] = v;
    }
    const phone = str(body, 'phone', fail, { max: 30 });
    if (phone !== undefined) {
      if (phone && !PHONE_RE.test(phone)) fail('phone', 'must contain only digits, spaces and + ( ) - .');
      else out.phone = phone;
    }
    if (!partial && !out.first_name && !out.last_name) fail('first_name', 'first or last name is required');
  });
  if (partial && Object.keys(out).length === 0) throw new ValidationError({ body: 'no updatable fields provided' });
  return out;
}

export function parseTask(body) {
  if (!isObject(body)) throw new ValidationError({ body: 'must be a JSON object' });
  const out = {};
  collect((fail) => {
    out.title = str(body, 'title', fail, { required: true, max: 200 });
    const due = body.due_date;
    if (due !== undefined && due !== null && due !== '') {
      if (typeof due !== 'string' || !DATE_RE.test(due) || Number.isNaN(Date.parse(due))) fail('due_date', 'must be a date (YYYY-MM-DD)');
      else out.due_date = due;
    }
  });
  return out;
}

export function parseTaskUpdate(body) {
  if (!isObject(body) || !TASK_STATUSES.includes(body.status)) {
    throw new ValidationError({ status: `must be one of: ${TASK_STATUSES.join(', ')}` });
  }
  return { status: body.status };
}

export function parseCommunication(body) {
  if (!isObject(body)) throw new ValidationError({ body: 'must be a JSON object' });
  const out = { channel: 'note', direction: 'internal' };
  collect((fail) => {
    out.body = str(body, 'body', fail, { required: true, max: 5000 });
    if (body.channel !== undefined) {
      if (!CHANNELS.includes(body.channel)) fail('channel', `must be one of: ${CHANNELS.join(', ')}`);
      else out.channel = body.channel;
    }
    if (body.direction !== undefined) {
      if (!DIRECTIONS.includes(body.direction)) fail('direction', `must be one of: ${DIRECTIONS.join(', ')}`);
      else out.direction = body.direction;
    }
  });
  return out;
}

/** Paging + search params from a query-string object (values may be arrays/objects when a client repeats a key). */
export function parseListQuery(query) {
  const out = { q: '', limit: 25, offset: 0 };
  collect((fail) => {
    if (query.q !== undefined) {
      if (typeof query.q !== 'string') fail('q', 'must be a single text value');
      else if (query.q.length > 100) fail('q', 'must be at most 100 characters');
      else out.q = query.q.trim();
    }
    for (const [key, min, max] of [['limit', 1, 100], ['offset', 0, Number.MAX_SAFE_INTEGER]]) {
      if (query[key] === undefined) continue;
      const n = typeof query[key] === 'string' && query[key].trim() !== '' ? Number(query[key]) : NaN;
      if (!Number.isInteger(n) || n < min || n > max) fail(key, `must be an integer ${key === 'limit' ? 'between 1 and 100' : '>= 0'}`);
      else out[key] = n;
    }
  });
  return out;
}
