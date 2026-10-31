// UI-L4-05: ActionsTaken create form + follow-up validation (AC-01, AC-07)
// UI-L4-06: ActionsTaken complete/cancel; read-only terminal rows (AC-04, AC-05, AC-06)
// UI-L4-07: ActionsTaken read-only for the Requester (AC-08)
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ActionsTaken from "../../src/components/ActionsTaken";
import * as api from "../../src/api";

function makeAction(o: Partial<api.ActionTaken> = {}): api.ActionTaken {
  return {
    id: 1,
    ticketId: 5,
    actionDate: "2026-10-28T02:30:00.000Z",
    description: "Replaced the faulty RAM module.",
    result: null,
    status: "OPEN",
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    performedBy: { id: 3, name: "Michael Chen" },
    assignee: null,
    updatedBy: null,
    createdAt: "2026-10-28T02:31:10.000Z",
    updatedAt: "2026-10-28T02:31:10.000Z",
    ...o,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchStaffActions").mockResolvedValue([]);
  vi.spyOn(api, "fetchRequesterActions").mockResolvedValue([]);
});

describe("UI-L4-05: ActionsTaken create form + follow-up validation", () => {
  it("UI-L4-05: requires a description and gates the follow-up note before submit (AC-01, AC-07)", async () => {
    const user = userEvent.setup();
    const createSpy = vi
      .spyOn(api, "createStaffAction")
      .mockResolvedValue(makeAction());
    render(
      <ActionsTaken ticketId={5} mode="staff" assignees={[{ id: 4, name: "Dana Lee" }]} />
    );
    await screen.findByText(/no actions yet/i);

    // Reveal the collapsible create form.
    await user.click(screen.getByRole("button", { name: /add action/i }));

    // Submitting with an empty description shows an inline, field-level error and
    // does not call the API.
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(await screen.findByText(/description is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^description/i), "Checked the server logs");

    // The follow-up note is hidden until follow-up is required.
    expect(screen.queryByLabelText(/follow-up note/i)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/follow-up required/i));
    const note = screen.getByLabelText(/follow-up note/i);
    expect(note).toBeInTheDocument();

    // Checked but empty note → inline error, still no API call.
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(await screen.findByText(/follow-up note is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    // Fill the note and submit successfully.
    await user.type(note, "Check back after 24h of uptime.");
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const [, payload] = createSpy.mock.calls[0];
    expect(payload).toMatchObject({
      description: "Checked the server logs",
      followUpRequired: true,
      followUpNote: "Check back after 24h of uptime.",
    });
  });
});

describe("UI-L4-06: ActionsTaken complete/cancel; read-only terminal rows", () => {
  it("UI-L4-06: complete needs a result, cancel transitions, terminal rows are read-only (AC-04, AC-05, AC-06)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchStaffActions").mockResolvedValue([
      makeAction({ id: 1, status: "OPEN", result: null, description: "First entry, no result" }),
      makeAction({ id: 2, status: "OPEN", result: "Replaced the module", description: "Second entry, has result" }),
      makeAction({ id: 3, status: "COMPLETED", result: "Done", description: "Third entry" }),
      makeAction({ id: 4, status: "CANCELLED", description: "Fourth entry" }),
    ]);
    const patchSpy = vi.spyOn(api, "patchStaffAction").mockResolvedValue(makeAction());

    render(<ActionsTaken ticketId={5} mode="staff" assignees={[]} />);
    await screen.findByText(/first entry, no result/i);

    const row1 = screen.getByTestId("action-row-1");
    const row2 = screen.getByTestId("action-row-2");
    const row3 = screen.getByTestId("action-row-3");
    const row4 = screen.getByTestId("action-row-4");

    // Terminal (COMPLETED / CANCELLED) rows expose no lifecycle controls.
    for (const row of [row3, row4]) {
      expect(within(row).queryByRole("button", { name: /complete/i })).toBeNull();
      expect(within(row).queryByRole("button", { name: /cancel action/i })).toBeNull();
      expect(within(row).queryByRole("button", { name: /^edit$/i })).toBeNull();
    }
    // Terminal badge labels are plain text — the ✓ / ✕ cue is a decorative CSS
    // ::before and Cancelled is no longer struck through (readability / AA).
    expect(within(row3).getByText("Completed")).toBeInTheDocument();
    expect(within(row4).getByText("Cancelled")).toBeInTheDocument();
    expect(row4.querySelector("s")).toBeNull();

    // Completing an OPEN action without a result is blocked inline, no API call.
    await user.click(within(row1).getByRole("button", { name: /complete/i }));
    expect(await within(row1).findByText(/result is required to complete/i)).toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();

    // Completing an OPEN action that has a result sends the COMPLETED transition.
    await user.click(within(row2).getByRole("button", { name: /complete/i }));
    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(5, 2, expect.objectContaining({ status: "COMPLETED" }))
    );

    patchSpy.mockClear();

    // Cancelling is irreversible, so it is guarded by a confirm dialog — the
    // trigger alone sends nothing.
    const cancelTrigger = within(row1).getByRole("button", { name: /cancel action/i });
    await user.click(cancelTrigger);
    await screen.findByRole("dialog", { name: /cancel this action/i });
    expect(patchSpy).not.toHaveBeenCalled();

    // Esc closes the dialog without sending, and focus returns to the trigger.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(patchSpy).not.toHaveBeenCalled();
    expect(within(row1).getByRole("button", { name: /cancel action/i })).toHaveFocus();

    // Reopening and confirming sends the CANCELLED transition.
    await user.click(within(row1).getByRole("button", { name: /cancel action/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel this action/i });
    await user.click(within(dialog).getByRole("button", { name: /yes, cancel action/i }));
    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(5, 1, expect.objectContaining({ status: "CANCELLED" }))
    );
  });
});

