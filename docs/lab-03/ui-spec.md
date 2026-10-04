# Lab 3 UI Specification — Zen Green Extensions

This document extends `docs/lab-02/ui-spec.md`. All Lab 2 tokens, form conventions, cards, buttons, validation placement, responsive breakpoints and accessibility rules remain in force. Lab 3 screens must look like part of the same application.

## 1. New Tokens

Existing tokens (`#006B3C`, `#0B7A46`, `#EAF6EF`, `#F5F7F6`, `#1F2A25`, error, warning, success) are reused unchanged.

| Token | Value | Use |
|---|---|---|
| `--color-internal-bg` | `#FEF3C7` | Internal Notes panel background |
| `--color-internal-border` | `#B45309` | Internal Notes panel border and lock icon |
| `--color-public-accent` | `#0B7A46` | Top border of the Public Comments panel |
| `--color-role-admin` | `#1F2A25` | Administrator role badge |

## 2. Badges (text always accompanies color)

**Role**

| Value | Style |
|---|---|
| Requester | Pale green `#EAF6EF` background, `#0B7A46` text |
| IT Staff | `#0B7A46` background, white text |
| Administrator | `#1F2A25` background, white text |

**Ticket status**

| Value | Style |
|---|---|
| New | Light grey-blue `#E8EEF3`, dark text |
| Open | Pale green `#EAF6EF`, `#006B3C` text |
| In Progress | `#0B7A46` background, white text |
| Waiting for Requester | Amber `#FEF3C7`, `#92400E` text |
| Resolved | `#006B3C` background, white text, check icon |
| Closed | Grey `#6B7280`, white text |
| Reopened | Amber outline `#B45309`, amber text |
| Cancelled | Light grey with strike-through label |

**Priority** (Requested and IT Priority): Low = green, Medium = amber-brown, High = red, as in Lab 2. The IT Priority badge is always labelled by the column or field name so it is never confused with Requested Priority.

**Other:** an Active/Inactive status badge in User Management (green / grey), and a "Requester says resolved" marker (check icon + text) in the queue and Staff Ticket Detail.

## 3. Routes and Navigation

| Route | Access | Screen |
|---|---|---|
| `/login` | Public (signed-in users are redirected home) | Login |
| `/change-password` | Any signed-in user (the only reachable route while a change is required) | Change Password |
| `/my-tickets`, `/tickets/new`, `/tickets/:id` | Requester | Lab 2 screens |
| `/staff/queue`, `/staff/tickets/:id` | IT Staff | Queue, Staff Ticket Detail |
| `/admin/users` | Administrator | User Management |
| `/forbidden` | Signed-in user on a wrong-role URL | Forbidden |
| any other path | Anyone | Not Found |

**Shell (all signed-in screens):** TokTickIT identity on the left; role navigation; on the right the user's name, role badge, a menu with Change Password and Logout. Navigation shows only destinations the role may use.

| Role | Navigation |
|---|---|
| Requester | My Tickets · Create Ticket |
| IT Staff | Ticket Queue |
| Administrator | User Management |

Home after login: Requester `/my-tickets`, IT Staff `/staff/queue`, Administrator `/admin/users`. The Development Requester name and Change Requester action no longer exist. On mobile the navigation and user menu collapse into one menu button with a visible label.

## 4. Screens

### 4.1 Login (`/login`)
- Centered card: TokTickIT title; Email and Password fields (required marker, labels above); optional show/hide password toggle (`aria-pressed`, labelled); Sign in primary button.
- Modes: idle → submitting (button busy and disabled, fields kept) → error.
- Validation under fields (email required/format, password required). Failure banner above the form with a safe message: "Invalid email or password"; "This account is inactive. Contact an administrator."; "Too many attempts. Try again later."; "Cannot reach the server. Please try again." The typed email is kept; the password is cleared after a rejected attempt.
- A session-ended message ("Your session has ended. Please sign in again.") appears as an info banner when redirected after a 401.

### 4.2 Change Password (`/change-password`)
- Card with Current password, New password, Confirm new password; a visible rules list (8–72 characters, at least one letter and one digit, different from current).
- Heading text differs when the change is mandatory ("You must choose a new password before continuing"); the shell shows only Logout in that state.
- Errors under the matching field; success confirmation, then redirect to the role's home.

### 4.3 Requester screens
Lab 2 screens without the Development Requester selector. **Ticket Detail additions:** read-only fields for Current Status badge, IT Priority badge, Ticket Owner name (or "Unassigned") and Resolution Summary (when present); tabs for Public Comments and Attachments. Public Comments show author name, role badge, time and text, oldest first, with a composer ("Post comment", 2000-character counter). A secondary button **Problem Appears Resolved** is enabled only in the allowed statuses; after use it becomes a disabled "Marked as resolved" confirmation. No Internal Note text or count appears anywhere.

### 4.4 IT Staff Ticket Queue (`/staff/queue`)
- Header with title and three count chips (Unassigned, Assigned to me, Requester says resolved); clicking a chip applies the matching filter.
- Filter bar: search (number, summary, requester), Status (Active default, All, each status), IT Priority, Category, Owner (Any, Me, Unassigned, specific staff), Clear Filters.
- Desktop table columns: Ticket No., Summary, Requester, Category, IT Priority, Status, Owner, Updated. Requested Priority is shown in the detail screen to avoid a mega-grid. Each row opens Ticket Detail via the Ticket No. link and an Open button. Unassigned rows show a muted "Unassigned" label; owners who are no longer active staff show "(inactive)". Sortable headers show direction.
- Mobile: each Ticket is a card with the same facts, status and priority badges at the top.
- Pagination as in Lab 2 ("Showing 1–10 of N tickets", windowed page buttons).
- States: loading skeleton, Empty ("The queue is empty"), No-Results with Clear Filters, Forbidden, safe Failure with Try Again.

