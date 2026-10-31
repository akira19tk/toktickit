// Requester dashboard — UI (Issue #52)
// Covers every #52 UI row in docs/lab-04/tests.md:
//   UI-L4-03  RequesterDashboard own metrics + Waiting for Me cue (AC-15, AC-25)
//   UI-L4-04  RequesterDashboard drill-down + empty state (AC-17)
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import RequesterDashboard from "../../src/pages/RequesterDashboard";
import { formatDateTime } from "../../src/lib/formatDate";
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
  it("UI-L4-03: renders all six metric cards (incl. Recently Resolved) with counts and labels", async () => {
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
    expect(within(resolved).getByText(/^resolved$/i)).toBeInTheDocument();
    const closed = screen.getByTestId("metric-closed");
    expect(within(closed).getByText("5")).toBeInTheDocument();
    expect(within(closed).getByText(/closed/i)).toBeInTheDocument();

    // Recently Resolved (last 7 days, Asia/Bangkok) — handout §4.6.
    const recently = screen.getByTestId("metric-recentlyResolved");
    expect(within(recently).getByText("2")).toBeInTheDocument();
    expect(within(recently).getByText(/recently resolved/i)).toBeInTheDocument();
  });

  it("UI-L4-03: cards use inline SVG icons (aria-hidden), not emoji", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    const open = await screen.findByTestId("metric-open");
    const svg = open.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // No legacy emoji glyphs in the card text.
    for (const glyph of ["📥", "🔧", "⏳", "✅", "📦", "⚠"]) {
      expect(open.textContent ?? "").not.toContain(glyph);
    }
  });

  it("UI-L4-03: recent rows show the last-updated date/time in a locale-stable format", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    const row = await screen.findByRole("link", { name: /TKT-2026-000101/ });
    // The component formats in the local zone; mirror that here for the assertion.
    expect(within(row).getByText(new RegExp(`Updated ${formatDateTime("2026-10-30T10:00:00.000Z")}`))).toBeInTheDocument();
  });

  it("UI-L4-03: formatDateTime renders Gregorian '31 Oct 2026, 11:30' regardless of locale", () => {
    expect(formatDateTime("2026-10-31T04:30:00.000Z", "Asia/Bangkok")).toBe("31 Oct 2026, 11:30");
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
  it("UI-L4-04: each card is a focusable 'View all' link drilling to its filtered list", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    expect(await screen.findByTestId("metric-open")).toHaveAttribute("href", "/tickets?status=OPEN");
    expect(screen.getByTestId("metric-inProgress")).toHaveAttribute("href", "/tickets?status=IN_PROGRESS");
    expect(screen.getByTestId("metric-waitingForMe")).toHaveAttribute("href", "/tickets?status=WAITING_FOR_REQUESTER");
    expect(screen.getByTestId("metric-resolved")).toHaveAttribute("href", "/tickets?status=RESOLVED");
    expect(screen.getByTestId("metric-closed")).toHaveAttribute("href", "/tickets?status=CLOSED");
    expect(screen.getByTestId("metric-recentlyResolved")).toHaveAttribute("href", "/tickets?status=RESOLVED");

    // Each card is a link with an accessible "View all …" name (keyboard-focusable).
    const viewAllOpen = screen.getByRole("link", { name: /view all open tickets/i });
    expect(viewAllOpen).toBe(screen.getByTestId("metric-open"));
    expect(screen.getByRole("link", { name: /view all in-progress tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all tickets waiting for you/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all recently resolved tickets/i })).toBeInTheDocument();

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
    expect(within(screen.getByTestId("metric-recentlyResolved")).getByText("0")).toBeInTheDocument();
    expect(screen.getByTestId("recent-empty")).toBeInTheDocument();
  });

  it("UI-L4-04: safe error state renders with a retry affordance (no crash)", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockRejectedValue(new Error("network"));
    renderDash();
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
