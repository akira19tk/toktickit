# Lab 4 Peer Review Evidence — Actions Taken, Workflow, Dashboards, Final Regression

This record covers Lab 4 feature PRs into `lab4-staging`, release PR #66 into `main`, and AI-use documentation PR #67 into `main`. Current approval and merge metadata were checked against GitHub on 2026-11-01 (Asia/Bangkok). Historical feedback and responses below are retained; the final status is recorded separately from the earlier review stages.

## Reviewer Information

**Reviewer:** Thannaporn
**GitHub username:** daisysia

---

## Part 1 — Reviews I Received

### PR #47 — docs(lab-04): Sprint 4 engineering contract (Issue #48)
**Link:** https://github.com/akira19tk/toktickit/pull/47
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/47#pullrequestreview-5715139418), 2026-10-30 23:09 ICT, reviewed commit `8f0c17d`.

**Merge:** 2026-10-30 23:10 ICT, merge commit `35f3a9c`.

**Review received:**
> 1. Ensure the resolution gate handles concurrent updates correctly to prevent tickets from being resolved while actions are still open.
> 2. Double-check role-based permissions, especially requester read-only access and internal notes visibility.
> 3. Verify that the test cases cover all acceptance criteria, including error handling and edge cases.
> 4. Clarify the rollback behavior to prevent unintended data loss.

**My responses and fixes:**

1. **Concurrent resolution gate** — `b1e2196`.
   Added **BR-23**: the OPEN-Actions check and the status `UPDATE` run in one *serializable* transaction;
   **BR-10** now also blocks creating/editing an Action on a `RESOLVED` Ticket (not just CLOSED/CANCELLED),
   and Action-create re-checks status inside its own transaction. This makes the invariant *"a
   RESOLVED/CLOSED Ticket has no OPEN Action"* hold under concurrency. Added **AC-27** (concurrent
   resolve + create) and **AC-14** now covers RESOLVED, with tests **API-L4-30** (Promise.all race) and
   **API-L4-31** (create-on-RESOLVED, then reopen).

2. **Role-based permissions / Internal Notes** — `86b06a3`.
   Added an explicit **§8.2 authorization matrix** (Requester own/other, IT_STAFF, ADMIN) and **BR-24**:
   Requesters read only their own Tickets' Actions, read-only, Action fields only — **never** Internal
   Notes (separate `InternalNote` entity, staff-only route); non-owned reads `404`, all writes `403`.
   Added **AC-28** and test **API-L4-32** (payload excludes note content; 404; `/notes` → 403).

3. **Test coverage of ACs + error/edge cases** — `9015ca7`.
   Added an **error-class coverage audit** (400 / 422 / 403 / 404 / 409 stale / 409 closed) and filled the
   gaps: **AC-29/API-L4-33** (404 unknown Ticket/Action) and **AC-30/API-L4-34** (400 field-bound
   validation: description, future `actionDate`, `attachmentNotes`, `followUpNote`). Traceability now maps
   AC-01…AC-30 to ≥1 test each; planned total 57.

4. **Rollback clarity** — `c9c4b19`.
   Made §7.3 explicit: a `pg_dump` **backup-before-migrate** step; numbered down-migration steps
   (`DROP TABLE "ActionTaken"` → only Action rows dropped; `DROP TYPE "ActionStatus"`); and a statement that
   **all Lab 1–3 tables are untouched** (FK columns live only on `ActionTaken`; the relations are
   Prisma-virtual). Verified by **MIG-L4-03**.

**Follow-up Issues opened:** none — all four points resolved within PR #47.

---

### PR #58 — feat(lab-04): Actions Taken DB migration, model, seed (Issue #49)
**Link:** https://github.com/akira19tk/toktickit/pull/58
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/58#pullrequestreview-5716474866), 2026-10-31 00:57 ICT, reviewed commit `e2bc3de`.

**Merge:** 2026-10-31 01:00 ICT, merge commit `f8fd0f4`.

**Review received:**
> 1. Ensure the foreign key constraints and delete restrictions behave correctly, especially for performedBy and assignee.
> 2. Verify that the migration remains safe for existing Lab 1-3 data and that rollback limitations are clearly documented.
> 3. Confirm that the seed remains idempotent across repeated runs and handles partially populated databases correctly.
> 4. Consider investigating the intermittent timeout in the Lab 3 authorization test.

