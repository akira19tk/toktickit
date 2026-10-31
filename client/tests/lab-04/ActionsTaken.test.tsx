// UI-L4-05: ActionsTaken create form + follow-up validation (AC-01, AC-07)
// UI-L4-06: ActionsTaken complete/cancel; read-only terminal rows (AC-04, AC-05, AC-06)
// UI-L4-07: ActionsTaken read-only for the Requester (AC-08)
// UI-L4-10: whitespace-only input rejected client-side (AC-01, AC-04, AC-07) — PR #62 review
// UI-L4-11: 422/409 recoverable errors keep typed data + show feedback (AC-02, AC-13) — PR #62 review
// UI-L4-12: successful create/complete refresh the list and ticket summary (AC-01, AC-04) — PR #62 review
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

describe("UI-L4-10: whitespace-only input is rejected client-side (PR #62 review)", () => {
  it("UI-L4-10: whitespace description, follow-up note, and completion result are all rejected (AC-01, AC-04, AC-07)", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(api, "createStaffAction").mockResolvedValue(makeAction());
    const patchSpy = vi.spyOn(api, "patchStaffAction").mockResolvedValue(makeAction());
    // An OPEN action whose stored result is whitespace-only cannot be completed.
    vi.spyOn(api, "fetchStaffActions").mockResolvedValue([
      makeAction({ id: 1, status: "OPEN", result: "   " }),
    ]);

    render(<ActionsTaken ticketId={5} mode="staff" assignees={[{ id: 4, name: "Dana Lee" }]} />);
    await screen.findByTestId("action-row-1");

    // Create: a whitespace-only description is rejected, no API call.
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "   ");
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(await screen.findByText(/description is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    // Create: a whitespace-only follow-up note is rejected when follow-up is checked.
    await user.type(screen.getByLabelText(/^description/i), "Investigated the alert");
    await user.click(screen.getByLabelText(/follow-up required/i));
    await user.type(screen.getByLabelText(/follow-up note/i), "   ");
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(await screen.findByText(/follow-up note is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    // Complete: a whitespace-only result cannot complete the action.
    const row = screen.getByTestId("action-row-1");
    await user.click(within(row).getByRole("button", { name: /complete/i }));
    expect(await within(row).findByText(/result is required to complete/i)).toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });
});

describe("UI-L4-11: recoverable errors keep typed data and show feedback (PR #62 review)", () => {
  it("UI-L4-11: 422 ASSIGNEE_INACTIVE (create) and 409 STALE_UPDATE (edit) preserve input + show the message (AC-02, AC-13)", async () => {
    const user = userEvent.setup();

    // (a) Create → 422 ASSIGNEE_INACTIVE: every typed field is retained and the
    //     inactive-assignee message is shown (here at the form level).
    const createSpy = vi.spyOn(api, "createStaffAction").mockRejectedValue(
      new api.ApiError(422, "ASSIGNEE_INACTIVE", "Assignee is inactive")
    );
    const view = render(
      <ActionsTaken ticketId={5} mode="staff" assignees={[{ id: 4, name: "Dana Lee" }]} />
    );
    await screen.findByText(/no actions yet/i);
    await user.click(screen.getByRole("button", { name: /add action/i }));

    await user.type(screen.getByLabelText(/^description/i), "Checked the switch config");
    await user.type(screen.getByLabelText(/^result/i), "Config looks correct");
    await user.selectOptions(screen.getByLabelText(/assignee/i), "4");
    await user.click(screen.getByLabelText(/follow-up required/i));
    await user.type(screen.getByLabelText(/follow-up note/i), "Revisit tomorrow");
    await user.type(screen.getByLabelText(/attachment notes/i), "See switch-log.txt");

    await user.click(screen.getByRole("button", { name: /save action/i }));

    expect(await screen.findByText(/this staff member is inactive/i)).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalledTimes(1);
    // Nothing was reset — every field still holds what the user typed.
    expect((screen.getByLabelText(/^description/i) as HTMLTextAreaElement).value).toBe("Checked the switch config");
    expect((screen.getByLabelText(/^result/i) as HTMLTextAreaElement).value).toBe("Config looks correct");
    expect((screen.getByLabelText(/assignee/i) as HTMLSelectElement).value).toBe("4");
    expect((screen.getByLabelText(/follow-up note/i) as HTMLTextAreaElement).value).toBe("Revisit tomorrow");
    expect((screen.getByLabelText(/attachment notes/i) as HTMLTextAreaElement).value).toBe("See switch-log.txt");
    view.unmount();

    // (b) Edit → 409 STALE_UPDATE: the edit stays open with the typed value kept
    //     and a reload-me message shown next to the fields.
    vi.spyOn(api, "fetchStaffActions").mockResolvedValue([
      makeAction({ id: 1, status: "OPEN", result: "Initial result" }),
    ]);
    const patchSpy = vi.spyOn(api, "patchStaffAction").mockRejectedValue(
      new api.ApiError(409, "STALE_UPDATE", "Stale")
    );
    render(<ActionsTaken ticketId={5} mode="staff" assignees={[]} />);
    const row = await screen.findByTestId("action-row-1");
    await user.click(within(row).getByRole("button", { name: /^edit$/i }));
    const desc = within(row).getByLabelText("Description") as HTMLTextAreaElement;
    await user.clear(desc);
    await user.type(desc, "Edited description text");
    await user.click(within(row).getByRole("button", { name: /^save$/i }));

    expect(await within(row).findByText(/changed since you opened/i)).toBeInTheDocument();
    expect(patchSpy).toHaveBeenCalledTimes(1);
    // Still editing, with the typed edit preserved.
    expect((within(row).getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Edited description text");
  });
});

describe("UI-L4-12: successful mutations refresh the list and ticket summary (PR #62 review)", () => {
  it("UI-L4-12: create and complete re-fetch the actions list and call onChanged once each (AC-01, AC-04)", async () => {
    const user = userEvent.setup();

    // — Create path — list re-fetches; onChanged (ticket-summary reload) fires once.
    const onChangedA = vi.fn();
    const fetchSpy = vi.spyOn(api, "fetchStaffActions").mockResolvedValue([]);
    vi.spyOn(api, "createStaffAction").mockResolvedValue(makeAction());

    const viewA = render(
      <ActionsTaken ticketId={5} mode="staff" assignees={[]} onChanged={onChangedA} />
    );
    await screen.findByText(/no actions yet/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.type(screen.getByLabelText(/^description/i), "Logged the incident");
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2)); // list re-fetched
    expect(onChangedA).toHaveBeenCalledTimes(1); // ticket summary refreshed once
    viewA.unmount();

    // — Complete path — same contract via a PATCH.
    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue([makeAction({ id: 1, status: "OPEN", result: "Done" })]);
    vi.spyOn(api, "patchStaffAction").mockResolvedValue(
      makeAction({ id: 1, status: "COMPLETED", result: "Done" })
    );
    const onChangedB = vi.fn();

    render(<ActionsTaken ticketId={5} mode="staff" assignees={[]} onChanged={onChangedB} />);
    const row = await screen.findByTestId("action-row-1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await user.click(within(row).getByRole("button", { name: /complete/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(onChangedB).toHaveBeenCalledTimes(1);
  });
});
