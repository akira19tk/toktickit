# Lab 3 Test Plan and Results — Users, Roles, IT Staff Ticketing, and Admin

## 1. Test Strategy

This plan is written from `specification.md` **before** implementation (Test DD). Tests are then driven red → green per Issue (TDD). It covers unit, API/integration, UI component, UI style, responsive, security/authorization, migration/regression and end-to-end levels. Every Acceptance Criterion (AC-01–AC-84) maps to at least one test below; planned totals — 122 tests (Unit: 7, API: 70, UI: 28, Migration: 4, Responsive: 5, UI Style: 1, E2E: 7).

**Naming rule (traceability).** Every automated test title starts with its Test ID, for example `it("API-08: GET /auth/me returns identity or 401", …)`. This lets the Status column be verified mechanically from test output.

**Status rule.** The Status column stays `Planned` until the test has actually run green on `main`. It is changed to `Pass` only from real test output, never from an agent's claim. A test that is not implemented, skipped or failing must not be marked Pass.

**Test database.** Automated tests never use the development database. They run against `toktickit_test` (`TEST_DATABASE_URL`), recreated by `npm run test:db:setup`, which refuses to run unless the name ends in `_test` and differs from `DATABASE_URL`. Each API test file creates exactly the users it needs (for example the exact number of Administrators for LAST_ADMIN) and does not rely on seeded passwords. Migration tests (MIG-01–MIG-04) run through `npm run test:migration` on `toktickit_migration_test`: Lab 2 migrations and a small Lab 2 fixture are applied first, a snapshot is recorded, then the Lab 3 migration and seed run and the data is compared.

