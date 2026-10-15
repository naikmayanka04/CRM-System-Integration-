import { pathToFileURL } from 'node:url';
import { loadConfig, requireDatabaseUrl } from './config.js';
import { createDb, migrate } from './db.js';
import { createPool } from './pool.js';
import { createCustomerRepo } from './repositories/customers.js';
import { createOrderRepo } from './repositories/orders.js';
import { createActivityRepo } from './repositories/activity.js';

// Deterministic demo data. Labelled source='seed' so it is never mistaken for synced store data.
const PEOPLE = [
  ['Amara', 'Okafor', 'amara.okafor@example.com', '+1 555 010 1001'],
  ['Ben', 'Larsen', 'ben.larsen@example.com', '+1 555 010 1002'],
  ['Chloe', 'Nguyen', 'chloe.nguyen@example.com', '+1 555 010 1003'],
  ['Diego', 'Ramirez', 'diego.ramirez@example.com', ''],
  ['Elif', 'Yilmaz', 'elif.yilmaz@example.com', '+1 555 010 1005'],
  ['Farah', 'Haddad', 'farah.haddad@example.com', '+1 555 010 1006'],
  ['Grace', 'Liu', 'grace.liu@example.com', '+1 555 010 1007'],
  ['Hiro', 'Tanaka', 'hiro.tanaka@example.com', ''],
  ['Ines', 'Costa', 'ines.costa@example.com', '+1 555 010 1009'],
  ['Jonas', 'Weber', 'jonas.weber@example.com', '+1 555 010 1010'],
  ['Kira', 'Petrova', 'kira.petrova@example.com', '+1 555 010 1011'],
  ['Liam', "O'Brien", 'liam.obrien@example.com', '+1 555 010 1012'],
];
const PRODUCTS = [['Ceramic pour-over set', 48], ['Linen apron', 32.5], ['Single-origin beans 1kg', 29], ['Hand grinder', 79], ['Gift card', 25]];
const STATUSES = ['completed', 'completed', 'completed', 'processing', 'cancelled', 'refunded'];

export async function seedDemo(db) {
  const base = Date.parse('2026-01-05T10:00:00Z');
  return db.tx(async (tx) => {
    const customers = createCustomerRepo(tx);
    const orders = createOrderRepo(tx);
    const activity = createActivityRepo(tx);
    for (const [i, [first_name, last_name, email, phone]] of PEOPLE.entries()) {
      const created = new Date(base + i * 86_400_000).toISOString();
      const id = await customers.insert({ first_name, last_name, email, phone, source: 'seed' }, created);
      const orderCount = i % 5 === 3 ? 0 : (i % 4) + 1; // a few customers have no orders
      for (let n = 0; n < orderCount; n++) {
        const items = [0, 1].slice(0, 1 + ((i + n) % 2)).map((k) => {
          const [name, price] = PRODUCTS[(i + n + k) % PRODUCTS.length];
          return { name, qty: 1 + ((i + k) % 2), price };
        });
        await orders.insert({
          customer_id: id,
          status: STATUSES[(i + n) % STATUSES.length],
          total: Math.round(items.reduce((s, it) => s + it.qty * it.price, 0) * 100) / 100,
          placed_at: new Date(base + (i * 9 + n * 31 + 14) * 86_400_000).toISOString(),
          items,
        });
      }
    }
    const first = (await customers.list({ q: 'okafor', limit: 1, offset: 0 })).items[0];
    await activity.insertTask(first.id, { title: 'Offer free shipping on next order', due_date: '2026-11-01' }, new Date(base).toISOString());
    await activity.insertCommunication(first.id, { channel: 'email', direction: 'inbound', body: 'Asked whether the pour-over set ships to Canada.' }, new Date(base + 3_600_000).toISOString());
    return PEOPLE.length;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cfg = loadConfig();
  requireDatabaseUrl(cfg);
  const db = createDb(createPool(cfg));
  try {
    await migrate(db);
    const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM customers');
    if (n > 0) console.log(`Database already has ${n} customers; seed skipped.`);
    else console.log(`Seeded ${await seedDemo(db)} demo customers.`);
  } finally { await db.end(); }
}
