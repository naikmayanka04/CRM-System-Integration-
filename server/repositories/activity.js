// Tasks and communications: small, customer-scoped tables.
export function createActivityRepo(db) {
  const one = async (sql, params) => (await db.query(sql, params))[0];
  return {
    listTasks(customerId) {
      return db.query(
        `SELECT * FROM tasks WHERE customer_id = $1
         ORDER BY (status = 'done'), COALESCE(due_date, DATE '9999-12-31'), id`, [customerId]);
    },
    getTask: (id) => one('SELECT * FROM tasks WHERE id = $1', [id]),
    insertTask: (customerId, { title, due_date }, now) =>
      one('INSERT INTO tasks (customer_id, title, due_date, created_at) VALUES ($1, $2, $3, $4) RETURNING *', [customerId, title, due_date ?? null, now]),
    setTaskStatus: (id, status) => one('UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *', [status, id]),
    listCommunications: (customerId) =>
      db.query('SELECT * FROM communications WHERE customer_id = $1 ORDER BY created_at DESC, id DESC', [customerId]),
    insertCommunication: (customerId, { channel, direction, body }, now) =>
      one('INSERT INTO communications (customer_id, channel, direction, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *', [customerId, channel, direction, body, now]),
  };
}
