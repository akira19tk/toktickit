# TokTickIT — Lab 3: Users, Roles, IT Staff Ticketing, and Admin

CPE334 Software Engineering (in the Age of AI Coding Agents) — Sprint 3.

Real authentication (server-side sessions, bcrypt), role-based authorization
(REQUESTER / IT_STAFF / ADMIN), mandatory first-login password change, CSRF
defense, and CORS allow-list on top of the Lab 2 Requester ticketing MVP.

## Repository structure

```
toktickit/
├── client/                   React + TypeScript + Vite frontend
├── server/
│   ├── prisma/
│   │   ├── migrations/       Prisma migration SQL (Labs 1–3)
│   │   ├── schema.prisma     Canonical data model
│   │   └── seed.ts           Idempotent seed (local dev only)
│   ├── scripts/              DB-setup helpers (test and migration test DBs)
│   ├── src/
│   │   ├── lib/              auth helpers (password, session, throttle)
│   │   ├── middleware/       requireAuth, passwordChangeGate, csrfCheck, requireRole
│   │   └── routes/           Express route handlers
│   └── tests/
│       ├── lab-01/           categories, health
│       ├── lab-02/           ticket and attachment regression (session-auth)
│       └── lab-03/           auth, authorization, requester regression, migration
├── docs/lab-03/              specification, tests, api-spec, ui-spec, reviewer, ai-use
├── shared/                   password-vectors.json (server + client share)
└── README.md
```

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL running locally

## 1. Backend setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env if your PostgreSQL credentials or ports differ
```

Create the development database and apply all migrations:

```bash
psql -U postgres -c "CREATE DATABASE toktickit;"
npx prisma migrate dev
```

Seed local development data (accounts, sample tickets, comments):

```bash
npm run prisma:seed
```

Run the API server (port 4000 by default):

```bash
npm run dev
```

## 2. Frontend setup

```bash
cd client
npm install
cp .env.example .env
npm run dev   # http://localhost:5173
```

> **Known limitation — Issue #25 (Login/Shell UI):** The client still sends the
> old `x-requester-id` header and the Development Requester selector from Lab 2.
> The Lab 3 server ignores that header, so the Lab 2 UI **does not work** against
> the new server until the Login and Shell screens are built in Issue #25.
> All Lab 3 features are tested via the API test suite; no UI interaction with
> the new auth layer is possible until that Issue lands.

## 3. Environment variables (`server/.env`)

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the **development** database. Never ends in `_test`. |
| `TEST_DATABASE_URL` | PostgreSQL connection string for the **API test** database. Must end in `_test` and differ from `DATABASE_URL`. Created once with `npm run test:db:setup`. |
| `MIGRATION_TEST_DATABASE_URL` | PostgreSQL connection string for the **migration test** database. Must end in `_test`. Created once with `npm run test:migration:setup`. |
| `PORT` | Port the Express API listens on (default `4000`). |
| `CLIENT_ORIGIN` | Exact origin allowed by CORS, e.g. `http://localhost:5173`. No wildcard (BR-15). |
| `BCRYPT_COST` | bcrypt work factor (BR-10). Minimum `10`; lower values only for CI speed. |
| `SESSION_TTL_HOURS` | Absolute session lifetime in hours (BR-11, default `8`). |
| `SEED_INITIAL_PASSWORD` | Initial password assigned to every seeded account (local dev only). Default `Welcome#2026`. |

Never commit `.env`. Only `.env.example` (no real secrets) is tracked.

## 4. Local seed credentials (local development only)

All accounts use the password in `SEED_INITIAL_PASSWORD` (default `Welcome#2026`).
Staff and Admin accounts have `mustChangePassword = false` for demo convenience.
Migrated Requester accounts have `mustChangePassword = true` (first login forces a change).

| Email | Role | Active | Notes |
|---|---|---|---|
| `admin@example.com` | ADMIN | yes | Only active Administrator |
| `michael.brown@example.com` | IT_STAFF | yes | |
| `sarah.johnson@example.com` | IT_STAFF | yes | |
| `david.lee@example.com` | IT_STAFF | yes | |
| `emma.clark@example.com` | IT_STAFF | **no** | Inactive staff account |
| `alice@example.com` | REQUESTER | yes | Migrated from Lab 2; must change password |
| `bob@example.com` | REQUESTER | yes | Migrated from Lab 2; must change password |
| `carol@example.com` | REQUESTER | yes | Migrated from Lab 2; must change password |
| `david@example.com` | REQUESTER | yes | Migrated from Lab 2; must change password |

These credentials are for **local development only**. Never use them in any shared or
production environment.

## 5. Running the test suite

### One-time test database setup

```bash
cd server
npm run test:db:setup
```

This drops and recreates `toktickit_test`, applies all migrations, and seeds
Categories and Related Systems. Refuses to run if the database name does not end
in `_test` or matches `DATABASE_URL`.

### API and unit tests

```bash
cd server
npm test
```

Runs all unit and API tests sequentially (`fileParallelism: false`) against
`toktickit_test`. No development data is touched.

### Migration tests (MIG-01 – MIG-04)

```bash
cd server
npm run test:migration:setup   # build toktickit_migration_test from scratch
npm run test:migration          # apply Lab 2 fixture → Lab 3 migration → compare
```

These tests verify that no Lab 2 data is lost during the Lab 3 schema migration.

### Client tests

```bash
cd client
npm test
```

## 6. Git branch and Pull Request rules

| Branch | Purpose |
|---|---|
| `main` | Stable release branch — never commit directly |
| `lab3-staging` | Lab 3 integration branch — never commit directly |
| `feature/<N>-<slug>` | One branch per Issue |

Each feature branch is merged into `lab3-staging` via a **peer-reviewed Pull
Request**. Once all Issues for a sprint are merged, a single release PR merges
`lab3-staging` → `main`.

Current sprint Issues:
- **#24** Auth foundation (schema, migration, seed, auth API, authorization) ← *this branch*
- **#25** Login and Shell UI
- **#26** Staff Ticket Queue
- **#27** Staff Ticket Operations
- **#28** Administrator User Management

## 7. API quick reference (Lab 3)

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Reference | `GET /api/categories`, `GET /api/related-systems` (authenticated) |
| Requester | `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, attachments, `GET/POST .../comments`, `POST .../resolved-indication` |
| Staff | `GET/POST /api/staff/tickets`, claim, owner, it-priority, status, comments, notes, download, assignees *(Issues #26/#27)* |
| Admin | `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, initial-password *(Issue #28)* |

Full shapes and error codes: `docs/lab-03/api-spec.md`.
