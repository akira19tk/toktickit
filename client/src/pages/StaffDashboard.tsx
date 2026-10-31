// IT Staff Dashboard — ui-spec.md §5, specification §8.1 (Issue #53).
// Backend-computed summary of the queue for IT Staff / Admin. Reuses the
// Requester dashboard's card, grid, icon and recent-list patterns so both
// dashboards look identical. States: loading → success (cards + urgent/recent
// lists, with empty cues) | error. ADMIN sees the same dashboard.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchStaffDashboard, type StaffDashboard, type StaffDashboardTicket } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/formatDate";
import StatusBadge from "../components/StatusBadge";
import PriorityBadge from "../components/PriorityBadge";

type MetricKey = keyof StaffDashboard["metrics"];

// Consistent inline SVG icons (stroke-based, 24×24, aria-hidden). No emoji.
function Icon({ name }: { name: MetricKey }) {
  const paths: Record<MetricKey, ReactNode> = {
    new: <><path d="M12 5v14M5 12h14" /></>,
    open: <path d="M3 13h4l2 3h6l2-3h4M5 6l-2 7v6h18v-6l-2-7H5z" />,
    inProgress: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
    waitingForRequester: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    myAssigned: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /><path d="M18 8l2 2 3-3" /></>,
    unassigned: <><circle cx="9" cy="8" r="4" /><path d="M1 21v-1a6 6 0 0 1 12 0v1" /><path d="M17 8h6" /></>,
    myOpenActions: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  };
  return (
    <svg
      className="zen-dash-card-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

// Metric card definitions — count key, label, drill-down (specification §8.1),
// and the accessible "View all …" phrasing for the whole-card link.
const CARDS: Array<{ key: MetricKey; label: string; viewAll: string; to: string }> = [
  { key: "new",                 label: "New",                   viewAll: "View all new tickets",             to: "/staff/queue?status=NEW" },
  { key: "open",                label: "Open",                  viewAll: "View all open tickets",            to: "/staff/queue?status=OPEN" },
  { key: "inProgress",          label: "In Progress",           viewAll: "View all in-progress tickets",     to: "/staff/queue?status=IN_PROGRESS" },
  { key: "waitingForRequester", label: "Waiting for Requester", viewAll: "View all tickets waiting for the requester", to: "/staff/queue?status=WAITING_FOR_REQUESTER" },
  { key: "myAssigned",          label: "My Assigned",           viewAll: "View tickets assigned to me",      to: "/staff/queue?owner=ME" },
  { key: "unassigned",          label: "Unassigned",            viewAll: "View unassigned tickets",          to: "/staff/queue?owner=UNASSIGNED" },
  { key: "myOpenActions",       label: "My Open Actions",       viewAll: "View my open actions",             to: "/staff/queue?actionAssignee=ME&actionStatus=OPEN" },
];

export default function StaffDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<StaffDashboard | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    fetchStaffDashboard()
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="zen-dash">
        <Header name={user?.name} />
        <div className="zen-card" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="zen-spinner" aria-label="Loading dashboard" />
          <p className="zen-muted">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Error (safe failure) ───────────────────────────────────────────────────
  if (loadState === "error" || !data) {
    return (
      <div className="zen-dash">
        <Header name={user?.name} />
        <div className="zen-card" role="alert" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Unable to Load Dashboard</h2>
          <p className="zen-muted">Could not reach the server. Please try again.</p>
          <button className="zen-btn zen-btn-primary" onClick={() => setReload((n) => n + 1)}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { metrics, myRecentTickets, urgentTickets } = data;

  return (
    <div className="zen-dash">
      <Header name={user?.name} />

      {/* ── Metric cards ─────────────────────────────────────────────────── */}
      <section aria-label="Queue summary" className="zen-dash-grid">
        {CARDS.map((card) => {
          const count = metrics[card.key];
          const attention = card.key === "myOpenActions" && count > 0;
          return (
            <Link
              key={card.key}
              to={card.to}
              className={`zen-card zen-dash-card${attention ? " zen-dash-card--attention" : ""}`}
              data-testid={`metric-${card.key}`}
              aria-label={`${card.viewAll}, ${count} ticket${count === 1 ? "" : "s"}`}
            >
              <Icon name={card.key} />
              <span className="zen-dash-card-count">{count}</span>
              <span className="zen-dash-card-label">{card.label}</span>
              {attention && (
                <span className="zen-dash-attention" data-testid="actions-attention">
                  Needs your attention
                </span>
              )}
              <span className="zen-dash-card-viewall" aria-hidden="true">View all →</span>
            </Link>
          );
        })}
      </section>

      {/* ── Urgent Tickets ───────────────────────────────────────────────── */}
      <TicketList
        testId="staff-urgent"
        title="Urgent Tickets"
        emptyTestId="urgent-empty"
        emptyText="No urgent tickets right now."
        viewAllTestId="urgent-viewall"
        viewAllTo="/staff/queue?itPriority=HIGH"
        tickets={urgentTickets}
        showPriority
      />

      {/* ── My Recent Tickets ────────────────────────────────────────────── */}
      <TicketList
        testId="staff-recent"
        title="My Recent Tickets"
        emptyTestId="recent-empty"
        emptyText="You have no assigned tickets yet."
        viewAllTestId="recent-viewall"
        viewAllTo="/staff/queue?owner=ME"
        tickets={myRecentTickets}
      />

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section aria-label="Quick actions" className="zen-dash-actions">
        <Link to="/staff/queue" className="zen-btn zen-btn-primary">Open Ticket Queue</Link>
        <Link to="/staff/queue?owner=UNASSIGNED" className="zen-btn zen-btn-secondary">Unassigned Tickets</Link>
      </section>
    </div>
  );
}

interface TicketListProps {
  testId: string;
  title: string;
  emptyTestId: string;
  emptyText: string;
  viewAllTestId: string;
  viewAllTo: string;
  tickets: StaffDashboardTicket[];
  showPriority?: boolean;
}

function TicketList({
  testId,
  title,
  emptyTestId,
  emptyText,
  viewAllTestId,
  viewAllTo,
  tickets,
  showPriority,
}: TicketListProps) {
  return (
    <section aria-label={title} className="zen-card zen-dash-recent" style={{ marginTop: 16 }} data-testid={testId}>
      <div className="zen-dash-recent-head">
        <h2 className="zen-section-title" style={{ fontSize: 18 }}>{title}</h2>
        <Link to={viewAllTo} className="zen-dash-recent-viewall" data-testid={viewAllTestId}>
          View all →
        </Link>
      </div>
      {tickets.length === 0 ? (
        <p className="zen-muted" data-testid={emptyTestId}>{emptyText}</p>
      ) : (
        <ul className="zen-dash-recent-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link to={`/staff/tickets/${t.id}`} className="zen-dash-recent-row">
                <span className="zen-dash-recent-no">{t.ticketNumber}</span>
                <span className="zen-dash-recent-summary">{t.summary}</span>
                {showPriority && <PriorityBadge priority={t.itPriority} />}
                <StatusBadge status={t.currentStatus} />
                <span className="zen-dash-recent-updated">
                  Updated {formatDateTime(t.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ name }: { name?: string }) {
  return (
    <div className="zen-dash-header">
      <h1 className="zen-section-title" style={{ fontSize: 24 }}>Dashboard</h1>
      {name && <p className="zen-muted zen-dash-welcome">Welcome back, {name}</p>}
    </div>
  );
}
