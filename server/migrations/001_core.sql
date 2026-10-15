CREATE TABLE customers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  woo_id      bigint UNIQUE,
  email       text,
  first_name  text NOT NULL DEFAULT '',
  last_name   text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);
-- Case-insensitive uniqueness; NULL emails (guest checkouts) never collide.
CREATE UNIQUE INDEX uq_customers_email ON customers (lower(email));
CREATE INDEX ix_customers_name ON customers (last_name, first_name);

CREATE TABLE orders (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  woo_id       bigint UNIQUE,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status       text NOT NULL,
  total        numeric(12,2) NOT NULL CHECK (total >= 0),
  currency     text NOT NULL DEFAULT 'USD',
  placed_at    timestamptz NOT NULL,
  synced_at    timestamptz
);
CREATE INDEX ix_orders_customer ON orders (customer_id, placed_at DESC);

CREATE TABLE order_items (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id  bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name      text NOT NULL,
  qty       integer NOT NULL CHECK (qty > 0),
  price     numeric(12,2) NOT NULL CHECK (price >= 0)
);
CREATE INDEX ix_order_items_order ON order_items (order_id);

CREATE TABLE tasks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_date     date,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at   timestamptz NOT NULL
);
CREATE INDEX ix_tasks_customer ON tasks (customer_id, status);

CREATE TABLE communications (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('note','email','phone','sms')),
  direction    text NOT NULL CHECK (direction IN ('internal','inbound','outbound')),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL
);
CREATE INDEX ix_comms_customer ON communications (customer_id, created_at DESC);

-- Supabase exposes the public schema through its REST API. Enabling RLS with NO policies denies
-- all anon/authenticated access; only our server's direct database connection (a privileged role) can read or write.
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
