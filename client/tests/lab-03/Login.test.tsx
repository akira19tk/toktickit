// UI-01: Login card renders all required elements
// UI-02: Client-side validation shows errors under fields for empty submit
// UI-03: Failure banner for 401 response (Invalid email or password)
// UI-04: Session-ended info banner when location state.sessionEnded is true
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as AuthContextModule from "../../src/context/AuthContext";
import { ApiError } from "../../src/api";
import Login from "../../src/pages/Login";
import type { User } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext");

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function makeAuthValue(overrides: Partial<ReturnType<typeof AuthContextModule.useAuth>> = {}) {
  return {
    user: null as User | null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    ...overrides,
  };
}

function renderLogin(locationState?: object) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/login", state: locationState ?? {} }]}
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/my-tickets" element={<div>My Tickets</div>} />
        <Route path="/change-password" element={<div>Change Password</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Login page", () => {
  it("UI-01: renders TokTickIT heading, email field, password field, and Sign in button", () => {
    mockUseAuth.mockReturnValue(makeAuthValue());
    renderLogin();

    // TokTickIT brand heading — preserved from deleted tests/lab-01/heading.test.tsx
    expect(screen.getByRole("heading", { name: /toktickit/i })).toBeInTheDocument();
    // getByLabelText asserts both the label and the input exist and are associated
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("UI-02: shows validation errors under fields when submitted with empty values", async () => {
    const login = vi.fn();
    mockUseAuth.mockReturnValue(makeAuthValue({ login }));
    renderLogin();

    await userEvent.setup().click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    // login() must not be called when client-side validation fails
    expect(login).not.toHaveBeenCalled();
  });

  it("UI-03: shows 'Invalid email or password' banner when API returns 401", async () => {
    const login = vi.fn().mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    );
    mockUseAuth.mockReturnValue(makeAuthValue({ login }));
    renderLogin();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "WrongPass1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid email or password/i);
    });
  });

  it("UI-04: shows session-ended info banner when location state.sessionEnded is true", () => {
    mockUseAuth.mockReturnValue(makeAuthValue());
    renderLogin({ sessionEnded: true });

    expect(
      screen.getByText(/your session has ended\. please sign in again/i)
    ).toBeInTheDocument();
  });
});
