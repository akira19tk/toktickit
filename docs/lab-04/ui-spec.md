# Lab 4 UI Specification — Dashboards, Actions Taken, and Final Polish

Extends `docs/lab-02/ui-spec.md` and `docs/lab-03/ui-spec.md`. All existing Zen Green tokens, badges, form
conventions, cards, tables, validation placement, responsive breakpoints, and accessibility rules remain in
force. Lab 4 screens must look like part of the same application; no new design language is introduced.

## 1. Tokens

No new color tokens. Hardening (#56/#57) reuses the existing amber and neutral palette. The Action status badge and dashboard metric cards reuse existing tokens
(`#006B3C`, `#0B7A46`, `#EAF6EF`, `#F5F7F6`, `#1F2A25`, warning `#FEF3C7`/`#92400E`, grey `#6B7280`).

## 2. Badges (text always accompanies color)

**Action status** (reuses the status-badge component; text label always present)

| Value | Style |
|---|---|
| Open | Pale green `#EAF6EF`, `#006B3C` text |
| Completed | `#006B3C` background, white text, check icon |
| Cancelled | Muted green-grey `#5a6b62`, white text, ✕ icon; no strike-through |

**Follow-up** marker: an amber chip "Follow-up" (`#FEF3C7` / `#92400E`) shown on Actions with
`followUpRequired = true`. Ticket priorities remain unchanged. Ticket In Progress now uses amber `#FEF3C7` / `#92400E`,
visually distinct from green Resolved (`#006B3C` / white, ✓). Ticket Cancelled uses
`#F3F4F6` / `#374151` (9.37:1), with ✕ and no strike-through. Labels always accompany color.
All `.zen-select` controls show one shared decorative chevron, with reserved right padding.
All displayed timestamps use `formatDateTime` (en-GB Gregorian, viewer timezone); native datetime-local
editing and ISO API payloads keep their normal format. My Tickets uses fixed column widths with wrapping
on desktop and accessible keyboard-operable cards on mobile.

## 3. Routes and Navigation

| Route | Access | Screen |
|---|---|---|
| `/dashboard` | IT_STAFF, ADMIN | IT Staff Dashboard (§5) |
| `/dashboard` (Requester shell) or `/` | REQUESTER | Requester Dashboard (§6) |
| `/staff/tickets/:id` | IT_STAFF, ADMIN | Ticket Detail + Actions Taken area (§7) |
| `/tickets/:id` | REQUESTER (owner) | Ticket Detail + read-only Actions list (§7) |

Dashboard is the role-appropriate landing page and gets a primary nav item with clear active-page
indication. The nav never shows a link the role cannot use. Dashboard **supplements**, never replaces, the
existing Queue / My Tickets / Ticket Detail screens — every card and row drills into them.

## 4. Common feedback states (all new surfaces)

- **Loading:** skeleton cards / rows reusing the Lab 2–3 loading pattern; no layout shift.
- **Empty:** a zero count renders `0` (not hidden); an empty list shows the standard empty message with the
  relevant drill-down call-to-action.
- **Forbidden (403):** the shell Forbidden view (user stays signed in, can navigate away).
- **Not found (404):** in-shell Not Found.
- **Conflict (409):** inline, non-destructive message that keeps the user's entered data (e.g. "This ticket
  still has open actions" for `OPEN_ACTIONS_EXIST`, "Reload — this item changed" for `STALE_UPDATE`).
- **Safe failure (5xx/network):** inline error with retry; entered form data preserved.
- **Duplicate submit:** action buttons disable while a mutation is in flight.

## 5. IT Staff Dashboard (`/dashboard`)

Header: "Welcome back, {name}!" + Refresh. Layout:

- **Metric cards** (responsive grid): New, Open, In Progress, Waiting for Requester, My Assigned, and
  **My Open Actions**. Each card shows a label + value and is an accessible drill-down button:
  New/Open/In Progress/Waiting → `/staff/queue?status=…`; My Assigned → `/staff/queue?owner=ME`;
  My Open Actions → `/staff/queue?actionAssignee=ME&actionStatus=OPEN`.
- **My Recent Tickets:** up to 5 Tickets owned by me, newest-updated first, each a row (ticket number,
  summary, status badge, updated time) linking to Ticket Detail; "View all" → `/staff/queue?owner=ME`.
- **Urgent Tickets:** up to 5 HIGH IT-priority Tickets not Closed/Cancelled, newest-updated first, linking to
  Ticket Detail; "View all" → `/staff/queue?itPriority=HIGH`. (HIGH is the top priority tier.)
- **Quick Actions:** Create Ticket, Search Tickets, My Queue.

All counts come from `GET /staff/dashboard` and must match the queue when drilled into. ADMIN sees the same
dashboard.

## 6. Requester Dashboard (`/dashboard` / `/`)

Header: "Welcome, {name}!". Summarizes only the Requester's own Tickets.

- **Metric cards:** My Open, In Progress, **Waiting for Me**, Resolved, Closed. Each is a drill-down to
  `/tickets?status=…` (Waiting for Me → `status=WAITING_FOR_REQUESTER`). "Waiting for Me" carries an
  attention cue (amber accent + non-color label) since it needs the Requester's action.
- **My Recent Tickets:** up to 5 own Tickets, newest-updated first, each linking to Ticket Detail;
  "View all" → `/tickets`.
- **Quick Actions:** Create Ticket, View My Tickets.

Ownership is enforced by the backend; the UI never requests another user's data.

## 7. Actions Taken on Ticket Detail

### 7.1 IT Staff / Admin (`/staff/tickets/:id`)
A new **Actions Taken** section below the existing workflow/comments/notes areas.

- **List/table** newest-first: action date/time, description, result, Performed by, Assignee (or
  "Unassigned"), status badge, follow-up chip, and attachment-notes hint. Stable order by `createdAt`.
- **Create** form (collapsible): Description (required), Result, Assignee (select of active IT_STAFF/ADMIN),
  Action date/time (defaults now, not future), Follow-up required (checkbox) → reveals Follow-up note
  (required when checked), Attachment notes. Submit → `POST …/actions`.
- **View/edit mode** per row: editable **only while OPEN**. Controls shown only when permitted:
  **Assign** (set/change assignee), **Complete** (requires a non-empty Result), **Cancel**. Completed /
  Cancelled rows are read-only. Any active staff/admin may edit any Action (not only the author).
- **Validation (inline):** Description required; Result required to Complete; Follow-up note required when
  Follow-up is checked; assignee must be active staff (inactive → "This staff member is inactive").
- Successful mutations refresh the list and, where relevant, the Ticket status summary.

### 7.2 Requester (`/tickets/:id`)
The same Actions list, **read-only**, all fields visible (date/time, description, result, Performed by,
Assignee, status, follow-up, attachment notes). No create/edit/transition controls. **Internal Notes remain
hidden** from Requesters.

## 8. Ticket Workflow and Resolution Feedback

Status control offers only matrix-permitted transitions (Lab 3). Attempting Resolve while open Actions
remain surfaces the `OPEN_ACTIONS_EXIST` message inline and does not lose the entered resolution summary.
Successful transitions refresh the Ticket summary status badge.

## 9. Responsive & Accessibility

Same requirements as Labs 2–3. Metric-card grid reflows to 2-up (tablet) and 1-up (mobile); lists stack
without horizontal overflow; the Actions table collapses to stacked cards on mobile.

**Final checklist (completed in Part 9 evidence):** design consistency; dashboard cards and drill-downs;
Actions Taken create/edit vs read-only; validation placement; visible keyboard focus and full keyboard
operation; non-color status cues; no clipped content, overlap, inaccessible modals, or horizontal page
scrolling; no console errors, broken links, placeholder text, or unfinished controls.


### Final visual and accessibility checklist (#56/#57)

Evidence method: source review, component tests, and the single final E2E run recorded in
`artifacts/lab-04/hardening.md`. Student local Terminal E2E passed all 36 cases; no agent browser verification was performed.

| Check | Result / evidence |
|---|---|
| Shared design and controls | Reviewed: existing Zen Green components; shared chevron; no duplicate Actions chevron. |
| Dashboard cards, labels, drill-downs and feedback | Component tests and student local Terminal E2E pass. |
| Actions editable vs requester read-only, validation and safe failure | ActionsTaken component tests and local Terminal Actions flow E2E pass. |
| Keyboard focus and semantic labels | Existing Dialog focus trap, Escape and focus restoration reviewed; A11y tests. Mobile My Tickets cards now accept Enter/Space and are exposed to assistive technology. |
| Non-color status cues and contrast | Cancelled has ✕ and readable neutral text; Resolved has ✓; every status retains its label. Contrast calculated from CSS colors. |
| Desktop table overflow / wrapping | Fixed columns and wrapping; student local Terminal RESP-02 passes requester no-overflow at 375/850/1440. |
| Tablet/mobile clipping and overlap | Existing responsive CSS reviewed; Student local Terminal E2E passes responsive checks and refreshes screenshots. No full manual visual audit. |
| Dates | Gregorian date/time helper used on all displayed ticket, comment and attachment dates; UI-L4-15 covers a Thai-locale regression. |
| Console errors / unfinished UI / links | Source scan found no client debug logging, TODO controls or unfinished routes. Backend error logging retained for diagnostics. Expected mocked HTTP failures are test fixtures. Runtime console cleanliness not manually verified. |

Manual visual inspection remains unverified under the requested no-browser-verification constraint;
this checklist does not claim a manual accessibility certification.