**My responses and fixes:**

1. **FK constraints / delete restrictions** — `f694bda`.
   Added **MIG-L4-05**: with an isolated disposable fixture, deleting a `User`
   referenced by an `ActionTaken` as `performedBy`, `assignee`, or `updatedBy` is rejected
   (all four FKs are `ON DELETE RESTRICT`), and deleting a `Ticket` that still has Actions is
   rejected — each FK exercised independently, then torn down.

2. **Migration safety + rollback limitations** — `7616cbf` (plus existing evidence).
   Lab 1–3 safety is already proven by **MIG-L4-01** (additive migration; all Lab 1–3 row
   counts preserved) and **MIG-L4-03** (rollback drops only `ActionTaken`/`ActionStatus`; all
   Lab 1–3 rows survive), per spec **§7.3**. Made the one data-loss consequence explicit in
   §7.3: rollback **permanently discards all `ActionTaken` rows**; capture them with
   `pg_dump --table=ActionTaken` or restore the pre-migrate `pg_dump` snapshot.

3. **Seed idempotency / partial DB** — `f694bda`.
   Added **MIG-L4-06**: starting from a partially populated DB (one seeded Ticket emptied, the
   rest kept), reseeding refills only the gap, leaves already-populated Tickets untouched,
   creates no duplicates, and remains idempotent on a further run. This is in addition to
   **MIG-L4-04** (re-run safe) and the `ActionTaken`-table-absent guard in the seed.

4. **Intermittent Lab 3 auth-test timeout** — no change in this PR (as scoped).
   This flake is tracked in **#41** and will be fixed in the **#57** final-hardening issue;
   the test passes 52/52 when run in isolation, so it is an environmental bcrypt timeout under
   parallel load, not a logic regression introduced here.

**Follow-up Issues opened:** none — timeout investigation already tracked in #41 (fix in #57).

### PR #59 — feat(lab-04): Actions Taken API + authorization (Issue #50)
**Link:** https://github.com/akira19tk/toktickit/pull/59
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/59#pullrequestreview-5717248914), 2026-10-31 01:55 ICT, reviewed commit `dcb46f8`.

**Merge:** 2026-10-31 01:55 ICT, merge commit `4c4b6e3`.

**Review received:**
> 1. Error handling: Ensure the validation and error response order matches the API specification, especially for invalid action transitions and closed tickets.
> 2. Authorization: Verify that requesters can only access their own tickets and that internal notes or sensitive fields are never exposed.
> 3. Concurrency: Confirm that stale updates and concurrent requests are handled safely to prevent inconsistent action states.
> 4. Test coverage: Ensure edge cases and permission restrictions are covered, particularly for PATCH operations.

**My responses and fixes:**

1. **Error ordering** — `dc08999`.
   The PATCH order (api-spec §6) is `400 fields → 422 assignee → 409 TICKET_CLOSED →
   INVALID_ACTION_STATE → STALE_UPDATE`, and create is `404 → 400 → 422 → TICKET_CLOSED`.
   Added **API-L4-35**: a PATCH that simultaneously requests an illegal transition on a
   **closed** Ticket with a **stale** token returns `409 TICKET_CLOSED` (it precedes both
   `INVALID_ACTION_STATE` and `STALE_UPDATE`); and an inactive assignee on a RESOLVED Ticket
   returns `422 ASSIGNEE_INACTIVE` (before `TICKET_CLOSED`). Existing per-code tests remain:
   `INVALID_ACTION_STATE` (**API-L4-04/05**), `TICKET_CLOSED` (**API-L4-08/31**).

2. **Authorization / no sensitive-field exposure** — cited + `dc08999`.
   Owner-only access is already proven by **API-L4-12** (non-owner Requester → 404, no
   existence leak) and **API-L4-32** (Requester payload has only Action top-level keys; a
   seeded Internal Note body never appears; Requester on `/staff/.../notes` → 403). The one
   gap — the **nested** user refs — is closed by new **API-L4-36**: `performedBy`, `assignee`,
   and `updatedBy` are exactly `{id,name}`, and the serialized response contains no `email`,
   `role`, or `passwordHash`. The single shared `actionView` serializer guarantees staff and
   Requester reads are byte-identical in shape.

