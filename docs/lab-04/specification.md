# Lab 4 — Engineering Specification (TokTickIT)

**Sprint:** Lab 4 — Actions Taken, Role Dashboards, Final Ticket Workflow, Regression & Hardening.
**Source of truth:** this document together with `api-spec.md`, `ui-spec.md`, and `tests.md` in `docs/lab-04/`.
If code and spec disagree, stop and reconcile the spec first. All authorization and workflow rules are
enforced by the backend; hiding a control in the UI is never the security boundary.

This spec *extends* Labs 1–3 and preserves their behavior and data. Where Lab 4 intentionally changes a
Lab 3 rule, it is called out in §11.

---

## 1. Sprint Goal

Deliver the operational core of the service desk: IT Staff (and Administrators) can record and manage
**Actions Taken** on a Ticket — a parent/child work log with its own assignee and completion lifecycle —
while the final **Ticket status workflow** is enforced server-side, including a resolution gate that blocks
closing out work that is still in progress. Requesters, IT Staff, and Administrators each get a concise,
backend-computed **dashboard** that summarizes their world and links into the existing detailed screens.
All Lab 1–3 features continue to work, and the whole application is hardened for final demonstration under
the Zen Green design language.

## 2. Stakeholder Request (in our words)

The desk can take Tickets and talk to Requesters, but there is no reliable record of the *actual work done*.
We are adding an Actions Taken log under each Ticket: each entry captures when the work happened, what was
done, the result, who recorded it (automatic), who is responsible for it (assignee), whether follow-up is
needed (and the note), and a hint about which attached file to look at. The Ticket Owner still coordinates
the Ticket as a whole, but any IT Staff member can record and be assigned an action. A Requester may still
signal that the problem *appears* resolved, but only IT Staff formally move the Ticket, and the system must
not let a Ticket be marked Resolved while actions are still open. We also want small, honest dashboards for
Requesters and IT Staff that summarize real data and link to the detail screens — not a second copy of the
list pages. Finally, polish and harden everything so the full product behaves as one coherent application.

## 3. Scope

### 3.1 Included
- **Actions Taken** CRUD-with-lifecycle on a Ticket: create, edit (while open), **assign** to an IT Staff
  member, **complete**, and **cancel**; fields per §7; append-only history (no hard delete).
- **Ticket workflow finalization:** enforce the transition matrix and a **resolution gate** (no Ticket may
  move to `RESOLVED` while any of its Actions is still `OPEN`).
- **Role dashboards:** backend-computed Requester dashboard and IT Staff dashboard, with defined metrics,
  empty states, and drill-down links; Administrator reuses the IT Staff dashboard.
- **Administrator** may create/update Actions Taken and change Ticket status (intentional change from Lab 3,
  see §11).
- **Final regression & hardening:** all Lab 1–3 behavior preserved; consistent loading / empty / forbidden /
  conflict / not-found / safe-failure feedback; duplicate-submit protection; README/seed/migration current.

### 3.2 Explicitly excluded
Carried from the handout §4.2: SLA clocks, escalation engines, on-call scheduling, breach notifications;
email/SMS/LINE/push notifications; inventory, spare parts, purchasing, cost accounting; time-sheet billing,
payroll, labor-cost; multi-level approvals and e-signatures; BI tools, custom report builders, export
warehouses; multi-tenant orgs and production-scale cloud ops; and any feature not approved in this spec.
Also excluded: real file upload *on an Action* (Attachment Notes is free text that references the Ticket's
existing Lab 2 Attachments; it is not a new upload channel), and deleting Actions.

## 4. Functional Requirements

### Actions Taken
- **FR-01** IT Staff and Administrators can create an Action Taken on a Ticket they can access.
- **FR-02** An Action Taken records: action date/time, description, result, performed-by (auto), assignee,
  follow-up-required flag, follow-up note, attachment notes, and a lifecycle status (see §7).
- **FR-03** **Any** active IT Staff/Admin with access to the Ticket (not only the author) can edit an
  Action's editable fields **while it is `OPEN`**; the system records the last editor (`updatedById`) and
  refreshes `updatedAt`. `COMPLETED` and `CANCELLED` Actions are read-only (append-only history; no hard
  delete — "cancel" is `status = CANCELLED`).
- **FR-04** IT Staff/Admin can **assign** an Action to an active staff member (IT_STAFF or ADMIN).
- **FR-05** IT Staff/Admin can **complete** an Action (`OPEN → COMPLETED`) and **cancel** an Action
  (`OPEN → CANCELLED`).
- **FR-06** Requesters can **view** all Actions Taken on their own Tickets, read-only, with all action
  fields; they can never create, edit, or transition an Action.
- **FR-07** A Ticket lists its Actions in a stable, documented order (newest first by `createdAt`).

### Ticket workflow
- **FR-08** IT Staff/Admin can change Ticket status only along the transition matrix (§5), with the required
  confirmations and resolution summary, enforced by the backend even if the client bypasses the UI.
- **FR-09** Moving a Ticket to `RESOLVED` is blocked while any of its Actions is `OPEN` (resolution gate).
- **FR-10** A Requester's "Problem Appears Resolved" indication remains advisory and does not change status
  (unchanged from Lab 3).

