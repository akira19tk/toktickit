# Lab 3 Sprint Engineering Specification — Users, Roles, IT Staff Ticketing, and Admin

This document extends `docs/lab-02/specification.md`. Anything not changed here keeps its Lab 2 behavior.

## 1. Sprint Goal

Replace the temporary Development Requester selector with real authentication and role-based authorization, so that Requesters, IT Staff and Administrators each use only the screens and API operations their role permits. IT Staff get a shared Ticket Queue and an operational Ticket Detail (ownership, IT Priority, status, Public Comments, Internal Notes). Administrators get a minimal User Management screen. Every Lab 2 Requester function keeps working on the authenticated identity, and no Lab 2 data is lost.

## 2. Stakeholder Request Interpretation

The IT department wants real accounts. A user signs in with email and password; a user holding an initial password must set a new one before doing anything else. The signed-in account — not anything the browser sends — decides what the user can see and do. IT Staff work from one shared queue, take ownership of tickets, talk to the Requester in Public Comments, keep private Internal Notes, and move tickets through a controlled workflow; a Requester may only say the problem *appears* resolved, and IT Staff formally resolve or close. Administrators manage accounts only. Hiding a button is never the security control: the backend enforces every rule.

## 3. Scope

### Included
- Login, logout, current-user retrieval, password change, mandatory first-login password change
- Server-side sessions, CSRF defense, CORS allow-list, login throttling
- Role-based navigation, route guards, Forbidden and Not Found pages
- Migration of Lab 2 Development Requesters to the `User` model without data loss
- Requester regression on authenticated identity; Public Comments; "Problem Appears Resolved"
- IT Staff Ticket Queue; Staff Ticket Detail; claim, reassign, IT Priority, status workflow; Public Comments; Internal Notes; Attachment download
- Minimal Administrator User Management
- Idempotent seed, tests (unit, API, UI, style, responsive, security, migration, E2E), documentation

### Excluded
- Email invitations, password-reset email, MFA, social login, SSO, self-registration
- Actions Taken, SLA, escalation, notifications, dashboards and KPI analytics beyond simple queue counts
- Multiple roles per user, user deletion, bulk operations, import/export, audit history, departments, profile photos
- Editing or deleting Comments and Notes (append-only)
- Staff uploading or removing Attachments; Requester-initiated cancel or reopen
- Cloud deployment or CI/CD

## 4. Functional Requirements

**Authentication**
- **FR-01** A user can log in with email and password; success establishes an authenticated session and returns the user's identity and role.
- **FR-02** A user can log out; logout invalidates the session on the server.
- **FR-03** The client can retrieve the current authenticated user.
- **FR-04** A user flagged `mustChangePassword` can use only logout, current-user retrieval and password change until a new valid password is saved.
- **FR-05** Any authenticated user can change their own password by supplying the current password.

**Authorization and shell**
- **FR-06** The application shell shows the user's name and role, role-specific navigation only, and Logout; unauthorized routes show Forbidden, unauthenticated routes go to Login.
- **FR-07** Every protected endpoint enforces role and ownership on the backend according to the authorization matrix (section 5).

**Requester**
- **FR-08** All Lab 2 Requester functions (create Ticket, My Tickets, Ticket Detail, Attachments) work for the authenticated Requester; the Development Requester selector is removed.
- **FR-09** A Requester can read and post Public Comments on their own Tickets.
- **FR-10** A Requester can indicate "Problem Appears Resolved" on their own Ticket.
- **FR-11** Requester Ticket Detail shows status, IT Priority, Ticket Owner name and Resolution Summary, and never any Internal Note data.

**IT Staff**
- **FR-12** IT Staff can view a Ticket Queue with search, filters, sorting, pagination, ownership and status information, and queue counts.
- **FR-13** IT Staff can open a Ticket in an operational detail view including Attachments.
- **FR-14** IT Staff can claim an unassigned Ticket.
- **FR-15** IT Staff can reassign a Ticket to an active IT Staff user.
- **FR-16** IT Staff can change IT Priority.
- **FR-17** IT Staff can change Ticket status following the transition matrix, with the required confirmations and resolution summary.
- **FR-18** IT Staff can read and post Public Comments.
- **FR-19** IT Staff can read and post Internal Notes; Administrators can read them; Requesters cannot access them.
- **FR-20** IT Staff can download active Attachments.

**Administrator**
- **FR-21** An Administrator can list users, search by name or email, and optionally filter by role.
- **FR-22** An Administrator can create a user with name, email, one role, activation state and initial password.
- **FR-23** An Administrator can edit a user's name, email, role and activation state.
- **FR-24** An Administrator can set a new initial password that must be changed at next login.
- **FR-25** The system prevents an Administrator from deactivating their own account and prevents loss of the last active Administrator.

**Cross-cutting**
- **FR-26** The Lab 2 database is migrated to the Lab 3 model without losing Tickets, Attachments, Categories or Related Systems, and without changing Ticket ownership.
- **FR-27** An idempotent seed provides the accounts, Tickets, Comments and Notes required for testing.
- **FR-28** Screens give clear loading, saving, success, validation, empty, no-results, forbidden, not-found, conflict and safe-failure feedback.
- **FR-29** All new screens are responsive and accessible and follow the Zen Green design language.

## 5. Business Rules

