// UI-08: zero tickets → Empty state + Create Ticket CTA        (AC-19)
// UI-09: filter active + no results → No-Results + Clear Filters (AC-20)
// UI-10: switch requester → reloads for new requester, page=1  (AC-31)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MyTickets from "../../src/components/MyTickets";
import * as api from "../../src/api";

const SAMPLE_TICKET: api.TicketListItem = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  createdAt: "2026-09-06T10:00:00Z",
  summary: "Laptop battery drains quickly",
  category: "Hardware",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  updatedAt: "2026-09-06T10:00:00Z",
};

function emptyResponse(page = 1): api.TicketListResponse {
  return { data: [], pagination: { page, pageSize: 10, totalCount: 0, totalPages: 0 } };
}

beforeEach(() => {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([
    { id: 1, name: "Account and Access" },
    { id: 2, name: "Hardware" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MyTickets", () => {
  it("UI-08: zero tickets with no active filter → Empty state with Create Ticket CTA (AC-19)", async () => {
    vi.spyOn(api, "fetchTickets").mockResolvedValue(emptyResponse());

    const onCreateTicket = vi.fn();
    render(<MyTickets requesterId={1} onCreateTicket={onCreateTicket} />);

    // Wait for empty state (not loading spinner)
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    // CTA button is INSIDE the empty-state card (not the header button)
    const emptyCard = screen.getByTestId("empty-state");
    const ctaBtn = within(emptyCard).getByRole("button", { name: /create ticket/i });
    expect(ctaBtn).toBeInTheDocument();

    await userEvent.setup().click(ctaBtn);
    expect(onCreateTicket).toHaveBeenCalledTimes(1);

    // No-results state must NOT show simultaneously
    expect(screen.queryByTestId("no-results-state")).not.toBeInTheDocument();
  });

  it("UI-09: filter active + no results → No-Results state with Clear Filters (AC-20)", async () => {
    const user = userEvent.setup();

    // Always return empty — after typing in search, hasActiveFilters=true → No-Results
    vi.spyOn(api, "fetchTickets").mockResolvedValue(emptyResponse());

    render(<MyTickets requesterId={1} onCreateTicket={vi.fn()} />);

    // Initial: no filter, no tickets → Empty state
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    // Type in search → filter becomes active → No-Results state
    // The FilterRow is always visible after loading
    await user.type(screen.getByPlaceholderText(/search tickets/i), "xyz");

    await waitFor(() => {
      expect(screen.getByTestId("no-results-state")).toBeInTheDocument();
    });

    // Clear Filters button must be in the No-Results card
    const noResultsCard = screen.getByTestId("no-results-state");
    expect(within(noResultsCard).getByRole("button", { name: /clear filters/i })).toBeInTheDocument();

    // Empty state must NOT show simultaneously
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("UI-10: switching requesterId reloads for new requester and resets to page 1 (AC-31)", async () => {
    const user = userEvent.setup();

    const makeTickets = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...SAMPLE_TICKET,
        id: start + i,
        ticketNumber: `TKT-2026-${String(start + i).padStart(6, "0")}`,
        summary: `Ticket ${start + i}`,
      }));

    vi.spyOn(api, "fetchTickets").mockImplementation(
      async (requesterId, params) => {
        if (requesterId === 2) {
          return {
            data: [{ ...SAMPLE_TICKET, id: 100, summary: "Requester 2 ticket" }],
            pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
          };
        }
        const p = params?.page ?? 1;
        return {
          data: p === 2 ? makeTickets(11, 5) : makeTickets(1, 10),
          pagination: { page: p, pageSize: 10, totalCount: 15, totalPages: 2 },
        };
      }
    );

    const { rerender } = render(<MyTickets requesterId={1} onCreateTicket={vi.fn()} />);

    // Wait for requester 1's page 1 to show (use data-testid to avoid table/card duplicate)
    await waitFor(() => {
      expect(screen.getByTestId("summary-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("summary-1").textContent).toBe("Ticket 1");

    // Navigate to page 2
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getByTestId("summary-11")).toBeInTheDocument();
    });

    // Switch to requester 2
    rerender(<MyTickets requesterId={2} onCreateTicket={vi.fn()} />);

    // Requester 2's ticket should appear
    await waitFor(() => {
      expect(screen.getByTestId("summary-100")).toBeInTheDocument();
    });
    expect(screen.getByTestId("summary-100").textContent).toBe("Requester 2 ticket");

    // The last fetchTickets call for requester 2 must use page=1
    const calls = vi.mocked(api.fetchTickets).mock.calls;
    const r2Calls = calls.filter((c) => c[0] === 2);
    expect(r2Calls.length).toBeGreaterThan(0);
    const lastR2Call = r2Calls[r2Calls.length - 1];
    expect(lastR2Call[1]?.page ?? 1).toBe(1);
  });
});
