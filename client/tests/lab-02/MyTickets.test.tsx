// UI-08: zero tickets → Empty state + Create Ticket CTA        (AC-19)
// UI-09: filter active + no results → No-Results + Clear Filters (AC-20)
//
// Stage C change: requesterId prop removed from MyTickets; renders below updated.
// UI-10 (switch requester reloads for new requester, page=1) was removed:
//   the Development Requester selector is gone (BR-61), MyTickets no longer
//   accepts a requesterId prop, and there is no client-side mechanism to change
//   the identity. The behavior it tested (page/filter reset on requester switch)
//   no longer exists.
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MyTickets from "../../src/components/MyTickets";
import * as api from "../../src/api";

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
    render(<MyTickets onCreateTicket={onCreateTicket} />);

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

    render(<MyTickets onCreateTicket={vi.fn()} />);

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
});
