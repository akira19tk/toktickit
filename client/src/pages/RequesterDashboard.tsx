// Requester Dashboard — ui-spec.md §6, specification §8.1, handout §4.6 (Issue #52).
// Backend-computed summary of ONLY the authenticated Requester's tickets.
// States: loading → success (cards + recent list, with empty cues) | error.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchRequesterDashboard, type RequesterDashboard } from "../api";
import { formatDateTime } from "../lib/formatDate";
import StatusBadge from "../components/StatusBadge";

type MetricKey = keyof RequesterDashboard["metrics"];

// Consistent inline SVG icons (stroke-based, 24×24, aria-hidden). No emoji.
function Icon({ name }: { name: MetricKey }) {
  const paths: Record<MetricKey, ReactNode> = {
    open: <path d="M3 13h4l2 3h6l2-3h4M5 6l-2 7v6h18v-6l-2-7H5z" />,
    inProgress: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
    waitingForMe: <path d="M6 2h12M6 22h12M8 2v4l4 4 4-4V2M8 22v-4l4-4 4 4v4" />,
    resolved: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
    closed: <><rect x="4" y="7" width="16" height="13" rx="1" /><path d="M3 4h18v3H3zM9 11h6" /></>,
    recentlyResolved: <><path d="M3.5 12a8 8 0 1 0 2.5-5.8M4 3v4h4" /><path d="M9 12l2.2 2.2L15 10" /></>,
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
const CARDS: Array<{
  key: MetricKey;
  label: string;
  viewAll: string;
  to: string;
}> = [
  { key: "open",             label: "My Open",           viewAll: "View all open tickets",            to: "/tickets?status=OPEN" },
  { key: "inProgress",       label: "In Progress",       viewAll: "View all in-progress tickets",     to: "/tickets?status=IN_PROGRESS" },
  { key: "waitingForMe",     label: "Waiting for Me",    viewAll: "View all tickets waiting for you", to: "/tickets?status=WAITING_FOR_REQUESTER" },
  { key: "resolved",         label: "Resolved",          viewAll: "View all resolved tickets",        to: "/tickets?status=RESOLVED" },
  { key: "closed",           label: "Closed",            viewAll: "View all closed tickets",          to: "/tickets?status=CLOSED" },
  { key: "recentlyResolved", label: "Recently Resolved", viewAll: "View all recently resolved tickets", to: "/tickets?status=RESOLVED" },
];

export default function RequesterDashboard() {
  const [data, setData] = useState<RequesterDashboard | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    fetchRequesterDashboard()
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
        <Header />
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
        <Header />
        <div className="zen-card" style={{ marginTop: 16, textAlign: "center" }}>
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

  const { metrics, myRecentTickets } = data;

  return (
    <div className="zen-dash">
      <Header />

      {/* ── Metric cards ─────────────────────────────────────────────────── */}
      <section aria-label="Ticket summary" className="zen-dash-grid">
        {CARDS.map((card) => {
          const count = metrics[card.key];
          const attention = card.key === "waitingForMe" && count > 0;
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
                <span className="zen-dash-attention" data-testid="waiting-attention">
                  Needs your attention
                </span>
              )}
              <span className="zen-dash-card-viewall" aria-hidden="true">View all →</span>
            </Link>
          );
        })}
      </section>

      {/* ── My Recent Tickets ────────────────────────────────────────────── */}
      <section aria-label="My recent tickets" className="zen-card zen-dash-recent" style={{ marginTop: 16 }}>
        <h2 className="zen-section-title" style={{ fontSize: 18 }}>My Recent Tickets</h2>
        {myRecentTickets.length === 0 ? (
          <p className="zen-muted" data-testid="recent-empty">
            You have no tickets yet. Create one to get started.
          </p>
        ) : (
          <ul className="zen-dash-recent-list">
            {myRecentTickets.map((t) => (
              <li key={t.id}>
                <Link to={`/tickets/${t.id}`} className="zen-dash-recent-row">
                  <span className="zen-dash-recent-no">{t.ticketNumber}</span>
                  <span className="zen-dash-recent-summary">{t.summary}</span>
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

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section aria-label="Quick actions" className="zen-dash-actions">
        <Link to="/tickets/new" className="zen-btn zen-btn-primary">Create Ticket</Link>
        <Link to="/tickets" className="zen-btn zen-btn-secondary">View My Tickets</Link>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="zen-dash-header">
      <h1 className="zen-section-title" style={{ fontSize: 24 }}>Dashboard</h1>
    </div>
  );
}