### Dashboards
- **FR-11** An authenticated Requester can retrieve a dashboard summarizing **only their own** Tickets:
  open / in-progress / resolved / closed counts, an attention indicator (waiting for requester), recently
  resolved, and recent Tickets, each with a drill-down link.
- **FR-12** An authenticated IT Staff/Admin can retrieve a dashboard summarizing the queue: counts by status
  (New, Open, In Progress, Waiting for Requester), my-assigned (owned by me), unassigned, my open Actions,
  and recent active Tickets, each with a drill-down link.
- **FR-13** Every dashboard metric is computed by the backend from authoritative data and has a defined
  empty behavior; dashboards link to — but do not replace — the existing queue / My Tickets / detail screens.

### Hardening
- **FR-14** All Lab 1–3 screens, navigation, ownership, comments, notes, attachments, user management, and
  authentication remain available and correct for permitted users.
- **FR-15** Write endpoints protect against duplicate submission (repeated click / retry) and surface
  consistent loading / success / empty / forbidden / conflict / not-found / safe-failure feedback.
- **FR-16** Concurrent/stale updates on Ticket status/owner/priority and on Actions are safely detected
  (optimistic concurrency, §5/§8) so one user does not silently overwrite another's recent change.

## 5. Business Rules

> BR-01 and BR-02 are retained verbatim from the handout; the rest are added for Lab 4.

- **BR-01** An Action Taken belongs to exactly one Ticket.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action Taken may be performed/assigned to a
  different IT Staff member.
- **BR-03** `performedBy` is set automatically to the authenticated creator and is immutable once created.
  `updatedBy`/`updatedAt` record the most recent editor and edit time (see BR-20).
- **BR-04** An Action's `assignee`, when set, must be an **active** user with role `IT_STAFF` or `ADMIN`.
  An inactive user, a `REQUESTER`, or an unknown user id is rejected with **`422`**: code `ASSIGNEE_INACTIVE`
  for an inactive staff/admin, and `INVALID_ASSIGNEE` for a non-staff role or unknown id. Assignee is
  optional at create and may be set/changed while `OPEN`.
- **BR-05** `actionDate` is the user-supplied date/time the work occurred; it defaults to the create time,
  must not be in the future, and is editable while `OPEN`. `createdAt`/`updatedAt` are system timestamps.
- **BR-06** `description` is required, trimmed, 1–2000 chars. `result` is optional while `OPEN` but
  **required** (1–2000 chars, trimmed) to move an Action to `COMPLETED`.
- **BR-07** When `followUpRequired` is true, `followUpNote` is required (1–1000 chars, trimmed). When it is
  false, `followUpNote` must be empty/omitted.
- **BR-08** `attachmentNotes` is optional free text (0–500 chars); it is a hint about which existing Ticket
  Attachment to look at and does not itself store or upload a file.
- **BR-09** Action lifecycle: `OPEN → COMPLETED` (complete) and `OPEN → CANCELLED` (cancel) are the only
  transitions; `COMPLETED` and `CANCELLED` are terminal. Any other transition is `409 INVALID_ACTION_STATE`.
- **BR-10** Actions can be created or edited only while the Ticket is in an **active working status**
  (`NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`). On `RESOLVED`, `CLOSED`, or
  `CANCELLED` Tickets, create/edit returns `409 TICKET_CLOSED`. This closes the invariant gap: a `RESOLVED`
  Ticket can never acquire a new `OPEN` Action. To record further work on a `RESOLVED`/`CLOSED` Ticket, IT
  Staff must first **reopen it** (`→ REOPENED`) per the transition matrix (BR-14); Actions are never
  auto-created and never auto-reopen a Ticket. (Extends Lab 3 BR-44, which blocked only CLOSED/CANCELLED.)
- **BR-11** Requesters may read Actions on their **own** Tickets only; any Action write under `/api/staff/*`
  by a Requester is `403`. Non-owned Ticket reads are `404` (no existence leak), as in Lab 3.
- **BR-12 (resolution gate)** A Ticket may not transition to `RESOLVED` while any of its Actions has status
  `OPEN` → `409 OPEN_ACTIONS_EXIST`. A Ticket with **zero** Actions may be resolved (legacy Lab 1–3 Tickets
  and simple tickets are unaffected). This is the Lab 4 rule deferred by Lab 3 BR-39. The OPEN-Actions check
  and the status `UPDATE` are atomic — see BR-23.
- **BR-13** The Lab 3 resolution requirements still apply: `RESOLVED` requires a 10–1000 char
  `resolutionSummary`; `CLOSED`/`CANCELLED` require `confirm: true`; `CLOSED` is reachable only from
  `RESOLVED`. (Status matrix below.)
- **BR-14** Statuses remain NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED,
  CANCELLED. The transition matrix (IT Staff/Admin) is:

  | From | Allowed targets |
  | --- | --- |
  | NEW | OPEN, IN_PROGRESS, CANCELLED |
  | OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | IN_PROGRESS | OPEN, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | WAITING_FOR_REQUESTER | OPEN, IN_PROGRESS, RESOLVED, CANCELLED |
  | RESOLVED | CLOSED, REOPENED |
  | CLOSED | REOPENED |
  | REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
  | CANCELLED | (none) |

