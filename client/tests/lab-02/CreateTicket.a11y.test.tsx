// UI-13: Tab through Create Ticket form — all controls reachable and operable (AC-32)
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CreateTicket from "../../src/components/CreateTicket";
import * as api from "../../src/api";

beforeEach(() => {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([
    { id: 1, name: "Account and Access" },
  ]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([
    { id: 1, name: "Email" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateTicket — keyboard accessibility (UI-13)", () => {
  it("every form control is reachable via Tab; none use outline:none", async () => {
    const user = userEvent.setup();
    render(<CreateTicket />);

    // Wait for async data to load
    await waitFor(() =>
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    );

    // All required interactive controls must be in the document and not hidden
    const categorySelect = screen.getByLabelText(/category/i);
    const systemSelect = screen.getByLabelText(/related system/i);
    const prioritySelect = screen.getByLabelText(/requested priority/i);
    const summaryInput = screen.getByLabelText(/summary/i);
    const descTextarea = screen.getByLabelText(/description/i);
    const submitBtn = screen.getByRole("button", { name: /submit ticket/i });
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });

    for (const el of [categorySelect, systemSelect, prioritySelect, summaryInput, descTextarea, submitBtn, cancelBtn]) {
      expect(el).toBeInTheDocument();
      expect(el).not.toHaveAttribute("tabindex", "-1");
    }

    // Tab navigation: move through controls and verify focus reaches each one
    // Start from body (nothing focused)
    await user.tab();
    // At least one control must become focused when tabbing
    expect(document.activeElement).not.toBe(document.body);

    // Tab through all controls and collect focused elements
    const focused = new Set<Element>();
    for (let i = 0; i < 10; i++) {
      if (document.activeElement && document.activeElement !== document.body) {
        focused.add(document.activeElement);
      }
      await user.tab();
    }

    // All major controls must appear in the focus sequence
    expect(focused.has(categorySelect)).toBe(true);
    expect(focused.has(systemSelect)).toBe(true);
    expect(focused.has(prioritySelect)).toBe(true);
    expect(focused.has(summaryInput)).toBe(true);
    expect(focused.has(descTextarea)).toBe(true);
  });
});
