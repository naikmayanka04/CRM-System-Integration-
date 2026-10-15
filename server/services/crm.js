import { ConflictError, NotFoundError } from '../errors.js';
import { parseCommunication, parseCustomer, parseListQuery, parseTask, parseTaskUpdate } from '../validation.js';

const UNIQUE_VIOLATION = '23505';

/**
 * Business rules for the CRM. Takes repositories (not a db handle), so it can be
 * unit-tested with fakes and never touches SQL.
 */
export function createCrmService({ customers, orders, activity, clock = () => new Date() }) {
  const now = () => clock().toISOString();

  async function requireCustomer(id) {
    const c = await customers.get(id);
    if (!c) throw new NotFoundError('Customer');
    return c;
  }

  async function assertEmailFree(email, exceptId) {
    const existing = await customers.findByEmail(email);
    if (existing && existing.id !== exceptId) throw new ConflictError('A customer with this email already exists');
  }

  // The pre-check above gives a friendly error; the unique index is the real guard against races.
  const rethrowDuplicate = (err) => {
    if (err?.code === UNIQUE_VIOLATION) throw new ConflictError('A customer with this email already exists');
    throw err;
  };

  return {
    async listCustomers(query) {
      const params = parseListQuery(query);
      const { items, total } = await customers.list(params);
      return { items, total, limit: params.limit, offset: params.offset };
    },

    async getCustomer(id) {
      const customer = await requireCustomer(id);
      const [tasks, communications] = await Promise.all([activity.listTasks(id), activity.listCommunications(id)]);
      return {
        ...customer,
        summary: { order_count: customer.order_count, total_spent: customer.total_spent, last_order_at: customer.last_order_at },
        tasks,
        communications,
      };
    },

    async createCustomer(body) {
      const data = parseCustomer(body);
      await assertEmailFree(data.email);
      try {
        const id = await customers.insert({ ...data, source: 'manual' }, now());
        return await customers.get(id);
      } catch (err) { return rethrowDuplicate(err); }
    },

    async updateCustomer(id, body) {
      await requireCustomer(id);
      const data = parseCustomer(body, { partial: true });
      if (data.email) await assertEmailFree(data.email, id);
      try {
        await customers.update(id, data, now());
      } catch (err) { rethrowDuplicate(err); }
      return customers.get(id);
    },

    async listOrders(customerId) {
      await requireCustomer(customerId);
      return orders.listByCustomer(customerId);
    },

    async listTasks(customerId) {
      await requireCustomer(customerId);
      return activity.listTasks(customerId);
    },
    async addTask(customerId, body) {
      await requireCustomer(customerId);
      return activity.insertTask(customerId, parseTask(body), now());
    },
    async updateTask(taskId, body) {
      if (!(await activity.getTask(taskId))) throw new NotFoundError('Task');
      return activity.setTaskStatus(taskId, parseTaskUpdate(body).status);
    },

    async listCommunications(customerId) {
      await requireCustomer(customerId);
      return activity.listCommunications(customerId);
    },
    async addCommunication(customerId, body) {
      await requireCustomer(customerId);
      return activity.insertCommunication(customerId, parseCommunication(body), now());
    },
  };
}
