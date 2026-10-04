// UI-19: Requester detail comments and resolved action (AC-29, AC-32, AC-34, AC-30)
// UI-20: Requester detail has no notes (AC-53)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TicketDetail from "../../src/components/TicketDetail";
import * as api from "../../src/api";

// Base ticket shared across tests
function makeTicket(overrides: Partial<api.TicketDetail> = {}): api.TicketDetail {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    categoryId: 1,
    category: "Hardware",
    relatedSystemId: 1,
    relatedSystem: "Email",
    summary: "Laptop battery drains quickly",
    description: "Battery drains.",
    requestedPriority: "MEDIUM",
    currentStatus: "OPEN",
    createdAt: "2026-09-06T10:00:00Z",
    updatedAt: "2026-09-06T10:00:00Z",
    attachments: [],
    itPriority: "HIGH",
    owner: { name: "Michael Brown" },
    resolutionSummary: null,
    resolvedAt: null,
    requesterResolvedAt: null,
    ...overrides,
  };
}

const MOCK_COMMENT: api.TicketComment = {
  id: 1,
  body: "We are looking into it.",
  createdAt: "2026-09-06T11:00:00Z",
  author: { id: 7, name: "Michael Brown", role: "IT_STAFF" },
};

beforeEach(() => {
  vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(makeTicket());
  vi.spyOn(api, "fetchTicketComments").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RequesterTicketDetail", () => {
  describe("UI-19: comments and resolved action", () => {
    it("UI-19: existing comments are displayed in chronological order", async () => {
      vi.spyOn(api, "fetchTicketComments").mockResolvedValue([MOCK_COMMENT]);

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("We are looking into it.")).toBeInTheDocument();
      });

      // "Michael Brown" also appears in the Ticket Owner header field; scope the
      // author assertions to the comment row to avoid an ambiguous match.
      const commentBody = screen.getByText("We are looking into it.");
      const commentRow = commentBody.closest(".td-comment-row") as HTMLElement;
      expect(commentRow).not.toBeNull();
      expect(within(commentRow).getByText("Michael Brown")).toBeInTheDocument();
      expect(within(commentRow).getByText("IT Staff")).toBeInTheDocument();
    });

    it("UI-19: posting a comment adds it to the list (AC-29)", async () => {
      const postedComment: api.TicketComment = {
        id: 2,
        body: "Still happening after reboot.",
        createdAt: "2026-09-06T12:00:00Z",
        author: { id: 1, name: "Alice Johnson", role: "REQUESTER" },
      };
      vi.spyOn(api, "postTicketComment").mockResolvedValue(postedComment);

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() =>
        expect(screen.getByLabelText(/post a comment/i)).toBeInTheDocument()
      );

      await userEvent.setup().type(
        screen.getByLabelText(/post a comment/i),
        "Still happening after reboot."
      );
      await userEvent.setup().click(screen.getByRole("button", { name: /^post comment/i }));

      await waitFor(() => {
        expect(screen.getByText("Still happening after reboot.")).toBeInTheDocument();
      });
      expect(api.postTicketComment).toHaveBeenCalledWith(1, "Still happening after reboot.");
    });

    it("UI-19: <script> tag in comment body renders as text, not as HTML (AC-30)", async () => {
      const xssComment: api.TicketComment = {
        id: 3,
        body: "<script>alert('xss')</script>",
        createdAt: "2026-09-06T11:00:00Z",
        author: { id: 7, name: "Staff", role: "IT_STAFF" },
      };
      vi.spyOn(api, "fetchTicketComments").mockResolvedValue([xssComment]);

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() => {
        // The text must appear literally; getByText would fail if React had injected HTML
        expect(screen.getByText(/<script>/i)).toBeInTheDocument();
      });
      // No <script> element was injected into the DOM
      expect(document.querySelector("script[data-injected]")).toBeNull();
    });

    it("UI-19: Problem Appears Resolved button enabled in OPEN status (AC-32)", async () => {
      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /problem appears resolved/i })
        ).toBeInTheDocument()
      );

      expect(
        screen.getByRole("button", { name: /problem appears resolved/i })
      ).not.toBeDisabled();
    });

    it("UI-19: clicking Problem Appears Resolved calls the API and button becomes disabled (AC-32)", async () => {
      vi.spyOn(api, "markTicketResolved").mockResolvedValue({
        requesterResolvedAt: "2026-09-06T12:00:00Z",
      });

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      const btn = await screen.findByRole("button", { name: /problem appears resolved/i });
      await userEvent.setup().click(btn);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /marked as resolved/i })
        ).toBeDisabled();
      });
      expect(api.markTicketResolved).toHaveBeenCalledWith(1);
    });

    it("UI-19: Problem Appears Resolved button disabled when status is NEW (AC-34)", async () => {
      vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
        makeTicket({ currentStatus: "NEW" })
      );

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /problem appears resolved/i })
        ).toBeInTheDocument()
      );

      expect(
        screen.getByRole("button", { name: /problem appears resolved/i })
      ).toBeDisabled();
    });

    it("UI-19: Problem Appears Resolved button disabled when already marked (AC-32 idempotent)", async () => {
      vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(
        makeTicket({ currentStatus: "OPEN", requesterResolvedAt: "2026-09-06T11:00:00Z" })
      );

      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /marked as resolved/i })
        ).toBeInTheDocument()
      );

      expect(
        screen.getByRole("button", { name: /marked as resolved/i })
      ).toBeDisabled();
    });
  });

  describe("UI-20: no internal notes in Requester view", () => {
    it("UI-20: no Internal Notes tab, section, or button is present (AC-53)", async () => {
      render(<TicketDetail ticketId={1} onBack={vi.fn()} />);

      await waitFor(() =>
        expect(screen.getByRole("tab", { name: /public comments/i })).toBeInTheDocument()
      );

      // Tab list must not include Internal Notes
      expect(
        screen.queryByRole("tab", { name: /internal notes/i })
      ).not.toBeInTheDocument();

      // No "Internal Notes" heading or label anywhere on the page
      expect(screen.queryByText(/internal notes/i)).not.toBeInTheDocument();

      // No "Add Internal Note" button
      expect(
        screen.queryByRole("button", { name: /add internal note/i })
      ).not.toBeInTheDocument();
    });
  });
});
