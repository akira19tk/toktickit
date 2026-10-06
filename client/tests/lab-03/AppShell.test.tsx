// UI-08: Shell shows user name, role badge, role-specific navigation, Change Password and Logout
// UI-11: AuthContext removes the legacy "toktickit_requester" sessionStorage key at startup (BR-61)
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as AuthContextModule from "../../src/context/AuthContext";
import * as api from "../../src/api";
import { AuthProvider } from "../../src/context/AuthContext";
import AppShell from "../../src/components/AppShell";
import type { User } from "../../src/context/AuthContext";

// Partial mock: keep AuthProvider real, replace useAuth so AppShell tests can
// receive controlled auth state without triggering the probe.
vi.mock("../../src/context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContextModule>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  // Clear the 401 handler set by AuthProvider to avoid cross-test leakage.
  api.setUnauthorizedHandler(null);
});

describe("AppShell", () => {
  it("UI-08: shell shows user name, role badge, role navigation, Change Password and Logout", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser(),
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      changePassword: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/my-tickets"]}>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    // Role badge text
    expect(screen.getByText("Requester")).toBeInTheDocument();
    // Requester navigation links
    expect(screen.getByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
    // Change Password and Logout controls
    expect(screen.getByRole("link", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("UI-08: in the mandatory password-change state the shell shows only Logout (no nav, no Change Password link) — ui-spec §4.2", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ mustChangePassword: true }),
      loading: false,
      sessionEnded: false,
      login: vi.fn(),
      logout: vi.fn(),
      changePassword: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/change-password"]}>
        <AppShell>
          <div>Content</div>
        </AppShell>
      </MemoryRouter>
    );

    // §4.2 "the shell shows only Logout in that state" — a user who signed into
    // the wrong account must be able to leave.
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();

    // No role navigation and no Change Password link while the change is forced.
    expect(screen.queryByRole("link", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /change password/i })).not.toBeInTheDocument();
  });

  it("UI-11: AuthContext removes legacy 'toktickit_requester' key from sessionStorage at startup (BR-61)", async () => {
    sessionStorage.setItem(
      "toktickit_requester",
      JSON.stringify({ id: 1, name: "Alice", email: "alice@example.com" })
    );

    // Mock the probe so AuthProvider doesn't hit the network.
    vi.spyOn(api, "fetchMe").mockRejectedValue(new Error("401"));

    render(
      <MemoryRouter>
        <AuthProvider>
          <div>app</div>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(sessionStorage.getItem("toktickit_requester")).toBeNull();
    });
  });
});
