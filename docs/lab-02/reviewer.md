# Lab 2 Peer Review Evidence — TokTickIT Requester Ticketing MVP

## Reviewer Information

**Reviewer:** Thanaporn Bunlusilp
**Student ID:** 67070503416
**GitHub username:** daisysia

---

## Part 1 — Reviews I Received (Partner Reviewed My PRs)

### PR #16 — docs: add Lab 2 specification, tests plan, ui-spec, api-spec
**Link:** https://github.com/akira19tk/toktickit/pull/16
**Status:** Approved

**Comment received:**
> Docs look complete across all 4 files. I like how BR-15 (attachment upload fails but ticket still saves) and the 404-vs-403 decision in section 11 are both well justified.
>
> One question — AC-28 (attachment fails but ticket succeeds) doesn't have a dedicated test ID in tests.md. Should we add one, or is it meant to be covered by API-01?

**My response:**
> Good catch, thanks! API-01 was only meant to cover the happy path. I'll add a dedicated test for AC-28 when implementing Issue #3 (probably API-05b or similar) so the traceability is clearer. Thanks for the review!

---

### PR #17 — feat: Development Requester context
**Link:** https://github.com/akira19tk/toktickit/pull/17
**Status:** Approved

**Comment received:**
> Requester context uses sessionStorage which matches BR-05 correctly, and inactive requesters are properly filtered out of the dropdown per BR-04.
>
> Tested closing and reopening the tab — session resets as expected (since it's sessionStorage), but might feel confusing to users having to re-select every time. Is that intentional for Lab 2, or should we add a UI note explaining it?
>
> Code and tests all pass (4/4 server, 5/5 client). Approving.

**My response:**
> Agreed it could feel confusing, but it's intentional — the spec is clear that this is a temporary testing mechanism, not real auth, so I didn't want it persisting longer than a session. Lab 3 will replace this whole flow with real authentication anyway.
>
> I'll add a small banner on the selection screen clarifying that you'll need to re-select on every new session. Thanks for testing this!

---

### PR #18 — feat: Create Ticket
**Link:** https://github.com/akira19tk/toktickit/pull/18
**Status:** Approved

**Comment received:**
> Tested POST /api/tickets with a non-existent categoryId — got a 400 as expected per BR-10. Form value retention on error also works correctly (typed a long summary, submitted, values were still there after the error).
>
> One question — the ticket number generation uses a separate TicketCounter instead of the ticket's own id. Why that approach instead of just using the id directly?
>
> Tests pass 13/13 server, 10/10 client. Great work.

**My response:**
> I used a separate counter for two reasons: 1) tying it to ticket.id would require an INSERT first to know the id, then an UPDATE to set the ticketNumber — two queries instead of one transaction, and 2) if tickets ever get deleted in a future lab, the numbering would have gaps instead of staying sequential.
>
> A per-year sequence (TicketCounter) lets me generate the number in a single transaction, formatted as TKT-YYYY-NNNNNN.

---

### PR #19 — feat: My Tickets list
**Link:** https://github.com/akira19tk/toktickit/pull/19
**Status:** Approved

**Comment received:**
> Searched "battery" combined with category=Hardware filter — results were correct per BR-20/BR-21 (AND logic). Windowed pagination (1 2 3 ... 6) matches the pattern shown in the Lab 1 handout too.
>
> Switched requester and noticed pagination resets to page 1 immediately, matching AC-31. Using key={requester.id} to force a remount is a clean approach.
>
> Tests pass 22/22 server, 13/13 client. Approving.

**My response:**
> Thanks! I went with the key prop because it was simpler than manually resetting every piece of state (page, active filters, stale data) — forcing a full remount guarantees there's no race condition where the previous requester's data briefly flashes on screen.

---

### PR #20 — feat: Requester Ticket Detail and Attachments
**Link:** https://github.com/akira19tk/toktickit/pull/20
**Status:** Approved

**Comment received:**
> Tried uploading a renamed .exe disguised as .jpg — backend correctly checks both the extension and the mimetype, so it was rejected. Soft-removed an attachment and tried downloading it again — got a 410 Gone exactly as expected per BR-16.
>
> The remove dialog requires at least 3 characters in the reason field before Confirm is enabled, matching BR-18.
>
> Tests pass 31/31 server, 15/15 client. Approving — congrats on finishing all 5 issues!

