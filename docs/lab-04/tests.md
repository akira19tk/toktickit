# Lab 4 Test Plan and Results — Actions Taken, Workflow, Dashboards, Regression

## 1. Test Strategy

This plan is written from `specification.md` **before** implementation (Test DD), then driven red → green per
Issue (TDD). It covers unit, API/integration, UI component, UI style/responsive, authorization, workflow,
migration/regression, and end-to-end levels. Every Acceptance Criterion (AC-01–AC-26) maps to at least one
test below.

**Naming rule (traceability).** Every automated test title starts with its Test ID, e.g.
`it("API-L4-03: create a valid Action", …)`, so the Status column can be verified mechanically from output.

**Status rule.** The Status column stays `Planned` until the test runs green on `main`. It becomes `Pass`
only from real test output, never from an agent's claim. Not-implemented, skipped, or failing tests are never
marked `Pass`. (This document is committed at spec time with all rows `Planned`.)

**Test database.** API tests run against `toktickit_test` (`TEST_DATABASE_URL`), recreated by
`npm run test:db:setup`; they never touch the dev DB. Each file creates the users/Tickets it needs. Migration
tests (`MIG-L4-*`) run via `npm run test:migration` on `toktickit_migration_test`: Lab 3 migrations + a Lab 3
fixture are applied and snapshotted, then the Lab 4 migration + seed run and data is compared.

**Timezone tests.** Dashboard boundary tests fix a known instant near a UTC/Asia-Bangkok day boundary to
prove `Asia/Bangkok` (UTC+7) is used (BR-18).

