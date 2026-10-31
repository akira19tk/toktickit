import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  STAFF_EMAIL,
  STAFF_NAME,
  STAFF2_EMAIL,
  STAFF2_NAME,
  STAFF_INACTIVE_EMAIL,
  REQUESTER_EMAIL,
  loginAs,
  apiLogin,
  apiLogout,
  createClaimedTicket,
  createActionViaApi,
  userIdByEmail,
  disconnectDb,
} from "./helpers";

/**
 * E2E-L4-01 — Actions Taken flow (AC-01, AC-02, AC-04, AC-05, AC-22, AC-13).
 *
 * The backend is the authority for every rule; these specs drive the real UI and
 * prove the Action lifecycle end-to-end. Each test owns its ticket (created +
 * claimed via the API) so reruns never collide. The /staff/tickets/:id UI is
 * IT_STAFF-only, so both "two different staff" actors are active IT_STAFF
 * (staff.e2e, staff2.e2e). Inactive-assignee rejection is asserted at the API
 * boundary because the UI never offers an inactive assignee in its dropdown.
 */

test.afterAll(async () => {
  await disconnectDb();
});

// The Actions Taken section and helpers to locate a row by its description text.
function actionsSection(page: Page): Locator {
  return page.locator("section.at-section");
}
function actionRow(page: Page, text: string): Locator {
  return page.getByTestId("actions-list").locator("li.at-row").filter({ hasText: text });
}
// A row shows "Performed by" / "Assignee" as labelled field values; scope to the
// value span so the reassign-select <option>s with the same names don't collide.
function performedBy(row: Locator): Locator {
  return row.locator(".at-field", { hasText: "Performed by" }).locator(".at-field-value");
}
function assigneeValue(row: Locator): Locator {
  return row.locator(".at-field", { hasText: "Assignee" }).locator(".at-field-value");
}

// Open the collapsible create form and fill the common fields.
async function openCreateForm(page: Page): Promise<Locator> {
  await actionsSection(page).getByRole("button", { name: "Add Action" }).click();
  const form = page.locator("form.at-create-form");
  await expect(form).toBeVisible();
  return form;
}

test("E2E-L4-01: two different IT staff add actions on one ticket; a non-author completes the other's action", async ({
  page,
  request,
  browser,
}) => {
  const runId = `${Date.now()}`;
  const d1 = `Staff one action ${runId}`;
  const d2 = `Staff two action ${runId}`;
  const { id: ticketId } = await createClaimedTicket(request);

  // Staff one creates an action (with a result) via the UI (AC-01).
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);
  const form = await openCreateForm(page);
  await form.locator("#at-description").fill(d1);
  await form.locator("#at-result").fill("Investigated and documented the root cause.");
  await form.getByRole("button", { name: "Save Action" }).click();

  const row1 = actionRow(page, d1);
  await expect(row1).toBeVisible();
  await expect(row1.locator('[aria-label="Status: Open"]')).toBeVisible();
  await expect(performedBy(row1)).toHaveText(STAFF_NAME);

  // Staff two, in a separate browser context, opens the SAME ticket, sees staff
  // one's OPEN action, completes it (non-author edit, AC-22), then adds its own.
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  try {
    await loginAs(page2, STAFF2_EMAIL, SEED_PASSWORD, "IT_STAFF");
    await page2.goto(`/staff/tickets/${ticketId}`);
    const row1On2 = actionRow(page2, d1);
    await expect(row1On2).toBeVisible();
    await row1On2.getByRole("button", { name: "Complete" }).click();
    await expect(row1On2.locator('[aria-label="Status: Completed"]')).toBeVisible();

    const form2 = await openCreateForm(page2);
    await form2.locator("#at-description").fill(d2);
    await form2.getByRole("button", { name: "Save Action" }).click();
    await expect(actionRow(page2, d2)).toBeVisible();
  } finally {
    await ctx2.close();
  }

  // Back in staff one's view: both actions persist, performed by different staff,
  // and staff one's action now reads Completed (persisted by the non-author).
  await page.reload();
  await expect(actionRow(page, d1).locator('[aria-label="Status: Completed"]')).toBeVisible();
  const row2 = actionRow(page, d2);
  await expect(row2).toBeVisible();
  await expect(performedBy(row2)).toHaveText(STAFF2_NAME);
});