**Shared password vectors.** `shared/password-vectors.json` (repository root) lists passwords with the expected result and reason (length, 72-byte boundary in ASCII and Thai, missing letter, missing digit). UNIT-01, API-12 and API-58 on the server and UI-05 on the client all read this one file, so the client-side check cannot drift from the API. (If the client's Vite config blocks files outside its root, add `server.fs.allow` for `shared/`.)

**Sequential server tests.** Server test files run one after another (`fileParallelism: false`) because they share and empty `toktickit_test`; the test database holds no seeded users.

**Concurrency.** API-64 and API-65 fire simultaneous requests (`Promise.all`) to prove the claim and last-Administrator rules are atomic.

**Authorization coverage.** API-16–API-22 are table-driven across every protected route in the authorization matrix (`specification.md` §5.8), so a newly added endpoint without a guard fails the suite.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Status |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-15 | Password policy validator using shared/password-vectors.json: min length, 72-byte limit (ASCII and Thai), letter+digit | Every vector classified as the file says; 72 bytes accepted, 73 rejected; 25 Thai characters rejected | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-02 | Unit | AC-08 | Email normalizer (trim, lowercase, format) | Normalized output; invalid formats rejected | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-03 | Unit | AC-46, AC-48, AC-49, AC-51 | Status transition matrix function | Allowed and blocked pairs match the matrix, terminal states have no exits | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-04 | Unit | AC-13 | Session token generator and SHA-256 hasher | Token is long and random; only the hash is persistable | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-05 | Unit | AC-07 | Login throttle logic | Counts per normalized email (known or unknown); locks 15 min after the 5th failure; resets on success | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-06 | Unit | AC-39 | Queue query-parameter parser (incl. `requesterResolved` flag) | Non-integer, <1, pageSize>50 and unsupported sort values fall back to defaults; `requesterResolved=true` parsed, any other value ignored | server/tests/lab-03/lib.unit.test.ts | Pass |
| UNIT-07 | Unit | AC-13 | Password hash/verify wrapper | Hash differs from plaintext; verify true/false correctly | server/tests/lab-03/lib.unit.test.ts | Pass |
| API-01 | API | AC-01 | Valid login | 200, identity returned, no hash; cookie HttpOnly, SameSite=Lax, Path=/, ~8h expiry, Secure only in production config | server/tests/lab-03/auth.api.test.ts | Pass |
| API-02 | API | AC-08 | Login with mixed-case, padded email | 200, same user | server/tests/lab-03/auth.api.test.ts | Pass |
| API-03 | API | AC-05 | Unknown email vs wrong password | Both 401 with identical body, no cookie | server/tests/lab-03/auth.api.test.ts | Pass |
| API-04 | API | AC-06 | Inactive account login | 403 ACCOUNT_INACTIVE with right password, 401 with wrong password | server/tests/lab-03/auth.api.test.ts | Pass |
| API-05 | API | AC-07 | Six failed logins in a row (existing and unknown email) | 6th attempt 429 even with correct password; lock lasts 15 minutes; unknown email behaves the same | server/tests/lab-03/auth.api.test.ts | Pass |
| API-06 | API | AC-09 | With a valid session, state-changing request without X-Requested-With (and login without it) | 403 CSRF_REJECTED and data unchanged; same request with the header succeeds | server/tests/lab-03/auth.api.test.ts | Pass |
| API-07 | API | AC-10 | Logout then reuse old cookie | 204; Set-Cookie expires the cookie; session row gone; later /auth/me returns 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-08 | API | AC-11 | GET /auth/me with and without session | 200 identity / 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-09 | API | AC-12 | Expired session | 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-10 | API | AC-13 | Scan responses and DB for secrets | No password/hash in any response; stored hash is bcrypt | server/tests/lab-03/auth.api.test.ts | Pass |
| API-11 | API | AC-14 | CORS from allowed and foreign origin | Allowed origin echoed with credentials; foreign gets none | server/tests/lab-03/auth.api.test.ts | Pass |
| API-12 | API | AC-15 | Change password with invalid new password / mismatch (cases from shared/password-vectors.json) | 400 field errors, unchanged | server/tests/lab-03/auth.api.test.ts | Pass |
| API-13 | API | AC-16 | Change password with wrong current password | 400 error on currentPassword | server/tests/lab-03/auth.api.test.ts | Pass |
| API-14 | API | AC-17 | Successful password change | Flag cleared, other sessions revoked, current kept, old password fails, new password works | server/tests/lab-03/auth.api.test.ts | Pass |
| API-15 | API | AC-02 | mustChangePassword user calls protected endpoints | 403 PASSWORD_CHANGE_REQUIRED except me/logout/change-password | server/tests/lab-03/auth.api.test.ts | Pass |
| API-16 | API | AC-18 | Every protected endpoint without session (table-driven) | 401 for all | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-17 | API | AC-19 | Requester calls /api/staff/* and /api/admin/* | 403, no resource info | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-18 | API | AC-20 | IT Staff and Admin call Requester endpoints | 403 | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-19 | API | AC-21 | Requester and IT Staff call /api/admin/* | 403, no user data | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-20 | API | AC-22 | Requester B reads A's Ticket and Attachment | 404 | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-21 | API | AC-23 | User deactivated mid-session | Next request 401, sessions deleted | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-22 | API | AC-03, AC-24 | Spoofed requesterId / x-requester-id; /api/dev-requesters | Session identity wins; dev-requesters 404 | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-23 | API | AC-25 | Create Ticket as authenticated Requester | 201; requesterId = session user, NEW, owner null, itPriority = requested | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| API-24 | API | AC-26 | My Tickets list, search, filter, sort, paging | Only own Tickets; Lab 2 behavior unchanged | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| API-25 | API | AC-27 | Attachment add/download/soft-remove on own and foreign Ticket | Own succeeds; foreign 404 | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| API-26 | API | AC-29 | Requester posts and reads Public Comment | 201; author and createdAt set; chronological list | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-27 | API | AC-30 | Comment validation and plain-text storage | 400 on empty/whitespace/2001 chars; <script> stored as text | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-28 | API | AC-31 | Requester comments on non-owned Ticket | 404 on read and post | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-29 | API | AC-32 | Problem Appears Resolved on allowed statuses | 200; status unchanged; repeat idempotent | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-30 | API | AC-33 | Requester tries to change status | 403; status unchanged | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-31 | API | AC-34 | Problem Appears Resolved on NEW/RESOLVED/CLOSED/CANCELLED | 409 INVALID_STATE | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-32 | API | AC-35 | Comment/note on CLOSED and CANCELLED Ticket | 409 TICKET_CLOSED | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-33 | API | AC-04 | Requester calls Internal Note endpoints | 403, no note data | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-34 | API | AC-53 | Requester Ticket Detail and comments payloads | No note content or count anywhere | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-35 | API | AC-52 | IT Staff posts Public Comment and Internal Note | Each stored and listed only in its own list | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-36 | API | AC-54 | Administrator reads queue, detail, comments, notes; attempts writes | Reads 200 with empty allowedTransitions; claim, status, owner, priority, comment, note all 403 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-37 | API | AC-30 | Internal Note validation | 400 on empty/whitespace/2001 chars | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-38 | API | AC-36 | Default queue | Active only; IT Priority desc then oldest; pagination + counts | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-39 | API | AC-37 | Queue search by number, summary, requester name | Matching rows only | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-40 | API | AC-38 | Queue filters combined; status=ALL; owner=ME/UNASSIGNED; requesterResolved | AND logic; closed shown with ALL; `requesterResolved=true` returns only active Requester-indicated-resolved Tickets, ANDed with other filters | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-41 | API | AC-39 | Queue sort fields and invalid params | Ordered correctly; invalid values fall back, 200 | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-42 | API | AC-41 | Queue row fields | Owner name or null, badges data, requesterResolvedAt marker | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-43 | API | AC-42 | Claim unassigned NEW Ticket | Owner = caller; status OPEN atomically | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-44 | API | AC-43 | Claim an owned Ticket | 409 ALREADY_OWNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-45 | API | AC-44, AC-78 | Reassign to active staff / inactive / requester / unknown; Ticket whose owner was deactivated | 200 for active staff and for a Ticket with a deactivated owner; 400 otherwise | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-46 | API | AC-45 | Change IT Priority | Saved; Requested Priority unchanged; invalid 400; Requester 403 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-47 | API | AC-46 | Allowed status transitions | 200 and new status | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-48 | API | AC-46 | Disallowed status transitions | 409 INVALID_TRANSITION | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-49 | API | AC-47 | Resolve with and without summary | 400 without; 200 with; resolvedAt set; Requester indicator cleared; Requester sees summary | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-50 | API | AC-48 | Close/cancel with and without confirm | 400 without confirm; CLOSED only from RESOLVED and sets closedAt; CANCELLED leaves closedAt null | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-51 | API | AC-49 | Reopen from RESOLVED and CLOSED | REOPENED; dates and indicator cleared | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-52 | API | AC-50 | Status change on unassigned Ticket | 409 TICKET_UNASSIGNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-53 | API | AC-51 | Owner and IT Priority changes on CLOSED/CANCELLED; status changes from CLOSED and CANCELLED | Owner/priority: 409 TICKET_CLOSED. CLOSED → REOPENED: 200. Any status change from CANCELLED: 409 INVALID_TRANSITION | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-54 | API | AC-55 | Staff downloads active and removed Attachment; tries to upload and to remove | File / 410 / upload and remove rejected | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-55 | API | AC-58 | Admin lists, searches and filters users | Correct rows; no password data | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-56 | API | AC-59 | Admin creates user; new user logs in | 201; mustChangePassword true; first login gated | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-57 | API | AC-60 | Duplicate email (different case) on create and edit | 409 EMAIL_TAKEN | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-58 | API | AC-61 | Invalid name, email, role; weak initial password on create and on set-initial-password; weak password shapes from shared vectors | 400 field errors, nothing saved; no current-password/confirmation errors for Admin-set passwords | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-59 | API | AC-62 | Edit name, email, role, activation | Saved and listed | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-60 | API | AC-63 | Admin deactivates self | 409 SELF_DEACTIVATION | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-61 | API | AC-64 | Deactivate/demote the last active Admin vs with a second Admin (empty test DB; the test creates the Admins it needs, no seeded admin exists) | 409 LAST_ADMIN / 200 | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-62 | API | AC-65 | Set initial password for another user and for self | Sessions revoked, old password fails, new works then forces change; self 409 | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-63 | API | AC-66 | DELETE /api/admin/users/:id | 404 or 405 | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-64 | API | AC-79 | Two simultaneous claims on one unassigned Ticket (Promise.all) | Exactly one 200 and one 409 ALREADY_OWNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-65 | API | AC-80 | Two Admins demote/deactivate each other simultaneously | At least one active Admin remains | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-66 | API | AC-81 | Ticket creation and user edit with extra privileged fields | Extra fields ignored; defaults and allowed fields only | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-67 | API | AC-82 | Same-value status, owner, priority; invalid transition body | 409 NO_CHANGE; INVALID_TRANSITION lists allowed targets | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-68 | API | AC-83 | Change a logged-in user's role | Next request uses the new role's permissions | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-69 | API | AC-84 | Status change on an unassigned CANCELLED Ticket | INVALID_TRANSITION, not TICKET_UNASSIGNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-70 | API | AC-07 | Five wrong current passwords on change-password | 6th attempt 429 TOO_MANY_ATTEMPTS | server/tests/lab-03/auth.api.test.ts | Pass |
| UI-28 | UI | AC-72 | Unknown URL | Not Found page with a button to the user's home | client/tests/lab-03/RouteGuard.test.tsx | Pass |
| MIG-01 | Migration | AC-68 | Compare post-migration data with the Lab 2 fixture snapshot | Ticket, Attachment, Category, Related System counts and requesterId map identical | server/tests/lab-03/migration-seed.test.ts | Pass |
| MIG-02 | Migration | AC-69 | Migrated requester login before and after seed | Before: 401; after: login works, mustChangePassword true | server/tests/lab-03/migration-seed.test.ts | Pass |
| MIG-03 | Migration | AC-70 | Backfill of itPriority and owner | itPriority = requestedPriority; owner null | server/tests/lab-03/migration-seed.test.ts | Pass |
| MIG-04 | Migration | AC-71 | Run seed twice; inspect data | Counts stable, no duplicates, passwords not reset, required data present | server/tests/lab-03/migration-seed.test.ts | Pass |
| UI-01 | UI | AC-76 | Login validation messages | Messages under fields, no API call | client/tests/lab-03/Login.test.tsx | Pass |
| UI-02 | UI | AC-76 | Login busy state and backend-down failure | Button busy; safe message; email retained | client/tests/lab-03/Login.test.tsx | Pass |
| UI-03 | UI | AC-72 | Login success redirects by role | Requester, IT Staff, Admin go to their home | client/tests/lab-03/Login.test.tsx | Pass |
| UI-04 | UI | AC-06 | Inactive account response | Inactive message without extra account details | client/tests/lab-03/Login.test.tsx | Pass |
| UI-05 | UI | AC-15, AC-77 | Change Password rules and mismatch; client validator run against the same shared/password-vectors.json | Rules shown; mismatch flagged; client and server agree on every vector including 72/73 bytes and Thai | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-06 | UI | AC-17, AC-77 | Change Password success | Continues to role home | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-07 | UI | AC-02 | Forced change gating | Any route redirects to Change Password | client/tests/lab-03/RouteGuard.test.tsx | Pass |
| UI-08 | UI | AC-28, AC-72 | App shell | Name, role badge, Logout; only role-permitted nav | client/tests/lab-03/AppShell.test.tsx | Pass |
| UI-09 | UI | AC-72 | Route guard | Unauthenticated to Login; wrong role to Forbidden | client/tests/lab-03/RouteGuard.test.tsx | Pass |
| UI-10 | UI | AC-73 | 401 during use | Back to Login with session-ended message | client/tests/lab-03/RouteGuard.test.tsx | Pass |
| UI-11 | UI | AC-28 | No Development Requester selector anywhere | Selector and Change Requester absent; legacy requester key removed from sessionStorage at startup | client/tests/lab-03/AppShell.test.tsx | Pass |
| UI-12 | UI | AC-41, AC-78 | Staff queue rows | Owner/Unassigned/(inactive), badges, resolved marker, open action | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-13 | UI | AC-36, AC-37, AC-38, AC-39 | Queue search, filters, sort, pagination, requesterResolved chip | Correct query parameters sent, incl. `requesterResolved=true` when the chip is on and cleared when toggled off | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-14 | UI | AC-40 | Queue empty, no-results, failure, forbidden | Four distinct states | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-15 | UI | AC-42, AC-45, AC-46, AC-78 | Staff detail controls | Claim, reassign, priority, status work with busy state; inactive-owner marker shown | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-16 | UI | AC-47, AC-48 | Resolve and close/cancel flows | Summary required; confirmation dialog required | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-17 | UI | AC-56, AC-30 | Public vs Internal separation | Separate panels, labels, helper text, button wording; <script> in a note renders as text | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-18 | UI | AC-57 | Staff detail error feedback | Not-found, forbidden, conflict, failure; input retained | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-19 | UI | AC-29, AC-32, AC-34, AC-30 | Requester detail comments and resolved action | Composer works; <script> renders as text; button enabled only in allowed statuses | client/tests/lab-03/RequesterTicketDetail.test.tsx | Pass |
| UI-20 | UI | AC-53 | Requester detail has no notes | No note UI or text | client/tests/lab-03/RequesterTicketDetail.test.tsx | Pass |
| UI-21 | UI | AC-58 | User list, search, role filter | Columns, results correct | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-22 | UI | AC-60, AC-61 | Create/Edit user validation and duplicate email | Field errors shown | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-23 | UI | AC-63, AC-64 | Self-deactivation and last-admin errors | Clear conflict messages | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-24 | UI | AC-65 | Set initial password dialog | Confirmation and success message | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-25 | UI | AC-67 | User Management feedback states | Success, forbidden, failure | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-26 | UI | AC-75 | Keyboard and a11y on Login, Change Password, dialogs | Labels, focus ring, aria-live, focus trap, Esc | client/tests/lab-03/A11y.test.tsx | Pass |
| UI-27 | UI | AC-30 | Comment/note composer validation | Empty/whitespace blocked; counter at limit | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| RESP-01 | Responsive | AC-74 | Login and Change Password at 375/850/1440 | No overflow or clipping | e2e/lab-03/responsive.spec.ts | Pass |
| RESP-02 | Responsive | AC-74 | Requester screens at three viewports | Layout rules from ui-spec hold | e2e/lab-03/responsive.spec.ts | Pass |
| RESP-03 | Responsive | AC-74 | Staff queue at three viewports | Table becomes cards on mobile | e2e/lab-03/responsive.spec.ts | Pass |
| RESP-04 | Responsive | AC-74 | Staff detail at three viewports | Panels/tabs stack; no overflow | e2e/lab-03/responsive.spec.ts | Pass |
| RESP-05 | Responsive | AC-74 | User Management at three viewports | Table becomes cards; dialog fits screen | e2e/lab-03/responsive.spec.ts | Pass |
| STYLE-01 | UI Style | AC-74 | Badge classes and colors for status, priority, role | Same value renders the same style on every screen | e2e/lab-03/responsive.spec.ts | Pass |
| E2E-01 | E2E | AC-02, AC-17, AC-77 | First login with initial password, forced change | App opens only after valid change | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-02 | E2E | AC-05, AC-10, AC-73 | Login failures, logout, Back button and direct URL | Protected data unreachable after logout | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-03 | E2E | AC-25, AC-29, AC-32 | Requester logs in, creates Ticket, comments, marks resolved | Flow completes with authenticated identity | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| E2E-04 | E2E | AC-42, AC-45, AC-46, AC-52, AC-53 | IT Staff claims, prioritizes, progresses Ticket, adds comment and note | Requester sees the comment but not the note | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| E2E-05 | E2E | AC-59, AC-60, AC-62, AC-65 | Admin creates/edits users, duplicate email, sets initial password | New user completes first login | e2e/lab-03/user-administration.spec.ts | Pass |
| E2E-06 | E2E | AC-19, AC-21, AC-63, AC-64, AC-67 | Admin safety rules and non-admin forbidden | Rules enforced; Forbidden page shown | e2e/lab-03/user-administration.spec.ts | Pass |
| E2E-07 | E2E | AC-72 | Role redirects and Forbidden page | Each role lands correctly; wrong URLs blocked | e2e/lab-03/authentication.spec.ts | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01 |
| AC-02 | API-15, UI-07, E2E-01 |
| AC-03 | API-22 |
| AC-04 | API-33 |
| AC-05 | API-03, E2E-02 |
| AC-06 | API-04, UI-04 |
| AC-07 | UNIT-05, API-05, API-70 |
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
| AC-30 | API-27, API-37, UI-17, UI-19, UI-27 |
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
| AC-72 | UI-28, UI-03, UI-08, UI-09, E2E-07 |
| AC-73 | UI-10, E2E-02 |
| AC-74 | RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, STYLE-01 |
| AC-75 | UI-26 |
| AC-76 | UI-01, UI-02 |
| AC-77 | UI-05, UI-06, E2E-01 |
| AC-78 | API-45, UI-12, UI-15 |
| AC-79 | API-64 |
| AC-80 | API-65 |
| AC-81 | API-66 |
| AC-82 | API-67 |
| AC-83 | API-68 |
| AC-84 | API-69 |

## 4. Responsive and Visual Checklist

A checked box means at least one automated test — client unit
(`client/tests/lab-03/`), server API (`server/tests/lab-03/`) or Playwright E2E
(`e2e/lab-03/`) — asserts the item; the Test ID(s), the kind (**unit**/**E2E**)
and the scope follow. Items left unchecked are asserted by **no** test and need a
manual visual check.

