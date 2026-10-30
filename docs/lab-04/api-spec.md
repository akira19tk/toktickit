# Lab 4 API Specification — Actions Taken, Workflow Gate, and Dashboards

Base URL `http://localhost:4000/api`. This document extends `docs/lab-03/api-spec.md`; all Lab 2–3 request
and response fields, session rules, CSRF header, CORS, identity handling, and allow-listed-fields behavior
not restated here are unchanged. The backend is the authority for every rule below.

## 1. Conventions (Lab 4 additions)

**Session & CSRF.** Unchanged: session cookie `tt_session`; every POST/PATCH/PUT/DELETE must send
`X-Requested-With: TokTickIT` or 403 `CSRF_REJECTED`.

**Check order.** Unchanged from Lab 3: authentication (401) → password-change gate (403) → CSRF (403) →
role (403) → resource lookup/ownership (404) → validation (400/422) → state conflict (409). For the Action
endpoints the assignee check is a **422** semantic-validation step (after 400 field shape, before 409 state).
For `PATCH …/status` the resolution gate (`OPEN_ACTIONS_EXIST`) is a 409 inserted after `TICKET_UNASSIGNED`
and before the 400 `resolutionSummary` check (see §6).

**Optimistic concurrency.** Mutating requests on `PATCH …/status`, `…/owner`, `…/it-priority`, and the
Action `PATCH` accept an optional `expectedUpdatedAt` (ISO-8601 string equal to the resource's current
`updatedAt`). If present and stale → 409 `STALE_UPDATE` (nothing written). If omitted, no check is done
(Lab 3 clients keep working).

**New status codes / codes**

| Status | Meaning | Codes |
|---|---|---|
| 422 | Semantic validation (assignee) | `ASSIGNEE_INACTIVE`, `INVALID_ASSIGNEE` |
| 409 | New state conflicts | `INVALID_ACTION_STATE`, `OPEN_ACTIONS_EXIST`, `STALE_UPDATE` |

`TICKET_CLOSED` (409) is reused from Lab 3 for Actions on CLOSED/CANCELLED Tickets.

**Action object** (returned by all Action endpoints; same shape for staff and Requester reads)
```json
{
  "id": 12,
  "ticketId": 5,
  "actionDate": "2026-10-28T02:30:00.000Z",
  "description": "Replaced the faulty RAM module and re-ran diagnostics.",
  "result": "All memory tests pass; no further errors.",
  "status": "OPEN",
  "followUpRequired": true,
  "followUpNote": "Confirm with user after 24h of uptime.",
  "attachmentNotes": "See diagnostic-report.pdf attachment.",
  "performedBy": { "id": 3, "name": "Michael Chen" },
  "assignee":    { "id": 4, "name": "Dana Lee" },
  "updatedBy":   { "id": 3, "name": "Michael Chen" },
  "createdAt": "2026-10-28T02:31:10.000Z",
  "updatedAt": "2026-10-28T02:31:10.000Z"
}
```
`result`, `followUpNote`, `attachmentNotes`, `assignee`, `updatedBy` may be `null`. `status` ∈ `OPEN`,
`COMPLETED`, `CANCELLED`. Timezone of stored instants is UTC; dashboards apply `Asia/Bangkok` boundaries.

## 2. Actions Taken — Staff

### POST /staff/tickets/:id/actions — IT_STAFF, ADMIN
Create an Action on an accessible Ticket.
Request (allow-listed)
```json
{
  "actionDate": "2026-10-28T02:30:00.000Z",
  "description": "…",
  "result": "…",
  "assigneeId": 4,
  "followUpRequired": true,
  "followUpNote": "…",
  "attachmentNotes": "…"
}
```
- **201** the created Action object; `performedBy` = session user, `status` = `OPEN`, `updatedBy` = null.
- **400** `VALIDATION_FAILED` — `description` missing/>2000; `actionDate` in the future; `followUpRequired`
  true with empty `followUpNote` (or false with a note present); `result`/`followUpNote`/`attachmentNotes`
  over length. Field errors in `errors`.
- **422** `ASSIGNEE_INACTIVE` (assignee is an inactive IT_STAFF/ADMIN) or `INVALID_ASSIGNEE` (assignee is a
  REQUESTER or unknown id).
- **403** Requester, or missing CSRF/password gate. **404** Ticket not found.
- **409** `TICKET_CLOSED` — Ticket is CLOSED or CANCELLED.

`actionDate` defaults to now when omitted. `assigneeId` is optional (unassigned Action).

### GET /staff/tickets/:id/actions — IT_STAFF, ADMIN
- **200** `{ "actions": [ …Action… ] }` newest-first by `createdAt`. **403** Requester. **404** no Ticket.

### PATCH /staff/tickets/:id/actions/:actionId — IT_STAFF, ADMIN
Edit, assign, complete, or cancel. Allowed for **any active** IT_STAFF/ADMIN (not only the author).
Request — any subset of editable fields and/or a lifecycle transition:
```json
{ "description": "…", "result": "…", "assigneeId": 4,
  "followUpRequired": false, "followUpNote": "", "attachmentNotes": "…",
  "status": "COMPLETED",
  "expectedUpdatedAt": "2026-10-28T02:31:10.000Z" }
```
- **200** the updated Action; `updatedBy` = session user, `updatedAt` refreshed.
- **400** `VALIDATION_FAILED` — same field rules as create; completing (`status:"COMPLETED"`) with an empty
  `result`; editing any field of a non-`OPEN` Action.
