// Shared ticket-status badge (ui-spec §2). One human label and one distinct
// style per status; text always accompanies colour. Reused by Requester screens
// now and by the Staff Queue / Staff Ticket Detail in Issues #26/#27.

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

const STATUS_MODIFIERS: Record<string, string> = {
  NEW: "new",
  OPEN: "open",
  IN_PROGRESS: "in-progress",
  WAITING_FOR_REQUESTER: "waiting",
  RESOLVED: "resolved",
  CLOSED: "closed",
  REOPENED: "reopened",
  CANCELLED: "cancelled",
};

export default function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const modifier = STATUS_MODIFIERS[status];
  // The RESOLVED check icon is added via CSS ::before so it stays decorative
  // and the visible label text remains exactly "Resolved".
  return (
    <span
      className={`zen-status-badge${modifier ? ` zen-status-badge--${modifier}` : ""}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
