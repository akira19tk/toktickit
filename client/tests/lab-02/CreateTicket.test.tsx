// UI-02: empty Summary → field error shown, no API call (AC-02)
// UI-03: double-click Submit → button stays disabled, createTicket called once (AC-04)
// UI-04: server 400 → form values retained (AC-05)
// UI-05: successful creation → ticket number shown in success panel (AC-01)
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CreateTicket from "../../src/components/CreateTicket";
import * as api from "../../src/api";

const MOCK_CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const MOCK_SYSTEMS = [
  { id: 1, name: "Email" },
  { id: 2, name: "Campus Wi-Fi" },
];
const MOCK_TICKET: api.CreatedTicket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains fast even when idle.",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-09-06T10:00:00Z",
  updatedAt: "2026-09-06T10:00:00Z",
  attachments: [],
  attachmentErrors: [],
};

beforeEach(() => {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(MOCK_CATEGORIES);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(MOCK_SYSTEMS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: render form and wait until selects are populated
async function renderAndWaitForForm(requesterId = 1) {
  render(<CreateTicket requesterId={requesterId} />);
  await waitFor(() =>
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
  );
}

// Helper: fill all required fields with valid data
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/category/i), "1");
  await user.selectOptions(screen.getByLabelText(/related system/i), "1");
  await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");
  await user.type(
    screen.getByLabelText(/summary/i),
    "Laptop battery drains quickly"
  );
  await user.type(
    screen.getByLabelText(/description/i),
    "Battery drains fast even when idle, started after update."
  );
}

describe("CreateTicket", () => {
  it("UI-02: submitting with empty summary shows field error and does not call createTicket", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "createTicket");

    await renderAndWaitForForm();

    // Fill required fields except summary
    await user.selectOptions(screen.getByLabelText(/category/i), "1");
    await user.selectOptions(screen.getByLabelText(/related system/i), "1");
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");
    await user.type(
      screen.getByLabelText(/description/i),
      "Battery drains fast even when idle, started after update."
    );
    // Leave summary empty

    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/summary.*required|must be 5|summary is required/i)
      ).toBeInTheDocument();
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("UI-03: second click on Submit while request is in flight is ignored; createTicket called once", async () => {
    const user = userEvent.setup();

    let resolveCreate!: (v: api.CreatedTicket) => void;
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise<api.CreatedTicket>((res) => {
        resolveCreate = res;
      })
    );

    await renderAndWaitForForm();
    await fillValidForm(user);

    const submitBtn = screen.getByRole("button", { name: /submit ticket/i });
    await user.click(submitBtn);

    // Button must be disabled/busy after first click
    expect(submitBtn).toBeDisabled();
    expect(api.createTicket).toHaveBeenCalledTimes(1);

    // Second click — button is disabled, event must not fire
    await user.click(submitBtn);
    expect(api.createTicket).toHaveBeenCalledTimes(1);

    // Clean up the pending promise
    resolveCreate(MOCK_TICKET);
  });

  it("UI-04: after server 400 response, previously entered form values remain", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "createTicket").mockRejectedValue(
      new api.ApiValidationError({ description: "Description too long" }, 400)
    );

    await renderAndWaitForForm();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    // Values must still be in the form (BR-13 / FR-17)
    await waitFor(() => {
      expect(screen.getByLabelText(/summary/i)).toHaveValue(
        "Laptop battery drains quickly"
      );
    });
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      "Battery drains fast even when idle, started after update."
    );
  });

  it("UI-05: successful creation shows ticket number in success panel (AC-01)", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "createTicket").mockResolvedValue(MOCK_TICKET);

    await renderAndWaitForForm();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /submit ticket/i }));

    await waitFor(() => {
      expect(screen.getByText(/TKT-2026-000001/)).toBeInTheDocument();
    });

    // Success state must offer "View Ticket" or "Create Another" action (ui-spec §10.3)
    expect(
      screen.getByRole("button", { name: /create another/i })
    ).toBeInTheDocument();
  });
});
