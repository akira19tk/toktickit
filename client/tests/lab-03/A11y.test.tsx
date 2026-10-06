// UI-26: Login and Change Password pages are accessible by keyboard
//        (every input has a visible label; errors are in aria-live regions);
//        User Management dialogs trap focus, close on Escape and return focus
//        to the trigger (Issue #28)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as AuthContextModule from "../../src/context/AuthContext";
import * as api from "../../src/api";
import { ApiError } from "../../src/api";
import Login from "../../src/pages/Login";
import ChangePassword from "../../src/pages/ChangePassword";
import UserManagement from "../../src/components/UserManagement";
import type { User } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext");

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    role: "REQUESTER",
    mustChangePassword: false,
    ...overrides,
  };
}

function makeAuthValue(overrides: Partial<ReturnType<typeof AuthContextModule.useAuth>> = {}) {
  return {
    user: makeUser(),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Accessibility", () => {
  describe("Login page", () => {
    it("UI-26: every input has an associated label", () => {
      mockUseAuth.mockReturnValue(makeAuthValue({ user: null }));

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      );

      // getByLabelText throws if no label is associated — this asserts the association
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      // Anchored to start so it does not collide with the Show/Hide toggle button
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });

    it("UI-26: field errors are announced via role=alert (aria-live region)", async () => {
      const login = vi.fn().mockRejectedValue(
        new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password")
      );
      mockUseAuth.mockReturnValue(makeAuthValue({ user: null, login }));

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      );

      // Submit empty form — triggers client-side validation
      await userEvent.setup().click(screen.getByRole("button", { name: /sign in/i }));

      // Each field error uses role=alert which implies aria-live=assertive
      await waitFor(() => {
        const alerts = screen.getAllByRole("alert");
        expect(alerts.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("Change Password page", () => {
    it("UI-26: every input has an associated label", () => {
      mockUseAuth.mockReturnValue(makeAuthValue());

      render(
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    });

    it("UI-26: confirmation-mismatch error is announced via role=alert", async () => {
      mockUseAuth.mockReturnValue(makeAuthValue());

      render(
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
          </Routes>
        </MemoryRouter>
      );

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/current password/i), "OldPass1");
      await user.type(screen.getByLabelText(/^new password/i), "NewPass1!");
      await user.type(screen.getByLabelText(/confirm new password/i), "Different1!");
      await user.click(screen.getByRole("button", { name: /change password/i }));

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });

      // The error is surfaced via role=alert
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((el) => /passwords do not match/i.test(el.textContent ?? ""))).toBe(true);
    });
  });

  describe("User Management dialogs", () => {
    function renderUserManagement() {
      mockUseAuth.mockReturnValue(
        makeAuthValue({ user: makeUser({ id: 9, name: "Admin User", role: "ADMIN" }) })
      );
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
      render(<UserManagement />);
    }

    it("UI-26: the dialog traps focus with Tab and Shift+Tab", async () => {
      const user = userEvent.setup();
      renderUserManagement();
      await screen.findByTestId("empty-state");

      await user.click(screen.getByRole("button", { name: /create user/i }));
      const dialog = screen.getByRole("dialog");

      // Focus moves into the dialog, onto the first field.
      const firstField = within(dialog).getByLabelText(/^name/i);
      const submit = within(dialog).getByRole("button", { name: /create user/i });
      expect(firstField).toHaveFocus();

      // Shift+Tab from the first control wraps to the last (submit).
      await user.tab({ shift: true });
      expect(submit).toHaveFocus();

      // Tab from the last control wraps back to the first.
      await user.tab();
      expect(firstField).toHaveFocus();
    });

    it("UI-26: Escape closes the dialog and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      renderUserManagement();
      await screen.findByTestId("empty-state");

      const trigger = screen.getByRole("button", { name: /create user/i });
      await user.click(trigger);
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });
  });
});
