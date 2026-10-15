# Requirements Specification — WooCommerce CRM Integration

Status: **Phase 1 draft; Phase 3 implemented FR-1, FR-3, FR-5 (customers, order view, tasks, notes) and AC-2.** All other requirements remain proposed scope.

## 1. Problem statement
Small online stores hold customer and order data in WooCommerce but have no lightweight place to
search customers, review their order history, track follow-ups, and decide who to contact next.
This project builds a small CRM that synchronizes customers and orders from WooCommerce and adds
one AI-assisted (agentic) workflow that recommends follow-ups for **staff approval**.

## 2. Users
| User | Need |
|---|---|
| Store staff / account manager | Find a customer, see orders, log notes, create follow-up tasks |
| Store owner | Dashboard of customers, revenue, segments, who needs attention |
| Developer / evaluator | Run, test and diagnose the integration reproducibly |

## 3. Environment decisions (confirmed with the project owner)
| Item | Decision | Source |
|---|---|---|
| Stack | Node.js + **Express** backend + React frontend | Stated by owner (Express re-confirmed after Phase 3) |
| WooCommerce access | **None** → clearly labelled **mock adapter** is the default | Stated by owner |
| AI provider | **None** → rule-based engine behind a swappable `AiProvider` interface | Stated by owner |
| Database | **Supabase (hosted Postgres)**, accessed with the `pg` driver | Stated by owner (after Phase 3) |
| Hosting | Local only; deployment guide documented, not performed | **Assumption** |
| Existing repo | None; new repository | **Assumption** |
| Deadline | Unknown | **Open question** |

Verified in the build sandbox: Node v22.22.2, npm 10.9.7, git 2.43.0. (Later finding, Phase 3: the npm registry is unreachable there, so `better-sqlite3`, Express and `pg` cannot be installed in it; see §8 R8.)

## 4. MVP (what will be demonstrated)
1. Customer list with search
2. Customer profile (contact details, notes/communication history, tasks)
3. Order history per customer
4. WooCommerce synchronization (mock adapter by default; live adapter implemented but unverified)
5. One AI-assisted workflow: follow-up recommendations with evidence, shown for staff approval

### Essential vs optional
| Essential (MVP) | Optional (only if time remains) |
|---|---|
| Customer/order models + migrations | Webhook receiver with signature verification (planned; see §6) |
| List, search, detail, order history | Configurable segmentation UI |
| Mock + live adapter behind one interface | Dashboard charts |
| Idempotent sync with error log + retry | CSV export |
| Rule-based follow-up agent + approval UI | LLM-backed provider |
| Unit, integration, API-level e2e tests | Browser e2e with screenshots (see §8) |

## 5. Functional requirements
- **FR-1** Create, edit, search (name/email/phone) and retrieve customers.
- **FR-2** Store WooCommerce external IDs; unique constraint prevents duplicate customers/orders.
- **FR-3** Show a customer's orders with latest synced status and an order summary (count, total, last order date).
- **FR-4** Segment customers using configurable rules (e.g. *VIP*: total spend ≥ X; *At risk*: no order in N days).
- **FR-5** Create follow-up tasks and log communication notes per customer.
- **FR-6** Dashboard: customer count, order count, revenue, segment breakdown, open tasks, last sync status.
- **FR-7** Sync: paginated fetch of customers and orders; upsert by external ID; validate payloads.
- **FR-8** Sync resilience: timeouts, retry with backoff, rate-limit (HTTP 429) handling, partial-failure recording, safe re-run.
- **FR-9** Integration status page: mode (MOCK/LIVE), last run, counts, errors with detail.
- **FR-10** AI agent: goal, allowed tools, decision boundaries; outputs recommendation + cited evidence + draft message.
- **FR-11** Human approval: nothing is sent or changed until staff clicks approve; reject is also recorded.

## 6. Non-functional requirements
- **Security:** secrets only in environment variables; `.env` git-ignored; `.env.example` provided; logs sanitized (no keys, minimal PII); input validation on all endpoints; webhook HMAC-SHA256 signature check (`X-WC-Webhook-Signature`) with constant-time compare; basic staff authentication for the CRM API.
- **Privacy:** the AI provider interface receives a minimized payload (no full email/phone unless needed for the draft); only data staff are authorized to see.
- **Reliability:** idempotent sync and webhook handling; migrations are repeatable.
- **Reproducibility:** one-command install, migrate, seed, test, start.
- **Honesty:** UI and docs always show MOCK vs LIVE mode; no claim of live verification without live credentials.

