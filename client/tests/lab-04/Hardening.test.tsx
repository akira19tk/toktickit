import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../../src/api";
import MyTickets from "../../src/components/MyTickets";
import userEvent from "@testing-library/user-event";
import { formatDateTime } from "../../src/lib/formatDate";

afterEach(() => vi.restoreAllMocks());

it("UI-L4-15: My Tickets uses Gregorian date/time even with a Thai browser locale", async () => {
  vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("1/11/2569");
  vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(api, "fetchTickets").mockResolvedValue({
    data: [{ id: 1, ticketNumber: "TKT-2026-000001", summary: "Network unavailable",
      category: "Network", requestedPriority: "HIGH", currentStatus: "IN_PROGRESS",
      createdAt: "2026-11-01T01:00:00Z", updatedAt: "2026-11-01T02:00:00Z" }],
    pagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
  });
  const open = vi.fn();
  render(<MyTickets onCreateTicket={() => {}} onOpenTicket={open} />);
  await screen.findByTestId("summary-1");
  expect(screen.queryAllByText("1/11/2569")).toHaveLength(0);
  expect(screen.getAllByText(formatDateTime("2026-11-01T01:00:00Z")).length).toBeGreaterThan(0);
  expect(screen.getByText(formatDateTime("2026-11-01T02:00:00Z"))).toBeInTheDocument();
  const card = screen.getAllByRole("button", { name: "Open ticket TKT-2026-000001" })
    .find((element) => element.classList.contains("mt-card"))!;
  card.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(open).toHaveBeenCalledWith(1);
});
