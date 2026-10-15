import { AppError } from '../errors.js';

/** Framework-agnostic route table: handlers are ({ params, query, body }) => { status?, body }. */
export class Router {
  #routes = [];
  add(method, pattern, handler) {
    this.#routes.push({ method, pattern, handler });
    return this;
  }
  get routes() { return [...this.#routes]; }
}

/** Translates body-parser's errors into our error types (status/type come from the `http-errors` library). */
export function mapBodyParserError(err) {
  if (err?.type === 'entity.too.large') return new AppError(413, 'payload_too_large', 'Request body too large');
  if (err?.type === 'entity.parse.failed') return new AppError(400, 'invalid_json', 'Body is not valid JSON');
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') return new AppError(415, 'unsupported_media_type', 'Unsupported encoding');
  return err;
}

export function errorEnvelope(err) {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } } };
  return { status: 500, body: { error: { code: 'internal_error', message: 'Unexpected server error' } } };
}
