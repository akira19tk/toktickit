# Lab 2 Test Plan and Results — TokTickIT Requester Ticketing MVP

> **Corrected on 2026-10-07, after tag `lab2-final`,** in [PR #46](https://github.com/akira19tk/toktickit/pull/46). The version at the tag still shows Pending with placeholder paths; see the correction note in §6.
>
> **Totals:** 38 Test IDs: 32 Pass, 4 Not implemented, 2 Manual (screenshots).

## 1. Test Strategy

Tests are planned from `specification.md` before implementation (Test-DD), then driven
red→green (TDD) per Issue. Coverage spans: unit (pure logic), API/integration (Supertest
against Express + real test DB), UI component (Vitest + React Testing Library), responsive/
visual (Playwright screenshots at 3 viewports), and E2E (Playwright, full user flow). Every
Acceptance Criterion in `specification.md` maps to at least one row below.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Test File | Status |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-01 | Ticket Number generator produces `TKT-YYYY-NNNNNN` format | Matches regex, is unique across calls | `server/tests/lab-02/ticketNumber.test.ts` | Pass |
| API-01 | API | AC-01 | POST /api/tickets with valid data | 201, saved Ticket, ticketNumber returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | API | AC-02 | POST /api/tickets with empty summary | 400, field error on `summary` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | API | AC-03 | POST /api/tickets with oversized description | 400, field error on `description` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | API | AC-06 | POST /api/tickets with invalid categoryId | 400, no Ticket created | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | API | AC-29 | POST /api/tickets with missing requestedPriority | 400, field error | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-06 | API | AC-11 | GET /api/tickets under Requester A context | Only Requester A's tickets returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-07 | API | AC-12 | GET /api/tickets/:id for a Ticket owned by another Requester | 404, no data leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-08 | API | AC-13 | GET /api/tickets?search=battery | Returns matching ticket(s) only | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-09 | API | AC-14, AC-15 | GET /api/tickets?categoryId=… (category filter) | Only tickets of that category returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-10 | API | AC-16 | GET /api/tickets with no sort param | Default order = createdAt desc | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | API | AC-17 | GET /api/tickets?page=2 with >10 tickets | Correct page slice + metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | API | AC-18 | GET /api/tickets?page=-1&pageSize=9999 | Falls back to defaults, 200 | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-13 | API | AC-22 | POST attachment: valid JPG under 5MB | 201, attachment saved | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-14 | API | AC-23 | POST attachment: 10MB file | 400, size-limit error | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-15 | API | AC-24 | POST attachment: 6th attachment on a ticket with 5 active | 400, limit error | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-16 | API | AC-25 | GET download for active attachment | 200, file returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-17 | API | AC-26 | DELETE attachment with reason | 200, removedAt + reason set | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-18 | API | AC-27 | GET download for a soft-removed attachment | 404/410, file not returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-19 | API | AC-08 | GET /api/dev-requesters | Inactive requester excluded | `server/tests/lab-02/dev-requesters.api.test.ts` | Pass |
| UI-01 | UI | AC-07 | No requester selected, navigate to My Tickets | Redirected to Selection screen | — | Not implemented |
| UI-02 | UI | AC-02 | Submit Create Ticket with empty Summary | Field message shown, no API call | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-03 | UI | AC-04 | Double-click Submit rapidly | Second click has no effect, button busy | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-04 | UI | AC-05 | Server returns validation error | Entered values remain in form | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | UI | AC-01 | Successful ticket creation | Ticket Number shown in success state | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI | AC-09 | No active requesters returned by API | Empty state shown | `client/tests/lab-02/RequesterSelect.test.tsx` | Pass |
| UI-07 | UI | AC-10 | Requester-list API call fails | Safe error state, no crash | `client/tests/lab-02/RequesterSelect.test.tsx` | Pass |
| UI-08 | UI | AC-19 | Zero tickets for current requester | Empty state + Create Ticket CTA | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-09 | UI | AC-20 | Tickets exist but filters match none | No-Results state + Clear Filters | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-10 | UI | AC-31 | Switch requester on My Tickets | List reloads, page resets to 1 | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | AC-21 | Open owned Ticket Detail | Header fields render as read-only | `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-12 | UI | AC-26 | Soft-remove attachment without reason | Confirm disabled until reason entered | `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-13 | UI | AC-32 | Tab through Create Ticket form | All controls reachable, focus visible | `client/tests/lab-02/CreateTicket.a11y.test.tsx` | Pass |
| RESP-01 | Responsive | AC-30 | Create Ticket at 375px width | Fields stack, no horizontal scroll | — | Manual (screenshots) |
| RESP-02 | Responsive | FR-16 | My Tickets at 375px / 800px / 1280px | Table→card layout switch correctly | — | Manual (screenshots) |
| E2E-01 | E2E | AC-01, AC-31 | Full flow: select requester → create ticket → find in My Tickets | Ticket visible with matching number | — | Not implemented |
| E2E-02 | E2E | AC-12 | Requester B attempts direct URL access to Requester A's ticket | Access denied / not found | — | Not implemented |
| E2E-03 | E2E | AC-22, AC-26 | Add attachment then soft-remove it | Attachment lifecycle completes end-to-end | — | Not implemented |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | UNIT-01, API-01, UI-05 (E2E-01 not implemented) |
| AC-02 | API-02, UI-02 |
| AC-03 | API-03 |
| AC-04 | UI-03 |
| AC-05 | UI-04 |
| AC-06 | API-04 |
| AC-07 | UI-01 (not implemented; no automated test) |
| AC-08 | API-19 |
| AC-09 | UI-06 |
| AC-10 | UI-07 |
| AC-11 | API-06 |
| AC-12 | API-07 (E2E-02 not implemented) |
| AC-13 | API-08 |
| AC-14 | API-09 |
| AC-15 | API-09 |
| AC-16 | API-10 |
| AC-17 | API-11 |
| AC-18 | API-12 |
| AC-19 | UI-08 |
| AC-20 | UI-09 |
| AC-21 | UI-11 |
| AC-22 | API-13 (E2E-03 not implemented) |
| AC-23 | API-14 |
| AC-24 | API-15 |
| AC-25 | API-16 |
| AC-26 | API-17, UI-12 (E2E-03 not implemented) |
| AC-27 | API-18 |
| AC-28 | No automated test; verified manually in the Lab 2 report |
| AC-29 | API-05 |
| AC-30 | RESP-01 (manual screenshots, no automated test) |
| AC-31 | UI-10 (E2E-01 not implemented) |
| AC-32 | UI-13 |

## 4. Responsive and Visual Checklist

- [ ] No clipped labels at any breakpoint (375px, 768px, 1280px)
- [ ] No unintended horizontal scrolling on Create Ticket, My Tickets, Ticket Detail
- [ ] Editable vs read-only fields are visually distinguishable at all sizes
- [ ] Badge colors for Requested Priority / Current Status remain readable and consistent
- [ ] Table (desktop) → card layout (mobile) transition on My Tickets has no missing columns
- [ ] Focus indicators visible on all interactive controls at all breakpoints
- [ ] Attachment file names do not overflow their containers

## 5. Test Commands

```bash
# Backend unit + API tests
cd server
npm run test              # Vitest + Supertest

# Frontend unit + component tests
cd client
npm run test               # Vitest + React Testing Library

# E2E + responsive/visual tests
npx playwright test e2e/lab-02
```

## 6. Final Results

Final Lab 2 run on `main` (tag `lab2-final`): **server 31/31 passed**, **client 15/15 passed**, no skipped tests.
These runs cover the 32 Test IDs marked **Pass** above (UNIT-01, API-01–API-19, UI-02–UI-13); each ID appears in
a test title in the listed file at tag `lab2-final`.

Not delivered as automated tests: UI-01 and E2E-01–E2E-03 were not implemented, and RESP-01–RESP-02 were checked
manually with screenshots instead of Playwright. AC-07 and AC-28 therefore have no automated test.

**Correction note (2026-10-07):** the status table in the submitted Lab 2 PDF marked every row Pass, including the
six rows above that have no automated test, and this file still showed Pending with placeholder paths. This revision
records the real status and the real test-file paths. No code or other evidence was changed; tag `lab2-final` still
points to the submitted state.

## 7. Known Limitations or Deferred Tests

- Server-side idempotency-key enforcement for duplicate ticket submission is not tested
  (UI-level prevention only per BR-12 / assumption in `specification.md` §11).
- Load/performance testing of pagination at large data volumes is out of scope for Lab 2.
- Cross-browser testing is limited to the Chromium engine used by Playwright by default.
