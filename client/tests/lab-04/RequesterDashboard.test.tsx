// Requester dashboard — UI (Issue #52)
// Covers every #52 UI row in docs/lab-04/tests.md:
//   UI-L4-03  RequesterDashboard own metrics + Waiting for Me cue (AC-15, AC-25)
//   UI-L4-04  RequesterDashboard drill-down + empty state (AC-17)
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import RequesterDashboard from "../../src/pages/RequesterDashboard";
import * as api from "../../src/api";

function makeDashboard(
  overrides: Partial<api.RequesterDashboard> = {}
): api.RequesterDashboard {
  return {
    metrics: {
      open: 4,
      inProgress: 2,
      waitingForMe: 1,
      resolved: 3,
      closed: 5,
      recentlyResolved: 2,
      ...(overrides.metrics ?? {}),
    },
    myRecentTickets: overrides.myRecentTickets ?? [
      { id: 101, ticketNumber: "TKT-2026-000101", summary: "VPN keeps dropping", currentStatus: "IN_PROGRESS", updatedAt: "2026-10-30T10:00:00.000Z" },
      { id: 102, ticketNumber: "TKT-2026-000102", summary: "Mailbox full", currentStatus: "WAITING_FOR_REQUESTER", updatedAt: "2026-10-29T10:00:00.000Z" },
    ],
  };
}

function renderDash() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <RequesterDashboard />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── UI-L4-03 ─────────────────────────────────────────────────────────────

describe("UI-L4-03: own metrics + Waiting for Me cue (AC-15, AC-25)", () => {
  it("UI-L4-03: renders all five metric cards with their counts and the recent list", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    // Each card carries both its count and a text label (not color-only).
    const open = await screen.findByTestId("metric-open");
    expect(within(open).getByText("4")).toBeInTheDocument();
    expect(within(open).getByText(/my open/i)).toBeInTheDocument();
    const inProgress = screen.getByTestId("metric-inProgress");
    expect(within(inProgress).getByText("2")).toBeInTheDocument();
    expect(within(inProgress).getByText(/in progress/i)).toBeInTheDocument();
    const waiting = screen.getByTestId("metric-waitingForMe");
    expect(within(waiting).getByText("1")).toBeInTheDocument();
    expect(within(waiting).getByText(/waiting for me/i)).toBeInTheDocument();
    const resolved = screen.getByTestId("metric-resolved");
    expect(within(resolved).getByText("3")).toBeInTheDocument();
    expect(within(resolved).getByText(/resolved/i)).toBeInTheDocument();
    const closed = screen.getByTestId("metric-closed");
    expect(within(closed).getByText("5")).toBeInTheDocument();
    expect(within(closed).getByText(/closed/i)).toBeInTheDocument();

    // Recent tickets list.
    expect(screen.getByText("TKT-2026-000101")).toBeInTheDocument();
    expect(screen.getByText("VPN keeps dropping")).toBeInTheDocument();
  });

  it("UI-L4-03: shows a non-color attention cue on Waiting for Me when > 0, hidden when 0", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    const { unmount } = renderDash();
    expect(await screen.findByTestId("waiting-attention")).toBeInTheDocument();
    unmount();

    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(
      makeDashboard({ metrics: { open: 0, inProgress: 0, waitingForMe: 0, resolved: 0, closed: 0, recentlyResolved: 0 } })
    );
    renderDash();
    await screen.findByTestId("metric-waitingForMe");
    expect(screen.queryByTestId("waiting-attention")).not.toBeInTheDocument();
  });

  it("UI-L4-03: quick actions link to Create Ticket and My Tickets", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    const create = await screen.findByRole("link", { name: /create ticket/i });
    expect(create).toHaveAttribute("href", "/tickets/new");
    const mine = screen.getByRole("link", { name: /view my tickets/i });
    expect(mine).toHaveAttribute("href", "/tickets");
  });
});

// ── UI-L4-04 ─────────────────────────────────────────────────────────────

describe("UI-L4-04: drill-down + empty state (AC-17)", () => {
  it("UI-L4-04: metric cards drill down to /tickets?status=… and recent rows to /tickets/:id", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    expect(await screen.findByTestId("metric-open")).toHaveAttribute("href", "/tickets?status=OPEN");
    expect(screen.getByTestId("metric-inProgress")).toHaveAttribute("href", "/tickets?status=IN_PROGRESS");
    expect(screen.getByTestId("metric-waitingForMe")).toHaveAttribute("href", "/tickets?status=WAITING_FOR_REQUESTER");
    expect(screen.getByTestId("metric-resolved")).toHaveAttribute("href", "/tickets?status=RESOLVED");
    expect(screen.getByTestId("metric-closed")).toHaveAttribute("href", "/tickets?status=CLOSED");

    // Recent row links to the Ticket Detail route.
    const row = screen.getByRole("link", { name: /TKT-2026-000101/ });
    expect(row).toHaveAttribute("href", "/tickets/101");
  });

  it("UI-L4-04: empty scope renders zeros and an empty recent message (no error)", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(
      makeDashboard({
        metrics: { open: 0, inProgress: 0, waitingForMe: 0, resolved: 0, closed: 0, recentlyResolved: 0 },
        myRecentTickets: [],
      })
    );
    renderDash();

    const open = await screen.findByTestId("metric-open");
    expect(within(open).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-closed")).getByText("0")).toBeInTheDocument();
    expect(screen.getByTestId("recent-empty")).toBeInTheDocument();
  });

  it("UI-L4-04: safe error state renders with a retry affordance (no crash)", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockRejectedValue(new Error("network"));
    renderDash();
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
