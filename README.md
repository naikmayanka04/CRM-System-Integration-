# WooCommerce CRM (Phase 3: customers, orders view, follow-ups, notes)

Status: Phases 1-3 done; ported to Express + Supabase (Postgres) in Phase 3b, **not yet run against a real database**. Not yet built: WooCommerce sync (mock/live), webhook, segments, dashboard, AI follow-up agent, auth. See `docs/`.
Data in this build is **demo seed data** (`source = seed`); there is no WooCommerce connection yet.

## Requirements
Node >= 22.9, a Postgres database (Supabase project or local Postgres).

## Run
```bash
npm install
cp .env.example .env   # set DATABASE_URL (Supabase connection string) and DB_SSL=require
npm run migrate        # creates tables (RLS enabled, no public policies)
npm run seed           # 12 demo customers (skipped if data exists)
npm run web:build      # builds web/dist with Vite
npm start              # http://localhost:3001  (PORT to change)
```
Dev UI with hot reload: `npm start` in one terminal, `npm run web:dev` in another.
Keep the database URL server-side only; never put it, or a Supabase anon key, in the web app.

## Test
```bash
npm run test:unit      # no database or install needed
npm test               # + integration tests; set TEST_DATABASE_URL to a throwaway database, otherwise they are skipped
npm run web:build && npm run test:e2e   # browser e2e (Playwright)
```
Results and what has/has not been run: `docs/test-report.md`. Screenshots: `docs/screenshots/`.

## Layout
`server/` Express adapter (`app.js`) + route table (`http/`) -> service (`services/`) -> repositories (`repositories/`) -> Postgres via `pg`; SQL migrations in `server/migrations/`. `web/` React UI. `test/` unit, integration, e2e.

## Known limits
No authentication yet (run on localhost only). See `docs/architecture.md` §12 for implementation notes.
