// UI-12: Staff queue rows — Owner/Unassigned/(inactive), badges, resolved marker, open action (AC-41, AC-78)
// UI-13: Queue search, filters, sort, pagination — correct query parameters sent (AC-36, AC-37, AC-38, AC-39)
// UI-14: Queue empty, no-results, failure, forbidden — four distinct states (AC-40)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import StaffTicketQueue from "../../src/components/StaffTicketQueue";
import * as api from "../../src/api";

function makeTicket(overrides: Partial<api.StaffQueueTicket> = {}): api.StaffQueueTicket {
  return {
    id: 1,
    ticketNumber: "TKT-SQ-0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    summary: "Printer on fire",
    category: "Hardware",
    requester: { id: 2, name: "Bob Baker" },
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "OPEN",
    owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
    requesterResolvedAt: null,
    ...overrides,
  };
}

function makeResponse(
  data: api.StaffQueueTicket[],
  overrides: Partial<api.StaffQueueResponse> = {}
): api.StaffQueueResponse {
  return {
    data,
    pagination: {
      page: 1,
      pageSize: 10,
      totalCount: data.length,
      totalPages: data.length ? 1 : 0,
    },
    counts: { unassigned: 0, assignedToMe: 0, requesterResolved: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([
    { id: 1, name: "Hardware" },
    { id: 2, name: "Software" },
  ]);
  vi.spyOn(api, "fetchAssignees").mockResolvedValue([
    { id: 7, name: "Michael Brown" },
    { id: 8, name: "Sarah Johnson" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── UI-12 ─────────────────────────────────────────────────────────────────────

describe("UI-12: Staff queue rows", () => {
  it("UI-12: owner name, Unassigned, (inactive) marker, badges, resolved marker and open action (AC-41, AC-78)", async () => {
    const data = [
      makeTicket({ id: 1, ticketNumber: "TKT-SQ-0001", owner: { id: 7, name: "Michael Brown", isActiveStaff: true }, currentStatus: "OPEN", itPriority: "HIGH" }),
      makeTicket({ id: 2, ticketNumber: "TKT-SQ-0002", owner: null, currentStatus: "NEW", itPriority: "MEDIUM", summary: "VPN keeps dropping", requester: { id: 3, name: "Carol Clark" } }),
      makeTicket({ id: 3, ticketNumber: "TKT-SQ-0003", owner: { id: 9, name: "Emma Clark", isActiveStaff: false }, currentStatus: "IN_PROGRESS", itPriority: "LOW", summary: "Server rack noise" }),
      makeTicket({ id: 4, ticketNumber: "TKT-SQ-0004", owner: { id: 7, name: "Michael Brown", isActiveStaff: true }, currentStatus: "WAITING_FOR_REQUESTER", itPriority: "HIGH", summary: "Monitor flicker", requesterResolvedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue(makeResponse(data));

    const onOpenTicket = vi.fn();
    render(<StaffTicketQueue onOpenTicket={onOpenTicket} />);

    const table = await screen.findByTestId("queue-table");

    // Owner name shown (scoped to the table so the Owner filter options don't count)
    expect(within(table).getAllByText("Michael Brown").length).toBeGreaterThan(0);
    // Unassigned owner
    expect(within(table).getAllByText("Unassigned").length).toBeGreaterThan(0);
    // Owner no longer active IT Staff → (inactive) marker (AC-78)
    expect(within(table).getAllByText(/\(inactive\)/i).length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Emma Clark").length).toBeGreaterThan(0);

    // Status and IT Priority badges (text always accompanies colour)
    expect(within(table).getAllByLabelText("Status: Open").length).toBeGreaterThan(0);
    expect(within(table).getAllByLabelText("Priority: High").length).toBeGreaterThan(0);

    // Requester-indicated-resolved marker on ticket 4 only
    const marker = within(table).getByTestId("resolved-marker-4");
    expect(marker).toHaveTextContent(/requester says resolved/i);
    expect(within(table).queryByTestId("resolved-marker-1")).not.toBeInTheDocument();

    // Open action via the Ticket No. link opens the detail
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Open ticket TKT-SQ-0001" })
    );
    expect(onOpenTicket).toHaveBeenCalledWith(1);
  });
});

// ── UI-13 ─────────────────────────────────────────────────────────────────────

describe("UI-13: Queue search, filters, sort, pagination", () => {
  it("UI-13: sends the correct query parameters (AC-36, AC-37, AC-38, AC-39)", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchStaffTickets")
      .mockResolvedValue(
        makeResponse([makeTicket()], {
          pagination: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 },
        })
      );

    const user = userEvent.setup();
    render(<StaffTicketQueue onOpenTicket={vi.fn()} />);

    const lastParams = () =>
      fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as api.StaffQueueParams;

    // Default query: priority desc sort, first page, Active status
    await waitFor(() =>
      expect(lastParams()).toEqual(
        expect.objectContaining({ sortBy: "itPriority", sortDir: "desc", page: 1, status: "ACTIVE" })
      )
    );

    // Search
    await user.type(screen.getByRole("searchbox", { name: /search tickets/i }), "printer");
    await waitFor(() => expect(lastParams().search).toBe("printer"));

    // Status filter
    await user.selectOptions(screen.getByLabelText("Filter by status"), "ALL");
    await waitFor(() => expect(lastParams().status).toBe("ALL"));

    // IT Priority filter
    await user.selectOptions(screen.getByLabelText("Filter by IT priority"), "HIGH");
    await waitFor(() => expect(lastParams().priority).toBe("HIGH"));

    // Category filter (value is the category id)
    await user.selectOptions(screen.getByLabelText("Filter by category"), "2");
    await waitFor(() => expect(lastParams().categoryId).toBe(2));

    // Owner filter
    await user.selectOptions(screen.getByLabelText("Filter by owner"), "UNASSIGNED");
    await waitFor(() => expect(lastParams().owner).toBe("UNASSIGNED"));

    // Sort by a column header
    await user.click(screen.getByRole("button", { name: /sort by ticket no/i }));
    await waitFor(() =>
      expect(lastParams()).toEqual(
        expect.objectContaining({ sortBy: "ticketNumber", sortDir: "desc" })
      )
    );

    // Pagination → next page
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastParams().page).toBe(2));

    // Requester-says-resolved chip → requesterResolved=true, cleared when toggled off
    const resolvedChip = screen.getByRole("button", { name: /requester says resolved/i });
    await user.click(resolvedChip);
    await waitFor(() => expect(lastParams().requesterResolved).toBe(true));
    await user.click(resolvedChip);
    await waitFor(() => expect(lastParams().requesterResolved).toBeUndefined());
  });
});

// ── UI-14 ─────────────────────────────────────────────────────────────────────

describe("UI-14: Queue states", () => {
  it("UI-14: empty state when there are no tickets and no filters (AC-40)", async () => {
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue(makeResponse([]));
    render(<StaffTicketQueue onOpenTicket={vi.fn()} />);

    const empty = await screen.findByTestId("empty-state");
    expect(empty).toHaveTextContent(/the queue is empty/i);
    expect(screen.queryByTestId("no-results-state")).not.toBeInTheDocument();
  });

  it("UI-14: no-results state with Clear Filters when a filter matches nothing (AC-40)", async () => {
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    render(<StaffTicketQueue onOpenTicket={vi.fn()} />);

    await screen.findByTestId("empty-state");
    await user.type(screen.getByRole("searchbox", { name: /search tickets/i }), "zzz");

    const noResults = await screen.findByTestId("no-results-state");
    expect(within(noResults).getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("UI-14: safe failure state with Try Again when the request fails (AC-40)", async () => {
    vi.spyOn(api, "fetchStaffTickets").mockRejectedValue(new Error("network down"));
    render(<StaffTicketQueue onOpenTicket={vi.fn()} />);

    const failure = await screen.findByTestId("failure-state");
    expect(within(failure).getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByTestId("queue-table")).not.toBeInTheDocument();
  });

  it("UI-14: forbidden state on a 403 response (AC-40)", async () => {
    vi.spyOn(api, "fetchStaffTickets").mockRejectedValue(
      new api.ApiError(403, "FORBIDDEN", "Forbidden")
    );
    render(<StaffTicketQueue onOpenTicket={vi.fn()} />);

    const forbidden = await screen.findByTestId("forbidden-state");
    expect(forbidden).toHaveTextContent(/don't have access/i);
    expect(screen.queryByTestId("failure-state")).not.toBeInTheDocument();
  });
});