### 5.1 Authentication and credentials
- **BR-01** Only an active user with valid credentials may authenticate.
- **BR-02** A user marked as requiring a password change cannot enter the normal application until a new valid password is saved.
- **BR-03** The authenticated user identity, not a `requesterId` supplied by the client, determines ownership of Requester operations.
- **BR-04** Public Comments are visible to the Requester, IT Staff and Administrator. Internal Notes are visible only to IT Staff and Administrator.
- **BR-05** A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed.
- **BR-06** Email addresses are trimmed, lowercased, validated (max 254 characters) and unique case-insensitively.
- **BR-07** Login failures are generic: an unknown email and a wrong password return the same 401 message. An inactive account is disclosed (403 `ACCOUNT_INACTIVE`) only when the correct password was supplied.
- **BR-08** After 5 consecutive failed logins for the same normalized email within 15 minutes, further attempts return 429 until the window ends; a successful login resets the counter. The counter is in memory and resets on server restart (documented limitation).
- **BR-09** A password is 8–72 characters, contains at least one letter and one digit, differs from the current password, and must match its confirmation.
- **BR-10** Passwords are hashed with bcrypt (cost 10 or higher). Plaintext passwords and hashes are never stored in plaintext, logged, or returned by any API.
- **BR-11** A session token is 256 bits of random data; only its SHA-256 hash is stored. The cookie `tt_session` is HttpOnly, SameSite=Lax, Path=/, and Secure in production. Sessions expire after 8 hours.
- **BR-12** Logout deletes the session row and clears the cookie. It is idempotent and returns 204 even without a session.
- **BR-13** Role and `isActive` are read from the database on every authenticated request, so changes apply immediately. Deactivating a user or setting an initial password deletes all of that user's sessions.
- **BR-14** Every POST, PATCH, PUT and DELETE request (including login) must carry `X-Requested-With: TokTickIT`; otherwise 403 `CSRF_REJECTED`. This is defense in depth on top of SameSite=Lax.
- **BR-15** CORS allows only the origin in `CLIENT_ORIGIN` (default `http://localhost:5173`) with credentials. The Lab 2 wildcard origin is removed.
- **BR-16** Changing a password always requires the correct current password, including the first-login change.
- **BR-17** A successful password change clears `mustChangePassword`, records `passwordChangedAt`, deletes the user's other sessions and keeps the current one.
- **BR-18** While `mustChangePassword` is true, every protected endpoint except `GET /api/auth/me`, `POST /api/auth/logout` and `POST /api/auth/change-password` returns 403 `PASSWORD_CHANGE_REQUIRED`.

### 5.2 Roles, authorization and errors
- **BR-19** Each user has exactly one role: `REQUESTER`, `IT_STAFF` or `ADMIN`.
- **BR-20** Only `GET /api/health`, `POST /api/auth/login` and `POST /api/auth/logout` are public. Everything else returns 401 without a valid session, including `GET /api/categories` and `GET /api/related-systems`.
- **BR-21** Requester endpoints (`/api/tickets*`) are `REQUESTER`-only. A Requester may touch only Tickets where `requesterId` equals the session user; any other Ticket or Attachment returns 404. IT Staff and Administrators calling them receive 403.
- **BR-22** Staff endpoints (`/api/staff/*`) are `IT_STAFF`-only, except that the read-only `GET /api/staff/tickets/:id/comments` and `GET /api/staff/tickets/:id/notes` also allow `ADMIN`. Requesters receive 403.
- **BR-23** Administrator endpoints (`/api/admin/*`) are `ADMIN`-only.
- **BR-24** Checks run in this order so nothing leaks: authentication (401) → password-change gate (403) → CSRF header (403) → role (403) → resource lookup and ownership (404) → input validation (400) → state conflicts (409). Errors never reveal whether another user's Ticket, Attachment or Note exists.

### 5.3 Ownership, priority and status
- **BR-25** A new Ticket starts in status NEW, has no owner, and its IT Priority equals its Requested Priority (Lab 2 BR-02 is preserved).
- **BR-26** A Ticket has zero or one primary Ticket Owner, who must be an active `IT_STAFF` user at the moment of assignment.
- **BR-27** IT Staff may claim only an unassigned Ticket. Claiming sets the owner to the caller and, if the status is NEW, sets it to OPEN in the same transaction. Claiming an owned Ticket returns 409 `ALREADY_OWNED`.
- **BR-28** Any IT Staff user may reassign a Ticket to any active IT Staff user, including themselves. Assigning to the current owner returns 409 `NO_CHANGE`.
- **BR-29** Ownership is validated only when assigned. A Ticket whose owner is later deactivated or changes role keeps that owner, is shown with a "no longer active IT Staff" marker, and can be reassigned.
- **BR-30** On CLOSED or CANCELLED Tickets, owner and IT Priority changes return 409 `TICKET_CLOSED`.
- **BR-31** Requested Priority never changes after creation. Only IT Staff may change IT Priority (`LOW`, `MEDIUM`, `HIGH`); setting the same value returns 409 `NO_CHANGE`.
- **BR-32** Statuses are NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED and CANCELLED.
- **BR-33** Status changes are accepted only along the transition matrix below; anything else returns 409 `INVALID_TRANSITION` with the allowed targets.
- **BR-34** Only IT Staff may change status.
- **BR-35** Moving to RESOLVED requires `resolutionSummary` of 10–1000 characters (trimmed). It sets `resolvedAt`, stores the summary, and clears the Requester-resolved indicator.
- **BR-36** Moving to CLOSED or CANCELLED requires `confirm: true`. CLOSED is reachable only from RESOLVED.
- **BR-37** REOPENED is reachable from RESOLVED and CLOSED. It clears `resolvedAt`, `closedAt` and the indicator; the previous resolution summary is kept until replaced.
- **BR-38** A status change on an unassigned Ticket returns 409 `TICKET_UNASSIGNED`; the Ticket must be claimed first. IT Priority may be changed while unassigned.
- **BR-39** There are no automatic status changes other than the claim rule in BR-27. The Lab 4 rule that blocks resolution while Actions Taken are incomplete is deferred.
- **BR-40** "Problem Appears Resolved" is allowed to the Ticket's Requester when the status is OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER or REOPENED. It sets `requesterResolvedAt` and does not change the status; repeating it is a 200 no-op. In any other status it returns 409 `INVALID_STATE`.
- **BR-41** The indicator is cleared when the status becomes RESOLVED or REOPENED.

