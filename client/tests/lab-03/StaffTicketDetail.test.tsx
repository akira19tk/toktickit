// UI-15: Staff detail controls — claim, reassign, priority, status with busy state; inactive-owner marker (AC-42, 45, 46, 78)
// UI-16: Resolve and close/cancel flows — summary required; confirmation dialog required (AC-47, 48)
// UI-17: Public vs Internal separation — panels, labels, helper text, button wording; <script> renders as text (AC-56, 30)
// UI-18: Staff detail error feedback — not-found, forbidden, conflict, failure; input retained (AC-57)
// UI-27: Comment/note composer validation — empty/whitespace blocked; counter (AC-30)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    owner: null,
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
    requesterResolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    attachments: [],
    allowedTransitions: ["OPEN", "IN_PROGRESS", "CANCELLED"],
    counts: { publicComments: 0, internalNotes: 0 },
    ...o,
  };
}

function makeEntry(o: Partial<api.TicketComment> = {}): api.TicketComment {
  return {
    id: 1,
    body: "An entry body.",
    createdAt: "2026-01-03T00:00:00.000Z",
    author: { id: 7, name: "Michael Brown", role: "IT_STAFF" },
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
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(makeDetail());
  vi.spyOn(api, "fetchStaffComments").mockResolvedValue([]);
  vi.spyOn(api, "fetchStaffNotes").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignees").mockResolvedValue([
    { id: 7, name: "Michael Brown" },
    { id: 8, name: "Sarah Johnson" },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── UI-15 ───────────────────────────────────────────────────────────────────

describe("UI-15: Staff detail controls", () => {
  it("UI-15: Claim sets owner and status with a busy state (AC-42)", async () => {
    const claim = deferred<{ owner: api.StaffOwner; currentStatus: string }>();
    vi.spyOn(api, "claimStaffTicket").mockReturnValue(claim.promise);
    const detail = vi
      .spyOn(api, "fetchStaffTicketDetail")
      .mockResolvedValue(makeDetail({ owner: null, currentStatus: "NEW" }));

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.click(screen.getByRole("button", { name: /^claim$/i }));
    expect(api.claimStaffTicket).toHaveBeenCalledWith(41);
    // Busy state while the request is in flight
    expect(screen.getByRole("button", { name: /claiming/i })).toBeDisabled();

    // The post-claim reload now returns the owned, OPEN ticket.
    detail.mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "OPEN",
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      })
    );
    claim.resolve({ owner: { id: 7, name: "Michael Brown", isActiveStaff: true }, currentStatus: "OPEN" });

    // After the reload the new owner and status are shown, with a success toast
    expect(await screen.findByTestId("toast")).toHaveTextContent(/claimed/i);
    expect(await screen.findByLabelText("Status: Open")).toBeInTheDocument();
    // Claim is replaced by the owner + reassign control once the ticket is owned
    expect(screen.queryByRole("button", { name: /^claim$/i })).not.toBeInTheDocument();
    const panel = screen.getByTestId("operations-panel");
    expect(within(panel).getByText("Ticket Owner")).toBeInTheDocument();
    expect(within(panel).getAllByText("Michael Brown").length).toBeGreaterThan(0);
  });

  it("UI-15: Reassign sends the chosen active staff id (AC-44)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({ owner: { id: 7, name: "Michael Brown", isActiveStaff: true }, currentStatus: "OPEN" })
    );
    vi.spyOn(api, "reassignStaffTicket").mockResolvedValue({
      owner: { id: 8, name: "Sarah Johnson", isActiveStaff: true },
    });

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    // Wait for the assignee options to load before selecting one.
    await screen.findByRole("option", { name: "Sarah Johnson" });
    await user.selectOptions(screen.getByLabelText("Reassign owner"), "8");
    await user.click(screen.getByRole("button", { name: /^reassign$/i }));

    expect(api.reassignStaffTicket).toHaveBeenCalledWith(41, 8);
    expect(await screen.findByTestId("toast")).toHaveTextContent(/owner updated/i);
  });

  it("UI-15: Change IT Priority sends the new value; Apply is disabled until changed (AC-45)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({ owner: { id: 7, name: "Michael Brown", isActiveStaff: true }, currentStatus: "OPEN", itPriority: "MEDIUM" })
    );
    vi.spyOn(api, "setStaffItPriority").mockResolvedValue({ itPriority: "HIGH" });

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    // Unchanged → Apply disabled
    expect(screen.getByRole("button", { name: /apply it priority/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("IT Priority"), "HIGH");
    await user.click(screen.getByRole("button", { name: /apply it priority/i }));

    expect(api.setStaffItPriority).toHaveBeenCalledWith(41, "HIGH");
    expect(await screen.findByTestId("toast")).toHaveTextContent(/priority updated/i);
  });

  it("UI-15: Change Status sends an allowed transition with a busy state (AC-46)", async () => {
    const change = deferred<api.StatusChangeResult>();
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "OPEN",
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      })
    );
    vi.spyOn(api, "changeStaffStatus").mockReturnValue(change.promise);

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /apply status change/i }));

    expect(api.changeStaffStatus).toHaveBeenCalledWith(41, { status: "IN_PROGRESS" });
    // Busy while in flight
    expect(screen.getByRole("button", { name: /apply status change/i })).toHaveAttribute("aria-busy", "true");

    change.resolve({
      currentStatus: "IN_PROGRESS",
      resolvedAt: null,
      closedAt: null,
      requesterResolvedAt: null,
      resolutionSummary: null,
      allowedTransitions: ["OPEN", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    });
    expect(await screen.findByTestId("toast")).toHaveTextContent(/status updated/i);
  });

  it("UI-15: an owner no longer active IT Staff is marked (AC-78)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({ owner: { id: 9, name: "Emma Clark", isActiveStaff: false }, currentStatus: "OPEN" })
    );
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);

    const panel = await screen.findByTestId("operations-panel");
    expect(within(panel).getByText("Emma Clark")).toBeInTheDocument();
    expect(within(panel).getByTestId("owner-inactive")).toHaveTextContent(/no longer active/i);
  });
});

