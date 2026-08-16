// UI-03: API failure displays a useful error message
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import App from "../../src/App";
import * as api from "../../src/api";

describe("Check System - failure flow", () => {
  it("shows Offline and a useful error message when the API is unreachable", async () => {
    vi.spyOn(api, "fetchHealth").mockRejectedValue(
      new Error("Health check failed with status 500")
    );
    vi.spyOn(api, "fetchCategories").mockResolvedValue([]);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /check system/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /unable to connect to toktickit api/i
    );
  });
});