### 4.5 IT Staff Ticket Detail (`/staff/tickets/:id`)
- **Header strip:** Ticket No., Status badge, IT Priority badge, Requester-says-resolved marker, Back to Queue.
- **Facts panel (read-only):** Date, Requester name and email, Category, Related System, Requested Priority, Summary, Description, Resolution Summary, dates.
- **Operations panel (editable, white background):** Owner (name or Unassigned) with a **Claim** button when unassigned and a Reassign select otherwise; IT Priority select; Status select showing only allowed transitions and a **Resolution summary** textarea when Resolved is chosen. Each control has its own Save/Apply button with a busy state. Closing or cancelling opens a confirmation dialog stating what will happen.
- **Tabs:** `Public Comments (n)` · `Internal Notes (n)` · `Attachments (n)`.
  - *Public Comments:* white panel with a green top border and the label "Visible to the Requester"; composer button reads **Post Public Comment**.
  - *Internal Notes:* amber panel (`--color-internal-bg`) with a lock icon and the label "Internal — not visible to the Requester"; composer button reads **Add Internal Note** and uses the secondary style. The two composers are never on the same tab.
  - *Attachments:* list with Download for active files; removed files show metadata and a Removed badge only.
- Feedback: inline messages beside the control for validation and conflict errors, a success toast on save, and page-level Not Found / Forbidden / Failure cards. Typed text is kept when a save fails.

### 4.6 User Management (`/admin/users`)
- Toolbar: search (name or email), Role filter, **Create User** primary button.
- Table (cards on mobile): Name, Email, Role badge, Status badge, **Edit** button.
- **Create User dialog:** Name, Email, Role select, Active toggle, Initial password (with the password rules). **Edit User dialog:** Name, Email, Role, Active, and a **Set new initial password** button that opens a confirmation dialog with a new-password field and explains the user must change it at next login.
- Field errors under the field (duplicate email, invalid role, weak password); conflict messages for self-deactivation and last Administrator appear in a banner at the top of the dialog; success toast after save; the current Administrator's own row disables the Active toggle with an explanatory tooltip.
- States: loading, Empty ("No users yet"), No-Results (with Clear), Forbidden page for non-Administrators, safe Failure with Try Again.

### 4.7 Forbidden and Not Found
Centered card with an icon, a heading ("You don't have access to this page" / "Page not found"), one sentence, and a primary button to the user's home (or Login when signed out).

## 5. Component Rules

- **Dialogs:** focus moves into the dialog and returns to the trigger on close; focus is trapped; Escape closes (except while saving); backdrop click does not close; full screen on mobile; the primary action is on the right and the destructive action uses the destructive style.
- **Buttons:** hierarchy and busy/disabled states as in Lab 2; save buttons show "Saving…" and are disabled while a request runs.
- **Toasts:** success is a pale green bar with text and icon, auto-dismiss after 5 seconds, and also announced through `aria-live="polite"`. Errors stay until dismissed.
- **Tabs:** keyboard operable (arrow keys), `aria-selected`, count in the label.
- **Read-only vs editable:** read-only values use the Lab 2 soft grey-green background; editable controls are white with the neutral border.
- **Safe rendering:** all user text (comments, notes, names, summaries) is rendered as text; never inject HTML.

## 6. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥ 992 px | Tables; Staff Ticket Detail uses facts and operations side by side above the tabs |
| Tablet 768–991 px | Tables stay but hide Category and Updated columns; operations panel below the facts |
| Mobile < 768 px | Queue and user list become cards; filters collapse under a Filters button; dialogs full screen; all buttons at least 44 px high; no horizontal page scroll |

At every size: no clipped labels, overlapping messages or hidden buttons.

## 7. Accessibility
- Every input has a visible label; required fields carry a marker plus a message on error; errors are announced through an `aria-live` region and focus moves to the first invalid field on submit.
- Color is never the only indicator: badges and markers always include text.
- Icon-only controls have accessible labels and tooltips; focus indicators stay visible; logical tab order.
- Login and Change Password are fully operable with the keyboard alone.

## 8. Visual Inspection Checklist (completed before submission)
- [ ] Zen Green tokens match this document and Lab 2 on every new screen
- [ ] Role navigation shows only permitted destinations for each of the three roles
- [ ] Status, priority and role badges are identical for the same value across screens
- [ ] Editable vs read-only fields are visually distinct
- [ ] Validation messages sit directly under their fields
- [ ] Public Comments and Internal Notes are unmistakably different
- [ ] Focus ring visible on every control; dialogs trap focus
- [ ] No clipping, overlap or horizontal overflow at 1440, 850 and 375 px
- [ ] Empty, No-Results, Forbidden, Not Found and Failure states checked on queue and user list
- [ ] Screenshots saved to the paths below

**Screenshot paths:** `artifacts/lab-03/screenshots/authentication/`, `…/staff-queue/`, `…/staff-ticket-detail/`, `…/user-management/` (each with `desktop`, `tablet`, `mobile` files).