test("E2E-L4-01: create-form inline validation, complete-without-result blocked then completed, cancel via dialog", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const { id: ticketId } = await createClaimedTicket(request);

  // Seed the actions this test transitions, so each row is addressable by text.
  const completeMe = `Needs a result ${runId}`;
  const cancelMe = `To be cancelled ${runId}`;
  await createActionViaApi(request, STAFF_EMAIL, ticketId, { description: completeMe });
  await createActionViaApi(request, STAFF_EMAIL, ticketId, { description: cancelMe });

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);

  // ── Create-form inline validation (AC-01, AC-07) ──────────────────────────
  const form = await openCreateForm(page);
  await form.getByRole("button", { name: "Save Action" }).click();
  await expect(form.getByText("Description is required.")).toBeVisible();

  await form.locator("#at-description").fill(`Freshly created ${runId}`);
  await form.getByLabel("Follow-up required").check();
  await form.getByRole("button", { name: "Save Action" }).click();
  await expect(
    form.getByText("Follow-up note is required when follow-up is checked.")
  ).toBeVisible();
  await form.locator("#at-followup-note").fill("Check back in 24 hours.");
  await form.getByRole("button", { name: "Save Action" }).click();

  const created = actionRow(page, `Freshly created ${runId}`);
  await expect(created).toBeVisible();
  await expect(created.getByText("Follow-up", { exact: true })).toBeVisible();

  // ── Complete without result is blocked, then completed after one (AC-04) ──
  const completeRow = actionRow(page, completeMe);
  await completeRow.getByRole("button", { name: "Complete" }).click();
  await expect(
    completeRow.getByText("Result is required to complete this action.")
  ).toBeVisible();
  await expect(completeRow.locator('[aria-label="Status: Open"]')).toBeVisible();

  await completeRow.getByRole("button", { name: "Edit" }).click();
  await completeRow.locator(`textarea[id^="at-edit-result-"]`).fill("Replaced the module; verified fixed.");
  await completeRow.getByRole("button", { name: "Save", exact: true }).click();
  // After the save the row re-renders read-only with the result; now it completes.
  await expect(completeRow.getByText("Replaced the module; verified fixed.")).toBeVisible();
  await completeRow.getByRole("button", { name: "Complete" }).click();
  await expect(completeRow.locator('[aria-label="Status: Completed"]')).toBeVisible();

  // ── Cancel via the confirmation dialog (AC-05) ────────────────────────────
  const cancelRow = actionRow(page, cancelMe);
  await cancelRow.getByRole("button", { name: "Cancel action" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this action?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Yes, cancel action" }).click();
  await expect(cancelRow.locator('[aria-label="Status: Cancelled"]')).toBeVisible();
});

test("E2E-L4-01: an OPEN action can be assigned to an active staff member via the UI", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const desc = `Assignable action ${runId}`;
  const { id: ticketId } = await createClaimedTicket(request);
  await createActionViaApi(request, STAFF_EMAIL, ticketId, { description: desc });

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);

  const row = actionRow(page, desc);
  await expect(assigneeValue(row)).toHaveText("Unassigned");
  await row.getByLabel("Reassign to").selectOption({ label: STAFF2_NAME });
  await row.getByRole("button", { name: "Assign" }).click();

  // The list refreshes and the assignee now reads the chosen active staffer.
  await expect(assigneeValue(actionRow(page, desc))).toHaveText(STAFF2_NAME);
});