**Status transition matrix** (IT Staff only)

| From | Allowed targets |
|---|---|
| NEW | OPEN, IN_PROGRESS, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| IN_PROGRESS | OPEN, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | OPEN, IN_PROGRESS, RESOLVED, CANCELLED |
| RESOLVED | CLOSED, REOPENED |
| CLOSED | REOPENED |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| CANCELLED | (none) |

### 5.4 Comments, notes and attachments
- **BR-42** Comment and note bodies are trimmed, 1–2000 characters, stored as plain text and rendered as text (never as HTML). Empty or whitespace-only bodies return 400. Entries are append-only; there is no edit or delete.
- **BR-43** Internal Notes may be created only by IT Staff and read by IT Staff and Administrators. Every Internal Note endpoint returns 403 to Requesters, and no Requester-facing payload contains note content or a note count.
- **BR-44** Public Comments and Internal Notes cannot be added to CLOSED or CANCELLED Tickets (409 `TICKET_CLOSED`).
- **BR-45** Author comes from the session and `createdAt` from the backend. Lists are chronological (oldest first) and show author name and role.
- **BR-46** A Requester may read and post Public Comments only on their own Tickets; otherwise 404.
- **BR-47** Lab 2 Attachment rules are unchanged. Only the owning Requester may add or soft-remove Attachments; IT Staff may view metadata and download active files (removed files return 410).

### 5.5 User administration
- **BR-48** Creating a user requires name (1–100 characters), a valid unique email, one valid role, an activation state, and an initial password that meets BR-09. The new user has `mustChangePassword = true`.
- **BR-49** A duplicate email (case-insensitive) on create or edit returns 409 `EMAIL_TAKEN` with a field error.
- **BR-50** An invalid role value, empty name or malformed email returns 400 with field errors.
- **BR-51** An Administrator cannot deactivate their own account (409 `SELF_DEACTIVATION`).
- **BR-52** The system must always keep at least one active Administrator: deactivating or changing the role of the last one returns 409 `LAST_ADMIN`.
- **BR-53** Users are never deleted; deactivation is used instead.
- **BR-54** Setting an initial password is Administrator-only, applies to another user only (own account → 409 `SELF_PASSWORD_RESET`), sets `mustChangePassword = true`, deletes the target's sessions, and never returns or logs the password.
- **BR-55** The user list returns all users (no pagination) sorted by name then id, supports case-insensitive substring search on name or email and an exact role filter, and never includes password data.

### 5.6 Queue
- **BR-56** The staff queue searches Ticket Number, Summary and Requester name (case-insensitive substring), sorts by `createdAt`, `updatedAt`, `ticketNumber`, `itPriority` or `currentStatus`, defaults to IT Priority descending then `createdAt` ascending, page size default 10 (max 50), and falls back to defaults for invalid parameters.
- **BR-57** By default the queue shows active Tickets (everything except CLOSED and CANCELLED); `status=ALL` shows everything. Filters are status, IT Priority, category and owner (`ANY`, `ME`, `UNASSIGNED` or a user id) and combine with AND. The response includes counts of unassigned, assigned-to-me and Requester-indicated-resolved active Tickets.

### 5.7 Migration, seed and client behavior
- **BR-58** The migration keeps every Ticket, Attachment, Category and Related System row and every `requesterId` value; ids of migrated users equal the old Development Requester ids.
- **BR-59** Migrated Requesters have no password until the seed (or an Administrator) assigns one. The seed assigns the documented initial password to every user whose hash is NULL and sets `mustChangePassword = true`. A user without a hash cannot log in.
- **BR-60** Existing Tickets are backfilled with `itPriority = requestedPriority` and no owner.
- **BR-61** The Development Requester selector, Change Requester action, `GET /api/dev-requesters`, `x-requester-id` handling and the client's stored requester key are removed; the client deletes any leftover requester key at startup.
- **BR-62** The seed is idempotent (upsert by email and by reserved Ticket Number). It never overwrites an existing password hash or `mustChangePassword`.
- **BR-63** Seeded credentials are for local development only, are documented in the README, and no real secret is committed.
- **BR-64** Validation failures return 400 with an `errors` object keyed by field name and safe messages.
- **BR-65** After login the client goes to `/change-password` if required, otherwise to the role's home (`/my-tickets`, `/staff/queue` or `/admin/users`). Unauthenticated access goes to `/login`; wrong-role access shows `/forbidden`. No return-URL parameter is used.
- **BR-66** Any 401 received while the app is running clears client auth state and returns to Login with the message "Your session has ended. Please sign in again."