## 7. Mock vs live mode
- **Mock mode (default):** a deterministic in-repo adapter returns fixture customers/orders, including deliberate edge cases (duplicate email casing, a failing page, a 429 response) so failure handling can be tested. Proves *our* sync logic; does **not** prove compatibility with a real store.
- **Live mode:** the same interface calls the WooCommerce REST API (`/wp-json/wc/v3/customers`, `/orders`) with a consumer key/secret from the environment. **Unverified until real credentials are supplied.** The checklist of evidence needed to verify it will go in the configuration guide.

## 8. Known blockers and risks (initial register)
| ID | Risk / blocker | Impact | Mitigation / evidence to unblock |
|---|---|---|---|
| R1 | No live WooCommerce store | Live adapter unverified | Mock adapter + contract tests against documented WC response shapes; free test store (WordPress + WooCommerce) to unblock |
| R2 | No AI API key | No LLM output | Rule-based provider; interface allows later LLM swap |
| R3 | **Updated in Phase 3:** a preinstalled Chromium exists, so browser e2e and screenshots now run here (see `docs/test-report.md`). New constraint found: the npm registry is unreachable, so Express/Vite/vitest cannot be installed (architecture §12) | Browser e2e done; dependency choices adjusted | API-level e2e (supertest) + React component tests here; Playwright spec provided and run on the owner's machine; screenshots must be captured there |
| R4 | ~~Judging criteria not provided~~ **Resolved:** criteria received (see §10) | — | Mapping below is now based on the official list |
| R7 | "Execution Quality" mentions *deployment*; plan is local-only | Possible lost points | Provide Docker/compose + deployment guide; deploy to a free host only if owner wants it (unverified until done) |
| R5 | Deadline unknown | Scope risk | MVP-first ordering |
| R6 | Webhook testing needs a public URL | Live webhook flow unverifiable | Signed-payload unit/integration tests locally |
| R8 | Express and Supabase/Postgres code cannot be run in the build sandbox (no npm or network) | Port is unverified until the owner runs it | Unit tests (34) run offline; DB-backed and browser tests are written and skip without `TEST_DATABASE_URL`; owner runs `npm install && npm test` and pastes results into `docs/test-report.md` |
| R9 | Supabase exposes the `public` schema over a REST API | Customer PII readable by anon key if RLS is off | RLS enabled on every table with no policies (migration 001; unit test enforces it); never ship the anon key to the browser; server-only connection string |

## 9. Acceptance criteria
- **AC-1** Syncing a store containing a customer imports it once; re-running sync leaves one record and updates changed fields.
- **AC-2** Opening that customer shows their orders with the latest synced status.
- **AC-3** A simulated API failure produces a stored, readable error; retry succeeds without duplicates.
- **AC-4** For a qualifying customer, the agent returns a recommendation citing the rule and fields used, plus a draft; no message is sent until approval.
- **AC-5** A fresh clone can install, migrate, seed, run tests and start following the README.
- **AC-6** Invalid webhook signature → rejected (401); duplicate delivery → processed once.

## 10. Mapping to the official scoring criteria (in priority order)
| # | Criterion | What it asks | Planned evidence in this repo |
|---|---|---|---|
| 1 | **AI Tool Usage** | Effective, correct use of AI tools throughout development | `docs/ai-usage-log.md`: tool, task, contribution, how it was verified, corrections made. Updated every phase (highest priority, so kept current, not written at the end) |
| 2 | **Codebase Quality** | Design patterns, unit tests, e2e tests, best practices | Adapter + Repository + Strategy (AI provider) patterns; layered `routes → services → repositories`; unit, integration and e2e suites; lint config; actual test output in `docs/test-report.md` |
| 3 | **Documentation** | Scope, assumptions, operational details | `README.md`, this file, `docs/architecture.md`, `docs/woocommerce-setup.md`, `docs/troubleshooting.md` |
| 4 | **Video Presentation** | Clear 2-minute explanation | `docs/demo-script.md` with timed sequence (owner records it; I cannot record video) |
| 5 | **Agentic AI** | Innovative use of agents for productivity | Follow-up agent with goal, tools, plan→act→verify loop, evidence citations, human approval gate |
| 6 | **Execution Quality** | Design, deployment, overall implementation | Working critical path, Docker setup, honest MOCK/LIVE labelling, UI polish within MVP |

## 11. Open questions for the owner
1. Submission deadline and required format (repo link, zip, video upload)?
2. ~~Is SQLite acceptable?~~ **Resolved:** Supabase (Postgres).
3. Do you want me to also provide a free-test-store setup guide so live mode can be verified later?