**Concurrency tests.** `expectedUpdatedAt` stale-update and double-submit cases fire overlapping requests to
prove no lost update and no duplicate write.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-L4-01 | Unit | AC-11 | Ticket transition matrix incl. CANCELLED terminal | Allowed/blocked pairs match BR-14 | server/tests/lab-04/lib.unit.test.ts | Pass |
| UNIT-L4-02 | Unit | AC-04, AC-05 | Action lifecycle validator (OPEN→COMPLETED/CANCELLED only; complete needs result) | Legal transitions pass, others rejected | server/tests/lab-04/lib.unit.test.ts | Pass |
| UNIT-L4-03 | Unit | AC-07 | Follow-up note rule (required iff followUpRequired) | Mismatches rejected | server/tests/lab-04/lib.unit.test.ts | Pass |
| UNIT-L4-04 | Unit | AC-26 | Asia/Bangkok "last 7 days" / day-boundary helper | Boundary computed in UTC+7, not UTC | server/tests/lab-04/lib.unit.test.ts | Pass |
| API-L4-01 | API | AC-01 | Create a valid Action | 201; under correct Ticket; performedBy=creator; status OPEN; updatedBy null | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-02 | API | AC-02 | Assign to active vs inactive staff/admin | Active → set; inactive → 422 ASSIGNEE_INACTIVE, unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-03 | API | AC-03 | Assign to a Requester / unknown id | 422 INVALID_ASSIGNEE | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-04 | API | AC-04 | Complete OPEN with/without result; complete non-OPEN | result→COMPLETED; none→400; non-OPEN→409 INVALID_ACTION_STATE | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-05 | API | AC-05 | Cancel OPEN then repeat | →CANCELLED; second transition 409 INVALID_ACTION_STATE | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-06 | API | AC-06 | Edit a COMPLETED/CANCELLED Action | 400 (read-only history) | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-07 | API | AC-07 | followUpRequired true with empty note; valid note | 400; then success | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-08 | API | AC-14 | Create/edit Action on RESOLVED/CLOSED/CANCELLED Ticket | 409 TICKET_CLOSED | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-09 | API | AC-19 | Multiple Actions list order | Newest-first by createdAt, stable | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-10 | API | AC-22 | Staff B (not author) edits/completes staff A's Action | 200; updatedBy=B; updatedAt refreshed | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-11 | API | AC-13 | Action PATCH with stale expectedUpdatedAt; omitted | 409 STALE_UPDATE; omitted → proceeds | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-12 | API | AC-08 | Requester reads own Ticket Actions; non-owned | 200 all fields newest-first; non-owned 404 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-13 | API | AC-09 | Requester attempts Action write under /staff/* | 403 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-14 | API | AC-18 | Admin creates/updates Action | 201/200 (Lab 4 change) | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-15 | API | AC-10 | Resolve with an OPEN Action; then all COMPLETED/CANCELLED; zero-Action Ticket | 409 OPEN_ACTIONS_EXIST; then resolves; zero-Action resolves | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-16 | API | AC-11 | Transition matrix over the API | Allowed succeed; others 409 INVALID_TRANSITION w/ targets | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-17 | API | AC-12 | RESOLVED request violating several rules at once | First applicable error (…→OPEN_ACTIONS_EXIST→400 summary) | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-18 | API | AC-13 | Status PATCH with stale expectedUpdatedAt | 409 STALE_UPDATE | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-19 | API | AC-18 | Admin changes status (allowed); admin claim/owner/priority/comment/note | status 200; others 403 (Lab 3 preserved) | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-20 | API | AC-21 | Double-submitted status transition / Action create | No duplicate, consistent state | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-21 | API | AC-15 | Requester dashboard scope + counts | Only own data; open/inProgress/resolved/closed correct | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-L4-22 | API | AC-25 | Waiting for Me metric | Equals count(WAITING_FOR_REQUESTER) for me | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-L4-23 | API | AC-26 | Recently Resolved uses Asia/Bangkok boundary | Count flips correctly across UTC+7 midnight | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-L4-24 | API | AC-15 | Requester dashboard requested by IT Staff/Admin | 403 | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-L4-25 | API | AC-16 | Staff dashboard counts match direct DB queries | new/open/inProgress/waiting/myAssigned/unassigned exact | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-26 | API | AC-23 | My Open Actions count | Equals count(assigneeId=me AND status=OPEN) | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-27 | API | AC-24 | Urgent list contents/order | Exactly HIGH & not Closed/Cancelled, newest-first, ≤5 | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-28 | API | AC-17 | Dashboards with empty scope | Zeros / empty lists, 200 (no 404) | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-29 | API | AC-18 | Staff dashboard requested by Requester | 403 | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-30 | API | AC-27 | Concurrent resolve + new-Action-create on an all-completed Ticket (Promise.all) | Invariant holds: resolve commits & create 409 TICKET_CLOSED, OR create commits & resolve 409 OPEN_ACTIONS_EXIST; never RESOLVED with an OPEN Action | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-L4-31 | API | AC-14 | Create Action on a RESOLVED Ticket; then reopen (→REOPENED) and create | 409 TICKET_CLOSED; after reopen, 201 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-32 | API | AC-28 | Requester Action read model excludes Internal Notes; non-owned 404; requester hits /notes | Payload has only Action fields (no note content); 404; 403 on /notes | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-33 | API | AC-29 | 404 edge cases: PATCH unknown actionId under a valid Ticket; GET/POST actions on unknown Ticket | 404 (no existence leak) | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-34 | API | AC-30 | 400 field bounds: description empty/>2000, actionDate in the future, attachmentNotes >500, followUpNote >1000 | 400 VALIDATION_FAILED with field errors; nothing written | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-35 | API | AC-14 | PATCH error-ordering when several rules collide (invalid transition on a closed Ticket; inactive assignee on a resolved Ticket) | TICKET_CLOSED before INVALID_ACTION_STATE/STALE_UPDATE; 422 assignee before TICKET_CLOSED (api-spec §6) | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-36 | API | AC-28 | Requester Action view nested user fields | performedBy/assignee/updatedBy are exactly {id,name}; no email/role/passwordHash anywhere | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-37 | API | AC-13 | Concurrent PATCH with the same expectedUpdatedAt | Exactly one 200, one 409 STALE_UPDATE; final DB matches the winner | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-38 | API | AC-02, AC-03 | PATCH assignee semantics | Active→200; inactive→422 ASSIGNEE_INACTIVE (unchanged); requester/unknown→422 INVALID_ASSIGNEE; Requester PATCH→403 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-L4-39 | API | AC-16, AC-23 | Dashboard excludes frozen tickets + non-matching actions (PR #63 review) | CLOSED/CANCELLED owned-by-me & unassigned excluded; myOpenActions = OPEN-assigned-to-me only | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-40 | API | AC-16, AC-18 | Dashboard metrics scoped per staffer (PR #63 review) | Two staff get different myAssigned/myOpenActions; global status counts equal | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-L4-41 | API | AC-17 | Queue action filter combines with status/owner/priority (PR #63 review) | actionAssignee=ME&actionStatus=OPEN × status/owner/priority; single-action AND semantics | server/tests/lab-04/staff-queue-action-filters.api.test.ts | Pass |
| API-L4-42 | API | AC-17 | Queue action filter over-constrained → empty (PR #63 review) | 200, [] (no 404/500) | server/tests/lab-04/staff-queue-action-filters.api.test.ts | Pass |
| UI-L4-01 | UI | AC-16, AC-24 | StaffDashboard renders cards, My Open Actions, urgent list | Values and labels shown; non-color cues | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-L4-02 | UI | AC-17 | StaffDashboard card/row drill-down navigation | Navigates to correct queue/detail route+params | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-L4-03 | UI | AC-15, AC-25 | RequesterDashboard own metrics + Waiting for Me cue | Correct cards; attention cue present | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-L4-04 | UI | AC-17 | RequesterDashboard drill-down + empty state | Links to /tickets?status=…; empty renders 0/message | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-L4-05 | UI | AC-01, AC-07 | ActionsTaken create form + follow-up validation | Required errors inline; follow-up note gated | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-06 | UI | AC-04, AC-05, AC-06 | ActionsTaken complete/cancel; read-only terminal | Controls show when permitted; terminal read-only | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-07 | UI | AC-08 | ActionsTaken read-only for Requester | All fields shown; no create/edit controls | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-08 | UI | AC-11, AC-21 | TicketWorkflow shows only permitted transitions; disables on submit | Permitted options only; no double submit | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-L4-09 | UI | AC-10 | TicketWorkflow surfaces OPEN_ACTIONS_EXIST without losing summary | Inline conflict; entered data preserved | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-L4-10 | UI | AC-01, AC-04, AC-07 | ActionsTaken rejects whitespace-only description / follow-up note / completion result | Trimmed-empty input blocked inline; no API call | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-11 | UI | AC-02, AC-13 | 422 ASSIGNEE_INACTIVE (create) + 409 STALE_UPDATE (edit) preserve typed data and show feedback | Every field retained; message shown; form not reset | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-12 | UI | AC-01, AC-04 | Successful create/complete refresh the Actions list and Ticket summary | List re-fetched; onChanged (summary reload) fires once | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-L4-13 | UI | AC-17 | Dashboard routing + legacy-route gating (PR #63 review) | Each role → /dashboard; /dashboard role-branches; legacy routes render for permitted role, forbid others | client/tests/lab-04/DashboardRouting.test.tsx | Pass |
| UI-L4-14 | UI | AC-17, AC-20 | StaffDashboard loading/error states are accessible (PR #63 review) | Loading = status region + accessible label; error = role=alert + retry button | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-L4-15 | UI | AC-20 | Gregorian dates under Thai locale and keyboard-operable mobile My Tickets card | No Buddhist year; date/time shown; Enter opens ticket | client/tests/lab-04/Hardening.test.tsx | Pass |
| RESP-L4-01 | Responsive/Style | AC-20 | Dashboard responsive grid structure (component-level) | Metric cards share responsive grid; actual pixel overflow is not asserted | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| MIG-L4-01 | Migration | AC-20 | Apply Lab 4 migration on a Lab 3 DB | All Lab 1–3 rows preserved; ActionTaken + enum created | server/tests/lab-04/migration.test.ts | Pass |
| MIG-L4-02 | Migration | AC-10, AC-20 | Legacy Ticket (zero Actions) resolvable after migration | Resolution gate passes; no backfill needed | server/tests/lab-04/migration.test.ts | Pass |
| MIG-L4-03 | Migration | AC-20 | Rollback drops ActionTaken/enum only | Lab 1–3 data intact | server/tests/lab-04/migration.test.ts | Pass |
| MIG-L4-04 | Migration | AC-20 | Seed is idempotent; covers zero/one/multiple Actions and non-zero/zero metrics | Re-run safe; dashboard-demo data present | server/tests/lab-04/migration.test.ts | Pass |
| MIG-L4-05 | Migration | AC-20 | ActionTaken FK deletes are RESTRICT (User as performedBy/assignee/updatedBy; Ticket with Actions) | Each delete rejected; referenced rows intact | server/tests/lab-04/migration.test.ts | Pass |
| MIG-L4-06 | Migration | AC-20 | Seed on a partially populated DB (some Tickets have Actions, some don't) | Missing Actions filled, already-populated untouched, no duplicates, idempotent | server/tests/lab-04/migration.test.ts | Pass |
| REG-L4-01 | Regression | AC-20 | Full Lab 1–3 server suites still green | All prior API/unit tests pass | server/tests/lab-01..03/* | Pass |
| E2E-L4-01 | E2E | AC-01,AC-02,AC-04,AC-05,AC-22 | Actions Taken flow: create→assign→complete / cancel, multiple on one Ticket | Visible, persisted, role-restricted | e2e/lab-04/actions-taken-flow.spec.ts | Blocked (Chromium startup permission) |
| E2E-L4-02 | E2E | AC-10, AC-11 | Ticket resolution: blocked by open Action, then resolve, reopen | Gate enforced end-to-end | e2e/lab-04/ticket-resolution.spec.ts | Blocked (Chromium startup permission) |
| E2E-L4-03 | E2E | AC-15,AC-16,AC-17 | Dashboards: staff + requester metrics and drill-down | Counts match; navigation correct | e2e/lab-04/dashboards.spec.ts | Blocked (Chromium startup permission) |
| E2E-L4-04 | E2E | AC-20 | Representative Lab 1–3 regression (auth, My Tickets, detail, attachments, comments, notes, admin) | All prior flows pass | e2e/lab-03/*.spec.ts + e2e/lab-04/dashboards.spec.ts | Blocked (Chromium startup permission) |

## 2.1 Error / edge-case coverage audit

Every error class across the Lab 4 endpoints has at least one explicit test:

| Error class | Covered by |
|---|---|
| 400 validation (field shape/bounds) | API-L4-04 (complete w/o result), API-L4-07 (follow-up note), API-L4-34 (description/actionDate/attachmentNotes/followUpNote bounds) |
| 422 assignee semantics | API-L4-02 (inactive, create), API-L4-03 (requester/unknown, create), API-L4-38 (inactive + requester/unknown, PATCH) |
| 403 forbidden (role) | API-L4-13 (requester write), API-L4-24/29 (dashboards), API-L4-32 (/notes), API-L4-38 (requester PATCH) |
| 404 not-found / ownership | API-L4-12 (non-owned read), API-L4-33 (unknown ticket/action) |
| 409 INVALID_TRANSITION / OPEN_ACTIONS_EXIST / INVALID_ACTION_STATE / NO_CHANGE | API-L4-16, API-L4-15/17, API-L4-04/05, API-L4-17 |
| 409 STALE_UPDATE (concurrency) | API-L4-11 (action), API-L4-18 (status), API-L4-30 (serializable gate), API-L4-37 (parallel PATCH, same token) |
| 409 TICKET_CLOSED (resolved/closed/cancelled) | API-L4-08, API-L4-31 |
| Error ordering across multiple simultaneous violations | API-L4-35 (PATCH: TICKET_CLOSED > INVALID_ACTION_STATE/STALE_UPDATE; 422 > TICKET_CLOSED), API-L4-17 (status endpoint) |
| No sensitive-field exposure in Requester view | API-L4-32 (top-level keys, no note body), API-L4-36 (nested user refs only {id,name}) |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-L4-01, UI-L4-05, UI-L4-10, UI-L4-12, E2E-L4-01 |
| AC-02 | API-L4-02, API-L4-38, UI-L4-11, E2E-L4-01 |
| AC-03 | API-L4-03, API-L4-38 |
| AC-04 | UNIT-L4-02, API-L4-04, UI-L4-06, UI-L4-10, UI-L4-12, E2E-L4-01 |
| AC-05 | UNIT-L4-02, API-L4-05, UI-L4-06, E2E-L4-01 |
| AC-06 | API-L4-06, UI-L4-06 |
| AC-07 | UNIT-L4-03, API-L4-07, UI-L4-05, UI-L4-10 |
| AC-08 | API-L4-12, UI-L4-07 |
| AC-09 | API-L4-13 |
| AC-10 | API-L4-15, MIG-L4-02, UI-L4-09, E2E-L4-02 |
| AC-11 | UNIT-L4-01, API-L4-16, UI-L4-08, E2E-L4-02 |
| AC-12 | API-L4-17 |
| AC-13 | API-L4-11, API-L4-18, API-L4-37, UI-L4-11 |
| AC-14 | API-L4-08, API-L4-31, API-L4-35 |
| AC-15 | API-L4-21, API-L4-24, UI-L4-03, E2E-L4-03 |
| AC-16 | API-L4-25, UI-L4-01, E2E-L4-03 |
| AC-17 | API-L4-28, UI-L4-02, UI-L4-04, E2E-L4-03 |
| AC-18 | API-L4-14, API-L4-19, API-L4-29 |
| AC-19 | API-L4-09 |
| AC-20 | MIG-L4-01, MIG-L4-03, MIG-L4-04, MIG-L4-05, MIG-L4-06, REG-L4-01, RESP-L4-01, E2E-L4-04 |
| AC-21 | API-L4-20, UI-L4-08 |
| AC-22 | API-L4-10, E2E-L4-01 |
| AC-23 | API-L4-26 |
| AC-24 | API-L4-27, UI-L4-01 |
| AC-25 | API-L4-22, UI-L4-03 |
| AC-26 | UNIT-L4-04, API-L4-23 |
| AC-27 | API-L4-30 |
| AC-28 | API-L4-32, API-L4-36, UI-L4-07 |
| AC-29 | API-L4-33 |
| AC-30 | API-L4-34 |

## 4. Planned totals

The table is the canonical test-plan inventory (one row can map to multiple executable assertions).
(Migration count grew from 4 to 6: **MIG-L4-05** and **MIG-L4-06** were added in response to the PR #58
review — FK delete restrictions and partial-DB seed idempotency.)
(UI count grew from 9 to 12: **UI-L4-10**–**UI-L4-12** were added in response to the PR #62 review —
whitespace-only validation, 422/409 recoverable-error data retention, and create/complete list +
ticket-summary refresh.)
(API count grew from 34 to 38: **API-L4-35**–**API-L4-38** were added in response to the PR #59
review — PATCH error-ordering, nested-user-field whitelist, parallel-PATCH stale-update, and PATCH
assignee semantics; the PATCH stale check was also made an atomic guarded UPDATE.)
Final column describes the hardening branch run, not `main`. Passing release output from `main` is still required after merge.

**Issue #55 run (full Labs 1–4 suite, feature/lab4-e2e).** All suites green; raw output in
`artifacts/lab-04/test-output/`:

- Server unit/API (`cd server && npm test`): **540 passed** (22 files) — satisfies **REG-L4-01**.
- Migration (`npm run test:migration`): **46 passed** (2 files).
- Client (`cd client && npm test`): **126 passed** (20 files).
- E2E (`npm run e2e`): **36 passed** — Lab 4 **E2E-L4-01…04**, the dashboard loading/error screenshot
  captures, the Lab 1–3 regression specs and smoke.

**Hardening #57** completes UNIT-L4-04 with explicit Bangkok midnight, year rollover and leap-year
boundaries. Final results for this branch and verification limitations are recorded in
`artifacts/lab-04/hardening.md`; release/main results remain pending peer review and release.

(Client test path: the planned `client/src/**/__tests__/*.test.tsx` paths were normalized to the
repository's established `client/tests/lab-04/*.test.tsx` convention — the Vitest config only includes
`tests/**/*.test.tsx`, and every Lab 1–3 client suite already lives under `client/tests/lab-0N/`. The
UI-L4-08/09 **TicketWorkflow** tests drive the status control through `StaffTicketDetail`, where it lives,
rather than a standalone component — no GitHub Issue owned this UI, so it was built under #54.)


## 5. Final hardening branch run (#56/#57)

2026-11-01 (Asia/Bangkok), Node 24.22.1. Server **544 passed**; migration **46 passed**;
client **127 passed**; client build/lint and server build pass. Logs and step exit codes:
`artifacts/lab-04/test-output/hardening-results.json`.

E2E was invoked **once**: **3 passed / 33 failed at browser launch**, because macOS denied Chromium's
MachPortRendezvous bootstrap registration. The Final column marks browser-dependent E2E rows
**Blocked**, not Pass. Prior Issue #55 green output above is historical and does not certify this branch.
RESP-L4-01 only validates component structure; browser overflow checks and fresh screenshots were blocked.
Review `artifacts/lab-04/hardening.md` for the exact error and remaining security limitations.
Release/main validation and manual visual verification remain outstanding.
