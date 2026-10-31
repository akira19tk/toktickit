// IT Staff dashboard — UI (Issue #53)
// Covers every #53 UI row in docs/lab-04/tests.md:
//   UI-L4-01   StaffDashboard renders cards, My Open Actions, urgent list (AC-16, AC-24)
//   UI-L4-02   StaffDashboard card/row drill-down navigation (AC-17)
//   RESP-L4-01 Dashboard reflow — responsive grid + list structure (AC-20)
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as AuthContextModule from "../../src/context/AuthContext";
import type { User } from "../../src/context/AuthContext";
import StaffDashboard from "../../src/pages/StaffDashboard";
import * as api from "../../src/api";

// Partial mock: keep AuthProvider real, replace useAuth for a controlled user.
vi.mock("../../src/context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContextModule>();
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function mockUser(overrides: Partial<User> = {}) {
  mockUseAuth.mockReturnValue({
    user: {
      id: 7,
      name: "Sam Staff",
      email: "sam@staff.test",
      role: "IT_STAFF",
      mustChangePassword: false,
      ...overrides,
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  });
}

function makeDashboard(
  overrides: Partial<api.StaffDashboard> = {}
): api.StaffDashboard {
  return {
    metrics: {
      new: 14,
      open: 23,
      inProgress: 18,
      waitingForRequester: 7,
      myAssigned: 16,
      unassigned: 9,
      myOpenActions: 5,
      ...(overrides.metrics ?? {}),
    },
    myRecentTickets: overrides.myRecentTickets ?? [
      { id: 234, ticketNumber: "TKT-2026-000234", summary: "VPN keeps dropping", currentStatus: "IN_PROGRESS", itPriority: "HIGH", updatedAt: "2026-10-30T10:00:00.000Z" },
    ],
    urgentTickets: overrides.urgentTickets ?? [
      { id: 231, ticketNumber: "TKT-2026-000231", summary: "Payroll outage", currentStatus: "OPEN", itPriority: "HIGH", updatedAt: "2026-10-30T09:00:00.000Z" },
    ],
  };
}

function renderDash() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <StaffDashboard />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── UI-L4-01 ─────────────────────────────────────────────────────────────

describe("UI-L4-01: renders cards, My Open Actions, urgent list (AC-16, AC-24)", () => {
  it("UI-L4-01: renders all seven metric cards with counts and text labels", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    const checks: Array<[string, string, RegExp]> = [
      ["metric-new", "14", /^new$/i],
      ["metric-open", "23", /^open$/i],
      ["metric-inProgress", "18", /in progress/i],
      ["metric-waitingForRequester", "7", /waiting for requester/i],
      ["metric-myAssigned", "16", /my assigned/i],
      ["metric-unassigned", "9", /unassigned/i],
      ["metric-myOpenActions", "5", /my open actions/i],
    ];
    // first assertion is async to wait for the fetch to resolve
    const first = await screen.findByTestId("metric-new");
    expect(within(first).getByText("14")).toBeInTheDocument();
    for (const [testId, count, label] of checks) {
      const card = screen.getByTestId(testId);
      expect(within(card).getByText(count)).toBeInTheDocument();
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
  });

  it("UI-L4-01: cards use inline SVG icons (aria-hidden), not emoji", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    const card = await screen.findByTestId("metric-myOpenActions");
    const svg = card.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("UI-L4-01: shows the urgent list with ticket number, summary and status", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    const urgent = await screen.findByTestId("staff-urgent");
    expect(within(urgent).getByText(/TKT-2026-000231/)).toBeInTheDocument();
    expect(within(urgent).getByText(/payroll outage/i)).toBeInTheDocument();
  });

  it("UI-L4-01: welcomes the signed-in staffer by name", async () => {
    mockUser({ name: "Sam Staff" });
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();
    expect(await screen.findByText(/sam staff/i)).toBeInTheDocument();
  });

  it("UI-L4-01: empty urgent and recent lists render a message (no error)", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(
      makeDashboard({ myRecentTickets: [], urgentTickets: [] })
    );
    renderDash();
    expect(await screen.findByTestId("urgent-empty")).toBeInTheDocument();
    expect(screen.getByTestId("recent-empty")).toBeInTheDocument();
  });

  it("UI-L4-01: safe error state renders with a retry affordance (no crash)", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockRejectedValue(new Error("network"));
    renderDash();
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

// ── UI-L4-02 ─────────────────────────────────────────────────────────────

describe("UI-L4-02: card/row drill-down navigation (AC-17)", () => {
  it("UI-L4-02: each metric card drills to the correct queue route + params", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    expect(await screen.findByTestId("metric-new")).toHaveAttribute("href", "/staff/queue?status=NEW");
    expect(screen.getByTestId("metric-open")).toHaveAttribute("href", "/staff/queue?status=OPEN");
    expect(screen.getByTestId("metric-inProgress")).toHaveAttribute("href", "/staff/queue?status=IN_PROGRESS");
    expect(screen.getByTestId("metric-waitingForRequester")).toHaveAttribute("href", "/staff/queue?status=WAITING_FOR_REQUESTER");
    expect(screen.getByTestId("metric-myAssigned")).toHaveAttribute("href", "/staff/queue?owner=ME");
    expect(screen.getByTestId("metric-unassigned")).toHaveAttribute("href", "/staff/queue?owner=UNASSIGNED");
    expect(screen.getByTestId("metric-myOpenActions")).toHaveAttribute("href", "/staff/queue?actionAssignee=ME&actionStatus=OPEN");
  });

  it("UI-L4-02: list 'View all' links and rows drill correctly", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    expect(await screen.findByTestId("recent-viewall")).toHaveAttribute("href", "/staff/queue?owner=ME");
    expect(screen.getByTestId("urgent-viewall")).toHaveAttribute("href", "/staff/queue?itPriority=HIGH");

    const recentRow = screen.getByRole("link", { name: /TKT-2026-000234/ });
    expect(recentRow).toHaveAttribute("href", "/staff/tickets/234");
    const urgentRow = screen.getByRole("link", { name: /TKT-2026-000231/ });
    expect(urgentRow).toHaveAttribute("href", "/staff/tickets/231");
  });
});

// ── RESP-L4-01 ─────────────────────────────────────────────────────────────

describe("RESP-L4-01: dashboard reflow — responsive grid + list structure (AC-20)", () => {
  it("RESP-L4-01: metric cards live in the shared responsive grid container", async () => {
    mockUser();
    vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(makeDashboard());
    renderDash();

    const card = await screen.findByTestId("metric-new");
    // Reuses the Requester dashboard's responsive grid (2-up/1-up via CSS tokens).
    const grid = card.closest(".zen-dash-grid");
    expect(grid).toBeTruthy();
    // All seven metric cards share the one grid so they reflow together.
    expect(within(grid as HTMLElement).getAllByText(/^\d+$/).length).toBe(7);
  });
});
