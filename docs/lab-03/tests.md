# Lab 3 Test Plan and Results — Users, Roles, IT Staff Ticketing, and Admin

## 1. Test Strategy

This plan is written from `specification.md` **before** implementation (Test DD). Tests are then driven red → green per Issue (TDD). It covers unit, API/integration, UI component, UI style, responsive, security/authorization, migration/regression and end-to-end levels. Every Acceptance Criterion (AC-01–AC-78) maps to at least one test below; planned totals — 114 tests (Unit: 7, API: 63, Migration: 4, UI: 27, Responsive: 5, UI Style: 1, E2E: 7).

**Naming rule (traceability).** Every automated test title starts with its Test ID, for example `it("API-08: GET /auth/me returns identity or 401", …)`. This lets the Status column be verified mechanically from test output.

**Status rule.** The Status column stays `Planned` until the test has actually run green on `main`. It is changed to `Pass` only from real test output, never from an agent's claim. A test that is not implemented, skipped or failing must not be marked Pass.

**Fixtures.** Tests create their own users with `test-…@example.com` addresses and remove them afterward; they do not depend on seeded passwords, which users may have changed. The migration test compares the database with `server/tests/lab-03/fixtures/lab2-snapshot.json`, captured before the migration is applied.

**Authorization coverage.** API-16–API-22 are table-driven across every protected route in the authorization matrix (`specification.md` §5.8), so a newly added endpoint without a guard fails the suite.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Status |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-15 | Password policy validator: length, letter+digit, differs from current, confirmation | Valid/invalid sets classified correctly; 72-char boundary | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-02 | Unit | AC-08 | Email normalizer (trim, lowercase, format) | Normalized output; invalid formats rejected | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-03 | Unit | AC-46, AC-48, AC-49, AC-51 | Status transition matrix function | Allowed and blocked pairs match the matrix, terminal states have no exits | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-04 | Unit | AC-13 | Session token generator and SHA-256 hasher | Token is long and random; only the hash is persistable | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-05 | Unit | AC-07 | Login throttle logic | Blocks after 5 failures, resets after window or success | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-06 | Unit | AC-39 | Queue query-parameter parser | Invalid sort/page/pageSize fall back to defaults | server/tests/lab-03/lib.unit.test.ts | Planned |
| UNIT-07 | Unit | AC-13 | Password hash/verify wrapper | Hash differs from plaintext; verify true/false correctly | server/tests/lab-03/lib.unit.test.ts | Planned |
| API-01 | API | AC-01 | Valid login | 200, user identity returned, HttpOnly cookie set, no hash | server/tests/lab-03/auth.api.test.ts | Planned |
| API-02 | API | AC-08 | Login with mixed-case, padded email | 200, same user | server/tests/lab-03/auth.api.test.ts | Planned |
| API-03 | API | AC-05 | Unknown email vs wrong password | Both 401 with identical body, no cookie | server/tests/lab-03/auth.api.test.ts | Planned |
| API-04 | API | AC-06 | Inactive account login | 403 ACCOUNT_INACTIVE with right password, 401 with wrong password | server/tests/lab-03/auth.api.test.ts | Planned |
| API-05 | API | AC-07 | Six failed logins in a row | 6th attempt 429 even with correct password | server/tests/lab-03/auth.api.test.ts | Planned |
| API-06 | API | AC-09 | State-changing request without X-Requested-With | 403 CSRF_REJECTED, no data change | server/tests/lab-03/auth.api.test.ts | Planned |
| API-07 | API | AC-10 | Logout then reuse old cookie | 204; later /auth/me returns 401 | server/tests/lab-03/auth.api.test.ts | Planned |
| API-08 | API | AC-11 | GET /auth/me with and without session | 200 identity / 401 | server/tests/lab-03/auth.api.test.ts | Planned |
| API-09 | API | AC-12 | Expired session | 401 | server/tests/lab-03/auth.api.test.ts | Planned |
| API-10 | API | AC-13 | Scan responses and DB for secrets | No password/hash in any response; stored hash is bcrypt | server/tests/lab-03/auth.api.test.ts | Planned |
| API-11 | API | AC-14 | CORS from allowed and foreign origin | Allowed origin echoed with credentials; foreign gets none | server/tests/lab-03/auth.api.test.ts | Planned |
| API-12 | API | AC-15 | Change password with invalid new password / mismatch | 400 field errors, unchanged | server/tests/lab-03/auth.api.test.ts | Planned |
| API-13 | API | AC-16 | Change password with wrong current password | 400 error on currentPassword | server/tests/lab-03/auth.api.test.ts | Planned |
| API-14 | API | AC-17 | Successful password change | Flag cleared, other sessions revoked, current kept, old password fails | server/tests/lab-03/auth.api.test.ts | Planned |
| API-15 | API | AC-02 | mustChangePassword user calls protected endpoints | 403 PASSWORD_CHANGE_REQUIRED except me/logout/change-password | server/tests/lab-03/auth.api.test.ts | Planned |
| API-16 | API | AC-18 | Every protected endpoint without session (table-driven) | 401 for all | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-17 | API | AC-19 | Requester calls /api/staff/* and /api/admin/* | 403, no resource info | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-18 | API | AC-20 | IT Staff and Admin call Requester endpoints | 403 | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-19 | API | AC-21 | Requester and IT Staff call /api/admin/* | 403, no user data | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-20 | API | AC-22 | Requester B reads A's Ticket and Attachment | 404 | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-21 | API | AC-23 | User deactivated mid-session | Next request 401, sessions deleted | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-22 | API | AC-03, AC-24 | Spoofed requesterId / x-requester-id; /api/dev-requesters | Session identity wins; dev-requesters 404 | server/tests/lab-03/authorization.api.test.ts | Planned |
| API-23 | API | AC-25 | Create Ticket as authenticated Requester | 201; requesterId = session user, NEW, owner null, itPriority = requested | server/tests/lab-03/requester-regression.api.test.ts | Planned |
| API-24 | API | AC-26 | My Tickets list, search, filter, sort, paging | Only own Tickets; Lab 2 behavior unchanged | server/tests/lab-03/requester-regression.api.test.ts | Planned |
| API-25 | API | AC-27 | Attachment add/download/soft-remove on own and foreign Ticket | Own succeeds; foreign 404 | server/tests/lab-03/requester-regression.api.test.ts | Planned |
| API-26 | API | AC-29 | Requester posts and reads Public Comment | 201; author and createdAt set; chronological list | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-27 | API | AC-30 | Comment validation and plain-text storage | 400 on empty/whitespace/2001 chars; <script> stored as text | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-28 | API | AC-31 | Requester comments on non-owned Ticket | 404 on read and post | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-29 | API | AC-32 | Problem Appears Resolved on allowed statuses | 200; status unchanged; repeat idempotent | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-30 | API | AC-33 | Requester tries to change status | 403; status unchanged | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-31 | API | AC-34 | Problem Appears Resolved on NEW/RESOLVED/CLOSED/CANCELLED | 409 INVALID_STATE | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-32 | API | AC-35 | Comment/note on CLOSED and CANCELLED Ticket | 409 TICKET_CLOSED | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-33 | API | AC-04 | Requester calls Internal Note endpoints | 403, no note data | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-34 | API | AC-53 | Requester Ticket Detail and comments payloads | No note content or count anywhere | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-35 | API | AC-52 | IT Staff posts Public Comment and Internal Note | Each stored and listed only in its own list | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-36 | API | AC-54 | Administrator reads and attempts writes | Read 200; all writes 403 | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-37 | API | AC-30 | Internal Note validation | 400 on empty/whitespace/2001 chars | server/tests/lab-03/comments-notes.api.test.ts | Planned |
| API-38 | API | AC-36 | Default queue | Active only; IT Priority desc then oldest; pagination + counts | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-39 | API | AC-37 | Queue search by number, summary, requester name | Matching rows only | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-40 | API | AC-38 | Queue filters combined; status=ALL; owner=ME/UNASSIGNED | AND logic; closed shown with ALL | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-41 | API | AC-39 | Queue sort fields and invalid params | Ordered correctly; invalid values fall back, 200 | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-42 | API | AC-41 | Queue row fields | Owner name or null, badges data, requesterResolvedAt marker | server/tests/lab-03/staff-queue.api.test.ts | Planned |
| API-43 | API | AC-42 | Claim unassigned NEW Ticket | Owner = caller; status OPEN atomically | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-44 | API | AC-43 | Claim an owned Ticket | 409 ALREADY_OWNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-45 | API | AC-44, AC-78 | Reassign to active staff / inactive / requester / unknown; Ticket whose owner was deactivated | 200 for active staff and for a Ticket with a deactivated owner; 400 otherwise | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-46 | API | AC-45 | Change IT Priority | Saved; Requested Priority unchanged; invalid 400; Requester 403 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-47 | API | AC-46 | Allowed status transitions | 200 and new status | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-48 | API | AC-46 | Disallowed status transitions | 409 INVALID_TRANSITION | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-49 | API | AC-47 | Resolve with and without summary | 400 without; 200 with; Requester sees summary | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-50 | API | AC-48 | Close/cancel with and without confirm | 400 without confirm; CLOSED only from RESOLVED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-51 | API | AC-49 | Reopen from RESOLVED and CLOSED | REOPENED; dates and indicator cleared | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-52 | API | AC-50 | Status change on unassigned Ticket | 409 TICKET_UNASSIGNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-53 | API | AC-51 | Owner/priority/status changes on CLOSED and CANCELLED | 409 TICKET_CLOSED; CANCELLED has no exits | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-54 | API | AC-55 | Staff downloads active and removed Attachment; upload attempt | File / 410 / upload rejected | server/tests/lab-03/staff-ticket-detail.api.test.ts | Planned |
| API-55 | API | AC-58 | Admin lists, searches and filters users | Correct rows; no password data | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-56 | API | AC-59 | Admin creates user; new user logs in | 201; mustChangePassword true; first login gated | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-57 | API | AC-60 | Duplicate email (different case) on create and edit | 409 EMAIL_TAKEN | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-58 | API | AC-61 | Invalid name, email, role, weak password | 400 field errors | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-59 | API | AC-62 | Edit name, email, role, activation | Saved and listed | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-60 | API | AC-63 | Admin deactivates self | 409 SELF_DEACTIVATION | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-61 | API | AC-64 | Deactivate/demote last active Admin vs with a second Admin | 409 LAST_ADMIN / 200 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-62 | API | AC-65 | Set initial password for another user and for self | Sessions revoked, forced change; self 409 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| API-63 | API | AC-66 | DELETE /api/admin/users/:id | 404 or 405 | server/tests/lab-03/users-admin.api.test.ts | Planned |
| MIG-01 | Migration | AC-68 | Compare post-migration data with pre-migration snapshot | Ticket/Attachment counts and requesterId map identical | server/tests/lab-03/migration-seed.test.ts | Planned |
| MIG-02 | Migration | AC-69 | Migrated requester login before and after seed | Before: 401; after: login works, mustChangePassword true | server/tests/lab-03/migration-seed.test.ts | Planned |
| MIG-03 | Migration | AC-70 | Backfill of itPriority and owner | itPriority = requestedPriority; owner null | server/tests/lab-03/migration-seed.test.ts | Planned |
| MIG-04 | Migration | AC-71 | Run seed twice; inspect data | Counts stable, no duplicates, passwords not reset, required data present | server/tests/lab-03/migration-seed.test.ts | Planned |
| UI-01 | UI | AC-76 | Login validation messages | Messages under fields, no API call | client/tests/lab-03/Login.test.tsx | Planned |
| UI-02 | UI | AC-76 | Login busy state and backend-down failure | Button busy; safe message; email retained | client/tests/lab-03/Login.test.tsx | Planned |
| UI-03 | UI | AC-72 | Login success redirects by role | Requester, IT Staff, Admin go to their home | client/tests/lab-03/Login.test.tsx | Planned |
| UI-04 | UI | AC-06 | Inactive account response | Inactive message without extra account details | client/tests/lab-03/Login.test.tsx | Planned |
| UI-05 | UI | AC-15, AC-77 | Change Password rules and mismatch | Rules shown; mismatch flagged | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-06 | UI | AC-17, AC-77 | Change Password success | Continues to role home | client/tests/lab-03/ChangePassword.test.tsx | Planned |
| UI-07 | UI | AC-02 | Forced change gating | Any route redirects to Change Password | client/tests/lab-03/RouteGuard.test.tsx | Planned |
| UI-08 | UI | AC-28, AC-72 | App shell | Name, role badge, Logout; only role-permitted nav | client/tests/lab-03/AppShell.test.tsx | Planned |
| UI-09 | UI | AC-72 | Route guard | Unauthenticated to Login; wrong role to Forbidden | client/tests/lab-03/RouteGuard.test.tsx | Planned |
| UI-10 | UI | AC-73 | 401 during use | Back to Login with session-ended message | client/tests/lab-03/RouteGuard.test.tsx | Planned |
| UI-11 | UI | AC-28 | No Development Requester selector anywhere | Selector and Change Requester absent | client/tests/lab-03/AppShell.test.tsx | Planned |
| UI-12 | UI | AC-41, AC-78 | Staff queue rows | Owner/Unassigned/(inactive), badges, resolved marker, open action | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-13 | UI | AC-36, AC-37, AC-38, AC-39 | Queue search, filters, sort, pagination | Correct query parameters sent | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-14 | UI | AC-40 | Queue empty, no-results, failure, forbidden | Four distinct states | client/tests/lab-03/StaffTicketQueue.test.tsx | Planned |
| UI-15 | UI | AC-42, AC-45, AC-46 | Staff detail controls | Claim, reassign, priority, status work with busy state | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-16 | UI | AC-47, AC-48 | Resolve and close/cancel flows | Summary required; confirmation dialog required | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-17 | UI | AC-56 | Public vs Internal separation | Separate panels, labels, helper text, button wording | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-18 | UI | AC-57 | Staff detail error feedback | Not-found, forbidden, conflict, failure; input retained | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| UI-19 | UI | AC-29, AC-32, AC-34 | Requester detail comments and resolved action | Composer works; button enabled only in allowed statuses | client/tests/lab-03/RequesterTicketDetail.test.tsx | Planned |
| UI-20 | UI | AC-53 | Requester detail has no notes | No note UI or text | client/tests/lab-03/RequesterTicketDetail.test.tsx | Planned |
| UI-21 | UI | AC-58 | User list, search, role filter | Columns, results correct | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-22 | UI | AC-60, AC-61 | Create/Edit user validation and duplicate email | Field errors shown | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-23 | UI | AC-63, AC-64 | Self-deactivation and last-admin errors | Clear conflict messages | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-24 | UI | AC-65 | Set initial password dialog | Confirmation and success message | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-25 | UI | AC-67 | User Management feedback states | Success, forbidden, failure | client/tests/lab-03/UserManagement.test.tsx | Planned |
| UI-26 | UI | AC-75 | Keyboard and a11y on Login, Change Password, dialogs | Labels, focus ring, aria-live, focus trap, Esc | client/tests/lab-03/A11y.test.tsx | Planned |
| UI-27 | UI | AC-30 | Comment/note composer validation | Empty/whitespace blocked; counter at limit | client/tests/lab-03/StaffTicketDetail.test.tsx | Planned |
| RESP-01 | Responsive | AC-74 | Login and Change Password at 375/850/1440 | No overflow or clipping | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-02 | Responsive | AC-74 | Requester screens at three viewports | Layout rules from ui-spec hold | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-03 | Responsive | AC-74 | Staff queue at three viewports | Table becomes cards on mobile | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-04 | Responsive | AC-74 | Staff detail at three viewports | Panels/tabs stack; no overflow | e2e/lab-03/responsive.spec.ts | Planned |
| RESP-05 | Responsive | AC-74 | User Management at three viewports | Table becomes cards; dialog fits screen | e2e/lab-03/responsive.spec.ts | Planned |
| STYLE-01 | UI Style | AC-74 | Badge classes and colors for status, priority, role | Same value renders the same style on every screen | e2e/lab-03/responsive.spec.ts | Planned |
| E2E-01 | E2E | AC-02, AC-17, AC-77 | First login with initial password, forced change | App opens only after valid change | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-02 | E2E | AC-05, AC-10, AC-73 | Login failures, logout, Back button and direct URL | Protected data unreachable after logout | e2e/lab-03/authentication.spec.ts | Planned |
| E2E-03 | E2E | AC-25, AC-29, AC-32 | Requester logs in, creates Ticket, comments, marks resolved | Flow completes with authenticated identity | e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| E2E-04 | E2E | AC-42, AC-45, AC-46, AC-52, AC-53 | IT Staff claims, prioritizes, progresses Ticket, adds comment and note | Requester sees the comment but not the note | e2e/lab-03/staff-ticket-flow.spec.ts | Planned |
| E2E-05 | E2E | AC-59, AC-60, AC-62, AC-65 | Admin creates/edits users, duplicate email, sets initial password | New user completes first login | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-06 | E2E | AC-19, AC-21, AC-63, AC-64, AC-67 | Admin safety rules and non-admin forbidden | Rules enforced; Forbidden page shown | e2e/lab-03/user-administration.spec.ts | Planned |
| E2E-07 | E2E | AC-72 | Role redirects and Forbidden page | Each role lands correctly; wrong URLs blocked | e2e/lab-03/authentication.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01 |
| AC-02 | API-15, UI-07, E2E-01 |
| AC-03 | API-22 |
| AC-04 | API-33 |
| AC-05 | API-03, E2E-02 |
| AC-06 | API-04, UI-04 |
| AC-07 | UNIT-05, API-05 |
| AC-08 | UNIT-02, API-02 |
| AC-09 | API-06 |
| AC-10 | API-07, E2E-02 |
| AC-11 | API-08 |
| AC-12 | API-09 |
| AC-13 | UNIT-04, UNIT-07, API-10 |
| AC-14 | API-11 |
| AC-15 | UNIT-01, API-12, UI-05 |
| AC-16 | API-13 |
| AC-17 | API-14, UI-06, E2E-01 |
| AC-18 | API-16 |
| AC-19 | API-17, E2E-06 |
| AC-20 | API-18 |
| AC-21 | API-19, E2E-06 |
| AC-22 | API-20 |
| AC-23 | API-21 |
| AC-24 | API-22 |
| AC-25 | API-23, E2E-03 |
| AC-26 | API-24 |
| AC-27 | API-25 |
| AC-28 | UI-08, UI-11 |
| AC-29 | API-26, UI-19, E2E-03 |
| AC-30 | API-27, API-37, UI-27 |
| AC-31 | API-28 |
| AC-32 | API-29, UI-19, E2E-03 |
| AC-33 | API-30 |
| AC-34 | API-31, UI-19 |
| AC-35 | API-32 |
| AC-36 | API-38, UI-13 |
| AC-37 | API-39, UI-13 |
| AC-38 | API-40, UI-13 |
| AC-39 | UNIT-06, API-41, UI-13 |
| AC-40 | UI-14 |
| AC-41 | API-42, UI-12 |
| AC-42 | API-43, UI-15, E2E-04 |
| AC-43 | API-44 |
| AC-44 | API-45 |
| AC-45 | API-46, UI-15, E2E-04 |
| AC-46 | UNIT-03, API-47, API-48, UI-15, E2E-04 |
| AC-47 | API-49, UI-16 |
| AC-48 | UNIT-03, API-50, UI-16 |
| AC-49 | UNIT-03, API-51 |
| AC-50 | API-52 |
| AC-51 | UNIT-03, API-53 |
| AC-52 | API-35, E2E-04 |
| AC-53 | API-34, UI-20, E2E-04 |
| AC-54 | API-36 |
| AC-55 | API-54 |
| AC-56 | UI-17 |
| AC-57 | UI-18 |
| AC-58 | API-55, UI-21 |
| AC-59 | API-56, E2E-05 |
| AC-60 | API-57, UI-22, E2E-05 |
| AC-61 | API-58, UI-22 |
| AC-62 | API-59, E2E-05 |
| AC-63 | API-60, UI-23, E2E-06 |
| AC-64 | API-61, UI-23, E2E-06 |
| AC-65 | API-62, UI-24, E2E-05 |
| AC-66 | API-63 |
| AC-67 | UI-25, E2E-06 |
| AC-68 | MIG-01 |
| AC-69 | MIG-02 |
| AC-70 | MIG-03 |
| AC-71 | MIG-04 |
| AC-72 | UI-03, UI-08, UI-09, E2E-07 |
| AC-73 | UI-10, E2E-02 |
| AC-74 | RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, STYLE-01 |
| AC-75 | UI-26 |
| AC-76 | UI-01, UI-02 |
| AC-77 | UI-05, UI-06, E2E-01 |
| AC-78 | API-45, UI-12 |

## 4. Responsive and Visual Checklist

- [ ] Login and Change Password: no clipping or overflow at 375, 850 and 1440 px
- [ ] Requester screens still correct after the shell change
- [ ] Staff queue: table on desktop, cards on mobile; filters usable on mobile
- [ ] Staff Ticket Detail: Public Comments and Internal Notes visibly different at every size
- [ ] User Management: table becomes cards; dialogs fit the screen on mobile
- [ ] Role, status and priority badges identical for the same value everywhere
- [ ] Focus ring visible on every control; dialogs trap focus
- [ ] Forbidden and Not Found pages checked

## 5. Test Commands

```bash
# Server unit + API + security + migration tests
cd server
npm run test

# Client unit + component tests
cd ../client
npm run test

# E2E + responsive + style tests (Playwright; start server and client first)
npx playwright test e2e/lab-03

# Traceability audit (to be added in the Sprint 3 contract Issue):
# fails if a Test ID in this file has no matching test title in the listed file,
# or a file path listed here does not exist
node scripts/audit-tests.mjs docs/lab-03/tests.md
```

## 6. Final Results

_To be completed after implementation: paste the real terminal output from `main`, then change each row's Status from `Planned` to `Pass` only when its Test ID appears in that output as passed. Any test that is not run stays `Planned` and is listed in section 7._

## 7. Known Limitations or Deferred Tests

- The login throttle is in memory and resets when the server restarts (BR-08); persistence is not tested.
- Cross-browser testing is limited to Chromium (Playwright default).
- Load and performance testing is out of scope.
- Add here any planned test that could not be completed, with the reason.
