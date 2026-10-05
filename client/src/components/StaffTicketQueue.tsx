// IT Staff Ticket Queue — ui-spec.md §4.4
// States: loading → success (table/cards/empty/no-results) | error | forbidden
// Reuses the shared StatusBadge and PriorityBadge and the My Tickets layout
// classes (mt-*) so the table→cards responsive behaviour is identical.
// No URL query sync (confirmed): search, filters, sort and page live in state.
import { useEffect, useState } from "react";
import {
  fetchStaffTickets,
  fetchAssignees,
  fetchCategories,
  ApiError,
  type Category,
  type Assignee,
  type StaffQueueTicket,
  type StaffQueueCounts,
  type Pagination,
} from "../api";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";

interface Props {
  onOpenTicket?: (ticketId: number) => void;
}

interface Filters {
  search: string;
  status: string; // "ACTIVE" (default) | "ALL" | one status
  priority: string;
  categoryId: string;
  owner: string; // "" (Any) | "ME" | "UNASSIGNED" | "<userId>"
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "ACTIVE",
  priority: "",
  categoryId: "",
  owner: "",
};

type SortField = "itPriority" | "ticketNumber" | "currentStatus" | "updatedAt";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_REQUESTER", label: "Waiting for Requester" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REOPENED", label: "Reopened" },
  { value: "CANCELLED", label: "Cancelled" },
];

function hasActiveFilters(f: Filters, resolvedOnly: boolean) {
  return !!(
    f.search ||
    f.status !== "ACTIVE" ||
    f.priority ||
    f.categoryId ||
    f.owner ||
    resolvedOnly
  );
}

// Pagination window (max 5 page buttons) — same rule as My Tickets.
function pageWindow(current: number, total: number, max = 5) {
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(total, start + max - 1);
  start = Math.max(1, end - max + 1);
  return { start, end };
}

