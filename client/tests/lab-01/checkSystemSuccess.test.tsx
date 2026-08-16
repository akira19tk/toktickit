// UI-02: Loading state changes to category list once the API calls resolve
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "../../src/App";
import * as api from "../../src/api";

describe("Check System - success flow", () => {
  it("shows a loading state, then the Online status and categories", async () => {
    vi.spyOn(api, "fetchHealth").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ status: "ok", service: "TokTickIT API" }),
            10
          )
        )
    );
    vi.spyOn(api, "fetchCategories").mockResolvedValue([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /check system/i }));

    // Loading state appears first
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);

    // Then resolves to success state
    await waitFor(() => {
      expect(screen.getByTestId("system-status")).toBeInTheDocument();
    });

    expect(screen.getByText(/online/i)).toBeInTheDocument();
    expect(screen.getByText("Account and Access")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });
});
