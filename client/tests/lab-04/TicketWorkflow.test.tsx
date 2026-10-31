// UI-L4-08: Ticket status control shows only matrix-permitted transitions and
//           blocks double submit (AC-11, AC-21).
// UI-L4-09: Resolving while open Actions remain surfaces OPEN_ACTIONS_EXIST
//           inline without losing the entered resolution summary (AC-10).
//
// The status control is part of StaffTicketDetail (§8 of the UI spec), so these
// workflow tests drive it through that screen rather than a standalone widget.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StaffTicketDetail from "../../src/components/StaffTicketDetail";
import * as api from "../../src/api";

function makeDetail(o: Partial<api.StaffTicketDetail> = {}): api.StaffTicketDetail {
  return {
    id: 41,
    ticketNumber: "TKT-2026-000041",
    summary: "Laptop battery drains quickly",
    description: "Battery drains fast.",
    category: "Hardware",
    relatedSystem: "Email",
    requester: { id: 2, name: "Bob Smith", email: "bob@example.com" },
    owner: { id: 3, name: "Michael Chen", isActiveStaff: true },
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "OPEN",
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    requesterResolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    attachments: [],
    allowedTransitions: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    counts: { publicComments: 0, internalNotes: 0 },
    ...o,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(makeDetail());
  vi.spyOn(api, "fetchStaffComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchStaffNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignees").mockResolvedValue([]);
  vi.spyOn(api, "fetchStaffActions").mockResolvedValue([]);
});

describe("UI-L4-08: status control transitions and double-submit", () => {
  it("UI-L4-08: offers only the allowed transitions and blocks a double submit (AC-11, AC-21)", async () => {
    const user = userEvent.setup();
    const d = deferred<api.StatusChangeResult>();
    vi.spyOn(api, "changeStaffStatus").mockReturnValue(d.promise);

    render(<StaffTicketDetail ticketId={41} onBack={() => {}} />);
    await screen.findByTestId("operations-panel");

    const select = screen.getByLabelText("Status") as HTMLSelectElement;

    // Exactly the matrix-permitted targets are offered (plus the placeholder);
    // a non-permitted status such as CLOSED is absent.
    expect(within(select).getByRole("option", { name: /in progress/i })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /^resolved$/i })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: /^cancelled$/i })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /^closed$/i })).toBeNull();

    await user.selectOptions(select, "IN_PROGRESS");
    const apply = screen.getByRole("button", { name: /apply status change/i });

    // First click starts the mutation; while it is in flight the button is busy
    // and disabled, so a second click cannot fire a duplicate request.
    await user.click(apply);
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute("aria-busy", "true");
    await user.click(apply);

    expect(api.changeStaffStatus).toHaveBeenCalledTimes(1);
    expect(api.changeStaffStatus).toHaveBeenCalledWith(41, { status: "IN_PROGRESS" });

    d.resolve({
      currentStatus: "IN_PROGRESS",
      resolvedAt: null,
      closedAt: null,
      requesterResolvedAt: null,
      resolutionSummary: null,
      allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    });
    expect(await screen.findByTestId("toast")).toHaveTextContent(/status updated/i);
  });
});

describe("UI-L4-09: resolution gate feedback", () => {
  it("UI-L4-09: OPEN_ACTIONS_EXIST is shown inline and the typed summary is kept (AC-10)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "changeStaffStatus").mockRejectedValue(
      new api.ApiError(409, "OPEN_ACTIONS_EXIST", "This ticket still has 2 open action(s).")
    );

    render(<StaffTicketDetail ticketId={41} onBack={() => {}} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "RESOLVED");
    const summary = screen.getByLabelText("Resolution summary") as HTMLTextAreaElement;
    await user.type(summary, "Swapped the battery and verified charge cycles.");

    await user.click(screen.getByRole("button", { name: /apply status change/i }));

    // Conflict is surfaced inline, mentions open actions, and the summary the
    // user typed is still present (not lost to a reload).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/open action/i);
    expect((screen.getByLabelText("Resolution summary") as HTMLTextAreaElement).value).toMatch(
      /swapped the battery/i
    );
    // The status did not change — still OPEN in the header.
    expect(within(screen.getByTestId("detail-header")).getByText(/^open$/i)).toBeInTheDocument();
  });
});
