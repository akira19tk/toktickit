// UI-03: Selection screen shows error state when API is unreachable
// Lab 2 note: The "Check System" failure flow from Lab 1 is replaced by the
// error state of the Development Requester Selection screen. This test covers
// the App-level integration for the failure path (loading → error state → retry).
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import App from "../../src/App";
import * as api from "../../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Development Requester Selection — failure flow", () => {
  it("shows the error state when the requester API is unreachable", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockRejectedValue(
      new Error("Network error")
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    // Error message and retry button are visible (FR-16, AC-10)
    expect(screen.getByText(/unable to load requesters/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });
});