- **BR-15** Status-change conflict order for a `RESOLVED` target: `NO_CHANGE` → `INVALID_TRANSITION` →
  `TICKET_UNASSIGNED` → `OPEN_ACTIONS_EXIST`, then the `400` `resolutionSummary` validation. This keeps the
  Lab 3 order intact and inserts the gate as a state conflict before the summary check.
- **BR-16 (concurrency)** Mutating requests on Ticket status/owner/it-priority and on an Action **may**
  include `expectedUpdatedAt` (ISO-8601). If present and it does not equal the stored `updatedAt`, the
  request is rejected `409 STALE_UPDATE`. If omitted, no concurrency check is performed (back-compatible
  with Lab 3 clients).
- **BR-17 (authorization)** `IT_STAFF` and `ADMIN` may write Actions Taken and change Ticket status.
  `ADMIN` remains read-only on the other Lab 3 `/api/staff/*` writes (claim, owner, it-priority, comments,
  notes) exactly as in Lab 3. Requesters are `403` on all `/api/staff/*` writes.
- **BR-18 (dashboard calculation)** All dashboard metrics are computed by the backend from authoritative
  tables. "Recent Tickets" = the 5 most recently `updatedAt` Tickets in scope. "Recently resolved" = Tickets
  whose `resolvedAt` falls within the last 7 days. **All date boundaries (last-7-days, "today") are computed
  in the `Asia/Bangkok` (UTC+7) timezone**, inclusive of day boundaries — not server/UTC time. Requester
  metrics are scoped to `requesterId = me`; IT Staff "my assigned" is `ownerId = me` and status not in
  (CLOSED, CANCELLED); "my open Actions" is Actions with `assigneeId = me` and status `OPEN`. Each metric's
  exact query, empty behavior, and drill-down URL are catalogued in §8.1.
- **BR-19** The Lab 3 security ordering (401 → password-gate 403 → CSRF 403 → role 403 → lookup/ownership
  404 → validation 400 → state conflict 409) applies unchanged to all new endpoints.
- **BR-20** Any **active** `IT_STAFF`/`ADMIN` with access to the Ticket may edit, assign, complete, or cancel
  **any** of its Actions — authorship is not required. Every such mutation sets `updatedById` to the actor
  and refreshes `updatedAt`. There is no hard delete; "cancel" means `status = CANCELLED`.
- **BR-21** The IT Staff dashboard **urgent list** = Tickets with `itPriority = HIGH` (the top priority tier;
  the data model has no separate Critical) and `currentStatus` not in (CLOSED, CANCELLED), ordered by
  `updatedAt` desc, limited to 5, each linking to Ticket Detail.
- **BR-22** The Requester dashboard **"Waiting for Me"** metric = the Requester's own Tickets with
  `currentStatus = WAITING_FOR_REQUESTER`, drilling down to `/tickets?status=WAITING_FOR_REQUESTER`.
- **BR-23 (atomic resolution gate)** A resolve request runs the OPEN-Actions check and the `UPDATE … SET
  currentStatus = RESOLVED` inside **one serializable database transaction** (Prisma
  `$transaction`, isolation `Serializable`), re-reading the Ticket's Action states inside the transaction.
  Combined with BR-10 (Action create/edit re-checks the Ticket status inside its own transaction and is
  rejected unless the Ticket is in an active status), this makes the invariant *"a RESOLVED/CLOSED Ticket
  has no OPEN Action"* hold under concurrency: a resolve and a concurrent Action-create can never interleave
  to leave a RESOLVED Ticket with an OPEN Action. On a serialization conflict the later transaction retries
  once, then fails safe with `409 STALE_UPDATE` (nothing written).
- **BR-24 (Requester isolation)** A Requester can read only their own Tickets' Actions, read-only, and the
  response contains only Action fields — never Internal Notes or any other user's data. Reads of a
  non-owned Ticket's Actions return `404`; every Action write path is `403` for Requesters. The full Lab 4
  authorization matrix is in §8.2.

## 6. UI Specification Summary

Full detail in `ui-spec.md`. All new UI reuses existing Zen Green tabs, badges, buttons, forms, tables,
cards, loading/empty/error states, and responsive conventions; no new visual language is introduced.

- **Actions Taken (on IT Staff Ticket Detail, §8.3):** a list/table of Actions newest-first showing
  action date/time, description, result, performed-by, assignee, a follow-up badge, status badge, and
  attachment-notes hint. A **create** form and an inline **view/edit** mode (edit only while `OPEN`), plus
  **Assign**, **Complete**, and **Cancel** controls that show only when permitted. Non-color status cues
  (badge text) distinguish OPEN / COMPLETED / CANCELLED. Validation messages appear inline
  (required description; result required to complete; follow-up note required when follow-up is checked).
- **Actions Taken (Requester Ticket Detail):** the same list, **read-only**, all fields visible; no
  create/edit/transition controls. Internal Notes remain hidden from Requesters (unchanged from Lab 3).
- **IT Staff Dashboard:** metric cards (New, Open, In Progress, Waiting for Requester, My Assigned, and a
  **My Open Actions** card = Actions assigned to me with status OPEN), a "My Recent Tickets" list, an
  **Urgent Tickets** list (HIGH IT priority, not Closed/Cancelled — grading Part 5), and Quick Actions
  (Create / Search / My Queue). Each card/row drills down to the appropriate filtered Ticket Queue or
  Ticket Detail.
