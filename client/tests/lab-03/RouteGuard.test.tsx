// UI-07: Unauthenticated user navigating to a protected route is redirected to /login
// UI-09: Authenticated user with the wrong role is redirected to /forbidden
// UI-10: Signed-in user navigating to /login is redirected to their role's home
// UI-28: User with mustChangePassword=true is redirected to /change-password from other routes
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as AuthContextModule from "../../src/context/AuthContext";
import { RequireRole, PublicOnlyRoute } from "../../src/components/RouteGuard";
import type { User } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext");

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
    ...overrides,
  };
}

function mockAuth(partial: { user?: User | null; loading?: boolean }) {
  mockUseAuth.mockReturnValue({
    user: partial.user ?? null,
    loading: partial.loading ?? false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteGuard", () => {
  it("UI-07: unauthenticated user navigating to a protected route is redirected to /login", () => {
    mockAuth({ user: null });

    render(
      <MemoryRouter initialEntries={["/my-tickets"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/my-tickets"
            element={
              <RequireRole role="REQUESTER">
                <div>My Tickets</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });

  it("UI-09: authenticated user with wrong role is redirected to /forbidden", () => {
    mockAuth({ user: makeUser({ role: "IT_STAFF" }) });

    render(
      <MemoryRouter initialEntries={["/my-tickets"]}>
        <Routes>
          <Route path="/forbidden" element={<div>Forbidden Page</div>} />
          <Route
            path="/my-tickets"
            element={
              <RequireRole role="REQUESTER">
                <div>My Tickets</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Forbidden Page")).toBeInTheDocument();
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });

  it("UI-10: signed-in user navigating to /login is redirected to their role's home", () => {
    mockAuth({ user: makeUser({ role: "REQUESTER" }) });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <div>Login Page</div>
              </PublicOnlyRoute>
            }
          />
          <Route path="/my-tickets" element={<div>My Tickets</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("My Tickets")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  it("UI-28: user with mustChangePassword=true navigating to a role route is redirected to /change-password", () => {
    mockAuth({ user: makeUser({ mustChangePassword: true }) });

    render(
      <MemoryRouter initialEntries={["/my-tickets"]}>
        <Routes>
          <Route path="/change-password" element={<div>Change Password Page</div>} />
          <Route
            path="/my-tickets"
            element={
              <RequireRole role="REQUESTER">
                <div>My Tickets</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Change Password Page")).toBeInTheDocument();
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });
});