**My response:**
> Thanks so much for reviewing every PR throughout this sprint! Testing real edge cases like the disguised file extension and the 410 response really helped confirm the business rules actually hold up in practice, not just pass the tests I wrote for them.

---

### PR #21 — Lab 2 release (lab2-staging → main)
**Link:** https://github.com/akira19tk/toktickit/pull/21
**Status:** Approved

**Comment received:**
> Pulled lab2-staging and ran the full test suite — all passing (server + client). Also walked through the full flow manually: select requester → create ticket with attachment → find it in My Tickets → open detail → download and soft-remove attachment → switch requester and confirmed cross-requester isolation works.
>
> Everything integrates cleanly across all 5 issues. Approving the release.

**My response:**
> Thanks for running the full smoke test on top of the individual reviews! Really appreciate you catching integration issues before this goes to main.

---

### PR #22 — fix: category/system display, download, and ticket navigation bugs
**Link:** https://github.com/akira19tk/toktickit/pull/22
**Status:** Approved

**Comment received:**
> Tested all 3 fixes:
> 1. Category and Related System now show proper names instead of raw ids ✓
> 2. Download works correctly via blob fetch, file downloads successfully ✓
> 3. Clicking a ticket row in My Tickets now opens Ticket Detail ✓
>
> All good, approving.

**My response:**
> Thanks for the quick review! These were bugs I caught while doing my own screenshot testing for the submission — good to confirm they're fixed before it goes to main.

---

## Part 2 — Reviews I Gave (I Reviewed Partner's PRs)

### PR #18 — docs: add post-integration peer review section (daisysia's repository)
**Branch:** `docs/lab2-review-evidence` → `main`
**Status:** Merged, Approved by me (akira19tk)

This PR added the post-integration peer review section to `docs/lab-02/reviewer.md` on my partner's repository. Since the Lab 2 implementation was already integrated before the formal peer-review evidence was completed, this PR was used to conduct and document a genuine post-integration peer review of the final implementation and documentation, covering: Lab 2 requirements and implementation, requester ticket workflow, My Tickets and ticket ownership, ticket detail and attachments, and tests/documentation.

**Comment 1 — given:**
> The requester ticket workflow looks clear. I suggest making sure the documentation clearly states that the Development Requester selector is for development/testing only and is not real authentication.

**Partner's response:**
> Thanks for the feedback. I will make sure this is clearly stated in the review documentation and that it remains consistent with the Lab 2 specification.

**Comment 2 — given:**
> The My Tickets implementation includes search, filtering, sorting, and pagination. I suggest confirming that these behaviors and requester ownership restrictions are clearly documented and covered by tests.

**Partner's response:**
> Thanks. I checked the specification and test plan. I will make sure the review record clearly mentions these behaviors and the requester ownership restriction.

**Comment 3 — given:**
> The attachment feature supports upload, download, and soft removal. Please confirm that file validation and the behavior of removed attachments are documented and tested.

**Partner's response:**
> Thanks for pointing this out. I will confirm the attachment validation and soft-removal behavior in the review record and make sure they are consistent with the implementation and tests.

**Final approval comment:**
> Reviewed the updated peer review documentation. The previous feedback has been addressed and the documentation is consistent with the implementation. Approved.

---

## Summary

All 7 Lab 2 Pull Requests (#16–#22) on my repository required peer review from Thanaporn Bunlusilp (daisysia) before merging into `lab2-staging` and, subsequently, `main`. Every PR received a substantive review comment testing specific business rules and acceptance criteria (not just a rubber-stamp approval), and every review comment received a direct response from me explaining the design decision or confirming the fix.

In the other direction, I reviewed and approved PR #18 on my partner's own repository, which documented her post-integration peer review of her Lab 2 implementation. My review raised three specific points (Development Requester selector labeling, My Tickets ownership/behavior documentation, and attachment validation/soft-removal documentation), each of which she addressed before I approved the final merge.
