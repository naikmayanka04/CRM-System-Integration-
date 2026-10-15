export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export class ValidationError extends AppError {
  constructor(details) { super(400, 'validation_failed', 'Request validation failed', details); }
}
export class NotFoundError extends AppError {
  constructor(what = 'Resource') { super(404, 'not_found', `${what} not found`); }
}
export class ConflictError extends AppError {
  constructor(message) { super(409, 'conflict', message); }
}