- **422** `ASSIGNEE_INACTIVE` / `INVALID_ASSIGNEE`.
- **403** Requester. **404** Ticket or Action not found (Action not under this Ticket → 404).
- **409** `INVALID_ACTION_STATE` (transition other than `OPEN→COMPLETED`/`OPEN→CANCELLED`);
  `TICKET_CLOSED`; `STALE_UPDATE`.

Conflict order for this endpoint: `TICKET_CLOSED` → `INVALID_ACTION_STATE` → `STALE_UPDATE`. There is no
hard delete; "cancel" = `status:"CANCELLED"`.

## 3. Actions Taken — Requester (read-only)

### GET /tickets/:id/actions — REQUESTER (owner)
- **200** `{ "actions": [ …Action… ] }` — all Actions on the Requester's own Ticket, all fields, newest-first.
- **404** Ticket not found **or not owned** by the caller (no existence leak). Requesters have no Action
  write endpoint; any attempt under `/staff/*` is 403.

## 4. Ticket Status — extended

### PATCH /staff/tickets/:id/status — IT_STAFF, ADMIN
Lab 3 behavior, with two Lab 4 changes: **ADMIN is now permitted**, and the **resolution gate** applies.
Request `{ "status": "RESOLVED", "resolutionSummary": "…", "confirm": true, "expectedUpdatedAt": "…" }`
- **200** updated Ticket summary (`currentStatus`, `resolvedAt`/`closedAt`, `allowedTransitions`).
- **409** conflict order: `NO_CHANGE` → `INVALID_TRANSITION` → `TICKET_UNASSIGNED` → **`OPEN_ACTIONS_EXIST`**
  → then **400** for the target-conditional requirement (`resolutionSummary` 10–1000 for RESOLVED; `confirm`
  for CLOSED/CANCELLED); `STALE_UPDATE` if `expectedUpdatedAt` is stale.
- `OPEN_ACTIONS_EXIST` message lists the count of still-open Actions. A Ticket with zero Actions resolves
  normally.
- **403** Requester. **404** Ticket not found.

`…/owner`, `…/it-priority`, `…/claim`, `…/comments`, `…/notes` keep **exact Lab 3 behavior and Lab 3 role
rules** (ADMIN remains read-only on these); they only gain the optional `expectedUpdatedAt` check.

## 5. Dashboards

All metrics are computed by the backend; date boundaries use `Asia/Bangkok` (UTC+7). Empty scope returns
`0` / `[]`, never 404. Each metric carries a `drillDown` client-route string (see `specification.md` §8.1).

### GET /staff/dashboard — IT_STAFF, ADMIN
```json
{
  "metrics": {
    "new": 14, "open": 23, "inProgress": 18, "waitingForRequester": 7,
    "myAssigned": 16, "unassigned": 9, "myOpenActions": 5
  },
  "myRecentTickets": [ { "id": 234, "ticketNumber": "TKT-2026-000234", "summary": "…",
                         "currentStatus": "IN_PROGRESS", "itPriority": "HIGH", "updatedAt": "…" } ],
  "urgentTickets":   [ { "id": 231, "ticketNumber": "TKT-2026-000231", "summary": "…",
                         "currentStatus": "OPEN", "itPriority": "HIGH", "updatedAt": "…" } ]
}
```
- `myAssigned` = `ownerId = me AND currentStatus ∉ {CLOSED,CANCELLED}`.
- `unassigned` = `ownerId IS NULL AND currentStatus ∉ {CLOSED,CANCELLED}`.
- `myOpenActions` = `ActionTaken WHERE assigneeId = me AND status = OPEN`.
- `myRecentTickets` = top 5 `ownerId = me` by `updatedAt desc`.
- `urgentTickets` = top 5 `itPriority = HIGH AND currentStatus ∉ {CLOSED,CANCELLED}` by `updatedAt desc`.
- **403** Requester.

### GET /requester/dashboard — REQUESTER (scoped `requesterId = me`)
```json
{
  "metrics": {
    "open": 3, "inProgress": 2, "waitingForMe": 1,
    "resolved": 5, "closed": 12, "recentlyResolved": 2
  },
  "myRecentTickets": [ { "id": 254, "ticketNumber": "TKT-2026-000254", "summary": "…",
                         "currentStatus": "IN_PROGRESS", "updatedAt": "…" } ]
}
```
- `open` = `currentStatus ∈ {NEW,OPEN,REOPENED}`; `waitingForMe` = `WAITING_FOR_REQUESTER`.
- `recentlyResolved` = `resolvedAt within last 7 days` (Asia/Bangkok).
- `myRecentTickets` = top 5 own by `updatedAt desc`.
- **403** IT_STAFF/ADMIN (they use `/staff/dashboard`).

## 6. Error-ordering summary (Lab 4 endpoints)

| Endpoint | Ordered checks after role (403) |
|---|---|
| `POST …/actions` | 404 Ticket → 400 fields → 422 assignee → 409 `TICKET_CLOSED` |
| `PATCH …/actions/:actionId` | 404 Ticket/Action → 400 fields (incl. non-OPEN edit, complete-without-result) → 422 assignee → 409 `TICKET_CLOSED` → `INVALID_ACTION_STATE` → `STALE_UPDATE` |
| `PATCH …/status` | 404 Ticket → 409 `NO_CHANGE` → `INVALID_TRANSITION` → `TICKET_UNASSIGNED` → `OPEN_ACTIONS_EXIST` → 400 summary/confirm → `STALE_UPDATE` |
| `GET …/dashboard` | role only (plus scope) |
