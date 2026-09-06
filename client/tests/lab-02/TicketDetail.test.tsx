// UI-11: open owned Ticket Detail → header fields rendered read-only (AC-21)
// UI-12: soft-remove without reason → confirm disabled until reason ≥3 chars (AC-26)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import TicketDetail from "../../src/components/TicketDetail";
import * as api from "../../src/api";

const MOCK_TICKET: api.TicketDetail = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains fast even when idle, started after Windows update.",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-09-06T10:00:00Z",
  updatedAt: "2026-09-06T10:00:00Z",
  attachments: [
    { id: 101, fileName: "screenshot.png", sizeBytes: 204800, uploadedAt: "2026-09-06T10:00:00Z" },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TicketDetail", () => {
  it("UI-11: header fields are rendered as read-only (AC-21)", async () => {
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(MOCK_TICKET);

    render(<TicketDetail ticketId={1} requesterId={1} onBack={vi.fn()} />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    // Summary and description must be visible and NOT in editable inputs
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText(/battery drains fast/i)).toBeInTheDocument();

    // Ticket number must not be an editable input
    const tnNode = screen.getByText("TKT-2026-000001");
    expect(tnNode.tagName).not.toBe("INPUT");

    // Status badge visible
    expect(screen.getByText("NEW")).toBeInTheDocument();

    // Attachment is listed
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
  });

  it("UI-12: remove confirm button stays disabled until reason has ≥3 chars (AC-26)", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(MOCK_TICKET);
    vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: 101,
      removedAt: "2026-09-06T11:00:00Z",
      removalReason: "Wrong file",
    });

    render(<TicketDetail ticketId={1} requesterId={1} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    });

    // Click Remove button to open confirm dialog
    await user.click(screen.getByRole("button", { name: /remove/i }));

    // Confirm dialog must appear
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Confirm button is disabled (no reason yet)
    const confirmBtn = within(dialog).getByRole("button", { name: /confirm|remove/i });
    expect(confirmBtn).toBeDisabled();

    // Type <3 chars — still disabled
    const reasonInput = within(dialog).getByRole("textbox");
    await user.type(reasonInput, "ab");
    expect(confirmBtn).toBeDisabled();

    // Type 3rd char — now enabled
    await user.type(reasonInput, "c");
    expect(confirmBtn).not.toBeDisabled();

    // Clicking confirm calls removeAttachment
    await user.click(confirmBtn);
    expect(api.removeAttachment).toHaveBeenCalledWith(1, 101, "abc", 1);
  });
});
