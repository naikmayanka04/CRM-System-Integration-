# Test report

Updated 2026-10-15 after the Phase 3b port to Express + Supabase (Postgres). Node v22.22.2.

## Run in the build sandbox (offline): `npm run test:unit` — 34 tests
```
✔ createCustomer stores a normalised customer stamped with the injected clock
✔ createCustomer rejects a duplicate email regardless of case
✔ a unique-violation from the database (race past the pre-check) becomes a 409 Conflict
✔ other database errors are not disguised as conflicts
✔ updateCustomer allows keeping own email but not taking another customer's
✔ unknown customer yields NotFound; invalid payload yields Validation (and no write)
✔ getCustomer exposes the order summary as a nested object
✔ tx commits on success and releases the connection
✔ tx rolls back on error, rethrows it, and still releases the connection
✔ nested tx uses savepoints: inner failure rolls back only the inner work
✔ query() omits the params argument when empty (keeps multi-statement SQL on the simple protocol)
✔ migrate applies pending files in name order, takes an advisory lock, records each one
✔ migrate skips files already recorded (repeatable)
✔ a failing migration is rolled back, named in the error, and not recorded
✔ real migration files: every table enables row level security (Supabase exposes the public schema)
✔ fullName / initials fall back to email, then a placeholder
✔ money formats currency and tolerates missing values
✔ shortDate is timezone-stable and tolerant of bad input
✔ dueState classifies open-task deadlines
✔ orderLabel pluralises
✔ routes table: every route has method, /api pattern and handler; no duplicates
✔ route handlers reject non-numeric and non-positive ids before touching the service
✔ Router keeps registration order and returns a copy
✔ body-parser errors map to our envelope (413, invalid JSON, charset)
✔ errorEnvelope hides internals of unexpected errors
✔ parseCustomer normalises email and trims names
✔ parseCustomer rejects bad email, missing name, bad phone, wrong types
✔ parseCustomer partial mode validates only provided fields and rejects empty updates
✔ parseCustomer ignores unknown fields (no mass assignment)
✔ parseTask requires title and valid calendar date
✔ parseTaskUpdate only accepts known statuses
✔ parseCommunication defaults to internal note and validates enums
✔ parseListQuery applies defaults and bounds
✔ parseListQuery rejects repeated/array parameters instead of crashing
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

## Written but NOT run (need `npm install` and a Postgres database)
| Suite | Tests | Needs | Status |
|---|---|---|---|
| `test/integration/api.test.js` (every endpoint, error paths, search, security headers) | 18 | Express, `TEST_DATABASE_URL` | Not run. Confirmed it reports **skipped** (not passed) when the database variable is missing, using stub packages. |
| `test/integration/db.test.js` (real Postgres: RLS on, case-insensitive unique email, cascades, savepoints, type parsing) | 6 | `pg`, `TEST_DATABASE_URL` | Not run. |
| `test/integration/static.test.js` (static files, SPA fallback, `/api` 404/405, invalid JSON, path traversal) | 1 | Express only (no database) | Not run. |
| `test/e2e/customers.e2e.js` (9 browser flows) | 9 | Express, database, `npm run web:build`, Playwright browsers | Not run on the new code. |

## Earlier results that no longer apply
The Phase 3 run (41/41 unit+integration, 9/9 browser) was against the previous `node:http` + `node:sqlite` build and is **not** evidence for the current code. The UI itself is unchanged, so `docs/screenshots/` still shows the real interface from that run.

## What the sandbox did verify about the port
`node --check` passes on every source and test file; the module graph loads and registers 11 routes and 7 per-path 405 handlers against stub packages (this proves wiring, not behaviour).

## To verify on your machine
```bash
npm install
cp .env.example .env     # set DATABASE_URL (Supabase) and TEST_DATABASE_URL (throwaway DB)
npm test                 # expect: no skipped tests
npm run web:build && npm run test:e2e
```
Paste the output here. Any failure is likely in Express wiring or SQL, the parts not run here.