3. **Concurrency** — `dc08999` (behavioural fix, not just a test).
   The stale check was a read-then-compare, which let two parallel PATCHes carrying the same
   `expectedUpdatedAt` both pass and both write. It is now an **atomic guarded UPDATE**
   (`updateMany … WHERE id = :id AND updatedAt = :expected`): the first write flips `@updatedAt`
   so the second matches zero rows → `409 STALE_UPDATE`. New **API-L4-37** fires both PATCHes
   with `Promise.all` and asserts exactly one `200`, one `409 STALE_UPDATE`, and that the
   persisted row equals the winner's write. Omitting the token still proceeds (**API-L4-11**).

4. **PATCH edge-case coverage** — `dc08999`.
   Already covered: Requester PATCH → 403 (**API-L4-13**), edit of a non-OPEN Action → 400
   (**API-L4-06**), complete without a result → 400 (**API-L4-04**). The gap was assignee
   semantics on PATCH (only create was tested, by **API-L4-02/03**); new **API-L4-38** covers
   active → 200, inactive staff/admin → 422 `ASSIGNEE_INACTIVE` (row unchanged),
   requester/unknown id → 422 `INVALID_ASSIGNEE`, and re-confirms Requester PATCH → 403.

**Verification:** full Lab 1–4 suite green — server **461**, migration **46**, client **90**,
E2E **15**. API-L4 test count 34 → 38.

**Follow-up Issues opened:** none — all four points resolved within PR #59.

### PR #60 — feat(lab-04): Ticket workflow — resolution gate, Admin status writes, concurrency (Issue #51)
**Link:** https://github.com/akira19tk/toktickit/pull/60
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/60#pullrequestreview-5721377977), 2026-10-31 12:00 ICT, reviewed commit `e95fee5`.

**Merge:** 2026-10-31 13:26 ICT, merge commit `3f77c0d`.

**Review received:**
> 1. Concurrency: Ensure serialization failures and retry exhaustion consistently return the expected 409 response without leaving partial updates.
> 2. Resolution Gate: Confirm that concurrent Action creation and Ticket resolution cannot violate the OPEN Actions invariant.
> 3. Authorization: Verify that ADMIN status-write access remains limited to the intended endpoint without affecting other restricted operations.
> 4. Regression Tests: Double-check that the updated Lab 3 tests preserve existing behavior and that the corrected transition matrix matches the specification.

**My responses and fixes:**

1. **Serialization failure / retry exhaustion → 409, no partial update** — `2029af5`.
   The RESOLVED path runs in a `Serializable` transaction that retries once on a Postgres
   `40001` / Prisma `P2034` conflict (`runSerializable`, `staff.ts`); a second conflict is
   caught and mapped to `409 STALE_UPDATE` — never a 500. This was asserted indirectly before;
   new **API-L4-18** now proves it directly by injecting **two** consecutive serialization
   failures (exhausting the retry): it asserts `409 STALE_UPDATE`, that `$transaction` was
   called exactly twice, and that `currentStatus`, `updatedAt`, `resolvedAt`, and
   `resolutionSummary` are all left untouched (no partial write).

2. **Concurrent create + resolve cannot break the OPEN-Actions invariant** — `2029af5`.
   **API-L4-30** already fired the resolve + Action-create race once; it now **loops 10 fresh
   tickets** and re-asserts after **each** iteration that no `RESOLVED` ticket holds an `OPEN`
   Action (and that each request lands in exactly one legal outcome — resolve wins and create →
   `409 TICKET_CLOSED`, or create wins and resolve → `409 OPEN_ACTIONS_EXIST`/`STALE_UPDATE`).
   The invariant holds across repeated interleavings, not just one lucky pass.

3. **ADMIN status-write scoped to `…/status` only** — cited (no new test needed).
   **API-L4-19** already asserts ADMIN gets `200` on `PATCH …/status` **and** `403` on all five
   other staff writes — claim, owner, it-priority, Public Comment, and Internal Note — plus a
   Requester `403` on status. The route-level authorization matrix is independently enforced by
   the Lab 3 `authorization.api.test.ts` table (`routes.table.ts`), where only `…/status` gained
   `ADMIN`; every other `/api/staff/*` mutation stays `IT_STAFF`-only.

