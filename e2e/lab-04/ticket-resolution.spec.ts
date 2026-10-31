import { test, expect, type Page } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  STAFF_EMAIL,
  REQUESTER_EMAIL,
  loginAs,
  apiLogin,
  apiLogout,
  createClaimedTicket,
  createActionViaApi,
  completeActionViaApi,
  getStaffTicket,
  disconnectDb,
} from "./helpers";

/**
 * E2E-L4-02 — Ticket resolution workflow (AC-10, AC-11, AC-13).
 *
 * Proves end-to-end: only matrix-permitted transitions are offered; the
 * resolution gate blocks Resolve while an Action is OPEN (without losing the
 * typed summary) and allows it once the Action is closed; reopen and close; the
 * Requester's "appears resolved" signal never changes status. Optimistic-
 * concurrency (STALE_UPDATE) is asserted at the API boundary because the status
 * control intentionally omits expectedUpdatedAt (Lab 3 compatibility, api-spec
 * §1); its inline UI rendering is covered on Actions in actions-taken-flow.
 */

const RESOLUTION = "Resolved during the E2E workflow regression test.";

test.afterAll(async () => {
  await disconnectDb();
});

function header(page: Page) {
  return page.getByTestId("detail-header");
}
function statusSelect(page: Page) {
  return page.getByRole("combobox", { name: "Status" });
}
async function applyStatus(page: Page) {
  await page.getByRole("button", { name: "Apply status change" }).click();
}

test("E2E-L4-02: only permitted transitions are offered; resolve is gated by an open action, then reopen and close", async ({
  page,
  request,
}) => {
  const { id: ticketId } = await createClaimedTicket(request);

  // The select must offer exactly the matrix-permitted transitions for OPEN and
  // nothing else (placeholder + allowedTransitions, in server order).
  const snapshot = await getStaffTicket(request, ticketId);
  expect(snapshot.currentStatus).toBe("OPEN");

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);
  await expect(statusSelect(page)).toBeVisible(); // wait for the detail to load

  const optionValues = await statusSelect(page)
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(optionValues).toEqual(["", ...snapshot.allowedTransitions]);
  expect(optionValues).not.toContain("NEW"); // not a legal exit from OPEN
  expect(optionValues).not.toContain("OPEN");

  // An OPEN action blocks Resolve; the typed summary survives the conflict.
  const action = await createActionViaApi(request, STAFF_EMAIL, ticketId, {
    description: "Pending diagnostic step still in progress",
  });
  await page.reload();
  await statusSelect(page).selectOption("RESOLVED");
  const summary = page.getByLabel("Resolution summary");
  await expect(summary).toBeVisible();
  await summary.fill(RESOLUTION);
  await applyStatus(page);
  // Scope to the operations panel so the gate message can't collide with an
  // action row that happens to mention "open action".
  await expect(page.getByTestId("operations-panel").getByText(/open action/i)).toBeVisible();
  await expect(summary).toHaveValue(RESOLUTION); // not lost on the 409
  await expect(header(page).locator('[aria-label="Status: Open"]')).toBeVisible();

  // Close the action → Resolve now succeeds.
  await completeActionViaApi(request, STAFF_EMAIL, ticketId, action.id);
  await page.reload();
  await statusSelect(page).selectOption("RESOLVED");
  await page.getByLabel("Resolution summary").fill(RESOLUTION);
  await applyStatus(page);
  await expect(header(page).locator('[aria-label="Status: Resolved"]')).toBeVisible();

  // Reopen (RESOLVED → REOPENED) …
  await statusSelect(page).selectOption("REOPENED");
  await applyStatus(page);
  await expect(header(page).locator('[aria-label="Status: Reopened"]')).toBeVisible();

  // … re-resolve, then Close via the confirmation dialog (RESOLVED → CLOSED).
  await statusSelect(page).selectOption("RESOLVED");
  await page.getByLabel("Resolution summary").fill(RESOLUTION);
  await applyStatus(page);
  await expect(header(page).locator('[aria-label="Status: Resolved"]')).toBeVisible();

  await statusSelect(page).selectOption("CLOSED");
  await applyStatus(page); // CLOSED routes through a confirmation dialog
  const confirm = page.getByRole("dialog", { name: "Confirm status change" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Close Ticket" }).click();
  await expect(header(page).locator('[aria-label="Status: Closed"]')).toBeVisible();
});

test("E2E-L4-02: a requester's 'appears resolved' signal does not change the ticket status", async ({
  page,
  request,
}) => {
  const { id: ticketId } = await createClaimedTicket(request); // OPEN, owned by staff

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

  const resolvedBtn = page.getByRole("button", { name: "Problem Appears Resolved" });
  await expect(resolvedBtn).toBeEnabled();
  await resolvedBtn.click();
  await expect(page.getByRole("button", { name: "Marked as resolved" })).toBeDisabled();

  // The signal is recorded but the workflow status is unchanged (still OPEN).
  const after = await getStaffTicket(request, ticketId);
  expect(after.currentStatus).toBe("OPEN");
  expect(after.requesterResolvedAt).not.toBeNull();
});

test("E2E-L4-02: a stale status update is rejected with 409 STALE_UPDATE", async ({ request }) => {
  const { id: ticketId } = await createClaimedTicket(request); // OPEN
  const before = await getStaffTicket(request, ticketId);
  const staleToken = before.updatedAt;

  await apiLogin(request, STAFF_EMAIL);
  // First transition with the current token succeeds and refreshes updatedAt.
  const first = await request.patch(`${API}/api/staff/tickets/${ticketId}/status`, {
    headers: CSRF,
    data: { status: "IN_PROGRESS", expectedUpdatedAt: staleToken },
  });
  expect(first.ok()).toBeTruthy();

  // Re-using the now-stale token must be rejected; nothing is written.
  const second = await request.patch(`${API}/api/staff/tickets/${ticketId}/status`, {
    headers: CSRF,
    data: { status: "WAITING_FOR_REQUESTER", expectedUpdatedAt: staleToken },
  });
  expect(second.status()).toBe(409);
  expect((await second.json()).code).toBe("STALE_UPDATE");
  await apiLogout(request);

  const after = await getStaffTicket(request, ticketId);
  expect(after.currentStatus).toBe("IN_PROGRESS"); // the stale PATCH did not apply
});
