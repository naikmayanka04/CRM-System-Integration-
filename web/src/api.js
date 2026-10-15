export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details ?? {};
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check that it is running and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json;
}

export const api = {
  listCustomers: ({ q = '', limit = 25, offset = 0 } = {}) => request('GET', `/api/customers?${new URLSearchParams({ q, limit, offset })}`),
  getCustomer: (id) => request('GET', `/api/customers/${id}`),
  createCustomer: (data) => request('POST', '/api/customers', data),
  updateCustomer: (id, data) => request('PUT', `/api/customers/${id}`, data),
  listOrders: (id) => request('GET', `/api/customers/${id}/orders`),
  addTask: (id, data) => request('POST', `/api/customers/${id}/tasks`, data),
  setTaskStatus: (taskId, status) => request('PATCH', `/api/tasks/${taskId}`, { status }),
  addNote: (id, data) => request('POST', `/api/customers/${id}/communications`, data),
};
