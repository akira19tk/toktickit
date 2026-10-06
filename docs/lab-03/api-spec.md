# Lab 3 API Specification — Authentication, Roles, IT Staff and Admin

Base URL `http://localhost:4000/api`. This document extends `docs/lab-02/api-spec.md`; Lab 2 request and response fields not listed here are unchanged.

## 1. Conventions

**Session.** `POST /auth/login` sets the cookie `tt_session` (HttpOnly, SameSite=Lax, Path=/, Secure in production, 8 hours). The client calls every API with `credentials: "include"`.

**Required header.** Every POST, PATCH, PUT and DELETE (including login and logout) must send `X-Requested-With: TokTickIT`, otherwise 403 `CSRF_REJECTED`. GET requests do not need it. "Public" below means *no session required*, not *no header required*.

**CORS.** Only the origin in `CLIENT_ORIGIN` (default `http://localhost:5173`) is allowed, with credentials. No wildcard.

**Identity.** The client never sends who it is. `x-requester-id` and any `requesterId` in a body or query are ignored.

**Public user object**
```json
{ "id": 2, "name": "Bob Smith", "email": "bob@example.com", "role": "REQUESTER", "mustChangePassword": false }
```
Roles: `REQUESTER`, `IT_STAFF`, `ADMIN`. Password hashes are never returned.

**Error body**
```json
{ "error": "Human-readable safe message", "code": "MACHINE_CODE", "errors": { "field": "message" } }
```
`code` and `errors` are optional.

**Check order.** authentication (401) → password-change gate (403) → CSRF header (403) → role (403) → resource lookup / ownership (404) → validation (400) → state conflict (409). Conflict order: status changes `NO_CHANGE` → `INVALID_TRANSITION` → `TICKET_UNASSIGNED`; owner and IT Priority `TICKET_CLOSED` → `NO_CHANGE`; claim `TICKET_CLOSED` → `ALREADY_OWNED`. For the status endpoint only the `status` enum value is validated in the 400 step; the `resolutionSummary` (RESOLVED) and `confirm` (CLOSED/CANCELLED) requirements are validated **after** the status 409 conflicts, so an illegal or no-op transition returns 409 rather than a 400.

**Allow-listed fields.** Each endpoint accepts only the fields documented here; any other field in a request body is ignored (never written).

**Status codes and codes**

| Status | Meaning | Codes |
|---|---|---|
| 200 / 201 / 204 | Success / created / success with no body | |
| 400 | Invalid input | `VALIDATION_FAILED` |
| 401 | No valid session, or bad credentials | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | Forbidden by role, password gate, CSRF or inactive account | `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_REJECTED`, `ACCOUNT_INACTIVE` |
| 404 | Missing or not owned resource, unknown route | `NOT_FOUND` |
| 409 | State conflict | `ALREADY_OWNED`, `INVALID_TRANSITION`, `TICKET_UNASSIGNED`, `TICKET_CLOSED`, `INVALID_STATE`, `NO_CHANGE`, `EMAIL_TAKEN`, `SELF_DEACTIVATION`, `LAST_ADMIN`, `SELF_PASSWORD_RESET` |
| 410 | Removed Attachment (Lab 2) | |
| 429 | Too many failed logins | `TOO_MANY_ATTEMPTS` |
| 500 | Unexpected error; no stack traces | `INTERNAL_ERROR` |

## 2. Authentication

### POST /auth/login — public
Request `{ "email": "Bob@Example.com ", "password": "…" }`
- **200** `{ "user": { …public user object… } }` and `Set-Cookie: tt_session=…`
- **400** missing or malformed fields (`errors.email`, `errors.password`)
- **401** `INVALID_CREDENTIALS` "Invalid email or password" — identical for unknown email, wrong password, or a user with no password yet
- **403** `ACCOUNT_INACTIVE` "This account is inactive. Contact an administrator." — only when the password was correct
- **429** `TOO_MANY_ATTEMPTS` — after the 5th consecutive failure for that normalized email (existing or not), attempts are refused for 15 minutes, even with the correct password

### POST /auth/logout — public, idempotent
- **204**; the session row is deleted and the cookie cleared even if no session exists.

### GET /auth/me — any authenticated user (allowed while the password change is pending)
- **200** `{ "user": { …public user object… } }`
- **401** no valid session

### POST /auth/change-password — any authenticated user (allowed while the password change is pending)
Request `{ "currentPassword": "…", "newPassword": "…", "confirmPassword": "…" }`
- **200** `{ "user": { …, "mustChangePassword": false } }`; other sessions are deleted, the current one remains.
- **400** `errors.currentPassword` (wrong), `errors.newPassword` (policy, same as current), `errors.confirmPassword` (mismatch)

- **429** `TOO_MANY_ATTEMPTS` after 5 wrong current passwords in a row for the same user (15-minute lock)