4. **Lab 3 regressions + matrix ↔ spec** — `2029af5` + cited.
   Exactly **two** Lab 3 files changed, and only the Admin-status expectations within them:
   - `comments-notes.api.test.ts` **API-36**: "Admin cannot change status → 403" → "Admin **CAN**
     change status → 200", and `allowedTransitions` for Admin "empty" → "populated" (current-state
     matrix). The owner/it-priority/comment/note `403` assertions in the same block are unchanged.
   - `routes.table.ts`: `/api/staff/tickets/:id/status` `allowedRoles` `["IT_STAFF"]` →
     `["IT_STAFF","ADMIN"]`; no other row touched.
   For the corrected matrix, new **UNIT-L4-01** parses the **BR-14 table out of
   `specification.md`** and compares it to the code matrix **edge by edge**, failing on any single
   `(from → to)` disagreement — so the restored `NEW → IN_PROGRESS` edge (BR-14 doc transcription
   fix) and every other edge are now pinned to the spec, not a hand-copied expectation.

**Verification:** full Lab 1–4 suite green — server **510**, migration **46**, client **90**,
E2E **15/15**.

**Follow-up Issues opened:** none — all four points resolved within PR #60.

### PR #62 — feat(lab-04): Actions Taken UI + ticket workflow feedback on Ticket Detail (Issue #54)
**Link:** https://github.com/akira19tk/toktickit/pull/62
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/62#pullrequestreview-5722224179), 2026-10-31 16:46 ICT, reviewed commit `24702b2`.

**Merge:** 2026-10-31 16:46 ICT, merge commit `af447c2`.

**Review received:**
> 1. Form validation: Ensure required fields, follow-up notes, and completion results are validated correctly, including edge cases such as empty or whitespace-only input.
> 2. Error handling: Verify that failed requests (409/422) preserve user-entered data and display clear feedback without resetting the form.
> 3. Authorization and UI state: Confirm that Requesters cannot access editing controls and that COMPLETED/CANCELLED Actions remain read-only.
> 4. State synchronization: Ensure successful create/update operations refresh both the Actions list and Ticket summary without showing stale data.
> 5. Test coverage: Consider adding an end-to-end test for the complete Action lifecycle, including creation, editing, completion, and the resolution gate.

**My responses and fixes:**

1. **Form validation incl. whitespace-only input** — new **UI-L4-10** (test added).
   The create form already trims (`description.trim()`, `followUpNote.trim()`) and completion
   requires a non-empty trimmed result; **UI-L4-10** now pins the edge cases — a whitespace-only
   **description**, a whitespace-only **follow-up note** (when follow-up is checked), and a
   whitespace-only **completion result** are each rejected inline with **no API call**. The
   server-side trim/bounds are independently covered by **API-L4-34** (`actions-taken.api.test.ts`,
   empty/over-length description, future date, over-length notes → `400 VALIDATION_FAILED`, nothing
   written), so both tiers are proven.

2. **409/422 preserve entered data without resetting the form** — new **UI-L4-11** (test added).
   On a recoverable error the component sets the message but never calls `reset()`, so controlled
   inputs keep their values. **UI-L4-11** drives (a) a **422 `ASSIGNEE_INACTIVE`** on create and
   asserts the "This staff member is inactive." message shows **and every field is retained**
   (description, result, assignee, follow-up note, attachment notes); and (b) a **409
   `STALE_UPDATE`** on an inline edit, asserting the edit stays open, shows "…changed since you
   opened it", and keeps the typed value.

3. **Requester read-only; COMPLETED/CANCELLED read-only** — cited **UI-L4-06 / UI-L4-07** + browser
   verification (no new test needed). **UI-L4-06** asserts terminal rows expose no Complete/Cancel/
   Edit controls; **UI-L4-07** asserts the Requester view has no create/edit/assign controls, shows
   all fields, and never calls the staff endpoint. Confirmed live in the browser against the merged
   backend: the Requester view at **375px** rendered read-only with **0** write controls and **0**
   `/staff/*/actions` calls.