### 5.8 Authorization matrix

Legend: ✓ allowed · 401 unauthenticated · 403 forbidden · 404 not found / not owned · R read-only

| Operation | No session | Requester | IT Staff | Admin |
|---|---|---|---|---|
| Login, logout | ✓ | ✓ | ✓ | ✓ |
| Current user, change own password | 401 | ✓ | ✓ | ✓ |
| Categories, related systems | 401 | ✓ | ✓ | ✓ |
| Create / list own Tickets, own detail | 401 | ✓ (own, else 404) | 403 | 403 |
| Add / download / remove own Attachment | 401 | ✓ (own, else 404) | 403 | 403 |
| Requester Public Comments, Problem Appears Resolved | 401 | ✓ (own, else 404) | 403 | 403 |
| Staff queue, staff Ticket Detail, assignees | 401 | 403 | ✓ | 403 |
| Claim, reassign, IT Priority, status | 401 | 403 | ✓ | 403 |
| Staff Public Comments (read) | 401 | 403 | ✓ | R |
| Staff Public Comments (post) | 401 | 403 | ✓ | 403 |
| Internal Notes (read) | 401 | 403 | ✓ | R |
| Internal Notes (post) | 401 | 403 | ✓ | 403 |
| Staff Attachment download | 401 | 403 | ✓ | 403 |
| User list, create, edit, set initial password | 401 | 403 | 403 | ✓ |

## 6. UI Specification Summary

Full detail is in `ui-spec.md`. Routes: `/login`, `/change-password`, `/my-tickets`, `/tickets/new`, `/tickets/:id`, `/staff/queue`, `/staff/tickets/:id`, `/admin/users`, `/forbidden` and a Not Found fallback (adds `react-router-dom`; see section 11).

- **Shell:** user name, role badge, role-specific navigation, Change Password and Logout.
- **Login / Change Password:** validated forms with busy state and safe failure messages.
- **Requester screens:** Lab 2 screens on the authenticated identity; Ticket Detail adds status/IT Priority/Owner, Resolution Summary, Public Comments and Problem Appears Resolved.
- **Staff Queue:** table on desktop, cards on mobile, search, filters, sort, pagination, counts.
- **Staff Ticket Detail:** grouped read-only facts plus editable Owner, IT Priority and Status controls, with tabs for Public Comments (green, visible to Requester), Internal Notes (amber, private) and Attachments.
- **User Management:** one list screen with create, edit and set-initial-password dialogs.
- **Feedback:** loading, saving, success, validation, empty, no-results, forbidden, not-found, conflict, failure.

## 7. Data Changes

```prisma
enum Role { REQUESTER IT_STAFF ADMIN }
enum TicketStatus { NEW OPEN IN_PROGRESS WAITING_FOR_REQUESTER RESOLVED CLOSED REOPENED CANCELLED }

model User {                       // evolved from DevRequester (same ids)
  id                 Int       @id @default(autoincrement())
  name               String
  email              String    @unique          // stored lowercase
  passwordHash       String?                    // NULL = cannot log in yet
  role               Role      @default(REQUESTER)
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(true)
  passwordChangedAt  DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @default(now()) @updatedAt
  requestedTickets   Ticket[]  @relation("TicketRequester")
  ownedTickets       Ticket[]  @relation("TicketOwner")
  sessions           Session[]
  publicComments     PublicComment[]
  internalNotes      InternalNote[]
  @@index([role, isActive])
}

model Session {
  tokenHash String   @id                         // SHA-256 of the cookie token
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  expiresAt DateTime
  @@index([userId])
  @@index([expiresAt])
}

model Ticket {                     // additions to the Lab 2 model
  ownerId             Int?
  owner               User?     @relation("TicketOwner", fields: [ownerId], references: [id])
  itPriority          Priority                  // NOT NULL after backfill
  requesterResolvedAt DateTime?
  resolutionSummary   String?
  resolvedAt          DateTime?
  closedAt            DateTime?
  publicComments      PublicComment[]
  internalNotes       InternalNote[]
  // currentStatus uses the extended TicketStatus enum
  @@index([ownerId])
  @@index([currentStatus])
  @@index([itPriority])
}

model PublicComment {
  id        Int      @id @default(autoincrement())
  ticketId  Int
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  body      String
  createdAt DateTime @default(now())
  @@index([ticketId, createdAt])
}

model InternalNote {               // identical shape, separate table
  id        Int      @id @default(autoincrement())
  ticketId  Int
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  body      String
  createdAt DateTime @default(now())
  @@index([ticketId, createdAt])
}
```

**Design decisions**
- Separate `PublicComment` and `InternalNote` tables make it structurally impossible to return a note from a comment query.
- Only the token hash is stored in `Session`, so a database leak does not yield usable cookies.
- A single `role` enum column enforces one role per user.

