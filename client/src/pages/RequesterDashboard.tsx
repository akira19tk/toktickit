// Requester Dashboard — ui-spec.md §6, specification §8.1 (Issue #52).
// Backend-computed summary of ONLY the authenticated Requester's tickets.
// States: loading → success (cards + recent list, with empty cues) | error.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRequesterDashboard, type RequesterDashboard } from "../api";
import StatusBadge from "../components/StatusBadge";

// Metric card definitions — count key, label, drill-down (specification §8.1).
const CARDS: Array<{
  key: keyof RequesterDashboard["metrics"];
  label: string;
  icon: string;
  to: string;
}> = [
  { key: "open",         label: "My Open",      icon: "📥", to: "/tickets?status=OPEN" },
  { key: "inProgress",   label: "In Progress",  icon: "🔧", to: "/tickets?status=IN_PROGRESS" },
  { key: "waitingForMe", label: "Waiting for Me", icon: "⏳", to: "/tickets?status=WAITING_FOR_REQUESTER" },
  { key: "resolved",     label: "Resolved",     icon: "✅", to: "/tickets?status=RESOLVED" },
  { key: "closed",       label: "Closed",       icon: "📦", to: "/tickets?status=CLOSED" },
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
              aria-label={`${card.label}: ${count} ticket${count === 1 ? "" : "s"}`}
            >
              <span className="zen-dash-card-icon" aria-hidden="true">{card.icon}</span>
              <span className="zen-dash-card-count">{count}</span>
              <span className="zen-dash-card-label">{card.label}</span>
              {attention && (
                <span className="zen-dash-attention" data-testid="waiting-attention">
                  ⚠ Needs your attention
                </span>
              )}
            </Link>
          );
        })}
      </section>

      {/* Recently resolved is a supporting cue, not a drill-down card. */}
      {metrics.recentlyResolved > 0 && (
        <p className="zen-muted zen-dash-note" data-testid="recently-resolved">
          ✅ {metrics.recentlyResolved} ticket{metrics.recentlyResolved === 1 ? "" : "s"} resolved in the last 7 days.
        </p>
      )}

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
