// UI-02: Selection screen shows loaded requesters when API succeeds
// Lab 2 note: The "Check System" flow from Lab 1 is replaced by the
// Development Requester Selection screen. This test covers the success path
// (loading → dropdown with requester names → Continue button enabled).
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import App from "../../src/App";
import * as api from "../../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Development Requester Selection — success flow", () => {
  it("shows a loading state, then the dropdown with active requesters", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([
                { id: 1, name: "Alice Johnson", email: "alice@example.com" },
                { id: 2, name: "Bob Smith",     email: "bob@example.com"   },
              ]),
            10
          )
        )
    );

    render(<App />);

    // Loading state is visible first
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/loading requesters/i)).toBeInTheDocument();

    // After API resolves the dropdown appears
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /development requester/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/alice johnson/i)).toBeInTheDocument();
    expect(screen.getByText(/bob smith/i)).toBeInTheDocument();

    // Continue button is disabled until a requester is chosen
    expect(
      screen.getByRole("button", { name: /continue/i })
    ).toBeDisabled();
  });
});