**Migration plan (no data loss)**
1. Before migrating, run a snapshot script that writes row counts and the ticket-id → requesterId map to `server/tests/lab-03/fixtures/lab2-snapshot.json` (used by MIG-01).
2. Run `npx prisma migrate dev --create-only`, then **edit the generated SQL**: replace the generated drop/create of `DevRequester` with `ALTER TABLE "DevRequester" RENAME TO "User"`, rename its primary-key and unique-index names to match Prisma, and add the new columns. This preserves ids and the existing Ticket foreign key.
3. Add `itPriority` as nullable, run `UPDATE "Ticket" SET "itPriority" = "requestedPriority"`, then set it NOT NULL.
4. Extend the `TicketStatus` enum with `ALTER TYPE … ADD VALUE`. Do not use the new values in the same migration.
5. Create `Session`, `PublicComment`, `InternalNote`. Run `prisma migrate dev` once more to confirm there is no drift.
6. Run the seed to assign initial passwords to users with a NULL hash.

**Seed (local development only)**

| Group | Accounts |
|---|---|
| Requesters (active) | alice@example.com, bob@example.com, carol@example.com, david@example.com (migrated from Lab 2; first login requires a password change) |
| Requester (inactive) | the existing inactive Lab 2 requester |
| IT Staff (active) | michael.brown@example.com, sarah.johnson@example.com, david.lee@example.com |
| IT Staff (inactive) | emma.clark@example.com |
| Administrator | admin@example.com (exactly one active Administrator) |

- Initial password for every seeded account: `Welcome#2026` (override with `SEED_INITIAL_PASSWORD`). Staff and Administrator accounts are seeded with `mustChangePassword = false` for convenience; migrated Requesters use `true`.
- About 24 realistic Tickets with reserved numbers `TKT-2026-900001`…`900024`, covering every status and priority, assigned and unassigned, several with a Requester-indicated-resolved marker, plus 6 Public Comments and 6 Internal Notes (no sensitive data). Comments and notes are created only for seeded Tickets that have none yet.
- Tests create their own users (`test-…@example.com`) and clean them up; they never depend on seeded passwords that may have been changed.

## 8. API Contract

Full request and response shapes, error codes and examples are in `api-spec.md`. Summary:

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Reference | `GET /api/categories`, `GET /api/related-systems` (authenticated) |
| Requester | `/api/tickets` (create, list, detail), attachments (Lab 2), `GET/POST /api/tickets/:id/comments`, `POST /api/tickets/:id/resolved-indication` |
| Staff | `GET /api/staff/tickets`, `GET /api/staff/tickets/:id`, `POST …/claim`, `PATCH …/owner`, `PATCH …/it-priority`, `PATCH …/status`, `GET/POST …/comments`, `GET/POST …/notes`, `GET …/attachments/:attachmentId/download`, `GET /api/staff/assignees` |
| Admin | `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/initial-password` |

**Authentication mechanism:** server-side session in PostgreSQL referenced by an HttpOnly, SameSite=Lax cookie; CSRF header on mutating requests; CORS allow-list with credentials. Error body: `{ "error": "message", "code": "MACHINE_CODE", "errors": { "field": "message" } }`.

## 9. Acceptance Criteria

