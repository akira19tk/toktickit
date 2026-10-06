// Staff Ticket Queue query-parameter parser (BR-56, BR-57)
// Pure, DB-free parsing so it can be unit-tested (UNIT-06). The route layer
// resolves the parsed owner intent (ME) to the session user id and builds the
// Prisma query from the normalized result.
//
// Fallback rule (BR-56 / api-spec §5): a page or pageSize that is not a
// positive integer, a pageSize above 50, or an unsupported sort/filter value
// falls back to the default — never an error.

import type { Priority, TicketStatus } from "@prisma/client";

export type OwnerFilter =
  | { kind: "ANY" }
  | { kind: "ME" }
  | { kind: "UNASSIGNED" }
  | { kind: "USER"; id: number };

export type StatusFilter = "ACTIVE" | "ALL" | TicketStatus;
export type SortBy =
  | "itPriority"
  | "createdAt"
  | "updatedAt"
  | "ticketNumber"
  | "currentStatus";
export type SortDir = "asc" | "desc";

export interface StaffQueueParams {
  search?: string;
  status: StatusFilter;
  priority?: Priority;
  categoryId?: number;
  owner: OwnerFilter;
  requesterResolved: boolean;
  sortBy: SortBy;
  sortDir: SortDir;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const DEFAULT_SORT_BY: SortBy = "itPriority";
const DEFAULT_SORT_DIR: SortDir = "desc";

const VALID_STATUSES: ReadonlySet<string> = new Set<TicketStatus>([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
]);

const VALID_PRIORITIES: ReadonlySet<string> = new Set<Priority>([
  "LOW",
  "MEDIUM",
  "HIGH",
]);

// Lowercased sort key → canonical camelCase sort field.
const SORT_BY_ALIASES: Record<string, SortBy> = {
  itpriority: "itPriority",
  createdat: "createdAt",
  updatedat: "updatedAt",
  ticketnumber: "ticketNumber",
  currentstatus: "currentStatus",
};

// Positive integer or fall back. Rejects non-digits, zero, negatives, decimals,
// and (when max is given) values above the max.
function parsePositiveInt(
  raw: unknown,
  fallback: number,
  max?: number
): number {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return fallback;
  const n = parseInt(s, 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
}

function parseOwner(raw: unknown): OwnerFilter {
  const s = String(raw ?? "").trim();
  const upper = s.toUpperCase();
  if (upper === "ME") return { kind: "ME" };
  if (upper === "UNASSIGNED") return { kind: "UNASSIGNED" };
  if (upper === "ANY" || s === "") return { kind: "ANY" };
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    if (id >= 1) return { kind: "USER", id };
  }
  return { kind: "ANY" }; // unsupported value → default
}

function parseStatus(raw: unknown): StatusFilter {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "" || s === "ACTIVE") return "ACTIVE";
  if (s === "ALL") return "ALL";
  if (VALID_STATUSES.has(s)) return s as TicketStatus;
  return "ACTIVE"; // unsupported value → default
}

export function parseStaffQueueQuery(
  query: Record<string, unknown>
): StaffQueueParams {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = parsePositiveInt(
    query.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  const sortByKey = String(query.sortBy ?? "").trim().toLowerCase();
  const sortBy = SORT_BY_ALIASES[sortByKey] ?? DEFAULT_SORT_BY;

  const sortDirRaw = String(query.sortDir ?? "").trim().toLowerCase();
  const sortDir: SortDir =
    sortDirRaw === "asc" ? "asc" : sortDirRaw === "desc" ? "desc" : DEFAULT_SORT_DIR;

  const search = String(query.search ?? "").trim() || undefined;

  const priorityRaw = String(query.priority ?? "").trim().toUpperCase();
  const priority = VALID_PRIORITIES.has(priorityRaw)
    ? (priorityRaw as Priority)
    : undefined;

  const categoryId = parsePositiveInt(query.categoryId, 0);

  // Only the exact string "true" enables the filter; any other value is
  // ignored (fallback rule). BR-57 / api-spec §5.
  const requesterResolved =
    String(query.requesterResolved ?? "").trim().toLowerCase() === "true";

  return {
    search,
    status: parseStatus(query.status),
    priority,
    categoryId: categoryId > 0 ? categoryId : undefined,
    owner: parseOwner(query.owner),
    requesterResolved,
    sortBy,
    sortDir,
    page,
    pageSize,
  };
}