test("E2E-L4-01: requester sees every action read-only, with no write controls", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const openDesc = `Requester-visible open ${runId}`;
  const doneDesc = `Requester-visible done ${runId}`;
  const { id: ticketId } = await createClaimedTicket(request);
  await createActionViaApi(request, STAFF_EMAIL, ticketId, { description: openDesc });
  const done = await createActionViaApi(request, STAFF_EMAIL, ticketId, {
    description: doneDesc,
    result: "Done and verified.",
  });
  // Mark the second action COMPLETED so the read-only view shows both states.
  await apiLogin(request, STAFF_EMAIL);
  expect(
    (
      await request.patch(`${API}/api/staff/tickets/${ticketId}/actions/${done.id}`, {
        headers: CSRF,
        data: { status: "COMPLETED" },
      })
    ).ok()
  ).toBeTruthy();
  await apiLogout(request);

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

  const section = actionsSection(page);
  await expect(section.getByText(openDesc)).toBeVisible();
  await expect(section.getByText(doneDesc)).toBeVisible();
  await expect(section.getByText("Done and verified.")).toBeVisible();
  await expect(section.locator('[aria-label="Status: Open"]')).toBeVisible();
  await expect(section.locator('[aria-label="Status: Completed"]')).toBeVisible();

  // No create or per-row write controls are rendered for a Requester (AC-08).
  await expect(section.getByRole("button", { name: "Add Action" })).toHaveCount(0);
  for (const name of ["Edit", "Complete", "Cancel action", "Assign"]) {
    await expect(section.getByRole("button", { name })).toHaveCount(0);
  }
});

test("E2E-L4-01: assigning an inactive staff member is rejected (422 ASSIGNEE_INACTIVE)", async ({
  request,
}) => {
  // The UI never offers an inactive assignee, so this backend rule is asserted at
  // the API boundary: create-with-inactive and patch-to-inactive both 422.
  const { id: ticketId } = await createClaimedTicket(request);
  const inactiveId = await userIdByEmail(STAFF_INACTIVE_EMAIL);

  await apiLogin(request, STAFF_EMAIL);
  const createRes = await request.post(`${API}/api/staff/tickets/${ticketId}/actions`, {
    headers: CSRF,
    data: { description: "Attempt to assign an inactive staffer", assigneeId: inactiveId },
  });
  expect(createRes.status()).toBe(422);
  expect((await createRes.json()).code).toBe("ASSIGNEE_INACTIVE");

  // A valid OPEN action, then a PATCH assigning it to the inactive staffer → 422.
  const okRes = await request.post(`${API}/api/staff/tickets/${ticketId}/actions`, {
    headers: CSRF,
    data: { description: "Valid action for the inactive-assign patch" },
  });
  expect(okRes.status()).toBe(201);
  const actionId = (await okRes.json()).id as number;
  const patchRes = await request.patch(
    `${API}/api/staff/tickets/${ticketId}/actions/${actionId}`,
    { headers: CSRF, data: { assigneeId: inactiveId } }
  );
  expect(patchRes.status()).toBe(422);
  expect((await patchRes.json()).code).toBe("ASSIGNEE_INACTIVE");
  await apiLogout(request);
});

test("E2E-L4-01: a stale action edit surfaces STALE_UPDATE conflict feedback inline", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const desc = `Concurrent edit target ${runId}`;
  const { id: ticketId } = await createClaimedTicket(request);
  const action = await createActionViaApi(request, STAFF_EMAIL, ticketId, { description: desc });

  // Staff opens the ticket; the row is loaded holding the action's original
  // updatedAt token.
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);
  const row = actionRow(page, desc);
  await expect(row).toBeVisible();

  // Meanwhile another staffer edits the SAME action (OPEN-preserving), bumping
  // its updatedAt so the open page now holds a stale token.
  await apiLogin(request, STAFF2_EMAIL);
  const bump = await request.patch(
    `${API}/api/staff/tickets/${ticketId}/actions/${action.id}`,
    { headers: CSRF, data: { description: `${desc} (edited elsewhere)` } }
  );
  expect(bump.ok()).toBeTruthy();
  await apiLogout(request);

  // The stale page tries to edit → inline conflict message, nothing lost.
  await row.getByRole("button", { name: "Edit" }).click();
  await row.locator(`textarea[id^="at-edit-desc-"]`).fill(`${desc} (my stale edit)`);
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("Reload — this action changed since you opened it.")).toBeVisible();
});