- [x] Login and Change Password: no horizontal overflow at 375, 850 and 1440 px — **RESP-01 (E2E)** (clipping itself is not asserted).
- [x] Requester screens correct after the shell change — **RESP-02 (E2E)**: no overflow at all three widths, My Tickets becomes cards on mobile, Create Ticket shows the Submit button.
- [x] Staff queue: table on desktop, cards on mobile; filters usable — **RESP-03 (E2E)**: no overflow, `.mt-table-wrap`/`.mt-cards` swap at <768 px, Search tickets box visible; **UI-13 (unit)**: search, filters, sort and pagination send the correct query parameters. The mobile Filters-button collapse itself is **not asserted**.
- [x] Staff Ticket Detail: Public Comments and Internal Notes visibly different at every size — **UI-17 (unit)**: separate panels, distinct labels and button wording; **E2E-04 (E2E)**: role-based content separation; **RESP-04 (E2E)**: panels/tabs present with no overflow at each size.
- [x] User Management: table becomes cards; dialogs fit the screen — **RESP-05 (E2E)**: card swap on mobile and the Create User dialog stays within the viewport at all three widths.
- [x] Role, status and priority badges identical for the same value — **STYLE-01 (E2E)** (Open status, High priority, IT Staff role across queue/detail/shell/Users table); **UI-12 (Badges, unit)** (each value renders its fixed label and distinct style).
- [x] Dialogs trap focus; Escape returns focus — **UI-26 (unit)** (Tab/Shift+Tab focus trap, Escape closes and restores focus). The *visible* focus ring on every control is **not asserted by any test** (manual check).
- [x] Forbidden and Not Found pages checked — **E2E-06/E2E-07 (E2E)** (Forbidden) and **E2E-07 (E2E)** (Not Found); also **UI-09 (unit)** (wrong role → Forbidden) and **UI-28 (unit)** (unknown URL → Not Found).

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

