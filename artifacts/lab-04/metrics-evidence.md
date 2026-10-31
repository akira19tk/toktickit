# Lab 4 — Dashboard Metrics Evidence (Part 5)

This document shows, for the two seeded dashboard users, **every** dashboard metric value next to the
exact SQL query that computes it and that query's result. For each user the three columns agree:

- **SQL result** — a direct `SELECT count(*)` against the isolated E2E database `toktickit_e2e`.
- **API value** — the number the live backend returns from `GET /api/staff/dashboard` /
  `GET /api/requester/dashboard` (captured below).
- The dashboard UI renders the API value verbatim.

That API == direct-DB equality is also asserted automatically for varied, non-trivial states by the
end-to-end test **E2E-L4-03** (`e2e/lab-04/dashboards.spec.ts`), which recomputes each metric with its own
Prisma query at page-load time and compares it to the rendered card.

## How to reproduce

```bash
npm run e2e:setup            # recreate + deterministically seed toktickit_e2e (prisma/seed-e2e.ts)
# SQL: psql "postgresql://postgres:postgres@localhost:5432/toktickit_e2e" -c "<query>"
# API: start the server on the E2E DB, log in, GET the dashboard (see the JSON captures below)
```

All boundaries that depend on "today" use **Asia/Bangkok (UTC+7)**, per BR-18 (the backend uses
`bangkokRecentCutoff()`; the SQL below mirrors it with `now() at time zone 'Asia/Bangkok'`).

## Seed state (deterministic, from `prisma/seed-e2e.ts`)

Relevant user ids: **staff.e2e@example.com = 3**, **requester.e2e@example.com = 6**.

| Ticket | Status | requesterId | ownerId | itPriority |
|---|---|---|---|---|
| TKT-2026-950001 | NEW | 6 | *(null)* | MEDIUM |
| TKT-2026-950002 | OPEN | 6 | 3 | HIGH |

No `ActionTaken` rows exist on the clean seed. Every table column below is the honest value for this
reproducible state — including the legitimate zeros (which demonstrate the empty-scope case, BR per
ui-spec §4).

## IT Staff dashboard — `GET /api/staff/dashboard` as staff.e2e (id = 3)

| Metric | SQL (against `toktickit_e2e`) | SQL result | API value |
|---|---|---|---|
| `new` | `select count(*) from "Ticket" where "currentStatus"='NEW';` | 1 | 1 |
| `open` | `select count(*) from "Ticket" where "currentStatus"='OPEN';` | 1 | 1 |
| `inProgress` | `select count(*) from "Ticket" where "currentStatus"='IN_PROGRESS';` | 0 | 0 |
| `waitingForRequester` | `select count(*) from "Ticket" where "currentStatus"='WAITING_FOR_REQUESTER';` | 0 | 0 |
| `myAssigned` | `select count(*) from "Ticket" where "ownerId"=3 and "currentStatus" not in ('CLOSED','CANCELLED');` | 1 | 1 |
| `unassigned` | `select count(*) from "Ticket" where "ownerId" is null and "currentStatus" not in ('CLOSED','CANCELLED');` | 1 | 1 |
| `myOpenActions` | `select count(*) from "ActionTaken" where "assigneeId"=3 and status='OPEN';` | 0 | 0 |

Live API response:

```json
{
  "metrics": {
    "new": 1, "open": 1, "inProgress": 0, "waitingForRequester": 0,
    "myAssigned": 1, "unassigned": 1, "myOpenActions": 0
  },
  "myRecentTickets": [
    { "id": 2, "ticketNumber": "TKT-2026-950002", "summary": "E2E: VPN disconnects frequently",
      "currentStatus": "OPEN", "itPriority": "HIGH", "updatedAt": "2026-10-31T15:58:20.300Z" }
  ],
  "urgentTickets": [
    { "id": 2, "ticketNumber": "TKT-2026-950002", "summary": "E2E: VPN disconnects frequently",
      "currentStatus": "OPEN", "itPriority": "HIGH", "updatedAt": "2026-10-31T15:58:20.300Z" }
  ]
}
```

The recent/urgent lists also match their specs: `urgentTickets` = HIGH IT-priority tickets not
Closed/Cancelled (950002), `myRecentTickets` = tickets owned by staff.e2e (950002).

## Requester dashboard — `GET /api/requester/dashboard` as requester.e2e (id = 6)

| Metric | SQL (against `toktickit_e2e`) | SQL result | API value |
|---|---|---|---|
| `open` | `select count(*) from "Ticket" where "requesterId"=6 and "currentStatus" in ('NEW','OPEN','REOPENED');` | 2 | 2 |
| `inProgress` | `select count(*) from "Ticket" where "requesterId"=6 and "currentStatus"='IN_PROGRESS';` | 0 | 0 |
| `waitingForMe` | `select count(*) from "Ticket" where "requesterId"=6 and "currentStatus"='WAITING_FOR_REQUESTER';` | 0 | 0 |
| `resolved` | `select count(*) from "Ticket" where "requesterId"=6 and "currentStatus"='RESOLVED';` | 0 | 0 |
| `closed` | `select count(*) from "Ticket" where "requesterId"=6 and "currentStatus"='CLOSED';` | 0 | 0 |
| `recentlyResolved` | `select count(*) from "Ticket" where "requesterId"=6 and "resolvedAt" >= (now() at time zone 'Asia/Bangkok')::date - interval '6 days';` | 0 | 0 |

Live API response:

```json
{
  "metrics": {
    "open": 2, "inProgress": 0, "waitingForMe": 0,
    "resolved": 0, "closed": 0, "recentlyResolved": 0
  },
  "myRecentTickets": [
    { "id": 2, "ticketNumber": "TKT-2026-950002", "summary": "E2E: VPN disconnects frequently",
      "currentStatus": "OPEN", "updatedAt": "2026-10-31T15:58:20.300Z" },
    { "id": 1, "ticketNumber": "TKT-2026-950001", "summary": "E2E: cannot sign in to email",
      "currentStatus": "NEW", "updatedAt": "2026-10-31T15:58:20.298Z" }
  ]
}
```

`open` counts `NEW`, `OPEN` and `REOPENED` together (BR per api-spec §5), so both seeded tickets fall into
it. `recentlyResolved` uses the Asia/Bangkok "last 7 days" window (`resolvedAt >= start-of-day − 6 days`);
no ticket is resolved on the seed, so it is 0.

## Non-trivial states

Because the clean seed is intentionally small, the automated E2E (`E2E-L4-03`) seeds richer fixtures at
runtime — a self-assigned open action (`myOpenActions > 0`), an unassigned NEW ticket (`unassigned > 0`),
and a resolved requester ticket (`resolved`, `recentlyResolved > 0`) — and asserts **every** staff and
requester metric equals a direct Prisma count. That guarantees the SQL-vs-API equality shown above holds for
arbitrary data, not just the seed.
