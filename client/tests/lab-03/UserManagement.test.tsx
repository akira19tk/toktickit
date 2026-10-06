// UI-21: User list, search, role filter — columns and results correct (AC-58)
// UI-22: Create/Edit validation and duplicate email — field errors shown (AC-60, AC-61)
// UI-23: Self-deactivation and last-admin — clear conflict messages (AC-63, AC-64)
// UI-24: Set initial password dialog — confirmation and success message (AC-65)
// UI-25: User Management feedback states — success, forbidden, failure (AC-67)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as AuthContextModule from "../../src/context/AuthContext";
import * as api from "../../src/api";
import { ApiError } from "../../src/api";
import UserManagement from "../../src/components/UserManagement";
import type { User } from "../../src/context/AuthContext";

vi.mock("../../src/context/AuthContext");
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

// Current signed-in admin (id 9 == admin@example.com row below → "self").
function asAdmin(overrides: Partial<User> = {}) {
  mockUseAuth.mockReturnValue({
    user: { id: 9, name: "Admin User", email: "admin@example.com", role: "ADMIN", mustChangePassword: false, ...overrides },
    loading: false,
    sessionEnded: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  } as ReturnType<typeof AuthContextModule.useAuth>);
}

function makeUser(o: Partial<api.AdminUser> = {}): api.AdminUser {
  return {
    id: 1,
    name: "Alice Adams",
    email: "alice@example.com",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

const LIST: api.AdminUser[] = [
  makeUser({ id: 1, name: "Alice Adams", email: "alice@example.com", role: "REQUESTER" }),
  makeUser({ id: 7, name: "Michael Brown", email: "michael.brown@example.com", role: "IT_STAFF" }),
  makeUser({ id: 9, name: "Admin User", email: "admin@example.com", role: "ADMIN" }),
];

beforeEach(() => {
  asAdmin();
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(LIST);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── UI-21 ─────────────────────────────────────────────────────────────────────

describe("UI-21: User list, search and role filter (AC-58)", () => {
  it("UI-21: renders Name, Email, Role and Status columns with matching role badges", async () => {
    render(<UserManagement />);

    await screen.findByTestId("users-table");
    // Scope to the desktop <table> (the mobile cards duplicate the same text).
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Alice Adams")).toBeInTheDocument();
    expect(table.getByText("michael.brown@example.com")).toBeInTheDocument();

    // Role badge text matches the shell's labels
    expect(table.getByText("Requester")).toBeInTheDocument();
    expect(table.getByText("IT Staff")).toBeInTheDocument();
    expect(table.getByText("Administrator")).toBeInTheDocument();
    // Status badge text (not colour alone)
    expect(table.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("UI-21: typing a search term and choosing a role send the matching query parameters", async () => {
    const user = userEvent.setup();
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.type(screen.getByLabelText(/search users/i), "ali");
    await waitFor(() =>
      expect(api.fetchAdminUsers).toHaveBeenLastCalledWith({ search: "ali", role: undefined })
    );

    await user.clear(screen.getByLabelText(/search users/i));
    await user.selectOptions(screen.getByLabelText(/filter by role/i), "IT_STAFF");
    await waitFor(() =>
      expect(api.fetchAdminUsers).toHaveBeenLastCalledWith({ search: undefined, role: "IT_STAFF" })
    );
  });
});

// ── UI-22 ─────────────────────────────────────────────────────────────────────

describe("UI-22: Create/Edit validation and duplicate email (AC-60, AC-61)", () => {
  it("UI-22: Create dialog shows field errors for empty name, bad email and weak password without calling the API", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createAdminUser");
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(within(dialog).getByText(/name is required/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/valid email/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/must be at least 8 characters/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-22: Create dialog surfaces a duplicate-email conflict under the email field", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createAdminUser").mockRejectedValue(
      new ApiError(409, "EMAIL_TAKEN", "That email address is already in use.", {
        email: "That email address is already in use.",
      })
    );
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name/i), "New Person");
    await user.type(within(dialog).getByLabelText(/^email/i), "alice@example.com");
    await user.type(within(dialog).getByLabelText(/initial password/i), "Welcome#2026");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(await within(dialog).findByText(/already in use/i)).toBeInTheDocument();
  });

  it("UI-22: Edit dialog flags an empty name and does not call the API", async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(api, "updateAdminUser");
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit alice adams/i }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/^name/i));
    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));

    expect(within(dialog).getByText(/name is required/i)).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ── UI-23 ─────────────────────────────────────────────────────────────────────

describe("UI-23: Self-deactivation and last-admin conflict messages (AC-63, AC-64)", () => {
  it("UI-23: editing your own account disables the Active toggle with an explanation (self-deactivation guard)", async () => {
    const user = userEvent.setup();
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    // id 9 (Admin User) is the signed-in admin
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit admin user/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("checkbox")).toBeDisabled();
    expect(within(dialog).getByText(/cannot deactivate your own account/i)).toBeInTheDocument();
    // Set-initial-password is for another user only (BR-54) — absent on your own row.
    expect(within(dialog).queryByRole("button", { name: /set new initial password/i })).not.toBeInTheDocument();
  });

  it("UI-23: a last-admin conflict is shown as a clear banner at the top of the Edit dialog", async () => {
    const user = userEvent.setup();
    const others = [
      ...LIST,
      makeUser({ id: 10, name: "Second Admin", email: "second.admin@example.com", role: "ADMIN" }),
    ];
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue(others);
    vi.spyOn(api, "updateAdminUser").mockRejectedValue(
      new ApiError(409, "LAST_ADMIN", "There must always be at least one active Administrator.")
    );
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit second admin/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox")); // uncheck Active (not self → enabled)
    await user.click(within(dialog).getByRole("button", { name: /save changes/i }));

    expect(await within(dialog).findByText(/at least one active administrator/i)).toBeInTheDocument();
  });
});

// ── UI-24 ─────────────────────────────────────────────────────────────────────

describe("UI-24: Set initial password dialog (AC-65)", () => {
  it("UI-24: opening Set-new-initial-password, submitting a valid password, shows the forced-change explanation and a success toast", async () => {
    const user = userEvent.setup();
    const setSpy = vi.spyOn(api, "setUserInitialPassword").mockResolvedValue(undefined);
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit alice adams/i }));
    const editDialog = screen.getByRole("dialog");

    // The button must render for another user, be visible, and NOT use the
    // header-only tertiary style (white-on-dark) that is invisible on the light
    // dialog — the regression that hid it in the browser.
    const setPwTrigger = within(editDialog).getByRole("button", { name: /set new initial password/i });
    expect(setPwTrigger).toBeVisible();
    expect(setPwTrigger).not.toHaveClass("zen-btn-tertiary");
    await user.click(setPwTrigger);

    // Edit closes, the password dialog opens with the forced-change explanation
    const pwDialog = screen.getByRole("dialog");
    expect(within(pwDialog).getByText(/required to change this password/i)).toBeInTheDocument();

    await user.type(within(pwDialog).getByLabelText(/new initial password/i), "BrandNew#99");
    await user.click(within(pwDialog).getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(setSpy).toHaveBeenCalledWith(1, "BrandNew#99"));

    // The dialog closes and the success message must appear on the PAGE — not
    // trapped inside the now-unmounted dialog — be a live region, stay visible,
    // and use the fixed-position toast (so scroll can't push it off-screen).
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const toast = await screen.findByTestId("toast");
    expect(toast).toBeVisible();
    expect(toast.closest('[role="dialog"]')).toBeNull();
    expect(toast).toHaveAttribute("role", "status");
    expect(toast).toHaveClass("um-toast");
    expect(toast).toHaveTextContent(/must change it at next login/i);
  });

  it("UI-24: a weak password is rejected under the field and the API is not called", async () => {
    const user = userEvent.setup();
    const setSpy = vi.spyOn(api, "setUserInitialPassword");
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit alice adams/i }));
    await user.click(screen.getByRole("button", { name: /set new initial password/i }));
    const pwDialog = screen.getByRole("dialog");
    await user.type(within(pwDialog).getByLabelText(/new initial password/i), "short");
    await user.click(within(pwDialog).getByRole("button", { name: /set password/i }));

    expect(within(pwDialog).getByText(/must be at least 8 characters/i)).toBeInTheDocument();
    expect(setSpy).not.toHaveBeenCalled();
  });
});

// ── UI-25 ─────────────────────────────────────────────────────────────────────

describe("UI-25: User Management feedback states (AC-67)", () => {
  it("UI-25: a successful create shows a success toast", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "createAdminUser").mockResolvedValue(
      makeUser({ id: 50, name: "Created Person", email: "created@example.com", role: "IT_STAFF", mustChangePassword: true })
    );
    render(<UserManagement />);
    await screen.findByTestId("users-table");

    await user.click(screen.getByRole("button", { name: /create user/i }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name/i), "Created Person");
    await user.type(within(dialog).getByLabelText(/^email/i), "created@example.com");
    await user.type(within(dialog).getByLabelText(/initial password/i), "Welcome#2026");
    await user.click(within(dialog).getByRole("button", { name: /create user/i }));

    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent(/created/i);
  });

  it("UI-25: a 403 shows the Forbidden state", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));
    render(<UserManagement />);
    expect(await screen.findByTestId("forbidden-state")).toBeInTheDocument();
  });

  it("UI-25: a server failure shows a safe failure state with Try Again", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockRejectedValue(new Error("network down"));
    render(<UserManagement />);
    const failure = await screen.findByTestId("failure-state");
    expect(within(failure).getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
