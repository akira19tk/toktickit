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

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Status |
|---|---|---|---|---|---|---|
| UNIT-L4-01 | Unit | AC-11 | Ticket transition matrix incl. CANCELLED terminal | Allowed/blocked pairs match BR-14 | server/tests/lab-04/lib.unit.test.ts | Planned |
| UNIT-L4-02 | Unit | AC-04, AC-05 | Action lifecycle validator (OPEN→COMPLETED/CANCELLED only; complete needs result) | Legal transitions pass, others rejected | server/tests/lab-04/lib.unit.test.ts | Planned |
| UNIT-L4-03 | Unit | AC-07 | Follow-up note rule (required iff followUpRequired) | Mismatches rejected | server/tests/lab-04/lib.unit.test.ts | Planned |
| UNIT-L4-04 | Unit | AC-26 | Asia/Bangkok "last 7 days" / day-boundary helper | Boundary computed in UTC+7, not UTC | server/tests/lab-04/lib.unit.test.ts | Planned |
| API-L4-01 | API | AC-01 | Create a valid Action | 201; under correct Ticket; performedBy=creator; status OPEN; updatedBy null | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-02 | API | AC-02 | Assign to active vs inactive staff/admin | Active → set; inactive → 422 ASSIGNEE_INACTIVE, unchanged | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-03 | API | AC-03 | Assign to a Requester / unknown id | 422 INVALID_ASSIGNEE | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-04 | API | AC-04 | Complete OPEN with/without result; complete non-OPEN | result→COMPLETED; none→400; non-OPEN→409 INVALID_ACTION_STATE | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-05 | API | AC-05 | Cancel OPEN then repeat | →CANCELLED; second transition 409 INVALID_ACTION_STATE | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-06 | API | AC-06 | Edit a COMPLETED/CANCELLED Action | 400 (read-only history) | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-07 | API | AC-07 | followUpRequired true with empty note; valid note | 400; then success | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-08 | API | AC-14 | Create/edit Action on RESOLVED/CLOSED/CANCELLED Ticket | 409 TICKET_CLOSED | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-09 | API | AC-19 | Multiple Actions list order | Newest-first by createdAt, stable | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-10 | API | AC-22 | Staff B (not author) edits/completes staff A's Action | 200; updatedBy=B; updatedAt refreshed | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-11 | API | AC-13 | Action PATCH with stale expectedUpdatedAt; omitted | 409 STALE_UPDATE; omitted → proceeds | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-12 | API | AC-08 | Requester reads own Ticket Actions; non-owned | 200 all fields newest-first; non-owned 404 | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-13 | API | AC-09 | Requester attempts Action write under /staff/* | 403 | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-14 | API | AC-18 | Admin creates/updates Action | 201/200 (Lab 4 change) | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-15 | API | AC-10 | Resolve with an OPEN Action; then all COMPLETED/CANCELLED; zero-Action Ticket | 409 OPEN_ACTIONS_EXIST; then resolves; zero-Action resolves | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-16 | API | AC-11 | Transition matrix over the API | Allowed succeed; others 409 INVALID_TRANSITION w/ targets | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-17 | API | AC-12 | RESOLVED request violating several rules at once | First applicable error (…→OPEN_ACTIONS_EXIST→400 summary) | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-18 | API | AC-13 | Status PATCH with stale expectedUpdatedAt | 409 STALE_UPDATE | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-19 | API | AC-18 | Admin changes status (allowed); admin claim/owner/priority/comment/note | status 200; others 403 (Lab 3 preserved) | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-20 | API | AC-21 | Double-submitted status transition / Action create | No duplicate, consistent state | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-21 | API | AC-15 | Requester dashboard scope + counts | Only own data; open/inProgress/resolved/closed correct | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| API-L4-22 | API | AC-25 | Waiting for Me metric | Equals count(WAITING_FOR_REQUESTER) for me | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| API-L4-23 | API | AC-26 | Recently Resolved uses Asia/Bangkok boundary | Count flips correctly across UTC+7 midnight | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| API-L4-24 | API | AC-15 | Requester dashboard requested by IT Staff/Admin | 403 | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| API-L4-25 | API | AC-16 | Staff dashboard counts match direct DB queries | new/open/inProgress/waiting/myAssigned/unassigned exact | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| API-L4-26 | API | AC-23 | My Open Actions count | Equals count(assigneeId=me AND status=OPEN) | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| API-L4-27 | API | AC-24 | Urgent list contents/order | Exactly HIGH & not Closed/Cancelled, newest-first, ≤5 | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| API-L4-28 | API | AC-17 | Dashboards with empty scope | Zeros / empty lists, 200 (no 404) | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| API-L4-29 | API | AC-18 | Staff dashboard requested by Requester | 403 | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| API-L4-30 | API | AC-27 | Concurrent resolve + new-Action-create on an all-completed Ticket (Promise.all) | Invariant holds: resolve commits & create 409 TICKET_CLOSED, OR create commits & resolve 409 OPEN_ACTIONS_EXIST; never RESOLVED with an OPEN Action | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| API-L4-31 | API | AC-14 | Create Action on a RESOLVED Ticket; then reopen (→REOPENED) and create | 409 TICKET_CLOSED; after reopen, 201 | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-L4-32 | API | AC-28 | Requester Action read model excludes Internal Notes; non-owned 404; requester hits /notes | Payload has only Action fields (no note content); 404; 403 on /notes | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| UI-L4-01 | UI | AC-16, AC-24 | StaffDashboard renders cards, My Open Actions, urgent list | Values and labels shown; non-color cues | client/src/pages/__tests__/StaffDashboard.test.tsx | Planned |
| UI-L4-02 | UI | AC-17 | StaffDashboard card/row drill-down navigation | Navigates to correct queue/detail route+params | client/src/pages/__tests__/StaffDashboard.test.tsx | Planned |
| UI-L4-03 | UI | AC-15, AC-25 | RequesterDashboard own metrics + Waiting for Me cue | Correct cards; attention cue present | client/src/pages/__tests__/RequesterDashboard.test.tsx | Planned |
| UI-L4-04 | UI | AC-17 | RequesterDashboard drill-down + empty state | Links to /tickets?status=…; empty renders 0/message | client/src/pages/__tests__/RequesterDashboard.test.tsx | Planned |
| UI-L4-05 | UI | AC-01, AC-07 | ActionsTaken create form + follow-up validation | Required errors inline; follow-up note gated | client/src/components/__tests__/ActionsTaken.test.tsx | Planned |
| UI-L4-06 | UI | AC-04, AC-05, AC-06 | ActionsTaken complete/cancel; read-only terminal | Controls show when permitted; terminal read-only | client/src/components/__tests__/ActionsTaken.test.tsx | Planned |
| UI-L4-07 | UI | AC-08 | ActionsTaken read-only for Requester | All fields shown; no create/edit controls | client/src/components/__tests__/ActionsTaken.test.tsx | Planned |
| UI-L4-08 | UI | AC-11, AC-21 | TicketWorkflow shows only permitted transitions; disables on submit | Permitted options only; no double submit | client/src/components/__tests__/TicketWorkflow.test.tsx | Planned |
| UI-L4-09 | UI | AC-10 | TicketWorkflow surfaces OPEN_ACTIONS_EXIST without losing summary | Inline conflict; entered data preserved | client/src/components/__tests__/TicketWorkflow.test.tsx | Planned |
| RESP-L4-01 | Responsive/Style | AC-20 | Dashboards + Actions table reflow (desktop/tablet/mobile) | 2-up/1-up grid; Actions table → stacked cards; no horizontal overflow | client/src/pages/__tests__/StaffDashboard.test.tsx | Planned |
| MIG-L4-01 | Migration | AC-20 | Apply Lab 4 migration on a Lab 3 DB | All Lab 1–3 rows preserved; ActionTaken + enum created | server/tests/lab-04/migration.test.ts | Planned |
| MIG-L4-02 | Migration | AC-10, AC-20 | Legacy Ticket (zero Actions) resolvable after migration | Resolution gate passes; no backfill needed | server/tests/lab-04/migration.test.ts | Planned |
| MIG-L4-03 | Migration | AC-20 | Rollback drops ActionTaken/enum only | Lab 1–3 data intact | server/tests/lab-04/migration.test.ts | Planned |
| MIG-L4-04 | Migration | AC-20 | Seed is idempotent; covers zero/one/multiple Actions and non-zero/zero metrics | Re-run safe; dashboard-demo data present | server/tests/lab-04/migration.test.ts | Planned |
| REG-L4-01 | Regression | AC-20 | Full Lab 1–3 server suites still green | All prior API/unit tests pass | server/tests/lab-01..03/* | Planned |
| E2E-L4-01 | E2E | AC-01,AC-02,AC-04,AC-05,AC-22 | Actions Taken flow: create→assign→complete / cancel, multiple on one Ticket | Visible, persisted, role-restricted | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| E2E-L4-02 | E2E | AC-10, AC-11 | Ticket resolution: blocked by open Action, then resolve, reopen | Gate enforced end-to-end | e2e/lab-04/ticket-resolution.spec.ts | Planned |
| E2E-L4-03 | E2E | AC-15,AC-16,AC-17 | Dashboards: staff + requester metrics and drill-down | Counts match; navigation correct | e2e/lab-04/dashboards.spec.ts | Planned |
| E2E-L4-04 | E2E | AC-20 | Representative Lab 1–3 regression (auth, My Tickets, detail, attachments, comments, notes, admin) | All prior flows pass | e2e/lab-04/dashboards.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-L4-01, UI-L4-05, E2E-L4-01 |
| AC-02 | API-L4-02, E2E-L4-01 |
| AC-03 | API-L4-03 |
| AC-04 | UNIT-L4-02, API-L4-04, UI-L4-06, E2E-L4-01 |
| AC-05 | UNIT-L4-02, API-L4-05, UI-L4-06, E2E-L4-01 |
| AC-06 | API-L4-06, UI-L4-06 |
| AC-07 | UNIT-L4-03, API-L4-07, UI-L4-05 |
| AC-08 | API-L4-12, UI-L4-07 |
| AC-09 | API-L4-13 |
| AC-10 | API-L4-15, MIG-L4-02, UI-L4-09, E2E-L4-02 |
| AC-11 | UNIT-L4-01, API-L4-16, UI-L4-08, E2E-L4-02 |
| AC-12 | API-L4-17 |
| AC-13 | API-L4-11, API-L4-18 |
| AC-14 | API-L4-08, API-L4-31 |
| AC-15 | API-L4-21, API-L4-24, UI-L4-03, E2E-L4-03 |
| AC-16 | API-L4-25, UI-L4-01, E2E-L4-03 |
| AC-17 | API-L4-28, UI-L4-02, UI-L4-04, E2E-L4-03 |
| AC-18 | API-L4-14, API-L4-19, API-L4-29 |
| AC-19 | API-L4-09 |
| AC-20 | MIG-L4-01, MIG-L4-03, MIG-L4-04, REG-L4-01, RESP-L4-01, E2E-L4-04 |
| AC-21 | API-L4-20, UI-L4-08 |
| AC-22 | API-L4-10, E2E-L4-01 |
| AC-23 | API-L4-26 |
| AC-24 | API-L4-27, UI-L4-01 |
| AC-25 | API-L4-22, UI-L4-03 |
| AC-26 | UNIT-L4-04, API-L4-23 |
| AC-27 | API-L4-30 |
| AC-28 | API-L4-32, UI-L4-07 |

## 4. Planned totals

55 tests planned — Unit 4, API 32, UI 9, Responsive/Style 1, Migration 4, Regression 1, E2E 4.
Final per-test status and the full passing output from `main` are recorded here once implemented.
