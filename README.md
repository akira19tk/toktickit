# TokTickIT — Lab 1: Full-Stack Hello World Starter

CPE334 Software Engineering (in the Age of AI Coding Agents) — Individual Sprint 1.

A vertical slice proving the full stack works end to end:
**React (Vite + Bootstrap) → Express REST API → Prisma ORM → PostgreSQL.**

Clicking **Check System** calls the backend health check and category list endpoints and
displays the result (or a clear error message if the backend/database is unavailable).

## Repository structure

```
toktickit/
├── client/            React + TypeScript + Vite + Bootstrap frontend
├── server/
│   ├── prisma/         Prisma schema, migrations, seed script
│   ├── src/             Express app (routes, Prisma client)
│   └── tests/lab-01/    Supertest API tests
├── client/tests/lab-01/ Vitest UI tests
├── docs/lab-01/          ai_use.md, reviewer.md, tests.md
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL running locally (or accessible via a connection string)

## 1. Backend setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env if your PostgreSQL user/password/host differ from the defaults
```

`.env` (not committed) should contain:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/toktickit?schema=public"
PORT=4000
```

Create the database, then run the migration and seed:

```bash
# Create the database once (adjust user as needed)
psql -U postgres -c "CREATE DATABASE toktickit;"

npx prisma migrate dev
npx prisma db seed
```

Run the API:

```bash
npm run dev
# API available at http://localhost:4000
```

## 2. Frontend setup

```bash
cd client
npm install
cp .env.example .env
npm run dev
# App available at http://localhost:5173
```

## 3. Running tests

Backend (Vitest + Supertest):

```bash
cd server
npm test
```

Frontend (Vitest + React Testing Library):

```bash
cd client
npm test
```

## Required environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `server/.env` | PostgreSQL connection string used by Prisma |
| `PORT` | `server/.env` | Port the Express API listens on (default 4000) |
| `VITE_API_BASE_URL` | `client/.env` | Base URL the frontend uses to call the API |

Never commit `.env` — only `.env.example` (a blank/sample template) is tracked in Git.

## Git branch and Pull Request rules for this lab

- `main` — stable release branch (protected, never commit directly)
- `lab1-staging` — Lab 1 integration branch (never commit directly)
- `feature/1-project-foundation`, `feature/2-health-check`,
  `feature/3-category-seed`, `feature/4-category-list` — one branch per Issue

Each feature branch is merged into `lab1-staging` via a peer-reviewed Pull Request.
Once all four Issues are merged into `lab1-staging`, a single release Pull Request
merges `lab1-staging` into `main`.

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `{ status: "ok", service: "TokTickIT API" }` |
| GET | `/api/categories` | Returns the four seeded IT request categories |

## Issue 3 verification

Verified locally on 2026-08-16:
- Prisma `Category` model (id, unique name, createdAt) migrated successfully to PostgreSQL
- `npx prisma db seed` inserted the four categories: Account and Access, Hardware, Software, Network
- Ran the seed twice to confirm it is idempotent (no duplicate rows created)
- No database credentials committed (.env is gitignored; only .env.example is tracked)
## Issue 2 verification

Verified locally on 2026-08-16:
- `GET /api/health` returns HTTP 200 with `{ "status": "ok", "service": "TokTickIT API" }`
- Supertest test `server/tests/lab-01/health.test.ts` passes
- Frontend Check System button displays backend status from a real API call
- Frontend shows a useful error message when the backend is unavailable (verified — see failure case screenshot)

## Issue 1 verification

Verified locally on 2026-08-16:
- Frontend (`npm run dev` in `client/`) starts successfully at http://localhost:5173
- Backend (`npm run dev` in `server/`) starts successfully at http://localhost:4000
- `npx prisma migrate dev` and `npx prisma db seed` run successfully against PostgreSQL