| ID | Maps to | Criterion |
|---|---|---|
| AC-01 | FR-01, BR-01, BR-06, BR-10, BR-11 | Given an active user with valid credentials, when the user logs in, then the backend sets an HttpOnly session cookie and returns only id, name, email, role and mustChangePassword (never a password hash). |
| AC-02 | FR-04, BR-02, BR-18 | Given a user whose mustChangePassword is true, when login succeeds, then every protected endpoint except `GET /api/auth/me`, `POST /api/auth/logout` and `POST /api/auth/change-password` returns 403 `PASSWORD_CHANGE_REQUIRED`, and the UI shows only the Change Password screen until a valid new password is saved. |
| AC-03 | FR-08, BR-03 | Given an authenticated Requester, when the client supplies another `requesterId` (body, query or `x-requester-id` header), then the backend ignores it and returns or writes only data owned by the authenticated user. |
| AC-04 | FR-19, BR-43 | Given a Requester account, when any Internal Note endpoint is requested, then the response is 403 and contains no note content. |
| AC-05 | FR-01, BR-07 | Given an unknown email or a wrong password, when the user logs in, then the response is 401 `INVALID_CREDENTIALS` with the same message for both cases and no session cookie is set. |
| AC-06 | BR-01, BR-07 | Given an inactive account, when the correct password is submitted, then login returns 403 `ACCOUNT_INACTIVE` and creates no session; when a wrong password is submitted the response is still the generic 401. |
| AC-07 | BR-08 | Given five consecutive failed logins for one email within 15 minutes, when a sixth attempt is made (even with the correct password), then the response is 429 `TOO_MANY_ATTEMPTS` and no session is created. |
| AC-08 | BR-06 | Given an email typed with different letter case or surrounding spaces, when the user logs in, then the email is normalized and login succeeds. |
| AC-09 | BR-14 | Given a state-changing request (POST/PATCH/PUT/DELETE) without the `X-Requested-With: TokTickIT` header, when it is sent, then the response is 403 `CSRF_REJECTED` and nothing changes. |
| AC-10 | FR-02, BR-12 | Given a logged-in user, when the user logs out, then the session is invalid on the server: a later `GET /api/auth/me` with the old cookie returns 401 and the cookie is cleared. |
| AC-11 | FR-03 | Given a valid session, when `GET /api/auth/me` is called, then it returns the current identity and role; with no session it returns 401. |
| AC-12 | BR-11 | Given a session older than its 8-hour expiry, when any protected request is made, then the response is 401. |
| AC-13 | BR-10 | Given any API response, when it is inspected, then it never contains a password or password hash, and the stored hash in the database is a bcrypt hash, not plaintext. |
| AC-14 | BR-15 | Given a request from the allowed client origin, when it is made with credentials, then CORS allows that exact origin with credentials; a request from any other origin receives no allow-origin header. |
| AC-15 | FR-05, BR-09 | Given a new password that is shorter than 8 characters, lacks a letter or a digit, equals the current password, or does not match the confirmation, when the change is submitted, then 400 field errors are returned and the password is unchanged. |
| AC-16 | BR-16 | Given a wrong current password, when a password change is submitted, then 400 is returned with an error on `currentPassword` and the password is unchanged. |
| AC-17 | FR-05, BR-17 | Given a valid password change, when it is saved, then mustChangePassword becomes false, the new password works and the old one fails, the user's other sessions are revoked, the current session stays valid, and the UI continues to the role's home screen. |
| AC-18 | BR-20 | Given no session, when any protected endpoint is called, then the response is 401. |
| AC-19 | FR-07, BR-22 | Given a Requester, when any `/api/staff/*` or `/api/admin/*` endpoint is called, then the response is 403 and reveals nothing about the resource. |
| AC-20 | FR-07, BR-21 | Given an IT Staff or Administrator user, when a Requester endpoint (`/api/tickets*`) is called, then the response is 403. |
| AC-21 | FR-07, BR-23 | Given a Requester or IT Staff user, when any `/api/admin/*` endpoint is called, then the response is 403 and no user data is returned. |
| AC-22 | FR-08, BR-21, BR-24 | Given Requester B, when a Ticket or Attachment owned by Requester A is requested, then the response is 404 (Lab 2 ownership protection preserved). |
| AC-23 | BR-13 | Given a user who is deactivated while logged in, when the user's next request arrives, then the response is 401 and the user's sessions no longer exist. |
| AC-24 | BR-61 | Given the Lab 3 backend, when `GET /api/dev-requesters` is requested, then the response is 404, and an `x-requester-id` header has no effect on any endpoint. |
| AC-25 | FR-08, BR-25 | Given an authenticated Requester, when a valid Ticket is created, then it is saved with requesterId equal to the session user's id, status NEW, no owner, and itPriority equal to requestedPriority. |
| AC-26 | FR-08 | Given an authenticated Requester, when My Tickets is opened, then only owned Tickets are listed and Lab 2 search, filter, sort and pagination behave as before. |
| AC-27 | FR-08, BR-47 | Given an owned Ticket, when the Requester adds, downloads and soft-removes an Attachment, then Lab 2 behavior is unchanged; the same actions on a non-owned Ticket are rejected. |
| AC-28 | FR-06, BR-61 | Given any Lab 3 screen, when it is rendered, then no Development Requester selector or Change Requester action exists, and the shell shows the user's name, a role badge and Logout. |
| AC-29 | FR-09, BR-42, BR-45 | Given an owned Ticket, when a Requester posts a Public Comment, then it is saved with the authenticated author and a backend timestamp and appears in chronological order. |
| AC-30 | BR-42 | Given an empty, whitespace-only or over-2000-character comment or note, when it is submitted, then 400 is returned with a field error; input such as `<script>` is stored as plain text and rendered as text. |
| AC-31 | BR-46 | Given a Ticket owned by another Requester, when comments are read or posted, then the response is 404. |
| AC-32 | FR-10, BR-40 | Given an owned Ticket in OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER or REOPENED, when the Requester selects Problem Appears Resolved, then requesterResolvedAt is set and the status is unchanged; repeating the action is idempotent. |
| AC-33 | BR-05, BR-34 | Given a Requester, when any request tries to change a Ticket status (including to RESOLVED or CLOSED), then it is rejected with 403 and the status is unchanged. |
| AC-34 | BR-40 | Given a Ticket in NEW, RESOLVED, CLOSED or CANCELLED, when the Requester selects Problem Appears Resolved, then the response is 409 `INVALID_STATE`. |
| AC-35 | BR-44 | Given a Ticket in CLOSED or CANCELLED, when a Public Comment or Internal Note is posted, then the response is 409 `TICKET_CLOSED`. |
| AC-36 | FR-12, BR-56, BR-57 | Given IT Staff opens the Ticket Queue, when no parameters are given, then active tickets are returned sorted by IT Priority (high first) then oldest first, with pagination metadata and queue counts. |
| AC-37 | FR-12, BR-56 | Given queue data, when `search` is supplied, then tickets matching Ticket Number, Summary or Requester name (case-insensitive substring) are returned. |
| AC-38 | FR-12, BR-57 | Given queue data, when status, priority, category and owner filters are combined, then they apply with AND logic; `status=ALL` includes CLOSED and CANCELLED; `owner=ME` and `owner=UNASSIGNED` work. |
| AC-39 | FR-12, BR-56 | Given queue data, when a supported sort field and direction are supplied the order changes accordingly; invalid sort, page or pageSize values fall back to defaults with a 200. |
| AC-40 | FR-28 | Given the Ticket Queue screen, when there are no tickets, no matches, a server failure, or the user is not IT Staff, then distinct Empty, No-Results, safe Failure and Forbidden states are shown. |
| AC-41 | FR-12, BR-57 | Given queue rows, when they are displayed, then each shows owner name or Unassigned, status and IT Priority badges, a Requester-indicated-resolved marker where applicable, and an action that opens Ticket Detail. |
| AC-42 | FR-14, BR-27, BR-39 | Given an unassigned NEW Ticket, when IT Staff claims it, then the owner becomes that user and the status becomes OPEN in the same transaction. |
| AC-43 | BR-27 | Given a Ticket that already has an owner, when another claim is made, then the response is 409 `ALREADY_OWNED` and nothing changes. |
| AC-44 | FR-15, BR-26, BR-28 | Given a Ticket, when IT Staff reassigns it to an active IT Staff user, then the owner changes; reassigning to an inactive, non-staff or non-existent user returns 400. |
| AC-45 | FR-16, BR-31 | Given a Ticket, when IT Staff changes IT Priority, then it is saved and Requested Priority is unchanged; an invalid value returns 400 and a Requester attempt returns 403. |
| AC-46 | FR-17, BR-32, BR-33, BR-34 | Given a Ticket and a target status, when IT Staff changes status, then transitions allowed by the matrix succeed and all others return 409 `INVALID_TRANSITION`. |
| AC-47 | BR-35 | Given a transition to RESOLVED, when no 10–1000 character resolution summary is provided then 400 is returned; with a summary the Ticket is resolved, resolvedAt is set and the Requester can read the summary. |
| AC-48 | BR-36 | Given a transition to CLOSED or CANCELLED, when `confirm: true` is missing then 400 is returned; CLOSED is accepted only from RESOLVED. |
| AC-49 | BR-37, BR-41 | Given a RESOLVED or CLOSED Ticket, when IT Staff reopens it, then the status becomes REOPENED and resolvedAt, closedAt and the Requester-resolved indicator are cleared. |
| AC-50 | BR-38 | Given an unassigned Ticket, when IT Staff attempts a status change, then the response is 409 `TICKET_UNASSIGNED`. |
| AC-51 | BR-30 | Given a CLOSED or CANCELLED Ticket, when owner or IT Priority changes are attempted, then 409 `TICKET_CLOSED` is returned; a CANCELLED Ticket accepts no status transitions. |
| AC-52 | FR-18, FR-19, BR-42, BR-45 | Given a Ticket, when IT Staff posts a Public Comment and an Internal Note, then each is stored with author and backend timestamp and appears only in its own list. |
| AC-53 | FR-11, BR-04, BR-43 | Given a Requester, when Ticket Detail or comments are fetched, then no Internal Note content or note count appears anywhere in the payload. |
| AC-54 | BR-22, BR-43 | Given an Administrator, when comments and notes are read the response is 200 (read-only); when an Administrator tries to post a comment or note, claim, or change status, owner or priority the response is 403. |
| AC-55 | FR-13, FR-20, BR-47 | Given a Ticket with attachments, when IT Staff downloads an active Attachment the file is returned; a removed Attachment returns 410; IT Staff cannot upload or remove attachments. |
| AC-56 | FR-18, FR-19, BR-04 | Given Staff Ticket Detail, when it is rendered, then Public Comments and Internal Notes are in separate, visibly different panels with different labels, helper text and button wording. |
| AC-57 | FR-28 | Given Staff Ticket Detail actions, when saving, a conflict, not-found, forbidden or server failure occurs, then the matching message is shown, the control shows a busy state while saving, and typed input is kept. |
| AC-58 | FR-21, BR-55 | Given an Administrator, when User Management is opened, then users are listed with Name, Email, Role, Status and an Edit action, can be searched by name or email and filtered by role, and no password data is returned. |
| AC-59 | FR-22, BR-48 | Given valid input, when an Administrator creates a user, then the user is created with mustChangePassword true and, on first login, is forced to change the password. |
| AC-60 | BR-49 | Given an email that already exists in any letter case, when a user is created or edited with it, then the response is 409 `EMAIL_TAKEN` with a field error. |
| AC-61 | BR-19, BR-48, BR-50, BR-64 | Given an empty name, an invalid email, an invalid role or a weak initial password, when a user is created or edited, then 400 field errors are returned and nothing is saved. |
| AC-62 | FR-23 | Given an existing user, when an Administrator edits name, email, role and activation state, then the changes are saved and the list reflects them. |
| AC-63 | FR-25, BR-51 | Given an Administrator, when the Administrator deactivates their own account, then the response is 409 `SELF_DEACTIVATION` and the account stays active. |
| AC-64 | FR-25, BR-52 | Given the only active Administrator, when that account is deactivated or its role is changed, then the response is 409 `LAST_ADMIN`; the same action succeeds when another active Administrator exists. |
| AC-65 | FR-24, BR-54 | Given another user, when an Administrator sets a new initial password, then the user's sessions are revoked, the old password fails, the new one works and forces a password change; doing it to oneself returns 409 `SELF_PASSWORD_RESET`. |
| AC-66 | BR-53 | Given the Administrator API, when a user deletion is attempted, then no delete route exists (404 or 405). |
| AC-67 | FR-28 | Given the User Management screen, when validation, success, forbidden or server-failure conditions occur, then clear feedback is shown; a non-Administrator sees the Forbidden page. |
| AC-68 | FR-26, BR-58 | Given the Lab 2 database, when the Lab 3 migration has run, then every Lab 2 Ticket and Attachment still exists with the same requesterId and the row counts equal the pre-migration snapshot. |
| AC-69 | FR-26, BR-59 | Given migrated Lab 2 requesters, when the migration finishes they have no password and cannot log in; after the seed runs they have the documented initial password with mustChangePassword true. |
| AC-70 | FR-26, BR-60 | Given existing Tickets, when the migration finishes, then each has itPriority equal to its requestedPriority and no owner. |
| AC-71 | FR-27, BR-62, BR-63 | Given the seed, when it is run twice, then counts are unchanged, no email or Ticket Number is duplicated and changed passwords are not reset; the required accounts, tickets, comments and notes exist. |
| AC-72 | FR-06, BR-65 | Given any user, when navigating, then login redirects to the role's home, only role-permitted navigation is shown, a wrong-role URL shows the Forbidden page, and an unauthenticated URL redirects to Login. |
| AC-73 | BR-66 | Given an expired or revoked session, when any API call returns 401 the app returns to Login with a session-ended message; after logout, the Back button or a direct URL exposes no protected data. |
| AC-74 | FR-29 | Given desktop, tablet and mobile viewports, when every new screen is rendered, then there is no clipping, overlap or horizontal overflow, tables become cards on mobile, and badge styles are consistent. |
| AC-75 | FR-29 | Given Login, Change Password, dialogs and forms, when used by keyboard, then every control is reachable with a visible focus ring, errors are announced through an aria-live region, and dialogs trap focus and close on Escape. |
| AC-76 | FR-01, FR-28 | Given the Login screen, when it is used, then validation messages appear under their fields, the submit button shows a busy state, a safe failure message appears if the backend is unavailable, and the typed email is retained. |
| AC-77 | FR-05, FR-28 | Given the Change Password screen, when it is used, then password rules are shown, a confirmation mismatch is flagged under the field, and a successful change continues to the role's home screen. |
| AC-78 | BR-29 | Given a Ticket whose owner was later deactivated or changed to another role, when the queue and Ticket Detail are shown, then the owner is kept and marked as no longer active IT Staff, and the Ticket can be reassigned. |

