# CLAUDE.md — TokTickIT

Guidance for AI coding agents working in this repository.

## Project

TokTickIT is a service-desk / ticketing system built incrementally across CPE 334 labs:

- **Lab 1** — Categories, health check.
- **Lab 2** — Requester ticketing MVP (Tickets, Attachments, ticket numbering).
- **Lab 3** — Real auth (server-side sessions, bcrypt), RBAC (REQUESTER / IT_STAFF / ADMIN),
  mandatory first-login password change, CSRF defense, CORS allow-list, Public Comments,
  Internal Notes, Ticket Owner + IT Priority, Administrator user management.
- **Lab 4** — Actions Taken on Tickets, final Ticket status/resolution workflow,
  role dashboards (Requester / IT Staff), and final regression + hardening.

### Stack & layout

- `client/` — React 19 + TypeScript + Vite, Bootstrap (Zen Green design language), React Router.
- `server/` — Express 5 + TypeScript, Prisma 6 + PostgreSQL, bcryptjs sessions, multer uploads.
  - `server/prisma/schema.prisma` — canonical data model; `migrations/`, `seed.ts`.
  - `server/src/{lib,middleware,routes}` — auth helpers, `requireAuth`/role gates, Express routes.
  - `server/tests/{lab-01,lab-02,lab-03}` — Vitest API/unit tests against `toktickit_test`.
- `e2e/` + root `playwright.config.ts` — Playwright E2E against isolated `toktickit_e2e`.
- `shared/` — `password-vectors.json` shared by client + server.
- `docs/lab-0N/` — per-sprint spec, api-spec, ui-spec, tests, reviewer, ai-use.

### Running tests

- API/unit: `cd server && npm run test:db:setup` (once), then `npm test`.
- Migration: `cd server && npm run test:migration:setup`, then `npm run test:migration`.
- Client: `cd client && npm test`.
- E2E: from root `npm run e2e:setup`, then `npm run e2e`.

See `README.md` for full setup, env vars, and seed credentials.

## Lab 4 rules

These rules apply to all work on the Lab 4 sprint. They are binding for AI coding agents.

- **Branching & PRs.** Never commit to `main` or `lab4-staging` directly. One GitHub Issue
  = one `feature/lab4-*` branch = one Pull Request into `lab4-staging`. The release PR
  (`lab4-staging` → `main`) happens only after all sprint Issues are merged.
- **Spec is source of truth.** The spec docs in `docs/lab-04/` (`specification.md`,
  `api-spec.md`, `ui-spec.md`, `tests.md`) are the source of truth. If code and spec
  disagree, stop and ask — do not guess or silently "fix" either side.
- **Tests first.** Write tests before implementation. Run the full Lab 1–4 test suite
  (server unit/API, migration, client, and E2E) and confirm it passes before saying a
  task is done.
- **Preserve prior labs.** Preserve all Lab 1–3 behavior and data. Migrations must not
  discard existing records. Reuse existing Zen Green components rather than introducing
  new or duplicate UI patterns.
- **Backend is the authority.** The backend enforces all authorization and workflow rules
  (ownership, role permissions, Ticket status transitions, resolution gate). Hiding a
  control in the UI is not authorization — every write must be enforced server-side.
- **Post-merge issue housekeeping.** When the user reports that a feature PR has been merged
  into `lab4-staging`, close that PR's linked GitHub Issue and move it to **Done** on
  Project 2 ("TokTickIT Individual Sprints", project id `PVT_kwHOCxwHQ84Bgewt`, Status field
  `PVTSSF_lAHOCxwHQ84BgewtzhfeNqA`, Done option `e5eaef4b`). `Closes #<n>` in a PR targeting
  `lab4-staging` does **not** auto-close the issue, because GitHub only auto-closes on merges
  into the default branch (`main`) — so this step is manual until the release PR merges.