// ── UI-16 ───────────────────────────────────────────────────────────────────

describe("UI-16: Resolve and close/cancel flows", () => {
  it("UI-16: Resolve requires a summary before Apply is enabled, then sends it (AC-47)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "OPEN",
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      })
    );
    vi.spyOn(api, "changeStaffStatus").mockResolvedValue({
      currentStatus: "RESOLVED",
      resolvedAt: "2026-01-04T00:00:00.000Z",
      closedAt: null,
      requesterResolvedAt: null,
      resolutionSummary: "Replaced the battery and verified boot.",
      allowedTransitions: ["CLOSED", "REOPENED"],
    });

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "RESOLVED");
    const summary = screen.getByLabelText("Resolution summary");
    const applyBtn = screen.getByRole("button", { name: /apply status change/i });

    // Too short → disabled
    await user.type(summary, "short");
    expect(applyBtn).toBeDisabled();

    // Long enough → enabled
    await user.clear(summary);
    await user.type(summary, "Replaced the battery and verified boot.");
    expect(applyBtn).toBeEnabled();

    await user.click(applyBtn);
    expect(api.changeStaffStatus).toHaveBeenCalledWith(41, {
      status: "RESOLVED",
      resolutionSummary: "Replaced the battery and verified boot.",
    });
  });

  it("UI-16: Close opens a confirmation dialog and only confirms with confirm:true (AC-48)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "RESOLVED",
        resolvedAt: "2026-01-04T00:00:00.000Z",
        allowedTransitions: ["CLOSED", "REOPENED"],
      })
    );
    vi.spyOn(api, "changeStaffStatus").mockResolvedValue({
      currentStatus: "CLOSED",
      resolvedAt: "2026-01-04T00:00:00.000Z",
      closedAt: "2026-01-05T00:00:00.000Z",
      requesterResolvedAt: null,
      resolutionSummary: "Fixed.",
      allowedTransitions: ["REOPENED"],
    });

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "CLOSED");
    await user.click(screen.getByRole("button", { name: /apply status change/i }));

    // Dialog appears; no request sent yet
    const dialog = await screen.findByRole("dialog", { name: /confirm status change/i });
    expect(api.changeStaffStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /close ticket/i }));
    expect(api.changeStaffStatus).toHaveBeenCalledWith(41, { status: "CLOSED", confirm: true });
  });

  it("UI-16: Cancel opens a confirmation dialog and sends confirm:true (AC-48)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "OPEN",
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      })
    );
    vi.spyOn(api, "changeStaffStatus").mockResolvedValue({
      currentStatus: "CANCELLED",
      resolvedAt: null,
      closedAt: null,
      requesterResolvedAt: null,
      resolutionSummary: null,
      allowedTransitions: [],
    });

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "CANCELLED");
    await user.click(screen.getByRole("button", { name: /apply status change/i }));

    const dialog = await screen.findByRole("dialog", { name: /confirm status change/i });
    await user.click(within(dialog).getByRole("button", { name: /cancel ticket/i }));
    expect(api.changeStaffStatus).toHaveBeenCalledWith(41, { status: "CANCELLED", confirm: true });
  });
});

// ── UI-17 ───────────────────────────────────────────────────────────────────