- **Requester Dashboard:** metric cards (My Open, In Progress, Resolved, Closed) plus a **"Waiting for Me"**
  card (status WAITING_FOR_REQUESTER — handout §4.6), a "My Recent Tickets" list, and Quick Actions
  (Create Ticket / View My Tickets). Each drills down into the existing My Tickets views. Summarizes only
  the authenticated Requester's Tickets.
- **Workflow controls:** Ticket status control offers only permitted transitions; attempting a blocked
  Resolve (open Actions remain) surfaces a clear, non-destructive error and preserves entered data.
- **Dashboard nav & shell:** role-appropriate Dashboard entry with clear active-page indication; loading,
  empty (zero counts render `0`; empty lists show an empty message), forbidden, and safe-failure states for
  each surface. Responsive and accessibility requirements are the same as Labs 2–3 (visible focus,
  keyboard operation, semantic labels, non-color cues, no clipping/overlap/horizontal overflow).

## 7. Data Changes

### 7.1 New enum and model (Prisma)

```prisma
enum ActionStatus {
  OPEN
  COMPLETED
  CANCELLED
}

model ActionTaken {
  id               Int          @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket       @relation(fields: [ticketId], references: [id])
  actionDate       DateTime     @default(now())      // user-editable "work happened at"
  description      String                             // 1–2000 chars (app-validated)
  result           String?                            // required to COMPLETE (BR-06)
  performedById    Int                                // auto = creator, immutable (BR-03)
  performedBy      User         @relation("ActionPerformedBy", fields: [performedById], references: [id])
  updatedById      Int?                               // last editor, any active staff/admin (BR-20)
  updatedBy        User?        @relation("ActionUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  assigneeId       Int?                               // active IT_STAFF/ADMIN only (BR-04)
  assignee         User?        @relation("ActionAssignee", fields: [assigneeId], references: [id], onDelete: Restrict)
  followUpRequired Boolean      @default(false)
  followUpNote     String?                            // required iff followUpRequired (BR-07)
  attachmentNotes  String?                            // free text hint (BR-08)
  status           ActionStatus @default(OPEN)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@index([ticketId, createdAt])     // list newest-first per Ticket
  @@index([ticketId, status])        // resolution-gate "any OPEN?" query
  @@index([assigneeId, status])      // "my open Actions" dashboard metric
}
```

`Ticket` gains `actions ActionTaken[]`; `User` gains `performedActions ActionTaken[] @relation("ActionPerformedBy")`,
`updatedActions ActionTaken[] @relation("ActionUpdatedBy")`, and `assignedActions ActionTaken[] @relation("ActionAssignee")`.
No existing field is altered or dropped.

### 7.2 Justified design decisions

1. **`ActionStatus` as a native Prisma/Postgres enum, not a reference table.** It matches the existing
   `TicketStatus`/`Priority`/`Role` enums, gives compile-time type safety, and keeps the resolution-gate and
   dashboard counts as index-only scans with no join. Trade-off: adding a value needs a migration — accepted
   because the set (OPEN/COMPLETED/CANCELLED) is closed and stable.
2. **Optimistic concurrency via the existing `updatedAt` as an `expectedUpdatedAt` token, not a new `version`
   column.** It reuses Prisma's `@updatedAt`, adds zero columns, and is backward-compatible (Lab 3 clients
   that omit the token still work). Trade-off: timestamp granularity rather than a monotonic counter —
   acceptable for a single-writer-per-record desk workflow and far cheaper than reworking every mutation.
3. **`performedBy` (audit: who recorded) is modeled separately from `assignee` (responsibility: who owns the
   action), with `assignee` nullable and `onDelete: Restrict`.** This directly satisfies BR-02 (the recorder
   and the responsible staffer can differ) and the dashboard "my open Actions" metric, and prevents orphaned
   references if a user row were ever removed.

### 7.3 Migration, backfill, rollback

- **Migration** (`lab4_actions_taken`): additive only — `CREATE TYPE "ActionStatus"`, `CREATE TABLE
  "ActionTaken"` with the three indexes, and the new relation columns on the join. No `ALTER`/`DROP` on any
  Lab 1–3 table; no renames. All existing Users, Tickets, Attachments, Public Comments, Internal Notes
  remain valid.
- **Backfill:** none required. Legacy Tickets simply have zero Actions. The resolution gate (BR-12) treats
  "zero Actions" as resolvable, so no existing Ticket becomes un-resolvable. Action-derived dashboard metrics
  (e.g. "my open Actions") compute to `0` for legacy data.
- **Backup before migrate:** take a `pg_dump` snapshot of the database immediately before applying the
  migration (documented in the README migrate step). This is the recovery point if anything goes wrong.
