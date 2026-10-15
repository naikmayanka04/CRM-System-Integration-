export function createOrderRepo(db) {
  return {
    async listByCustomer(customerId) {
      const orders = await db.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC, id DESC', [customerId]);
      if (!orders.length) return [];
      const items = await db.query('SELECT order_id, name, qty, price FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY id', [orders.map((o) => o.id)]);
      return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id).map(({ name, qty, price }) => ({ name, qty, price })) }));
    },
    /** Used by seed and tests now; the sync service (Phase 4) adds upsert-by-woo_id. */
    insert(order) {
      return db.tx(async (tx) => {
        const [{ id }] = await tx.query(
          `INSERT INTO orders (woo_id, customer_id, status, total, currency, placed_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [order.woo_id ?? null, order.customer_id, order.status, order.total, order.currency ?? 'USD', order.placed_at, order.synced_at ?? null],
        );
        for (const it of order.items ?? []) {
          await tx.query('INSERT INTO order_items (order_id, name, qty, price) VALUES ($1, $2, $3, $4)', [id, it.name, it.qty, it.price]);
        }
        return id;
      });
    },
  };
}