describe("UI-L4-07: ActionsTaken read-only for the Requester", () => {
  it("UI-L4-07: renders every field with no create/edit controls and uses the requester endpoint (AC-08)", async () => {
    vi.spyOn(api, "fetchRequesterActions").mockResolvedValue([
      makeAction({
        id: 9,
        status: "OPEN",
        result: "All memory tests pass.",
        followUpRequired: true,
        followUpNote: "Confirm after 24h.",
        attachmentNotes: "See diagnostic-report.pdf.",
        assignee: { id: 4, name: "Dana Lee" },
      }),
    ]);

    render(<ActionsTaken ticketId={5} mode="requester" />);
    await screen.findByText(/replaced the faulty ram module/i);

    // All fields are visible to the owner.
    expect(screen.getByText(/all memory tests pass/i)).toBeInTheDocument();
    expect(screen.getByText(/dana lee/i)).toBeInTheDocument();
    expect(screen.getByText(/michael chen/i)).toBeInTheDocument();
    expect(screen.getByText(/see diagnostic-report\.pdf/i)).toBeInTheDocument();
    // The amber chip is exactly "Follow-up"; the field label is "Follow-up note".
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    // Field labels match the handout wording (not "Note" / "Attachments").
    expect(screen.getByText("Follow-up note")).toBeInTheDocument();
    expect(screen.getByText("Attachment notes")).toBeInTheDocument();

    // Timestamps use the shared formatDateTime helper → a Gregorian date
    // ("28 Oct 2026, …"), never the Buddhist year (2569) toLocaleString gave
    // under a th-TH locale.
    expect(screen.getByText(/Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2569/)).toBeNull();

    // No write controls anywhere.
    expect(screen.queryByRole("button", { name: /add action/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /complete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel action/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /assign/i })).toBeNull();

    // The Requester screen must never hit the staff endpoint.
    expect(api.fetchStaffActions).not.toHaveBeenCalled();
  });
});