export default function StaffTicketQueue({ onOpenTicket }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // The "Requester says resolved" chip has no server filter (BR-57), so it is a
  // client-side filter over the current result page.
  const [resolvedOnly, setResolvedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("itPriority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [tickets, setTickets] = useState<StaffQueueTicket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [counts, setCounts] = useState<StaffQueueCounts>({
    unassigned: 0,
    assignedToMe: 0,
    requesterResolved: 0,
  });
  const [loadState, setLoadState] = useState<
    "loading" | "success" | "error" | "forbidden"
  >("loading");

  // Reference data for filter dropdowns (load once).
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    fetchAssignees()
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, []);

  // Fetch the queue whenever a query parameter changes.
  useEffect(() => {
    let active = true;
    setLoadState("loading");

    fetchStaffTickets({
      search: filters.search || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
      owner: filters.owner || undefined,
      // false → undefined so the param is omitted (fetchStaffTickets drops it)
      requesterResolved: resolvedOnly || undefined,
      sortBy,
      sortDir,
      page,
    })
      .then((res) => {
        if (!active) return;
        setTickets(res.data);
        setPagination(res.pagination);
        setCounts(res.counts);
        setLoadState("success");
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) {
          setLoadState("forbidden");
        } else {
          setLoadState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [
    filters.search,
    filters.status,
    filters.priority,
    filters.categoryId,
    filters.owner,
    resolvedOnly,
    sortBy,
    sortDir,
    page,
  ]);

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setResolvedOnly(false);
    setPage(1);
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function sortIndicator(field: SortField) {
    if (sortBy !== field) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  // ── Forbidden (full-page) ────────────────────────────────────────────────
  if (loadState === "forbidden") {
    return (
      <div className="zen-main">
        <QueueHeader counts={counts} filters={filters} resolvedOnly={resolvedOnly} onChip={() => {}} />
        <div
          className="zen-card"
          data-testid="forbidden-state"
          style={{ marginTop: 16, textAlign: "center" }}
        >
          <span className="zen-icon" aria-hidden="true">🔒</span>
          <h2 className="zen-section-title">You don't have access to the queue</h2>
          <p className="zen-muted">This area is for IT Staff.</p>
        </div>
      </div>
    );
  }

  // ── Error / safe failure (full-page) ──────────────────────────────────────
  if (loadState === "error") {
    return (
      <div className="zen-main">
        <QueueHeader counts={counts} filters={filters} resolvedOnly={resolvedOnly} onChip={() => {}} />
        <div
          className="zen-card"
          data-testid="failure-state"
          style={{ marginTop: 16, textAlign: "center" }}
        >
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Unable to Load the Queue</h2>
          <p className="zen-muted">Could not connect to the server.</p>
          <button className="zen-btn zen-btn-primary" onClick={() => setLoadState("loading")}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Loading / success share the header + filter bar so the filter controls
  //    stay mounted across a reload (keeps typed input and focus) ────────────
  const active = hasActiveFilters(filters, resolvedOnly);
  // The "Requester says resolved" chip now filters server-side via
  // requesterResolved=true, so rows match the chip count (no page-local filter).
  const displayed = tickets;

  const total = pagination?.totalCount ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const { start: winStart, end: winEnd } = pageWindow(page, totalPages);
  const pageStart = total === 0 ? 0 : (page - 1) * (pagination?.pageSize ?? 10) + 1;
  const pageEnd = Math.min(page * (pagination?.pageSize ?? 10), total);

  function onChip(kind: "unassigned" | "me" | "resolved") {
    if (kind === "unassigned") {
      setResolvedOnly(false);
      handleFilterChange("owner", filters.owner === "UNASSIGNED" ? "" : "UNASSIGNED");
    } else if (kind === "me") {
      setResolvedOnly(false);
      handleFilterChange("owner", filters.owner === "ME" ? "" : "ME");
    } else {
      setResolvedOnly((v) => !v);
      setPage(1);
    }
  }

  return (
    <div className="zen-main">
      <QueueHeader counts={counts} filters={filters} resolvedOnly={resolvedOnly} onChip={onChip} />

      <FilterBar
        filters={filters}
        categories={categories}
        assignees={assignees}
        onFilterChange={handleFilterChange}
        onClear={clearFilters}
      />

      {loadState === "loading" ? (
        <div className="zen-card" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="zen-spinner" aria-label="Loading queue" />
          <p className="zen-muted">Loading queue…</p>
        </div>
      ) : (
      <>
      {/* Empty */}
      {displayed.length === 0 && !active && (
        <div className="zen-card" data-testid="empty-state" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">🎫</span>
          <h2 className="zen-section-title">The queue is empty</h2>
          <p className="zen-muted">There are no tickets to show.</p>
        </div>
      )}

      {/* No results */}
      {displayed.length === 0 && active && (
        <div className="zen-card" data-testid="no-results-state" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">🔍</span>
          <h2 className="zen-section-title">No Matching Tickets</h2>
          <p className="zen-muted" style={{ marginBottom: 16 }}>
            No tickets match your current search or filters.
          </p>
          <button className="zen-btn zen-btn-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {/* Table + pagination */}
      {displayed.length > 0 && (
        <div className="zen-card mt-tickets" data-testid="queue-table">
          <div className="mt-table-wrap">
            <table className="mt-table" aria-label="Ticket Queue">
              <thead>
                <tr>
                  <th>
                    <button className="mt-sort-btn" onClick={() => toggleSort("ticketNumber")} aria-label="Sort by Ticket No.">
                      Ticket No.{sortIndicator("ticketNumber")}
                    </button>
                  </th>
                  <th>Summary</th>
                  <th>Requester</th>
                  <th className="sq-hide-tablet">Category</th>
                  <th>
                    <button className="mt-sort-btn" onClick={() => toggleSort("itPriority")} aria-label="Sort by IT Priority">
                      IT Priority{sortIndicator("itPriority")}
                    </button>
                  </th>
                  <th>
                    <button className="mt-sort-btn" onClick={() => toggleSort("currentStatus")} aria-label="Sort by Status">
                      Status{sortIndicator("currentStatus")}
                    </button>
                  </th>
                  <th>Owner</th>
                  <th className="sq-hide-tablet">
                    <button className="mt-sort-btn" onClick={() => toggleSort("updatedAt")} aria-label="Sort by Updated">
                      Updated{sortIndicator("updatedAt")}
                    </button>
                  </th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((t) => (
                  <tr key={t.id}>
                    <td className="mt-ticket-no">
                      <button
                        className="sq-link"
                        onClick={() => onOpenTicket?.(t.id)}
                        aria-label={`Open ticket ${t.ticketNumber}`}
                      >
                        {t.ticketNumber}
                      </button>
                    </td>
                    <td className="sq-summary" data-testid={`summary-${t.id}`}>
                      <span className="sq-summary-text">{t.summary}</span>
                      {t.requesterResolvedAt && (
                        <span className="sq-resolved-marker" data-testid={`resolved-marker-${t.id}`}>
                          ✓ Requester says resolved
                        </span>
                      )}
                    </td>
                    <td>{t.requester.name}</td>
                    <td className="sq-hide-tablet">{t.category}</td>
                    <td><PriorityBadge priority={t.itPriority} /></td>
                    <td><StatusBadge status={t.currentStatus} /></td>
                    <td>{renderOwner(t)}</td>
                    <td className="sq-hide-tablet">{new Date(t.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="zen-btn zen-btn-secondary mt-page-btn"
                        onClick={() => onOpenTicket?.(t.id)}
                        aria-label={`Open ticket ${t.ticketNumber} detail`}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-cards">
            {displayed.map((t) => (
              <div key={t.id} className="mt-card zen-card">
                <div className="mt-card-row">
                  <span className="mt-card-label">Status</span>
                  <StatusBadge status={t.currentStatus} />
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">IT Priority</span>
                  <PriorityBadge priority={t.itPriority} />
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Ticket No.</span>
                  <span className="mt-ticket-no">{t.ticketNumber}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Summary</span>
                  <span>{t.summary}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Requester</span>
                  <span>{t.requester.name}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Category</span>
                  <span>{t.category}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Owner</span>
                  <span>{renderOwner(t)}</span>
                </div>
                {t.requesterResolvedAt && (
                  <div className="mt-card-row">
                    <span className="sq-resolved-marker">✓ Requester says resolved</span>
                  </div>
                )}
                <div className="mt-card-row">
                  <button
                    className="zen-btn zen-btn-secondary"
                    style={{ width: "100%" }}
                    onClick={() => onOpenTicket?.(t.id)}
                    aria-label={`Open ticket ${t.ticketNumber} detail`}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-pagination" aria-label="Pagination">
            <span className="mt-count">
              Showing {pageStart}–{pageEnd} of {total} ticket{total !== 1 ? "s" : ""}
            </span>

            <div className="mt-page-btns">
              <button
                className="zen-btn zen-btn-secondary mt-page-btn"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                Previous
              </button>

              {winStart > 1 && (
                <>
                  <button className="zen-btn zen-btn-secondary mt-page-btn" onClick={() => setPage(1)} aria-label="Page 1">1</button>
                  {winStart > 2 && <span className="mt-ellipsis">…</span>}
                </>
              )}

              {Array.from({ length: Math.max(0, winEnd - winStart + 1) }, (_, i) => winStart + i).map((p) => (
                <button
                  key={p}
                  className={`zen-btn mt-page-btn${p === page ? " mt-page-btn--active" : " zen-btn-secondary"}`}
                  onClick={() => setPage(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p}
                </button>
              ))}

              {winEnd < totalPages && (
                <>
                  {winEnd < totalPages - 1 && <span className="mt-ellipsis">…</span>}
                  <button className="zen-btn zen-btn-secondary mt-page-btn" onClick={() => setPage(totalPages)} aria-label={`Page ${totalPages}`}>
                    {totalPages}
                  </button>
                </>
              )}

              <button
                className="zen-btn zen-btn-secondary mt-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ── Helpers / sub-components ──────────────────────────────────────────────────

function renderOwner(t: StaffQueueTicket) {
  if (!t.owner) return <span className="zen-muted">Unassigned</span>;
  return (
    <span>
      {t.owner.name}
      {!t.owner.isActiveStaff && <span className="sq-inactive"> (inactive)</span>}
    </span>
  );
}

interface HeaderProps {
  counts: StaffQueueCounts;
  filters: Filters;
  resolvedOnly: boolean;
  onChip: (kind: "unassigned" | "me" | "resolved") => void;
}

function QueueHeader({ counts, filters, resolvedOnly, onChip }: HeaderProps) {
  return (
    <div className="mt-header">
      <h1 className="zen-section-title" style={{ fontSize: 24 }}>Ticket Queue</h1>
      <div className="sq-chips" role="group" aria-label="Queue counts">
        <button
          type="button"
          className={`sq-chip${filters.owner === "UNASSIGNED" ? " sq-chip--active" : ""}`}
          aria-pressed={filters.owner === "UNASSIGNED"}
          onClick={() => onChip("unassigned")}
        >
          Unassigned <span className="sq-chip-count">{counts.unassigned}</span>
        </button>
        <button
          type="button"
          className={`sq-chip${filters.owner === "ME" ? " sq-chip--active" : ""}`}
          aria-pressed={filters.owner === "ME"}
          onClick={() => onChip("me")}
        >
          Assigned to me <span className="sq-chip-count">{counts.assignedToMe}</span>
        </button>
        <button
          type="button"
          className={`sq-chip${resolvedOnly ? " sq-chip--active" : ""}`}
          aria-pressed={resolvedOnly}
          onClick={() => onChip("resolved")}
        >
          Requester says resolved <span className="sq-chip-count">{counts.requesterResolved}</span>
        </button>
      </div>
    </div>
  );
}

interface FilterBarProps {
  filters: Filters;
  categories: Category[];
  assignees: Assignee[];
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClear: () => void;
}

function FilterBar({ filters, categories, assignees, onFilterChange, onClear }: FilterBarProps) {
  return (
    <div className="mt-filter-row">
      <input
        className="zen-input mt-search"
        type="search"
        placeholder="Search number, summary, requester…"
        aria-label="Search tickets"
        value={filters.search}
        onChange={(e) => onFilterChange("search", e.target.value)}
      />
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => onFilterChange("status", e.target.value)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by IT priority"
        value={filters.priority}
        onChange={(e) => onFilterChange("priority", e.target.value)}
      >
        <option value="">All Priorities</option>
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by category"
        value={filters.categoryId}
        onChange={(e) => onFilterChange("categoryId", e.target.value)}
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by owner"
        value={filters.owner}
        onChange={(e) => onFilterChange("owner", e.target.value)}
      >
        <option value="">Any Owner</option>
        <option value="ME">Me</option>
        <option value="UNASSIGNED">Unassigned</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button className="zen-btn zen-btn-secondary" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}