describe("UI-17: Public vs Internal separation", () => {
  it("UI-17: the two tabs are separate panels with distinct labels and button wording (AC-56)", async () => {
    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    // Public Comments tab is active first: green panel, its helper and button
    const publicPanel = screen.getByTestId("public-panel");
    expect(within(publicPanel).getByTestId("public-helper")).toHaveTextContent(/visible to the requester/i);
    expect(within(publicPanel).getByRole("button", { name: /post public comment/i })).toBeInTheDocument();
    // The internal composer is NOT on the same tab
    expect(screen.queryByTestId("internal-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add internal note/i })).not.toBeInTheDocument();

    // Switch to Internal Notes: amber panel, lock helper, its own button
    await user.click(screen.getByRole("tab", { name: /internal notes/i }));
    const internalPanel = screen.getByTestId("internal-panel");
    expect(within(internalPanel).getByTestId("internal-helper")).toHaveTextContent(/internal — not visible to the requester/i);
    expect(within(internalPanel).getByTestId("internal-helper")).toHaveTextContent(/🔒/);
    expect(within(internalPanel).getByRole("button", { name: /add internal note/i })).toBeInTheDocument();
    expect(screen.queryByTestId("public-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post public comment/i })).not.toBeInTheDocument();
  });

  it("UI-17: a <script> note body is rendered as text, not executed (AC-30)", async () => {
    const payload = "<script>alert('xss')</script>";
    vi.spyOn(api, "fetchStaffNotes").mockResolvedValue([makeEntry({ id: 5, body: payload })]);

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.click(screen.getByRole("tab", { name: /internal notes/i }));
    const internalPanel = screen.getByTestId("internal-panel");
    // Rendered verbatim as text; no real <script> element is created from it.
    expect(within(internalPanel).getByText(payload)).toBeInTheDocument();
    expect(internalPanel.querySelector("script")).toBeNull();
  });
});

// ── UI-18 ───────────────────────────────────────────────────────────────────

describe("UI-18: Staff detail error feedback", () => {
  it("UI-18: a 404 shows the Not Found state (AC-57)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(new api.ApiError(404, "NOT_FOUND", "Ticket not found"));
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    expect(await screen.findByTestId("notfound-state")).toHaveTextContent(/not found/i);
  });

  it("UI-18: a 403 shows the Forbidden state (AC-57)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(new api.ApiError(403, "FORBIDDEN", "Forbidden"));
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    expect(await screen.findByTestId("forbidden-state")).toHaveTextContent(/don't have access/i);
  });

  it("UI-18: a network failure shows the safe Failure state with Try Again (AC-57)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(new Error("network down"));
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    const failure = await screen.findByTestId("failure-state");
    expect(within(failure).getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("UI-18: a 409 conflict is shown inline and the typed input is retained (AC-57)", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(
      makeDetail({
        owner: { id: 7, name: "Michael Brown", isActiveStaff: true },
        currentStatus: "OPEN",
        allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      })
    );
    vi.spyOn(api, "changeStaffStatus").mockRejectedValue(
      new api.ApiError(409, "NO_CHANGE", "The ticket already has this status.")
    );

    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.selectOptions(screen.getByLabelText("Status"), "RESOLVED");
    const summary = screen.getByLabelText("Resolution summary");
    await user.type(summary, "Replaced the battery and verified boot.");
    await user.click(screen.getByRole("button", { name: /apply status change/i }));

    // Inline conflict message (not a page-level card), typed summary kept
    expect(await screen.findByRole("alert")).toHaveTextContent(/already set|nothing to change/i);
    expect(screen.getByLabelText("Resolution summary")).toHaveValue("Replaced the battery and verified boot.");
    expect(screen.queryByTestId("failure-state")).not.toBeInTheDocument();
  });
});

// ── UI-27 ───────────────────────────────────────────────────────────────────

describe("UI-27: Comment and note composer validation", () => {
  it("UI-27: the public composer blocks empty/whitespace and shows a live counter (AC-30)", async () => {
    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    const post = screen.getByRole("button", { name: /post public comment/i });
    expect(post).toBeDisabled(); // empty

    const box = screen.getByLabelText("Post a public comment");
    await user.type(box, "   ");
    expect(post).toBeDisabled(); // whitespace-only

    await user.clear(box);
    await user.type(box, "Looking into it");
    expect(post).toBeEnabled();
    expect(screen.getByText("15/2000")).toBeInTheDocument();
  });

  it("UI-27: the internal-note composer blocks empty/whitespace and shows a live counter (AC-30)", async () => {
    const user = userEvent.setup();
    render(<StaffTicketDetail ticketId={41} onBack={vi.fn()} />);
    await screen.findByTestId("operations-panel");

    await user.click(screen.getByRole("tab", { name: /internal notes/i }));
    const add = screen.getByRole("button", { name: /add internal note/i });
    expect(add).toBeDisabled();

    const box = screen.getByLabelText("Add an internal note");
    await user.type(box, "   ");
    expect(add).toBeDisabled();

    await user.clear(box);
    await user.type(box, "Suspect RAM");
    expect(add).toBeEnabled();
    expect(screen.getByText("11/2000")).toBeInTheDocument();
  });
});
