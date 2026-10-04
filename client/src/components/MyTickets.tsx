// My Tickets screen — ui-spec.md §10.4
// States: loading → success (table/cards/empty/no-results) | error
// Always shows FilterRow once data has loaded (avoids hiding the search input).
import { useEffect, useState } from "react";
import {
  fetchTickets,
  fetchCategories,
  type Category,
  type TicketListItem,
  type Pagination,
} from "../api";

interface Props {
  onCreateTicket: () => void;
  onOpenTicket?: (ticketId: number) => void;
}

interface Filters {
  search: string;
  categoryId: string;
  priority: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { search: "", categoryId: "", priority: "", status: "" };

function hasActiveFilters(f: Filters) {
  return !!(f.search || f.categoryId || f.priority || f.status);
}

// ── Pagination window (max 5 page buttons, with "…" separators) ────────────

function pageWindow(current: number, total: number, max = 5) {
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(total, start + max - 1);
  start = Math.max(1, end - max + 1);
  return { start, end };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyTickets({ onCreateTicket, onOpenTicket }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<"createdAt" | "ticketNumber">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");

  // Load categories once for filter dropdown
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Fetch tickets whenever key parameters change
  useEffect(() => {
    let active = true;
    setLoadState("loading");

    fetchTickets({
      search: filters.search || undefined,
      categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
      priority: filters.priority || undefined,
      status: filters.status || undefined,
      sortBy,
      sortDir,
      page,
    })
      .then((res) => {
        if (!active) return;
        setTickets(res.data);
        setPagination(res.pagination);
        setLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [page, filters.search, filters.categoryId, filters.priority, filters.status, sortBy, sortDir]);

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function toggleSort(field: "createdAt" | "ticketNumber") {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="zen-main">
        <ScreenHeader onCreateTicket={onCreateTicket} />
        <div className="zen-card" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="zen-spinner" aria-label="Loading tickets" />
          <p className="zen-muted">Loading tickets…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (loadState === "error") {
    return (
      <div className="zen-main">
        <ScreenHeader onCreateTicket={onCreateTicket} />
        <div className="zen-card" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Unable to Load Tickets</h2>
          <p className="zen-muted">Could not connect to the server.</p>
          <button className="zen-btn zen-btn-primary" onClick={() => setLoadState("loading")}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Success — always show header + filter row ────────────────────────────

  const active = hasActiveFilters(filters);
  const total = pagination?.totalCount ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const { start: winStart, end: winEnd } = pageWindow(page, totalPages);
  const pageStart = (page - 1) * (pagination?.pageSize ?? 10) + 1;
  const pageEnd = Math.min(page * (pagination?.pageSize ?? 10), total);

  return (
    <div className="zen-main">
      <ScreenHeader onCreateTicket={onCreateTicket} />

      <FilterRow
        filters={filters}
        categories={categories}
        onFilterChange={handleFilterChange}
        onClear={clearFilters}
      />

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {tickets.length === 0 && !active && (
        <div
          className="zen-card"
          data-testid="empty-state"
          style={{ marginTop: 16, textAlign: "center" }}
        >
          <span className="zen-icon" aria-hidden="true">🎫</span>
          <h2 className="zen-section-title">No Tickets Yet</h2>
          <p className="zen-muted" style={{ marginBottom: 24 }}>
            You haven't created any tickets. Create your first one now.
          </p>
          <button className="zen-btn zen-btn-primary" onClick={onCreateTicket}>
            Create Ticket
          </button>
        </div>
      )}

      {/* ── No-Results state ─────────────────────────────────────────────── */}
      {tickets.length === 0 && active && (
        <div
          className="zen-card"
          data-testid="no-results-state"
          style={{ marginTop: 16, textAlign: "center" }}
        >
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

      {/* ── Tickets table + pagination ────────────────────────────────────── */}
      {tickets.length > 0 && (
        <div className="zen-card mt-tickets" data-testid="tickets-table">
          {/* Desktop table */}
          <div className="mt-table-wrap">
            <table className="mt-table" aria-label="My Tickets">
              <thead>
                <tr>
                  <th>
                    <button
                      className="mt-sort-btn"
                      onClick={() => toggleSort("ticketNumber")}
                      aria-label={`Sort by Ticket No.`}
                    >
                      Ticket No.{sortBy === "ticketNumber" ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                    </button>
                  </th>
                  <th>
                    <button
                      className="mt-sort-btn"
                      onClick={() => toggleSort("createdAt")}
                      aria-label={`Sort by Created Date`}
                    >
                      Created Date{sortBy === "createdAt" ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                    </button>
                  </th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    className="mt-row-clickable"
                    onClick={() => onOpenTicket?.(t.id)}
                    role={onOpenTicket ? "button" : undefined}
                    tabIndex={onOpenTicket ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onOpenTicket && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onOpenTicket(t.id);
                      }
                    }}
                    aria-label={onOpenTicket ? `Open ticket ${t.ticketNumber}` : undefined}
                  >
                    <td className="mt-ticket-no">{t.ticketNumber}</td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="mt-summary" data-testid={`summary-${t.id}`}>{t.summary}</td>
                    <td>{t.category}</td>
                    <td><PriorityBadge priority={t.requestedPriority} /></td>
                    <td><StatusBadge status={t.currentStatus} /></td>
                    <td>{new Date(t.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list (visually shown via CSS, hidden on desktop) */}
          <div className="mt-cards" aria-hidden="true">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="mt-card zen-card mt-row-clickable"
                onClick={() => onOpenTicket?.(t.id)}
              >
                <div className="mt-card-row">
                  <span className="mt-card-label">Ticket No.</span>
                  <span className="mt-ticket-no">{t.ticketNumber}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Summary</span>
                  <span>{t.summary}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Category</span>
                  <span>{t.category}</span>
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Priority</span>
                  <PriorityBadge priority={t.requestedPriority} />
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Status</span>
                  <StatusBadge status={t.currentStatus} />
                </div>
                <div className="mt-card-row">
                  <span className="mt-card-label">Created</span>
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
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
                  <button
                    className="zen-btn zen-btn-secondary mt-page-btn"
                    onClick={() => setPage(1)}
                    aria-label="Page 1"
                  >
                    1
                  </button>
                  {winStart > 2 && <span className="mt-ellipsis">…</span>}
                </>
              )}

              {Array.from({ length: winEnd - winStart + 1 }, (_, i) => winStart + i).map((p) => (
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
                  <button
                    className="zen-btn zen-btn-secondary mt-page-btn"
                    onClick={() => setPage(totalPages)}
                    aria-label={`Page ${totalPages}`}
                  >
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
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScreenHeader({ onCreateTicket }: { onCreateTicket: () => void }) {
  return (
    <div className="mt-header">
      <h1 className="zen-section-title" style={{ fontSize: 24 }}>
        My Tickets
      </h1>
      <button className="zen-btn zen-btn-primary" onClick={onCreateTicket}>
        Create Ticket
      </button>
    </div>
  );
}

interface FilterRowProps {
  filters: Filters;
  categories: Category[];
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClear: () => void;
}

function FilterRow({ filters, categories, onFilterChange, onClear }: FilterRowProps) {
  return (
    <div className="mt-filter-row">
      <input
        className="zen-input mt-search"
        type="search"
        placeholder="Search tickets…"
        aria-label="Search tickets"
        value={filters.search}
        onChange={(e) => onFilterChange("search", e.target.value)}
      />
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by category"
        value={filters.categoryId}
        onChange={(e) => onFilterChange("categoryId", e.target.value)}
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="zen-select mt-filter-select"
        aria-label="Filter by priority"
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
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => onFilterChange("status", e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="NEW">New</option>
      </select>
      <button className="zen-btn zen-btn-secondary" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   "#B3261E",
  MEDIUM: "#B45309",
  LOW:    "#0B7A46",
};

function PriorityBadge({ priority }: { priority: string }) {
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return (
    <span
      className="mt-badge"
      style={{ background: PRIORITY_COLORS[priority] ?? "#5a6b62" }}
      aria-label={`Priority: ${label}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="mt-badge"
      style={{ background: "var(--color-secondary)" }}
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
}
