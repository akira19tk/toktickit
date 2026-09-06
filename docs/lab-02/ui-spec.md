# Lab 2 UI Specification — Zen Green Theme

## 1. Color Tokens

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#006B3C` | App header, primary buttons, strong emphasis |
| `--color-secondary` | `#0B7A46` | Active tabs, focus accents, links, hover states |
| `--color-pale` | `#EAF6EF` | Selected rows, success backgrounds, subtle emphasis |
| `--color-bg` | `#F5F7F6` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, panels (border `1px solid #E1E6E3`, shadow `0 1px 3px rgba(0,0,0,0.06)`) |
| `--color-text` | `#1F2A25` | Body text (dark charcoal-green, not pure black) |
| `--color-error` | `#B3261E` | Error text/border |
| `--color-warning` | `#B45309` (on `#FEF3C7`) | Warning callouts/badges |
| `--color-success` | `#0B7A46` (on `#EAF6EF`) | Success confirmations |
| `--color-editable-border` | `#C7CDC9` | Editable field border |
| `--color-readonly-bg` | `#F1F3F0` | Read-only field background |

## 2. Typography and Spacing

- Font: system UI stack (`-apple-system, Segoe UI, Roboto, sans-serif`)
- Base size 16px; labels 14px/600 weight; section headers 20px/700
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px; form field vertical gap = 16px
- Line height 1.5 for body text, 1.3 for headers

## 3. Field States

| State | Style |
|---|---|
| Editable | White background, `--color-editable-border`, 1px, 6px radius |
| Read-only | `--color-readonly-bg` background, no border-hover, cursor `default` |
| Invalid | `--color-error` border (2px) + error text 12px directly below field |
| Disabled | 50% opacity, cursor `not-allowed`, no hover/focus ring |
| Focused | 2px `--color-secondary` outline, visible for keyboard nav (never `outline: none`) |

## 4. Required-Field Marker and Validation Placement

- Required fields show a red asterisk (`*`) immediately after the label text.
- The asterisk is a visual hint only — never the sole indicator of a validation failure.
- Validation messages render directly under their field, 12px, `--color-error`, appear on
  blur and on submit attempt; never collected into a single top-of-form banner only.

## 5. Button Hierarchy and Busy State

| Type | Style |
|---|---|
| Primary | Solid `--color-primary`, white text |
| Secondary | Outlined `--color-secondary`, text `--color-secondary` |
| Tertiary | Text-only link style, `--color-secondary` |
| Destructive | Solid `--color-error`, white text (used for attachment removal confirm) |
| Disabled | 50% opacity, no pointer events |
| Busy | Spinner + disabled state; label changes to "Submitting…" |

## 6. Attachment Selection and Error Presentation

- File picker accepts `.jpg,.jpeg,.png,.webp,.pdf` via the `accept` attribute (client-side
  hint only — backend re-validates MIME type and size).
- Selected files preview as a chip list (filename + size); invalid files show an inline
  error chip with the specific reason (type/size/limit) rather than a generic message.
- Upload progress shown per file; failed uploads are retryable individually.

## 7. Screen States

Every screen implements: **Initial**, **Loading**, **Success**, **Empty**, **No-Results**
(list screens only), and **Failure** states, each visually distinct:

- Loading: skeleton or spinner, no layout jump when data arrives
- Empty: icon + message + primary CTA (e.g. "Create your first ticket")
- No-Results: message + "Clear Filters" secondary button, distinct copy from Empty
- Failure: icon + message + "Try Again" button, never a raw error dump

## 8. Responsive Layout Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥992px | Multi-column form; My Tickets as a full data table; content max-width 1140px, centered |
| Tablet 768–991px | Two-column form where practical; Summary/Description get full width |
| Mobile <768px | Single-column stacked fields; My Tickets renders as cards, not a squeezed table; buttons full-width and touch-sized (min 44px height) |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, no horizontal page scroll |

## 9. Accessibility

- Every icon-only control has an `aria-label` and a tooltip.
- All form controls reachable via Tab in logical order; visible focus ring at every
  breakpoint.
- Color is never the only indicator of state (badges pair color with text, e.g. "High" not
  just red).
- Form errors are announced via `aria-live="polite"` region for screen readers.

## 10. Screen-by-Screen Notes

### 10.1 Application Shell
- TokTickIT logo/title (left), My Tickets + Create Ticket nav (center), current Requester
  name + "Change Requester" link (right); collapses to hamburger menu on mobile.
- Active nav item underlined in `--color-secondary`.

### 10.2 Development Requester Selection
- Centered card, icon, dropdown (`aria-label="Development Requester"`), info banner
  "Only active development requesters are shown", disclaimer banner about Lab 3 auth,
  Cancel + Continue buttons (Continue disabled until a value is chosen).

### 10.3 Create Ticket
- Read-only fields (Ticket Number placeholder "Generated after submission", Ticket Date
  "Generated after submission") grouped at top, styled per §3 read-only state.
- Classification fields (Category, Related System, Requested Priority) grouped together.
- Summary (single-line) and Description (resizable textarea, min 4 rows) given full width.
- Attachment picker below main fields, chip list per §6.
- Primary "Submit Ticket" + secondary "Cancel" at bottom; Submit shows busy state per §5.
- Success state: green confirmation panel with Ticket Number + "View Ticket" / "Create
  Another" actions.

### 10.4 My Tickets
- Header: "My Tickets" title + "Create Ticket" primary button (top right).
- Filter row: search input, Category/Priority/Status selects, "Clear Filters" tertiary
  button — all wrap onto multiple rows on tablet/mobile rather than overflowing.
- Table columns (desktop): Ticket No., Created Date, Summary, Category, Requested
  Priority (badge), Current Status (badge), Last Updated. Mobile: same fields as a
  card with label/value pairs.
- Pagination bar at bottom: "Showing X to Y of Z tickets" + Previous/page numbers/Next.

### 10.5 Requester Ticket Detail
- Read-only header block (Ticket No., Date, Category, Related System, Requester,
  Requested Priority, Current Status, Summary, Description) — visually grouped and
  clearly separated (divider or card boundary) from the Attachments section below.
- Attachments section: list of chips/cards (filename, size, uploaded date), Download
  icon-button on active items, Remove icon-button opening a confirm dialog requiring a
  reason (§6, BR-18), removed attachments shown grayed-out with "Removed" badge and no
  Download control.

## 11. Visual Inspection Checklist (pre-submission)

- [ ] Compared against this document and approved sample screens — not personal memory
- [ ] Desktop / tablet / mobile screenshots captured for Create Ticket, My Tickets, Ticket
      Detail and saved to `artifacts/lab-02/screenshots/{screen}/`
- [ ] Badge colors consistent across all screens for the same priority/status value
- [ ] No console errors/warnings visible during manual walkthrough