Password policy: at least 8 characters, at most 72 **bytes** in UTF-8 (about 24 Thai characters), at least one letter and one digit; longer values are rejected, never truncated. New and current passwords must differ, and the confirmation must match. The same length, byte-limit, letter and digit rules apply to initial passwords set by an Administrator; "differs from current" and the confirmation do not. The client checks the same limits for instant feedback, but the server result is authoritative.

## 3. Reference data
`GET /categories`, `GET /related-systems` — **200** as in Lab 2 for any authenticated user whose password change is not pending; **401** otherwise.

## 4. Requester endpoints (role `REQUESTER`; non-owned resources → 404; other roles → 403)

Lab 2 endpoints keep their paths and shapes; the Requester id now comes from the session.

| Endpoint | Notes |
|---|---|
| `POST /tickets` | Saves `requesterId` from the session; defaults: status `NEW`, `ownerId` null, `itPriority = requestedPriority` |
| `GET /tickets` | Same query parameters as Lab 2 (search, filters, sort, page); list items add `itPriority` and `owner` name |
| `GET /tickets/:id` | Lab 2 fields plus the additions below |
| `POST /tickets/:id/attachments`, `GET …/download`, `DELETE …/:attachmentId` | Unchanged; owner only |

**Ticket detail additions**
```json
{ "currentStatus": "IN_PROGRESS", "itPriority": "HIGH", "owner": { "name": "Michael Brown" },
  "resolutionSummary": null, "resolvedAt": null, "requesterResolvedAt": null }
```
`owner` is `null` when unassigned. No note content or count is ever included.

### GET /tickets/:id/comments
- **200** `[ { "id": 5, "body": "…", "createdAt": "…", "author": { "id": 9, "name": "Michael Brown", "role": "IT_STAFF" } } ]` oldest first

### POST /tickets/:id/comments
Request `{ "body": "Thanks, still happening." }`
- **201** the created comment (same shape)
- **400** `errors.body` for empty, whitespace-only or over 2000 characters
- **404** not owned · **409** `TICKET_CLOSED` for CLOSED or CANCELLED

### POST /tickets/:id/resolved-indication
No body.
- **200** `{ "requesterResolvedAt": "…" }` — idempotent, timestamp unchanged on repeat
- **404** not owned · **409** `INVALID_STATE` unless status is OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER or REOPENED

## 5. IT Staff endpoints (role `IT_STAFF`; Requester → 403)

### GET /staff/tickets — queue (roles `IT_STAFF`, `ADMIN` read-only)
Query parameters (all optional):

| Parameter | Values | Default |
|---|---|---|
| `search` | text matched against Ticket Number, Summary, Requester name | — |
| `status` | `ACTIVE`, `ALL`, or one status | `ACTIVE` (everything except CLOSED and CANCELLED) |
| `priority` | `LOW`, `MEDIUM`, `HIGH` (IT Priority) | any |
| `categoryId` | integer | any |
| `owner` | `ANY`, `ME`, `UNASSIGNED`, or a user id | `ANY` |
| `requesterResolved` | `true` restricts to Tickets the Requester has indicated resolved; any other value is ignored | — |
| `sortBy` | `itPriority`, `createdAt`, `updatedAt`, `ticketNumber`, `currentStatus` | `itPriority` desc, then `createdAt` asc |
| `sortDir` | `asc`, `desc` | `desc` for the default sort |
| `page`, `pageSize` | integers; `pageSize` max 50 | 1, 10 |

A `page` or `pageSize` that is not a positive integer, a `pageSize` above 50, or an unsupported `sortBy`/`sortDir`/filter value falls back to the default (never an error). For an Administrator `owner=ME` returns no rows.

- **200**
```json
{ "data": [ { "id": 41, "ticketNumber": "TKT-2026-000041", "createdAt": "…", "updatedAt": "…",
    "summary": "Laptop battery drains quickly", "category": "Hardware",
    "requester": { "id": 2, "name": "Bob Smith" },
    "requestedPriority": "MEDIUM", "itPriority": "HIGH", "currentStatus": "OPEN",
    "owner": { "id": 7, "name": "Michael Brown", "isActiveStaff": true },
    "requesterResolvedAt": null } ],
  "pagination": { "page": 1, "pageSize": 10, "totalCount": 31, "totalPages": 4 },
  "counts": { "unassigned": 8, "assignedToMe": 5, "requesterResolved": 2 } }
```
`owner` is `null` when unassigned. `counts` cover active Tickets and ignore the current filters.

### GET /staff/tickets/:id — roles `IT_STAFF`, `ADMIN` (read-only)
- **200** Ticket facts, `requester { id, name, email }`, `owner`, `requestedPriority`, `itPriority`, `currentStatus`, `resolutionSummary`, `resolvedAt`, `closedAt`, `requesterResolvedAt`, `attachments` (active plus removed metadata, as in Lab 2), `allowedTransitions` (array of statuses; always `[]` for an Administrator), and `counts { publicComments, internalNotes }`
- **404** unknown id