- **Rollback/recovery (explicit steps):**
  1. `DROP TABLE "ActionTaken";` — removes the Action rows and their three indexes and the four foreign keys
     (`ticketId`, `performedById`, `updatedById`, `assigneeId`). **The only data dropped is `ActionTaken`
     rows.**
  2. `DROP TYPE "ActionStatus";` — removes the enum type (now unreferenced).
  3. No other statement runs. **`User`, `Ticket`, `Attachment`, `PublicComment`, `InternalNote`, `Session`,
     `Category`, `RelatedSystem`, and `TicketCounter` are untouched** — the migration never altered,
     renamed, or dropped a column on any of them (the `actions` / `performedActions` / `updatedActions` /
     `assignedActions` relations are Prisma-virtual; the FK columns live only on `ActionTaken`).
  4. If rows must be preserved for later re-apply, `pg_dump --table=ActionTaken` (or restore the pre-migrate
     snapshot) before step 1.
  - Mechanics: `prisma migrate resolve --rolled-back <migration>` + the down SQL above in a non-Prisma
    environment, or restore the pre-migrate `pg_dump`. Because the change is purely additive, rollback never
    causes Lab 1–3 data loss. **MIG-L4-03** asserts rollback drops only `ActionTaken`/`ActionStatus` and that
    all Lab 1–3 rows survive.
  - **Rollback limitation (explicit):** rollback **permanently discards every `ActionTaken` row** — the
    table is dropped. No Lab 1–3 data is affected, but any recorded Actions are lost unless first captured
    via `pg_dump --table=ActionTaken` (step 4 above) or recovered from the pre-migrate `pg_dump` snapshot.
    This is the only data-loss consequence of the rollback and is accepted as the trade-off for a clean,
    purely-additive down-migration.
- **Seed (idempotent):** re-runnable safely (upsert/skip by deterministic key). Adds Tickets covering all
  major statuses and priorities, assigned and unassigned, and Tickets with **zero, one, and multiple**
  Actions across OPEN/COMPLETED/CANCELLED, with and without follow-up, assigned to active staff (and the
  data is arranged so both non-zero and zero dashboard metrics are demonstrable).

## 8. API Contract Summary

Full request/response shapes, status codes, and error bodies are in `api-spec.md`. All routes sit behind the
Lab 3 auth/password-gate/CSRF middleware and follow the BR-19 error ordering.

| Method & path | Role | Purpose | Key codes |
| --- | --- | --- | --- |
| `POST /api/staff/tickets/:id/actions` | IT_STAFF, ADMIN | Create an Action | 201 / 400 / 422 `ASSIGNEE_INACTIVE`,`INVALID_ASSIGNEE` / 403 / 404 / 409 `TICKET_CLOSED` |
| `GET /api/staff/tickets/:id/actions` | IT_STAFF, ADMIN | List Actions (newest first) | 200 / 403 / 404 |
| `PATCH /api/staff/tickets/:id/actions/:actionId` | IT_STAFF, ADMIN | Edit / assign / complete / cancel (any active staff/admin) | 200 / 400 / 422 `ASSIGNEE_INACTIVE`,`INVALID_ASSIGNEE` / 403 / 404 / 409 `INVALID_ACTION_STATE`,`TICKET_CLOSED`,`STALE_UPDATE` |
| `GET /api/tickets/:id/actions` | REQUESTER (owner) | Read own Ticket's Actions (read-only, all fields) | 200 / 403 / 404 |
| `PATCH /api/staff/tickets/:id/status` *(extended)* | IT_STAFF, ADMIN | Status change + resolution gate | 200 / 400 / 403 / 404 / 409 `NO_CHANGE`,`INVALID_TRANSITION`,`TICKET_UNASSIGNED`,`OPEN_ACTIONS_EXIST`,`STALE_UPDATE` |
| `GET /api/staff/dashboard` | IT_STAFF, ADMIN | IT Staff dashboard metrics + drill-down links | 200 / 403 |
| `GET /api/requester/dashboard` | REQUESTER | Requester dashboard metrics (own data only) + links | 200 / 403 |

- **Create/edit body:** `actionDate?`, `description`, `result?`, `assigneeId?`, `followUpRequired?`,
  `followUpNote?`, `attachmentNotes?`, and for transitions `status?` (COMPLETED|CANCELLED); mutations accept
  optional `expectedUpdatedAt`.
- **Dashboards** return concise, documented metric objects (counts + a short recent list with ids/numbers),
  **not** whole Ticket collections, each metric carrying its drill-down query (e.g.
  `/api/staff/tickets?status=NEW`, `/api/tickets?status=RESOLVED`). Empty scope returns zeros / empty lists,
  never 404.
- **Admin change note:** `ADMIN` is now accepted on Action writes and on `…/status`; all other `/api/staff/*`
  Admin behavior is unchanged (read-only), and `allowedTransitions` is populated for ADMIN on status reads.

### 8.1 Dashboard metric catalog

All counts are backend-computed; empty scope returns `0` or `[]` (never 404). Date boundaries use
`Asia/Bangkok` (UTC+7). `me` = authenticated user id. Drill-down URLs are client routes with query params.

**IT Staff dashboard — `GET /api/staff/dashboard`** (IT_STAFF, ADMIN):

