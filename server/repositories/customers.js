// All SQL for customers lives here. Services never build queries.
// Statuses that do not count towards revenue / total spent.
const NON_REVENUE = `('cancelled','refunded','failed')`;

const SELECT_WITH_SUMMARY = `
  SELECT c.*,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
    (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status NOT IN ${NON_REVENUE}) AS total_spent,
    (SELECT MAX(o.placed_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
  FROM customers c`;

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`); // backslash is Postgres' default LIKE escape

export function createCustomerRepo(db) {
  return {
    async list({ q, limit, offset }) {
      const params = [];
      let clause = '';
      if (q) {
        params.push(`%${escapeLike(q)}%`);
        const ors = [`(c.first_name || ' ' || c.last_name) ILIKE $1`, `c.email ILIKE $1`];
        const digits = q.replace(/[\s\-.]/g, '');
        if (digits) {
          params.push(`%${escapeLike(digits)}%`);
          ors.push(`regexp_replace(c.phone, '[\\s\\-.]', '', 'g') LIKE $2`);
        }
        clause = `WHERE ${ors.join(' OR ')}`;
      }
      const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM customers c ${clause}`, params);
      const items = await db.query(
        `${SELECT_WITH_SUMMARY} ${clause} ORDER BY lower(c.last_name), lower(c.first_name), c.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items, total: n };
    },
    async get(id) {
      return (await db.query(`${SELECT_WITH_SUMMARY} WHERE c.id = $1`, [id]))[0];
    },
    async findByEmail(email) {
      return (await db.query('SELECT id FROM customers WHERE lower(email) = lower($1)', [email]))[0];
    },
    async insert(c, now) {
      const rows = await db.query(
        `INSERT INTO customers (woo_id, email, first_name, last_name, phone, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
        [c.woo_id ?? null, c.email ?? null, c.first_name ?? '', c.last_name ?? '', c.phone ?? '', c.source ?? 'manual', now],
      );
      return rows[0].id;
    },
    async update(id, fields, now) {
      const cols = ['email', 'first_name', 'last_name', 'phone'].filter((k) => fields[k] !== undefined);
      const sets = cols.map((k, i) => `${k} = $${i + 1}`);
      await db.query(
        `UPDATE customers SET ${sets.join(', ')}, updated_at = $${cols.length + 1} WHERE id = $${cols.length + 2}`,
        [...cols.map((k) => fields[k]), now, id],
      );
    },
  };
}