# Test database and migration tests
cd server
npm run test:db:setup
npm run test:migration
```

## 6. Final Results

Run on commit `d2364771cd38309212d17592d186b617a5f0a8d6` (from
`artifacts/lab-03/test-output/commit.txt`; branch `docs/lab3-final`, cut from
`main` after the Lab 3 release, PR #44), 2026-10-06.

### Output files

All captured under `artifacts/lab-03/test-output/`:

| File | Command | Counts |
|---|---|---|
| `server.txt` | `cd server && npm run build && npm test` | 16 test files passed, 382 tests passed |
| `client.txt` | `cd client && npm run build && npm test` | 15 test files passed, 90 tests passed |
| `e2e.txt` | `npm run e2e` | 15 passed (13 Lab 3 specs + 2 smoke) |
| `server-verbose.txt` | `cd server && npx vitest run --reporter=verbose` | 16 test files passed, 382 tests passed |
| `client-verbose.txt` | `cd client && npx vitest run --reporter=verbose` | 15 test files passed, 90 tests passed |
| `migration.txt` | `cd server && npm run test:migration` | 1 test file passed, 20 tests passed |
| `migration-verbose.txt` | `cd server && npx vitest run --config vitest.migration.config.ts --reporter=verbose` | 1 test file passed, 20 tests passed (MIG-01..04 titles printed) |
| `commit.txt` | `git rev-parse HEAD` | `d2364771cd38309212d17592d186b617a5f0a8d6` |

The first verbose server run on this commit had 2 transient failures in authorization.api.test.ts (API-17 ECONNRESET, API-18 404 instead of 403). Both passed on the immediate rerun recorded here. Details are tracked in #41.

### Status marking

A row is marked **Pass** only where its Test ID appears at the start of an
individually printed, passing test-title line in the files above. The
`-verbose.txt` runs print every title, so all UNIT, API and UI IDs are cited from
them, the MIG-01..04 IDs from `migration-verbose.txt`, and the E2E / RESP / STYLE
IDs from `e2e.txt`. **All 122 IDs are Pass.**

## 7. Known Limitations or Deferred Tests

- The login throttle is in memory and resets when the server restarts (BR-08); persistence is not tested.
- Cross-browser testing is limited to Chromium (Playwright default).
- Load and performance testing is out of scope.
- Add here any planned test that could not be completed, with the reason.