| Metric | Query | Empty | Drill-down |
| --- | --- | --- | --- |
| New | `count(currentStatus = NEW)` | `0` | `/staff/queue?status=NEW` |
| Open | `count(currentStatus = OPEN)` | `0` | `/staff/queue?status=OPEN` |
| In Progress | `count(currentStatus = IN_PROGRESS)` | `0` | `/staff/queue?status=IN_PROGRESS` |
| Waiting for Requester | `count(currentStatus = WAITING_FOR_REQUESTER)` | `0` | `/staff/queue?status=WAITING_FOR_REQUESTER` |
| My Assigned | `count(ownerId = me AND currentStatus ∉ {CLOSED,CANCELLED})` | `0` | `/staff/queue?owner=ME` |
| Unassigned | `count(ownerId IS NULL AND currentStatus ∉ {CLOSED,CANCELLED})` | `0` | `/staff/queue?owner=UNASSIGNED` |
| My Open Actions | `count(ActionTaken WHERE assigneeId = me AND status = OPEN)` | `0` | `/staff/queue?actionAssignee=ME&actionStatus=OPEN` |
| My Recent Tickets | top 5 `ownerId = me` by `updatedAt desc` | `[]` | `/staff/queue?owner=ME` |
| Urgent Tickets | top 5 `itPriority = HIGH AND currentStatus ∉ {CLOSED,CANCELLED}` by `updatedAt desc` | `[]` | `/staff/queue?itPriority=HIGH` |

**Requester dashboard — `GET /api/requester/dashboard`** (REQUESTER, scoped `requesterId = me`):

| Metric | Query | Empty | Drill-down |
| --- | --- | --- | --- |
| My Open | `count(currentStatus ∈ {NEW,OPEN,REOPENED})` | `0` | `/tickets?status=OPEN` |
| In Progress | `count(currentStatus = IN_PROGRESS)` | `0` | `/tickets?status=IN_PROGRESS` |
| Waiting for Me | `count(currentStatus = WAITING_FOR_REQUESTER)` | `0` | `/tickets?status=WAITING_FOR_REQUESTER` |
| Resolved | `count(currentStatus = RESOLVED)` | `0` | `/tickets?status=RESOLVED` |
| Closed | `count(currentStatus = CLOSED)` | `0` | `/tickets?status=CLOSED` |
| Recently Resolved | `count(resolvedAt within last 7 days, Asia/Bangkok)` | `0` | `/tickets?status=RESOLVED` |
| My Recent Tickets | top 5 by `updatedAt desc` | `[]` | `/tickets` |

### 8.2 Authorization matrix (Lab 4 surfaces)

Backend-enforced. `✓` = allowed; `404` = behaves as not-found to avoid existence leaks; `403` = forbidden
by role. "own" = the Requester is the Ticket's `requesterId`.

| Capability | Requester (own) | Requester (other) | IT_STAFF | ADMIN |
| --- | --- | --- | --- | --- |
| `GET /api/tickets/:id/actions` (read Actions) | ✓ read-only, all Action fields | 404 | — (uses staff route) | — (uses staff route) |
| `GET /api/staff/tickets/:id/actions` | 403 | 403 | ✓ | ✓ |
| `POST/PATCH …/actions` (create/edit/assign/complete/cancel) | 403 | 403 | ✓ | ✓ |
| `PATCH …/status` (Ticket workflow) | 403 | 403 | ✓ | ✓ (Lab 4 change) |
| `GET/POST …/notes` (**Internal Notes**) | 403 | 403 | ✓ | 403 read-only¹ |
| `GET /api/staff/dashboard` | 403 | 403 | ✓ | ✓ |
| `GET /api/requester/dashboard` | ✓ own scope only | n/a | 403 | 403 |

¹ ADMIN Internal-Note behavior is unchanged from Lab 3 (read allowed per Lab 3 BR-22; write 403).

**Internal Notes are never exposed to Requesters.** They live in a separate `InternalNote` entity and are
served only by `/api/staff/tickets/:id/notes` (IT_STAFF, and ADMIN read-only). No Action field, Action
endpoint, Requester Ticket Detail payload, or Requester dashboard ever includes Internal Note data — the
Action read model (`GET /api/tickets/:id/actions`) returns only Action fields (BR-11, BR-24).

## 9. Acceptance Criteria (Given/When/Then)