## 10. Definition of Done

**Product completion**
- All FR-01–FR-29 are implemented and all AC-01–AC-78 are satisfied.
- Every Acceptance Criterion maps to at least one automated test in `tests.md`, each test title starts with its Test ID, and every test file path in `tests.md` exists.
- The full suite (unit, API, UI, security/authorization, migration/regression, responsive, E2E) passes from the documented commands on the final `main` branch; no test is skipped, disabled or commented out.
- Every protected endpoint is covered by the authorization matrix test; no protected operation relies on hidden UI.
- Lab 2 data is intact (MIG-01), Lab 2 Requester functions pass their regression tests (API-23–25), and the Development Requester selector and `x-requester-id` handling are gone.
- No password, hash or token appears in any response, log, test output or committed file; `.env` is not committed and `.env.example` documents `CLIENT_ORIGIN`, `SESSION_TTL_HOURS`, `BCRYPT_COST` and `SEED_INITIAL_PASSWORD`.
- Screens match `ui-spec.md` at desktop, tablet and mobile, with the visual checklist completed and screenshots saved under `artifacts/lab-03/screenshots/`.
- README setup, seed credentials (local only), migration steps and test commands are current.

**Course delivery**
- Seven Issues, each on its own feature branch, merged into `lab3-staging` by peer-reviewed Pull Requests; one release Pull Request from `lab3-staging` to `main`.
- `docs/lab-03/` contains specification, tests, ui-spec, api-spec, reviewer and ai-use; the first four exist before the implementation PRs merge.
- Test statuses in `tests.md` are filled in only from real test output.

