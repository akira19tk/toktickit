// UI-11: open owned Ticket Detail → header fields rendered read-only (AC-21)
// UI-12: soft-remove without reason → confirm disabled until reason ≥3 chars (AC-26)
//
// Stage C changes:
//   – requesterId prop removed from TicketDetail; renders now omit it.
//   – TicketDetail now calls fetchTicketComments on mount; mocked as empty in every test.
//   – Attachments now live in the "Attachments" tab (default is "Public Comments"),
//     so both tests navigate to that tab before asserting on attachment content.
//   – removeAttachment signature no longer includes requesterId; assertion updated.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TicketDetail from "../../src/components/TicketDetail";
import * as api from "../../src/api";

const MOCK_TICKET: api.TicketDetail = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  category: "Hardware",
  relatedSystemId: 1,
  relatedSystem: "Email",
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

beforeEach(() => {
  // fetchTicketComments is required by TicketDetail since the Lab 3 addition of the comments tab.
  vi.spyOn(api, "fetchTicketComments").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TicketDetail", () => {
  it("UI-11: header fields are rendered as read-only (AC-21)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(MOCK_TICKET);

    render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

    // Wait for data to load — the header must be visible
    await waitFor(() => {
      expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
    });

    // Summary and description must be visible and NOT in editable inputs
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText(/battery drains fast/i)).toBeInTheDocument();

    // Ticket number must not be an editable input
    const tnNode = screen.getByText("TKT-2026-000001");
    expect(tnNode.tagName).not.toBe("INPUT");

    // Status badge visible (displayed by the new Lab 3 read-only fields)
    expect(screen.getByText("NEW")).toBeInTheDocument();

    // Navigate to the Attachments tab to verify the attachment
    await user.click(screen.getByRole("tab", { name: /attachments/i }));
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

    render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

    // Navigate to the Attachments tab before interacting with attachments
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /attachments/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("tab", { name: /attachments/i }));

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

    // Clicking confirm calls removeAttachment (requesterId no longer passed)
    await user.click(confirmBtn);
    expect(api.removeAttachment).toHaveBeenCalledWith(1, 101, "abc");
  });
});