| ID | Maps to | Criterion |
| --- | --- | --- |
| **AC-01** | FR-01, BR-01, BR-03 | Given a permitted IT Staff user and valid data, when an Action is created, then it is saved under the correct Ticket with `performedBy` = the authenticated creator and `status = OPEN`. |
| **AC-02** | FR-04, BR-04 | Given an active IT Staff/Admin target, when an Action is assigned to them, then `assigneeId` is set; given an **inactive** staff/admin target, then the response is `422 ASSIGNEE_INACTIVE` and the Action is unchanged. |
| **AC-03** | BR-04 | Given a `REQUESTER` or an unknown user id, when used as assignee, then the response is `422 INVALID_ASSIGNEE`. |
| **AC-04** | FR-05, BR-06, BR-09 | Given an `OPEN` Action with a non-empty result, when completed, then `status = COMPLETED`; given no result, then `400`; given a non-OPEN Action, then `409 INVALID_ACTION_STATE`. |
| **AC-05** | FR-05, BR-09 | Given an `OPEN` Action, when cancelled, then `status = CANCELLED`; a second complete/cancel returns `409 INVALID_ACTION_STATE`. |
| **AC-06** | FR-03 | Given a `COMPLETED` or `CANCELLED` Action, when an edit is attempted, then it is rejected (read-only history). |
| **AC-07** | BR-07 | Given `followUpRequired = true` with no note, when created/edited, then `400`; with a 1–1000 char note, then it succeeds. |
| **AC-08** | FR-06, BR-11 | Given an authenticated Requester, when they read `/api/tickets/:id/actions` for their own Ticket, then all Actions with all fields are returned read-only; for a non-owned Ticket, then `404`. |
| **AC-09** | FR-06, BR-11, BR-17 | Given a Requester, when they attempt any Action write under `/api/staff/*`, then `403`. |
| **AC-10** | FR-09, BR-12 | Given a Ticket with at least one `OPEN` Action, when IT Staff set it to `RESOLVED`, then `409 OPEN_ACTIONS_EXIST`; given all Actions `COMPLETED`/`CANCELLED` (or zero Actions) and a valid summary, then it resolves. |
| **AC-11** | BR-13, BR-14 | Given a target status, when IT Staff change status, then matrix-allowed transitions succeed (with summary/confirm where required) and all others return `409 INVALID_TRANSITION` listing allowed targets. |
| **AC-12** | BR-15 | Given a `RESOLVED` request that violates several rules at once, when processed, then the first applicable error in order (`INVALID_TRANSITION` → `TICKET_UNASSIGNED` → `OPEN_ACTIONS_EXIST` → `400` summary) is returned. |
| **AC-13** | BR-16 | Given a stale `expectedUpdatedAt` on a status or Action mutation, when submitted, then `409 STALE_UPDATE`; when omitted, then the mutation proceeds (Lab 3 compatibility). |
| **AC-14** | BR-10 | Given a `RESOLVED`, `CLOSED`, or `CANCELLED` Ticket, when an Action is created/edited, then `409 TICKET_CLOSED`; given the Ticket is reopened (`→ REOPENED`), then an Action can be created again. |
| **AC-15** | FR-11, BR-18 | Given an authenticated Requester, when the Requester dashboard is retrieved, then only metrics and recent Tickets owned by that Requester are returned, with correct open/in-progress/resolved/closed counts and a waiting-for-you indicator. |
| **AC-16** | FR-12, BR-18 | Given IT Staff, when the dashboard is retrieved, then New/Open/In Progress/Waiting counts, my-assigned, unassigned, my-open-Actions, and the 5 most recently updated active Tickets match direct DB queries. |
| **AC-17** | FR-13 | Given a dashboard card/row, when activated, then it navigates to the correct filtered Queue / My Tickets / Ticket Detail; given empty scope, then zeros/empty lists render (no error, no 404). |
| **AC-18** | FR-12, BR-17 | Given an Administrator, when they create/update an Action or change Ticket status, then it succeeds; when they attempt claim/owner/it-priority/comment/note writes, then `403` (Lab 3 behavior preserved). |
| **AC-19** | FR-07 | Given a Ticket with multiple Actions, when listed, then they appear newest-first by `createdAt` in a stable order for both staff and requester views. |
| **AC-20** | FR-14, FR-15 | Given the full Lab 1–3 feature set, when exercised after migration, then authentication, My Tickets, Ticket Detail, Attachments, Public Comments, Internal Notes, IT Staff functions, and Administrator user management all behave as before, with consistent feedback states. |
| **AC-21** | FR-16, FR-15 | Given a double-submitted create/transition, when received, then the duplicate is prevented or safely handled (no duplicate Action, no inconsistent status), and entered form data is preserved on recoverable failure. |
| **AC-22** | FR-03, BR-20 | Given an `OPEN` Action created by staff A, when active staff B (not the author) with access to the Ticket edits/assigns/completes/cancels it, then the mutation succeeds and `updatedById` = B with a refreshed `updatedAt`. |
| **AC-23** | FR-12, BR-18 | Given Actions assigned to me with status OPEN, when the IT Staff dashboard is retrieved, then the "My Open Actions" count equals a direct `count(assigneeId = me AND status = OPEN)` query. |
| **AC-24** | FR-12, BR-21 | Given Tickets of mixed IT priority and status, when the IT Staff dashboard is retrieved, then the Urgent list contains exactly the HIGH-priority Tickets not in CLOSED/CANCELLED, newest-first, and each links to Ticket Detail. |
| **AC-25** | FR-11, BR-22 | Given the Requester has Tickets in WAITING_FOR_REQUESTER, when the Requester dashboard is retrieved, then the "Waiting for Me" count matches and drills down to `/tickets?status=WAITING_FOR_REQUESTER`. |
| **AC-26** | BR-18 | Given a Ticket resolved at a time that falls on different calendar days in UTC vs Asia/Bangkok, when "Recently Resolved" is computed, then the Asia/Bangkok day boundary is used. |
| **AC-27** | FR-09, BR-12, BR-23 | Given a Ticket whose Actions are all completed, when a resolve request and a new-Action-create request are issued concurrently, then the invariant holds: either the resolve commits and the create is rejected `409 TICKET_CLOSED`, or the create commits (Ticket still active) and the resolve returns `409 OPEN_ACTIONS_EXIST` — the system never ends with a `RESOLVED` Ticket that has an `OPEN` Action. |
| **AC-28** | FR-06, BR-11, BR-24 | Given a Requester, when they read their own Ticket's Actions, then the payload contains only Action fields and no Internal Note content; when they request a non-owned Ticket's Actions, then `404`; when they call `/api/staff/tickets/:id/notes`, then `403`. (Requesters never see Internal Notes by any path.) |
| **AC-29** | FR-01, FR-03, BR-19 | Given an unknown Ticket id (create/list Actions) or an unknown Action id under a valid Ticket (PATCH), when requested by permitted staff, then `404` with no existence leak. |
| **AC-30** | FR-02, BR-05, BR-06, BR-08 | Given an Action create/edit with a field out of bounds (empty or >2000 char description, future `actionDate`, >500 char `attachmentNotes`, >1000 char `followUpNote`), when submitted, then `400 VALIDATION_FAILED` with field errors and nothing is written. |

