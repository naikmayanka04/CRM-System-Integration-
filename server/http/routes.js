import { NotFoundError } from '../errors.js';
import { Router } from './router.js';

function id(params, key = 'id') {
  const n = Number(params[key]);
  if (!Number.isSafeInteger(n) || n < 1) throw new NotFoundError('Resource');
  return n;
}

export function buildRoutes(crm) {
  const r = new Router();
  r.add('GET', '/api/health', () => ({ body: { status: 'ok' } }));

  r.add('GET', '/api/customers', ({ query }) => crm.listCustomers(query).then((body) => ({ body })));
  r.add('POST', '/api/customers', async ({ body }) => ({ status: 201, body: await crm.createCustomer(body) }));
  r.add('GET', '/api/customers/:id', async ({ params }) => ({ body: await crm.getCustomer(id(params)) }));
  r.add('PUT', '/api/customers/:id', async ({ params, body }) => ({ body: await crm.updateCustomer(id(params), body) }));
  r.add('GET', '/api/customers/:id/orders', async ({ params }) => ({ body: { items: await crm.listOrders(id(params)) } }));

  r.add('GET', '/api/customers/:id/tasks', async ({ params }) => ({ body: { items: await crm.listTasks(id(params)) } }));
  r.add('POST', '/api/customers/:id/tasks', async ({ params, body }) => ({ status: 201, body: await crm.addTask(id(params), body) }));
  r.add('PATCH', '/api/tasks/:taskId', async ({ params, body }) => ({ body: await crm.updateTask(id(params, 'taskId'), body) }));

  r.add('GET', '/api/customers/:id/communications', async ({ params }) => ({ body: { items: await crm.listCommunications(id(params)) } }));
  r.add('POST', '/api/customers/:id/communications', async ({ params, body }) => ({ status: 201, body: await crm.addCommunication(id(params), body) }));
  return r;
}