## 11. Assumptions and Decisions

- **Server-side sessions over JWT:** logout and deactivation must take effect immediately, which is simple with a session table and awkward with stateless tokens.
- **`react-router-dom` is added** for URL routes and route guards. Lab 2 used in-memory screen state, which cannot demonstrate "direct access blocked after logout". It is a routing library, not a replacement for any mandated technology.
- **Administrator is read-only for Tickets:** to satisfy BR-04 an Administrator may read Public Comments and Internal Notes through the API, but cannot write to any Ticket and has no Ticket screens (least privilege, minimal UI).
- **Ticket Owner must be IT Staff:** stricter than the handout's "IT Staff or Administrator", consistent with the Administrator decision above.
- **Not-owned resources return 404, wrong role returns 403:** keeps the Lab 2 rule that existence is never revealed.
- **Staff cannot upload or remove Attachments:** the handout asks for "Attachment continuity" only.
- **No automatic status transitions** besides claim → OPEN, to keep the workflow testable.
- **In-memory login throttle** is acceptable for a local lab; a production system would persist it.
- **Seeded requesters require a first-login password change** (matching section 5.2 of the handout); staff and admin seeds do not, for demo convenience.
- **Role changes do not move existing data:** a user's old requested Tickets and owned Tickets stay attached to them; ownership validity is checked only at assignment time.
