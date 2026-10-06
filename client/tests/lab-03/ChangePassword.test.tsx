// UI-05: Client password validator accepts/rejects all shared password-vectors.json vectors (BR-09)
// UI-06: Confirmation-mismatch error appears under the Confirm field
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as AuthContextModule from "../../src/context/AuthContext";
import { validatePassword, isPasswordValid } from "../../src/lib/passwordValidator";
import ChangePassword from "../../src/pages/ChangePassword";
import type { User } from "../../src/context/AuthContext";
// A3 note: path is three levels up because shared/ lives at the toktickit root
import vectors from "../../../shared/password-vectors.json";

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

function renderChangePassword() {
  return render(
    <MemoryRouter initialEntries={["/change-password"]}>
      <Routes>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/my-tickets" element={<div>My Tickets</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChangePassword", () => {
  it("UI-05: client password validator accepts/rejects all shared vectors (BR-09)", () => {
    for (const { password, valid, reason } of vectors) {
      const errors = validatePassword(password);
      expect(isPasswordValid(errors)).toBe(valid);
    }
  });

  it("UI-06: confirmation mismatch is flagged under the Confirm field", async () => {
    mockUseAuth.mockReturnValue(makeAuthValue());
    renderChangePassword();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/current password/i), "OldPass1");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass1!");
    await user.type(screen.getByLabelText(/confirm new password/i), "Different1!");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });
});
