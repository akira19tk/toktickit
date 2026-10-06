// Ticket status transition matrix (BR-32, BR-33; specification §5.3).
// Pure, dependency-free functions so UNIT-03 can test them in isolation and the
// staff status route can share exactly the same rules.

import type { TicketStatus } from "@prisma/client";

// Allowed target statuses for each source status. CANCELLED is terminal (no
// exits); CLOSED may only move to REOPENED. Mirrors the matrix in the spec.
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

// Targets reachable from `from`, as a fresh mutable array (callers expose it in
// API responses and must not mutate the shared matrix).
export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return [...STATUS_TRANSITIONS[from]];
}

// True when `from → to` is permitted by the matrix. A same-status pair is not a
// transition; the route reports that separately as NO_CHANGE.
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}