4. **Create/update refresh the list and the Ticket summary (no stale data)** — new **UI-L4-12**
   (test added). A successful mutation calls `refresh()`, which re-fetches the Actions list **and**
   invokes the `onChanged` prop (the detail screen passes `reload`, refreshing the status summary).
   **UI-L4-12** asserts that after a **create** and after a **complete**, `fetchStaffActions` is
   called again (list re-fetch) and `onChanged` fires **exactly once** each.

5. **Full-lifecycle E2E** — tracked as **E2E-L4-01** (`e2e/lab-04/actions-taken-flow.spec.ts`, create
   → assign → complete / cancel, multiple on one Ticket) and **E2E-L4-02** (resolution gate) under
   **Issue #55 (E2E + screenshots)**, planned next. No change in this PR — the E2E specs are owned
   by #55 per the sprint plan.

**Also addressed:** the resolve-blocked message now shows a **client-side, pluralized** copy
("This ticket has 1 open action. Complete or cancel it before resolving." / "…3 open actions…
them…") built from the server's structured `openActions` count rather than echoing the raw server
text — `d733de6`; asserted by **UI-L4-09**.

**Verification:** client suite **107** green (UI-L4-10/11/12 added), `tsc` clean; Lab 1–3 E2E
regression **15/15**; browser-verified end-to-end against the merged backend.

**Follow-up Issues opened:** none — items 1–4 resolved within PR #62; item 5 (lifecycle E2E) is
Issue #55.

### PR #63 — feat(lab-04): Staff dashboard API + UI + queue filters (Issue #53)
**Link:** https://github.com/akira19tk/toktickit/pull/63
**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/63#pullrequestreview-5723525051), 2026-10-31 22:20 ICT, reviewed commit `db25b1e`.

**Merge:** 2026-10-31 22:20 ICT, merge commit `093abad`.

**Review received:**
> 1. Dashboard metrics: Verify that ticket counts correctly exclude CLOSED/CANCELLED tickets where required, and that My Open Actions only includes OPEN actions assigned to the authenticated user.
> 2. Queue filtering: Ensure the new actionAssignee and actionStatus filters work correctly when combined with existing status, owner, and priority filters, including empty-result cases.
> 3. Authorization: Confirm that REQUESTER users cannot access the staff dashboard API and that all metrics are calculated according to the intended user scope.
> 4. Routing and regression: Verify that the new /dashboard landing page correctly handles all roles without breaking existing Lab 1-3 routes, navigation, or post-login redirects.
> 5. UI consistency: Ensure dashboard cards link to the correct filtered queue views and that loading, empty, and error states remain accessible and responsive.

**My responses and evidence** — fixes in `c8503d8` (tests only, plus one a11y attribute):

1. **Metric exclusions** — already covered by **API-L4-25** (myAssigned/unassigned = direct Prisma counts with `currentStatus ∉ {CLOSED,CANCELLED}`) and **API-L4-26** (myOpenActions = `count(assigneeId=me AND status=OPEN)`). Hardened with **API-L4-39**: added a CANCELLED-unassigned fixture and explicit assertions that CLOSED/CANCELLED tickets owned by me **and** unassigned are excluded, and that myOpenActions excludes a COMPLETED action assigned to me, an OPEN action assigned to someone else, and an OPEN unassigned action.

2. **Queue filter combinations** — new **API-L4-41** combines `actionAssignee=ME&actionStatus=OPEN` with `status`, `owner`, and `priority` (and proves the single-action AND semantics: a ticket whose only mine-action is COMPLETED plus a separate OPEN action owned by someone else does **not** match). New **API-L4-42** covers over-constrained combinations returning `200, []` (no 404/500). File: `server/tests/lab-04/staff-queue-action-filters.api.test.ts`.

3. **Authorization + scope** — **API-L4-29** asserts a REQUESTER gets `403`. New **API-L4-40** logs in two different staff users against the same seed and asserts they receive **different** `myAssigned`/`myOpenActions` (each equal to a direct per-user query) while the non-scoped global status counts are identical — proving metrics are scoped to the authenticated user.

4. **Routing / regression** — new **UI-L4-13** (`client/tests/lab-04/DashboardRouting.test.tsx`) asserts every role is redirected to `/dashboard` from `/login`, that `/dashboard` role-branches (Requester vs Staff dashboard), and that the legacy `/my-tickets`, `/staff/queue`, `/admin/users` routes still render for their permitted role and forbid others. End-to-end this is also covered by the updated Lab 3 E2E (**E2E-07** "each role lands on its home", plus `e2e/lab-03/helpers.ts` `ROLE_HOME` → `/dashboard` and the RESP-02/03/05 + STYLE-01 + E2E-03/05/06 navigations) — full E2E suite **15/15**.

5. **UI consistency + states** — drill-down hrefs are asserted by **UI-L4-02** (each card → the correct `/staff/queue?…` route, incl. `?actionAssignee=ME&actionStatus=OPEN` and `?itPriority=HIGH`). New **UI-L4-14** asserts the error state is `role="alert"` with a retry button and the loading state exposes a `status` region with an accessible label; the empty state is covered by **UI-L4-01**, and responsive reflow by **RESP-L4-01**.

**Verification:** server **540** green, migration **46**, client **126** (UI-L4-13/14 added), E2E **15/15**; client `tsc`/`vite build` clean.

**Follow-up Issues opened:** none — all five points addressed within PR #63.

<!-- Add further feature-PR reviews below as the sprint proceeds. -->

---

### PR #65 — Accessibility and regression hardening (Issues #56 / #57)

**Link:** https://github.com/akira19tk/toktickit/pull/65

**Reviewer:** Thannaporn (@daisysia)

**Review:** https://github.com/akira19tk/toktickit/pull/65#pullrequestreview-5724909297

**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/65#pullrequestreview-5724909297), 2026-11-01 04:03 ICT, reviewed commit `d31a3ec`.

**Merge:** 2026-11-01 04:16 ICT, merge commit `f9d9428`.

**Review summary and evidence:**

1. Accessibility and consistency: reviewer approved contrast, responsive layout, keyboard support and
   date formatting. Implementation: `4afc4d6`; evidence and refreshed fixture screenshots: `d31a3ec`.
2. Test stability: reviewer approved file isolation, pool cleanup and awaited React updates.
   Server **544**, migration **46**, client **127**, E2E **36** passed; actual logs are under
   `artifacts/lab-04/test-output/hardening-*`.
3. Follow-ups: remaining Prisma CLI audit advisory, full manual accessibility inspection and
   release/main verification were acknowledged and remain documented in `artifacts/lab-04/hardening.md`.

**Response/disposition:** No changes requested; no implementation changes required for this approval.
The documentation-only commit `2488ef2` recorded the review; no tests were rerun for that record.
Approval applies to `d31a3ec`; the subsequent documentation commit does not represent a new peer approval.
No separate response was posted for this approval-only review.

---

## Part 2 — Additional Review and Release Records

### PR #61 — Requester dashboard (Issue #52)

**Link:** https://github.com/akira19tk/toktickit/pull/61

**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/61#pullrequestreview-5721386161), 2026-10-31 12:03 ICT, reviewed commit `d5b39ce`.

**Merge:** 2026-10-31 13:29 ICT, merge commit `f27b7ea`.

**Review and disposition:** The repository author posted a response linking commit `c992f3f`: Recently Resolved card, whole-card accessible drill-down links, decorative SVG icons, responsive grid, locale-stable recent-ticket timestamps and consistent button styling. The response reports client 99 and E2E 15 passing at that stage. These are historical results, not the final release counts.

**Evidence caveat:** The formal approval body discusses workflow serialization, ADMIN permissions and the transition matrix rather than Requester Dashboard changes. The approval is attached to PR #61, but its wording does not establish a dashboard-specific review. The dashboard response and approval are recorded separately without rewriting the reviewer's words.

**Existing author response:** [GitHub comment](https://github.com/akira19tk/toktickit/pull/61#issuecomment-6539085829).

### PR #64 — E2E suites, screenshots and metrics evidence (Issue #55)

**Link:** https://github.com/akira19tk/toktickit/pull/64

**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/64#pullrequestreview-5724600084), 2026-11-01 02:38 ICT, reviewed commit `bb38c53`.

**Merge:** 2026-11-01 02:40 ICT, merge commit `cbc6cc7`.

**Review and disposition:** The reviewer approved Actions Taken lifecycle, resolution flow, metrics, role restrictions and responsive screenshots. The author posted a point-by-point response linking E2E-L4-01/02/03, screenshot paths, direct database comparisons and responsive coverage.

**Count clarification:** The review body cites 34 E2E tests. The final recorded historical #55 output reports 36, and final-main validation also reports 36. The review's count is retained as historical wording, not substituted for actual test output.

**Existing author response:** [GitHub comment](https://github.com/akira19tk/toktickit/pull/64#issuecomment-6548219772).

### PR #66 — Lab 4 release: lab4-staging → main

**Link:** https://github.com/akira19tk/toktickit/pull/66

**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/66#pullrequestreview-5724973214), 2026-11-01 04:20 ICT, reviewed commit `f9d9428`.

**Merge:** 2026-11-01 04:23 ICT, merge commit `a92fa7d`.

**Review and disposition:** The reviewer approved integration of Actions Taken, resolution safeguards, dashboards, accessibility and regression hardening, citing server 544 / migration 46 / client 127 / E2E 36. Prisma advisories, manual accessibility review and post-merge validation were acknowledged as follow-ups. No implementation changes or separate response were requested.

**Post-merge validation:** At release commit `a92fa7d`, server 544, migration 46 and client 127 passed with builds/lint; the student local Terminal E2E run passed all 36 in 41.1s. This distinguishes release validation from the pre-merge branch results.

### PR #67 — AI-use report and English My Reflection

**Link:** https://github.com/akira19tk/toktickit/pull/67

**Status:** Approved → Merged.

**Approval:** [@daisysia review](https://github.com/akira19tk/toktickit/pull/67#pullrequestreview-5725040569), 2026-11-01 04:43 ICT, reviewed commit `0c801e9`.

**Merge:** 2026-11-01 04:44 ICT, merge commit `b6456de`.

**Review and disposition:** The reviewer approved tool attribution, six selected prompts, limitations/corrections and the student's reflection. The review explicitly accepts not rerunning tests for this documentation-only change. No implementation changes or separate response were requested. Application validation remains tied to the previously tested release commit; this PR changes documentation only.

---

## Summary

Times above use Asia/Bangkok. All rows below were verified as MERGED; approvals are linked in the individual records. Feature branches are retained as grading evidence.

| PR | Issue | Scope | Reviewer | Final status | Merged into |
|---|---|---|---|---|---|
| [#47](https://github.com/akira19tk/toktickit/pull/47) | #48 | Engineering contract | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#58](https://github.com/akira19tk/toktickit/pull/58) | #49 | Actions Taken data/migration | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#59](https://github.com/akira19tk/toktickit/pull/59) | #50 | Actions Taken API | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#60](https://github.com/akira19tk/toktickit/pull/60) | #51 | Ticket workflow | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#61](https://github.com/akira19tk/toktickit/pull/61) | #52 | Requester dashboard | Thannaporn (@daisysia) | Approved → Merged (review wording caveat above) | lab4-staging |
| [#62](https://github.com/akira19tk/toktickit/pull/62) | #54 | Actions Taken UI | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#63](https://github.com/akira19tk/toktickit/pull/63) | #53 | Staff dashboard and queue filters | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#64](https://github.com/akira19tk/toktickit/pull/64) | #55 | E2E and screenshot evidence | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#65](https://github.com/akira19tk/toktickit/pull/65) | #56, #57; #39–42 | Accessibility and hardening | Thannaporn (@daisysia) | Approved → Merged | lab4-staging |
| [#66](https://github.com/akira19tk/toktickit/pull/66) | — | Lab 4 release | Thannaporn (@daisysia) | Approved → Merged | main |
| [#67](https://github.com/akira19tk/toktickit/pull/67) | — | AI-use report and reflection | Thannaporn (@daisysia) | Approved → Merged | main |

No new review comments were posted by the agent while reconciling this record. Historical responses are preserved or linked rather than fabricated.
