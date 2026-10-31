// Dashboard routing + legacy-route regression (Issue #53, PR #63 review point 4).
//   UI-L4-13  Every role lands on /dashboard after login; /dashboard renders the
//             role-appropriate dashboard; the legacy Lab 1–3 routes still render
//             for their permitted role and forbid everyone else.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as AuthContextModule from "../../src/context/AuthContext";
import type { User } from "../../src/context/AuthContext";
import { PublicOnlyRoute, RequireRole } from "../../src/components/RouteGuard";
import Dashboard from "../../src/pages/Dashboard";
import * as api from "../../src/api";

vi.mock("../../src/context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContextModule>();
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function setUser(role: User["role"] | null) {
  mockUseAuth.mockReturnValue({
    user: role
      ? { id: 1, name: "Test User", email: "t@test.dev", role, mustChangePassword: false }
      : null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  });
}

const ROLES = ["REQUESTER", "IT_STAFF", "ADMIN"] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-L4-13: post-login landing + legacy route gating (AC-17)", () => {
  it.each(ROLES)("UI-L4-13: a signed-in %s visiting /login is redirected to /dashboard", (role) => {
    setUser(role);
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><div>LOGIN</div></PublicOnlyRoute>} />
          <Route path="/dashboard" element={<div>DASHBOARD HOME</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("DASHBOARD HOME")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
  });

  it("UI-L4-13: /dashboard renders the Requester dashboard for a REQUESTER", async () => {
    setUser("REQUESTER");
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({
      metrics: { open: 0, inProgress: 0, waitingForMe: 0, resolved: 0, closed: 0, recentlyResolved: 0 },
      myRecentTickets: [],
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    // Requester-only card is present; the staff-only "My Open Actions" card is not.
    expect(await screen.findByTestId("metric-waitingForMe")).toBeInTheDocument();
    expect(screen.queryByTestId("metric-myOpenActions")).not.toBeInTheDocument();
  });

  it.each(["IT_STAFF", "ADMIN"] as const)(
    "UI-L4-13: /dashboard renders the Staff dashboard for %s",
    async (role) => {
      setUser(role);
      vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
        metrics: { new: 0, open: 0, inProgress: 0, waitingForRequester: 0, myAssigned: 0, unassigned: 0, myOpenActions: 0 },
        myRecentTickets: [],
        urgentTickets: [],
      });
      render(<MemoryRouter><Dashboard /></MemoryRouter>);
      expect(await screen.findByTestId("metric-myOpenActions")).toBeInTheDocument();
      expect(screen.queryByTestId("metric-waitingForMe")).not.toBeInTheDocument();
    }
  );

  // Legacy Lab 1–3 routes still work directly for the permitted role and are
  // forbidden for others (they are not replaced by the new /dashboard landing).
  const LEGACY: Array<{ path: string; allow: User["role"]; deny: User["role"] }> = [
    { path: "/my-tickets", allow: "REQUESTER", deny: "IT_STAFF" },
    { path: "/staff/queue", allow: "IT_STAFF", deny: "REQUESTER" },
    { path: "/admin/users", allow: "ADMIN", deny: "REQUESTER" },
  ];

  function renderGuarded(path: string, allow: User["role"]) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={<RequireRole role={allow}><div>PAGE OK</div></RequireRole>} />
          <Route path="/forbidden" element={<div>FORBIDDEN</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("UI-L4-13: each legacy route still renders for its permitted role", () => {
    for (const { path, allow } of LEGACY) {
      setUser(allow);
      const { unmount } = renderGuarded(path, allow);
      expect(screen.getByText("PAGE OK"), `${path} should render for ${allow}`).toBeInTheDocument();
      unmount();
    }
  });

  it("UI-L4-13: each legacy route forbids a non-permitted role", () => {
    for (const { path, allow, deny } of LEGACY) {
      setUser(deny);
      const { unmount } = renderGuarded(path, allow);
      expect(screen.getByText("FORBIDDEN"), `${path} should forbid ${deny}`).toBeInTheDocument();
      expect(screen.queryByText("PAGE OK")).not.toBeInTheDocument();
      unmount();
    }
  });
});