### POST /staff/tickets/:id/claim
No body. **200** `{ "owner": {…}, "currentStatus": "OPEN" }` (a NEW Ticket becomes OPEN in the same transaction) · **409** `TICKET_CLOSED`, `ALREADY_OWNED`. Atomic: with simultaneous claims exactly one succeeds.

### PATCH /staff/tickets/:id/owner
Assigns or reassigns; also allowed on an unassigned Ticket and never changes the status.
Request `{ "ownerId": 8 }`
- **200** `{ "owner": {…} }`
- **400** `errors.ownerId` when the target is missing, inactive, or not IT Staff
- **409** `NO_CHANGE`, `TICKET_CLOSED`

### PATCH /staff/tickets/:id/it-priority
Request `{ "itPriority": "HIGH" }`
- **200** `{ "itPriority": "HIGH" }` · **400** invalid value · **409** `NO_CHANGE`, `TICKET_CLOSED`

### PATCH /staff/tickets/:id/status
Request `{ "status": "RESOLVED", "resolutionSummary": "Replaced battery.", "confirm": true }`
- `resolutionSummary` (10–1000 characters) is required for `RESOLVED`.
- `confirm: true` is required for `CLOSED` and `CANCELLED`.
- **200** `{ "currentStatus": "RESOLVED", "resolvedAt": "…", "allowedTransitions": ["CLOSED", "REOPENED"] }`
- **400** `errors.resolutionSummary` or `errors.confirm`
- **409** `INVALID_TRANSITION` (body includes `allowed`), `TICKET_UNASSIGNED`, `NO_CHANGE`

Side effects: RESOLVED sets `resolvedAt` and clears the Requester indicator; CLOSED sets `closedAt`; CANCELLED leaves `closedAt` null; REOPENED clears `resolvedAt`, `closedAt` and the indicator. A request for the current status returns 409 `NO_CHANGE`. Any status change from CANCELLED returns 409 `INVALID_TRANSITION`; CLOSED may only go to REOPENED.

### GET /staff/tickets/:id/comments — roles `IT_STAFF`, `ADMIN` (read-only for Admin)
**200** same list shape as the Requester endpoint.

### POST /staff/tickets/:id/comments — role `IT_STAFF`
Request `{ "body": "…" }` · **201** created comment · **400** `errors.body` · **409** `TICKET_CLOSED`

### GET /staff/tickets/:id/notes — roles `IT_STAFF`, `ADMIN` (read-only for Admin)
**200** same shape as comments. **403** for Requesters, with no note data.

### POST /staff/tickets/:id/notes — role `IT_STAFF`
Request `{ "body": "…" }` · **201** created note · **400** `errors.body` · **409** `TICKET_CLOSED`

### GET /staff/tickets/:id/attachments/:attachmentId/download — role `IT_STAFF`
**200** file stream · **404** unknown · **410** removed Attachment. There is no staff upload or remove endpoint.

### GET /staff/assignees — role `IT_STAFF`
**200** `[ { "id": 7, "name": "Michael Brown" } ]` — active IT Staff only, for the reassign dropdown.

## 6. Administrator endpoints (role `ADMIN`; everyone else → 403)

### GET /admin/users
Query `search` (name or email, case-insensitive substring) and `role` (`REQUESTER`, `IT_STAFF`, `ADMIN`). No pagination.
- **200** `{ "data": [ { "id": 2, "name": "Bob Smith", "email": "bob@example.com", "role": "REQUESTER", "isActive": true, "mustChangePassword": false, "createdAt": "…" } ] }` sorted by name then id

### POST /admin/users
Request `{ "name": "New Person", "email": "new@example.com", "role": "IT_STAFF", "isActive": true, "initialPassword": "Welcome#2026" }`
- **201** the user (no password data); `mustChangePassword` is true
- **400** `errors.name`, `errors.email`, `errors.role`, `errors.initialPassword`
- **409** `EMAIL_TAKEN` with `errors.email`

### PATCH /admin/users/:id
Request any of `{ "name", "email", "role", "isActive" }`
- **200** the updated user; deactivating deletes that user's sessions
- **400** validation · **404** unknown id
- **409** `EMAIL_TAKEN`, `SELF_DEACTIVATION`, `LAST_ADMIN` (the last-Administrator check is atomic under concurrent requests)

Only `name`, `email`, `role` and `isActive` are accepted; `passwordHash`, `mustChangePassword`, `id` and other fields are ignored. Passwords are never edited here — use the initial-password endpoint.
### POST /admin/users/:id/initial-password
Request `{ "initialPassword": "Welcome#2027" }`
- **204**; sets `mustChangePassword = true` and deletes the target's sessions
- **400** `errors.initialPassword` (length, byte-limit, letter and digit rules of BR-09; the differs-from-current and confirmation rules do not apply) · **404** unknown id · **409** `SELF_PASSWORD_RESET`

There is no user deletion endpoint (`DELETE /admin/users/:id` → 404 or 405).

## 7. Removed from Lab 2
- `GET /api/dev-requesters` → **404**
- The `x-requester-id` header and any client-supplied `requesterId` → ignored
