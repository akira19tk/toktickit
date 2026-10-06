# Lab 3 Peer Review Evidence — Users, Roles, IT Staff Ticketing, and Admin

## Reviewer Information

**Reviewer:** Thanaporn Bunlusilp
**Student ID:** 67070503416
**GitHub username:** daisysia

All five Lab 3 feature PRs (#32–#36) were reviewed and approved by the reviewer
before merging into `lab3-staging`, and the release PR (#44) was reviewed and
approved before merging `lab3-staging` → `main`. Every review raised specific,
non-blocking questions; each received a direct reply, and each actionable
follow-up was opened as a tracked issue (#37–#43).

---

## Part 1 — Reviews I Received

### PR #32 — feat: login, change password, role shell and Requester regression (#25)
**Link:** https://github.com/akira19tk/toktickit/pull/32
**Status:** Approved

**Review received:**
> Approve ✅
>
> Thanks for the thorough write-up. The scope matches #25, and the split with #26/#27/#28 is clear. Staff and Admin homes are placeholders only, and StatusBadge and PriorityBadge are built once for reuse.
>
> What looks good
>
> The route guard rules are simple and cover the cases that matter: unauthenticated users go to /login, the wrong role goes to /forbidden, and mustChangePassword users can only reach /change-password.
> Removing the dev Requester selector (BR-61) and moving the Requester screens to session auth is the right call before staging.
> Good catches from manual testing on the session handling (BR-66). The /auth/me probe now runs once at startup and no longer triggers the 401 handler. The "session has ended" banner now survives the guard redirect. SessionLifecycle.test.tsx covers these fixes with the real AuthProvider and api.ts, which gives more confidence than mocking the provider.
> Forbidden and signed-in Not Found now render inside the shell, so the user can still see who is signed in and log out. That's a nice UX fix.
> Tests pass on both sides (client 54, server 199), and the remaining todos are tracked.
>
> Non-blocking notes
>
> Auto-close: the base branch is lab3-staging, so Closes #25 probably won't close the issue on merge. GitHub only auto-closes when merging into the default branch, and the Development sidebar shows "None yet". It may be worth linking the issue manually or closing it after merge.
> Session expiry: now that /auth/me runs only once, an expired session is detected only when the next API call returns 401. Can you confirm that path also sets the "session has ended" banner and redirects to /login? If it isn't covered in SessionLifecycle.test.tsx yet, a test for it would help.
> Dialog a11y todo: please make sure it's listed in #28 so it doesn't get lost.
>
> None of these block the merge. LGTM 🚀

_(The reviewer submitted this same approval twice, at 13:49:45 and 13:59:39 UTC; quoted once above.)_

**My response:**
> Thanks for the review!
>
> 1. Agreed. GitHub only auto-closes on the default branch. I will put
>    "Closes #25" through "#29" in the release PR from lab3-staging to main,
>    so they all close when that merges.
> 2. Yes, covered in SessionLifecycle.test.tsx: "probe 200, then a later 401
>    shows /login WITH the banner" and "probe 401, sign in via the form, then
>    a later 401 shows /login WITH the banner". The second one is the test
>    that exposed the probe re-running on every navigation.
> 3. Done in #35: UI-26 dialog focus trap and Escape are real tests in
>    A11y.test.tsx now, no todo left.

**Follow-up issue opened:** none (the session-expiry path and the dialog-a11y todo were confirmed as already covered in tests).

---

### PR #33 — feat: IT Staff Ticket Queue (#26)
**Link:** https://github.com/akira19tk/toktickit/pull/33
**Status:** Approved

**Review received:**
> Approve ✅
>
> Thanks for stacking this on #32. Keeping this PR to the queue work makes it much easier to review.
>
> What looks good
>
> The queue has the full set of controls: search, filters, sort, pagination and counts. The owner / Unassigned / (inactive) markers and the mobile card layout cover the cases in ui-spec 4.4.
> Putting the contract change in a separate docs commit is the right approach. You also explained why requesterResolved=true was needed (ui-spec 4.4 vs BR-57 / api-spec 5) and confirmed that no Test IDs were added or removed. That makes it easy to trace.
> Good finds from manual testing. You're right that the Summary truncation bug can't be caught in jsdom, and moving it to E2E in #29 makes sense. Fixing the seed (TKT-2026-900006 owned by inactive emma.clark) so AC-78 can actually be shown is also a good catch.
> Tests are passing: server 245, client 60.
>
> Questions / non-blocking notes
>
> Admin + assignees: BR-22 gives Admin read-only access to /api/staff/tickets, but /api/staff/assignees is IT Staff only. If the owner filter dropdown loads data from this endpoint, will Admin get a 403 or an empty dropdown? If that's expected, it may be worth disabling or hiding the owner filter for Admin.
> Pagination reset: when the user changes a filter, search, or count chip, does the page reset to 1? Otherwise a user on page 3 who switches to a filter with fewer results will see an empty page.
> Seed change side effects: changing the owner of TKT-2026-900006 may affect other tests or screens that count tickets per owner, or that expect this ticket to belong to an active staff member. Please double-check that.
> Known limitation (types not shared): I agree it shouldn't block this PR. Could you open a follow-up issue so the server response and client types don't drift apart over time? A contract test or a shared type package would work.
>
> None of these block the merge. LGTM once #32 is merged 🚀

**My response:**
> Thanks for the review!
>
> 1. Admin + assignees: Admin never reaches the queue screen. /staff/queue is
>    IT Staff only in the client router, so Admin gets the Forbidden page
>    (covered by E2E-07). Admin's read-only access under BR-22 is API only,
>    to look up a Ticket id. So the owner dropdown never loads for Admin.
> 2. Pagination reset: checked in the browser. From page 3, clicking the
>    "Requester says resolved" chip goes back to page 1 and shows
>    "Showing 1-4 of 4 tickets". Filters and search reset the page the same
>    way.
> 3. Seed side effects: none on tests. Server tests build their own data in
>    each file, and E2E uses its own seed (seed-e2e.ts) on a separate
>    database. The dev seed only affects the local dev database.
> 4. Opened #37 for sharing the API response types.

**Follow-up issue opened:** **#37** — share the API response and client types so they don't drift apart (contract test or shared type package).

---

### PR #34 — feat: IT Staff ticket operations (#27)
**Link:** https://github.com/akira19tk/toktickit/pull/34
**Status:** Approved

**Review received:**
> Approve ✅
>
> Clean, well-scoped PR. The conditional UPDATE fix for API-64 is correct, the 409-before-400 order is documented, and API-54 tests both sides.
>
> Non-blocking
>
> Claim condition: should the UPDATE check status = 'NEW'? If a ticket in another status has ownerId null, the current condition could move it back to OPEN.
> Other operations: do reassign, priority and status changes also need a conditional WHERE status = <expected> to avoid lost updates?
> Internal Notes: is there a test that Requester endpoints never return them?
> Flaky UI-03: please open an issue for the timeout and the act() warning.
>
> LGTM once #32 and #33 are merged 🚀

**My response:**
> Thanks for the review!
>
> 1. Claim condition: the UPDATE sets "currentStatus" with
>    CASE WHEN "currentStatus" = 'NEW' THEN 'OPEN' ELSE "currentStatus" END,
>    so only a NEW ticket moves to OPEN; an unassigned ticket in another
>    status keeps its status. Covered by API-43 ("claiming a non-NEW
>    unassigned Ticket sets the owner but keeps the status").
> 2. Good catch. Reassign, IT Priority and status changes read then write,
>    so two staff changing the same ticket at once could produce a
>    transition the matrix does not allow. The spec only requires
>    concurrency protection for claim (AC-79) and the last-admin rule
>    (BR-67), so I opened #38 to add conditional UPDATEs and concurrency
>    tests rather than widen this PR.
> 3. Yes: API-34 checks the Requester ticket and comment payloads carry no
>    note content or count, API-33 checks the note endpoints return 403
>    with no note text, and E2E-04 checks the Requester screen.
> 4. Opened #39 for UI-03 and the act() warning.

**Follow-up issues opened:** **#38** — conditional UPDATEs and concurrency tests for reassign / IT priority / status changes; **#39** — flaky UI-03 timeout and the `act()` warning.

---

### PR #35 — feat: Administrator User Management (#28)
**Link:** https://github.com/akira19tk/toktickit/pull/35
**Status:** Approved

**Review received:**
> Approve ✅
>
> Solid PR. Using pg_advisory_xact_lock for the last-admin rule with password hashing kept outside the transaction is a good design. API-65 tests the real invariant (exactly one active admin remains), and the shared Dialog fixes the a11y todo from #32.
>
> Non-blocking
>
> Base branch: the description says this is stacked on #34, but the base is lab3-staging with only 2 commits. Is the branch based directly on lab3-staging, or should the base be feature/5-staff-ticket-ops?
> Role change without session revoke (BR-13): is the role read from the DB on every request? If it's cached in the session, a demoted admin keeps admin access until they log out.
> API-65 socket reset: it happened once and didn't reproduce, so please track it in an issue in case it's flaky.
> Server build failing: I agree it's pre-existing, but please make sure #29 fixes it before release.
>
> LGTM once #32 → #33 → #34 are merged 🚀

**My response:**
> Thanks for the review!
>
> 1. Base branch: it was stacked on feature/5-staff-ticket-ops. After #34
>    merged, I moved the base to lab3-staging, so only this PR's two
>    commits remain. That is expected.
> 2. Role is read from the database on every authenticated request (BR-13);
>    requireAuth loads the user with the session, nothing is cached. A
>    demoted admin loses admin access on the next request. API-68 (AC-83)
>    covers the same session continuing under the new role.
> 3. Opened #40 for the one-off API-65 socket reset.
> 4. Fixed in #36 (Issue #29): server npm run build passes and the built
>    server starts. Before that fix the built server had never started.

**Follow-up issue opened:** **#40** — one-off API-65 socket reset (track in case it's flaky). (The server-build fix was delivered in PR #36 / Issue #29.)

---

### PR #36 — test: E2E, responsive evidence and release prep (#29)
**Link:** https://github.com/akira19tk/toktickit/pull/36
**Status:** Approved

**Review received:**
> Approve ✅
>
> Great release-prep PR. Getting the built server to start for the first time is the most important fix in the stack. The _e2e guard on setup/seed is a good safety net, and the RESP tests assert real layout instead of only taking screenshots. E2E passing twice in a row is reassuring.
>
> Non-blocking
>
> Base branch: same as #35. The description says this is stacked on #35, but the base is lab3-staging. Please confirm the merge order will work as written.
> Flaky tests: the my-tickets.api.test.ts timeout is the third one-off failure in this stack, after UI-03 and API-65. One issue tracking all three would help find a shared cause, such as DB setup under load.
> npm audit: fine to leave it out of this lab, but please open an issue so it's tracked.
> CI: Checks shows 0. A workflow that runs the unit tests and build would catch problems like the build failure earlier.
>
> LGTM once #32 → #35 are merged 🚀

**My response:**
> Thanks for the review!
>
> 1. Base branch: #32 to #35 are already merged into lab3-staging in order,
>    and I moved this PR's base there after #35 merged, so it now shows only
>    the #29 commits. Merging this completes the stack.
> 2. Opened #41 to track the three one-off failures together (#39 UI-03,
>    #40 API-65, and the my-tickets beforeAll timeout) and look for a shared
>    cause.
> 3. Opened #42 for npm audit.
> 4. Agreed. Opened #43 for a CI workflow running tests and builds on
>    every PR.

**Follow-up issues opened:** **#41** — track the three one-off test failures together (UI-03 / API-65 / my-tickets timeout) and look for a shared cause; **#42** — `npm audit`; **#43** — CI workflow running tests and builds on every PR.

---

### PR #44 — release: Lab 3 users, roles, IT Staff ticketing and admin
**Link:** https://github.com/akira19tk/toktickit/pull/44
**Status:** Approved

**Review received:**
> Approve ✅
>
> Clean release PR. All five feature PRs (#32–#36) were reviewed and merged in order, server, client and E2E all pass on lab3-staging, and every follow-up from the reviews is now tracked as an issue (#37–#43). Because this PR targets main, the Closes #25–#29 keywords should also work this time.
>
> Non-blocking
>
> Linked issues: the Development sidebar still shows "None yet". After merging, please confirm that #25–#29 actually closed. If they didn't, main may not be the default branch.
> Merge method: please use a merge commit rather than squash. That keeps the 46 commits traceable to their PRs and keeps lab3-staging in sync with main.
> Release tag: once the final evidence is on main, consider tagging it (e.g. lab3) so there's a fixed point to refer back to.
>
> LGTM 🚀

**My response:**
> Thanks for the review!
>
> 1. Will confirm right after merging and close any that stay open.
> 2. Merging with a merge commit, same as #32 to #36.
> 3. Good idea. I will tag the final evidence commit on main as lab3.

**Follow-up issue opened:** none (this PR confirmed that follow-ups #37–#43 were already tracked).

---

## Follow-up issue index (#37–#43)

| Issue | Topic | Raised in review of | Opened in reply to |
|---|---|---|---|
| #37 | Share API response / client types (avoid drift) | PR #33 | PR #33 |
| #38 | Conditional UPDATEs + concurrency tests for reassign / priority / status | PR #34 | PR #34 |
| #39 | Flaky UI-03 timeout and `act()` warning | PR #34 | PR #34 |
| #40 | One-off API-65 socket reset | PR #35 | PR #35 |
| #41 | Track the three one-off test failures together (UI-03 / API-65 / my-tickets) | PR #36 | PR #36 |
| #42 | `npm audit` | PR #36 | PR #36 |
| #43 | CI workflow running tests and builds on every PR | PR #36 | PR #36 |

---

## Summary

The reviewer (daisysia) approved all five Lab 3 feature PRs (#32–#36) before each
merged into `lab3-staging`, then approved the release PR (#44) before it merged
into `main`. Each review tested specific behaviour and acceptance criteria — route
guards and session handling (#32), queue controls and the Admin/assignees boundary
(#33), the claim condition and lost-update concurrency (#34), the last-admin
advisory lock and DB-backed role reads (#35), and the first-ever built-server start
plus flaky-test tracking (#36) — rather than a rubber-stamp approval. Every
actionable, non-blocking note became a tracked follow-up issue (#37–#43).