Every AC maps to at least one planned test in `tests.md`.

## 10. Definition of Done (Product Completion)

- [ ] All FR-01…FR-16 implemented and enforced **server-side**; UI controls mirror but never replace backend authz.
- [ ] Prisma migration applies cleanly on a Lab 3 database with **no data loss**; rollback verified; seed is idempotent and covers zero/one/multiple Actions and non-zero/zero dashboard metrics.
- [ ] Every AC-01…AC-21 has a passing automated test; full suite green from `main`: server unit/API, migration/regression, client component, and E2E.
- [ ] Actions Taken (list/create/assign/edit/complete/cancel, inactive-assignee rejection, role restrictions, safe failures, responsive) demonstrable; different Actions on one Ticket shown.
- [ ] Ticket workflow: permitted transitions only, resolution gate enforced, stable ordering, append-only Actions, role-appropriate visibility.
- [ ] IT Staff and Requester dashboards show accurate, backend-computed metrics matching DB queries, with drill-down, loading, empty, forbidden, and safe-failure states; Requester ownership protection enforced.
- [ ] All Lab 1–3 regression passes; no console errors, broken links, placeholder text, or unfinished controls.
- [ ] Zen Green consistency, responsive (desktop/tablet/mobile), and accessibility checklist complete; README setup/seed/migration/test/demo instructions current.
- [ ] One Issue → one `feature/lab4-*` branch → one PR into `lab4-staging`, reviewed and approved; release PR to `main` only after all sprint Issues merge.

## 11. Assumptions and Decisions

1. **Action model = assignee + status enum (decision).** Although the handout field list (§3/§4.1/§8.3) omits
   them, grading Part 6 requires demonstrable *assign / complete / cancel / inactive-assignee rejection*, so
   an Action has a separate `assignee` (distinct from the auto `performedBy`) and an `ActionStatus` lifecycle
   (OPEN/COMPLETED/CANCELLED). "Performed by" remains the automatic creator.
2. **Requester visibility = all Actions, read-only, all fields (decision).** §8.3 ("Requesters will see all
   Actions Taken items") is the more specific statement and overrides §4.3's open-ended "where approved".
   **Internal Notes stay hidden** from Requesters (unchanged from Lab 3).
3. **Resolution gate = block `RESOLVED` only while any Action is `OPEN` (decision).** `COMPLETED` and
   `CANCELLED` Actions do not block; `followUpRequired` does **not** block; a Ticket with **zero** Actions is
   resolvable so Lab 1–3 regression is preserved. This realizes the rule Lab 3 BR-39 deferred.
4. **Administrator write scope (intentional change from Lab 3).** Per handout §1 and §4.3, `ADMIN` may now
   create/update Actions Taken **and** change Ticket status. All other `/api/staff/*` Admin behavior stays as
   Lab 3 (read-only on claim/owner/it-priority/comments/notes). Lab 3 tests asserting Admin-read-only on
   *those* endpoints remain valid; tests asserting Admin-empty-`allowedTransitions` or Admin-403-on-status
   are updated to reflect this change and noted in the Lab 4 reviewer/test docs.
5. **Action date/time** is a user-editable "work happened at" value defaulting to now, not future-dated, with
   separate system `createdAt`/`updatedAt` (reconciles §4.1 "Action Date/Time" with §8.3 "create date/time").
6. **Editability/append-only:** Any active IT Staff/Admin with access to the Ticket (not only the author) may
   edit/assign/complete/cancel an Action while it is `OPEN`; the last editor is tracked in `updatedById`.
   There is no hard delete; `COMPLETED`/`CANCELLED` Actions are immutable history.
7. **Attachment Notes** is free text (0–500 chars) referencing existing Lab 2 Attachments; Lab 4 adds no new
   file-upload path on Actions.
8. **Concurrency** uses an optional `expectedUpdatedAt` token (optimistic), keeping Lab 3 clients working when
   the token is omitted.
9. **Dashboard specifics:** "recent" lists = 5 most recently `updatedAt` Tickets in scope; "recently
   resolved" = `resolvedAt` within the last 7 days. **All date boundaries are computed in `Asia/Bangkok`
   (UTC+7), not server/UTC time.** The IT Staff urgent list uses `itPriority = HIGH` because the `Priority`
   enum has no separate Critical tier (adding one is out of scope and would touch Lab 1–3 seed/regression).
   Administrator reuses the IT Staff dashboard; user-account counts are optional and out of scope unless
   added later.
10. **New routers/mounts:** Action endpoints extend the existing `/api/staff` and `/api/tickets` routers; a
    small `/api/requester` router (or equivalent) is added for the Requester dashboard. Exact shapes are
    finalized in `api-spec.md`.
