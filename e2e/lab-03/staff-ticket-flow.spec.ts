import { test, expect, type APIRequestContext, type Locator } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  REQUESTER_EMAIL,
  STAFF_EMAIL,
  STAFF_NAME,
  loginAs,
  apiLogin,
  apiLogout,
  createTicketViaApi,
} from "./helpers";

/**
 * Stage 4 — Requester + Staff ticket flow E2E (E2E-03, E2E-04).
 *
 * Rerun safety: every run creates its own ticket, so no test depends on earlier
 * state and reruns never collide. Login helpers (./helpers) wait for the
 * post-login screen, so later navigations don't race the login.
 */

// Wait for the option to exist, select it once, then confirm the value held.
async function selectOptionByLabel(select: Locator, label: string): Promise<void> {
  await expect(select).toBeVisible();
  await expect(select.locator("option", { hasText: label })).toBeAttached();
  await select.selectOption({ label });
  await expect(select).not.toHaveValue("");
}

// Staff claims a ticket via the API (used only as setup to reach an OPEN status).
async function claimAsStaff(request: APIRequestContext, ticketId: number): Promise<void> {
  await apiLogin(request, STAFF_EMAIL);
  const res = await request.post(`${API}/api/staff/tickets/${ticketId}/claim`, { headers: CSRF });
  expect(res.ok(), "staff claim should succeed").toBeTruthy();
  await apiLogout(request);
}

test("E2E-03: a requester signs in, creates a ticket, comments, and marks it as appearing resolved", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const summary = `E2E requester ticket ${runId}`;
  const commentText = `E2E requester comment ${runId}`;

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");

  await page.getByRole("link", { name: "Create Ticket" }).click();
  await expect(page).toHaveURL(/\/tickets\/new$/);
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
  await selectOptionByLabel(page.getByRole("combobox", { name: "Category" }), "Software");
  await selectOptionByLabel(page.getByRole("combobox", { name: "Related System" }), "Email");
  await selectOptionByLabel(page.getByRole("combobox", { name: "Requested Priority" }), "Medium");
  await page.getByRole("textbox", { name: "Summary" }).fill(summary);
  await page.getByRole("textbox", { name: "Description" }).fill("Created by the E2E requester-flow test. Please ignore.");
  await page.getByRole("button", { name: "Submit Ticket" }).click();

  // Success panel confirms creation and shows the generated number (AC-25).
  await expect(page.getByRole("heading", { name: "Ticket Created Successfully" })).toBeVisible();
  const ticketNumber = ((await page.getByTestId("ticket-number").textContent()) ?? "").trim();
  expect(ticketNumber).toMatch(/^TKT-/);

  // The ticket appears in the requester's own My Tickets list (session identity).
  await page.getByRole("link", { name: "My Tickets" }).click();
  await expect(page).toHaveURL(/\/my-tickets$/);
  const openRow = page.getByRole("button", { name: `Open ticket ${ticketNumber}` });
  await expect(openRow).toBeVisible();

  // Open the detail; capture the numeric id from the URL.
  await openRow.click();
  await expect(page).toHaveURL(/\/tickets\/\d+$/);
  const ticketId = Number(page.url().match(/\/tickets\/(\d+)/)![1]);
  await expect(page.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

  // Post a public comment (AC-29).
  await page.getByRole("textbox", { name: "Post a comment" }).fill(commentText);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(commentText)).toBeVisible();

  // A NEW ticket cannot be marked resolved yet (BR-40): the button is disabled.
  await expect(page.getByRole("button", { name: "Problem Appears Resolved" })).toBeDisabled();

  // Move the ticket to OPEN via a staff claim (setup to reach an allowed status).
  await claimAsStaff(request, ticketId);

  // Reload: the requester can now indicate the problem appears resolved (AC-32),
  // which becomes a disabled confirmation.
  await page.reload();
  const resolvedBtn = page.getByRole("button", { name: "Problem Appears Resolved" });
  await expect(resolvedBtn).toBeEnabled();
  await resolvedBtn.click();
  const markedBtn = page.getByRole("button", { name: "Marked as resolved" });
  await expect(markedBtn).toBeVisible();
  await expect(markedBtn).toBeDisabled();
});

test("E2E-04: IT staff claim, prioritise, progress a ticket and add a comment and note; requester sees the comment but not the note", async ({
  page,
  request,
  browser,
}) => {
  const runId = `${Date.now()}`;
  const commentText = `E2E public comment ${runId}`;
  const noteText = `E2E internal note ${runId}`;

  // Fresh ticket owned by the requester (unique per run).
  const { id: ticketId } = await createTicketViaApi(request);

  // Staff signs in and opens the ticket; it starts NEW and unassigned.
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${ticketId}`);
  const header = page.getByTestId("detail-header");
  await expect(header.getByText("New", { exact: true })).toBeVisible();

  // Claim (AC-42): status NEW→OPEN, owner becomes the staff user.
  await page.getByRole("button", { name: "Claim" }).click();
  await expect(header.getByText("Open", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim" })).toHaveCount(0);
  await expect(page.getByTestId("operations-panel").locator("p", { hasText: STAFF_NAME })).toBeVisible();

  // Change IT Priority to High (AC-45).
  await page.getByRole("combobox", { name: "IT Priority" }).selectOption("HIGH");
  await page.getByRole("button", { name: "Apply IT Priority" }).click();
  await expect(header.getByText("High", { exact: true })).toBeVisible();

  // Progress the status OPEN→IN_PROGRESS (AC-46).
  await page.getByRole("combobox", { name: "Status" }).selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Apply status change" }).click();
  await expect(header.getByText("In Progress", { exact: true })).toBeVisible();

  // Add a public comment (Public Comments tab is active by default) (AC-52).
  await page.getByRole("textbox", { name: "Post a public comment" }).fill(commentText);
  await page.getByRole("button", { name: "Post Public Comment" }).click();
  await expect(page.getByTestId("public-panel").getByText(commentText)).toBeVisible();

  // Add an internal note (AC-52).
  await page.getByRole("tab", { name: /Internal Notes/ }).click();
  await page.getByRole("textbox", { name: "Add an internal note" }).fill(noteText);
  await page.getByRole("button", { name: "Add Internal Note" }).click();
  await expect(page.getByTestId("internal-panel").getByText(noteText)).toBeVisible();

  // In the requester's own browser context: the public comment is visible, but the
  // internal note text and any Internal Notes UI/count are absent (AC-53).
  const reqContext = await browser.newContext();
  const reqPage = await reqContext.newPage();
  try {
    await loginAs(reqPage, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
    await reqPage.goto(`/tickets/${ticketId}`);
    await expect(reqPage.getByRole("heading", { name: "Ticket Detail" })).toBeVisible();

    await expect(reqPage.getByText(commentText)).toBeVisible();

    await expect(reqPage.getByText(noteText)).toHaveCount(0);
    await expect(reqPage.getByRole("tab", { name: /Internal Notes/ })).toHaveCount(0);
    // Only Public Comments and Attachments tabs exist for a requester.
    await expect(reqPage.getByRole("tab")).toHaveCount(2);
  } finally {
    await reqContext.close();
  }
});
