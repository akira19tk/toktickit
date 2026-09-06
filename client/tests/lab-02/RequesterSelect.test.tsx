// UI-06: empty state when API returns no active requesters (AC-09)
// UI-07: error state when requester-list API call fails (AC-10)
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import RequesterSelect from "../../src/components/RequesterSelect";
import * as api from "../../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RequesterSelect", () => {
  it("UI-06: shows empty state when API returns no active requesters", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockResolvedValue([]);

    render(<RequesterSelect onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    // Must not show the dropdown when empty
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("UI-07: shows error state when requester-list API call fails; page does not crash", async () => {
    vi.spyOn(api, "fetchDevRequesters").mockRejectedValue(
      new Error("Network error")
    );

    render(<RequesterSelect onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    // Must offer a retry path (Try Again button)
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
