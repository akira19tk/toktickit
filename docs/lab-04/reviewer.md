# Lab 4 Peer Review Evidence — Actions Taken, Workflow, Dashboards, Final Regression

Every `feature/lab4-*` PR into `lab4-staging`, and the release PR `lab4-staging → main`, is reviewed and
approved before merge. Each review's comments, responses, and follow-up commits are recorded below.

## Reviewer Information

**Reviewer:** Thannaporn
**GitHub username:** daisysia

---

## Part 1 — Reviews I Received

### PR #47 — docs(lab-04): Sprint 4 engineering contract (Issue #48)
**Link:** https://github.com/akira19tk/toktickit/pull/47
**Status:** Changes requested → addressed → re-review requested

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
**Status:** Changes requested → addressed → re-review requested

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

<!-- Add further feature-PR reviews below as the sprint proceeds. -->

---

## Summary

| PR | Issue | Scope | Reviewer | Status | Merged into |
|---|---|---|---|---|---|
| #47 | #48 | Sprint 4 engineering contract (specification/api/ui/tests) | Thannaporn (daisysia) | Changes requested → fixed, re-review | lab4-staging |
| #58 | #49 | Actions Taken DB foundation (migration, model, seed) | Thannaporn (daisysia) | Changes requested → fixed, re-review | lab4-staging |
| #__ | #50 | Actions Taken API + authorization | | | lab4-staging |
| #__ | #51 | Ticket workflow (resolution gate, Admin write, Lab 3 auth test updates) | | | lab4-staging |
| #__ | #52 | Requester dashboard (API + UI) | | | lab4-staging |
| #__ | #53 | Staff dashboard (API + UI + queue filters) | | | lab4-staging |
| #__ | #54 | Actions Taken UI | | | lab4-staging |
| #__ | #55 | E2E + screenshots | | | lab4-staging |
| #__ | #56 | Accessibility & visual consistency | | | lab4-staging |
| #__ | #57 | Final hardening & release | | | lab4-staging |
| #__ | — | Release PR | | | main |
