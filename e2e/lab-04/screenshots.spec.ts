import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
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
  userIdByEmail,
  disconnectDb,
} from "./helpers";

/**
 * Lab 4 screenshots (Issue #55) — dashboards, Actions Taken and key Lab 4 states
 * at desktop / tablet / mobile. Generated from the clean E2E seed (run standalone
 * right after `npm run e2e:setup`), plus a little per-spec data this file creates
 * itself, so images are deterministic and free of other specs' junk.
 *
 * Captures are viewport-only (no full-scroll stitch) and no password is typed on
 * a screenshotted screen. State-mutating UI (create form, edit, cancel dialog) is
 * opened and then dismissed without submitting, so the fixture never changes
 * between viewports.
 *
 *   artifacts/lab-04/screenshots/
 *     staff-dashboard/     dashboard-{desktop,tablet,mobile}.png
 *     requester-dashboard/ dashboard-{...}.png
 *     actions-taken/       list / create-form / validation-errors / edit-mode /
 *                          cancel-dialog / requester-readonly / resolve-blocked /
 *                          empty-state / forbidden  (× 3 viewports)
 */

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
] as const;

function shot(folder: string, screen: string, vp: string): string {
  return `artifacts/lab-04/screenshots/${folder}/${screen}-${vp}.png`;
}

async function forEachViewport(
  page: Page,
  fn: (vp: (typeof VIEWPORTS)[number]) => Promise<void>
): Promise<void> {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await fn(vp);
  }
}

async function setHighPriority(request: APIRequestContext, ticketId: number): Promise<void> {
  await apiLogin(request, STAFF_EMAIL);
  const res = await request.patch(`${API}/api/staff/tickets/${ticketId}/it-priority`, {
    headers: CSRF,
    data: { itPriority: "HIGH" },
  });
  expect(res.ok()).toBeTruthy();
  await apiLogout(request);
}

async function resolveTicket(request: APIRequestContext, ticketId: number): Promise<void> {
  await apiLogin(request, STAFF_EMAIL);
  const res = await request.patch(`${API}/api/staff/tickets/${ticketId}/status`, {
    headers: CSRF,
    data: { status: "RESOLVED", resolutionSummary: "Resolved for the Lab 4 screenshot fixtures." },
  });
  expect(res.ok()).toBeTruthy();
  await apiLogout(request);
}

test.afterAll(async () => {
  await disconnectDb();
});

test("screenshots: IT staff dashboard (desktop/tablet/mobile)", async ({ page, request }) => {
  // A HIGH-priority owned ticket (urgent + recent lists) and a self-assigned open
  // action (My Open Actions) so the dashboard shows populated cards and lists.
  const { id } = await createClaimedTicket(request);
  await setHighPriority(request, id);
  const staffId = await userIdByEmail(STAFF_EMAIL);
  await createActionViaApi(request, STAFF_EMAIL, id, {
    description: "Follow up with the requester to confirm the fix.",
    assigneeId: staffId,
  });

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto("/dashboard");
  await expect(page.getByTestId("metric-open")).toBeVisible();
  await forEachViewport(page, async (vp) => {
    await page.getByTestId("metric-new").scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("staff-dashboard", "dashboard", vp.name) });
  });
});

test("screenshots: requester dashboard (desktop/tablet/mobile)", async ({ page, request }) => {
  // Add a resolved ticket so Resolved / Recently Resolved are populated too.
  const { id } = await createClaimedTicket(request);
  await resolveTicket(request, id);

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto("/dashboard");
  await expect(page.getByTestId("metric-open")).toBeVisible();
  await forEachViewport(page, async (vp) => {
    await page.screenshot({ path: shot("requester-dashboard", "dashboard", vp.name) });
  });
});

test("screenshots: Actions Taken — list, create form, validation, edit, cancel dialog", async ({
  page,
  request,
}) => {
  const { id } = await createClaimedTicket(request);
  const staffId = await userIdByEmail(STAFF_EMAIL);
  // One OPEN (with follow-up) and one COMPLETED action for a rich list.
  await createActionViaApi(request, STAFF_EMAIL, id, {
    description: "Investigate the reported connectivity drop on the VPN gateway.",
    assigneeId: staffId,
    followUpRequired: true,
    followUpNote: "Confirm stability after 24 hours of uptime.",
    attachmentNotes: "See the packet-capture notes in the ticket thread.",
  });
  const done = await createActionViaApi(request, STAFF_EMAIL, id, {
    description: "Replaced the faulty network cable and re-ran diagnostics.",
    result: "Link is stable; verified end-to-end with the requester.",
  });
  await apiLogin(request, STAFF_EMAIL);
  expect(
    (
      await request.patch(`${API}/api/staff/tickets/${id}/actions/${done.id}`, {
        headers: CSRF,
        data: { status: "COMPLETED" },
      })
    ).ok()
  ).toBeTruthy();
  await apiLogout(request);

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");

  const section = page.locator("section.at-section");
  const openRow = page
    .getByTestId("actions-list")
    .locator("li.at-row")
    .filter({ hasText: "Investigate the reported connectivity drop" });

  await forEachViewport(page, async (vp) => {
    await page.goto(`/staff/tickets/${id}`); // reset UI state for each viewport
    await expect(section.getByText("Actions Taken")).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "list", vp.name) });

    // Create form — populated, then the same form showing inline validation.
    await section.getByRole("button", { name: "Add Action" }).click();
    const form = page.locator("form.at-create-form");
    await form.locator("#at-description").fill("Escalate to the network vendor for a firmware patch.");
    await form.locator("#at-result").fill("Awaiting the vendor's RMA confirmation.");
    await form.getByLabel("Follow-up required").check();
    await form.locator("#at-followup-note").fill("Chase the vendor if no reply within two business days.");
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "create-form", vp.name) });

    await form.locator("#at-description").fill("");
    await form.locator("#at-followup-note").fill("");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(form.getByText("Description is required.")).toBeVisible();
    await page.screenshot({ path: shot("actions-taken", "validation-errors", vp.name) });
    await form.getByRole("button", { name: "Cancel" }).click();

    // Inline edit mode on the OPEN action.
    await openRow.getByRole("button", { name: "Edit" }).click();
    await openRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "edit-mode", vp.name) });
    await openRow.getByRole("button", { name: "Cancel edit" }).click();

    // Cancel-action confirmation dialog (dismissed without cancelling).
    await openRow.getByRole("button", { name: "Cancel action" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this action?" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: shot("actions-taken", "cancel-dialog", vp.name) });
    await dialog.getByRole("button", { name: "Keep action" }).click();
  });
});

test("screenshots: Actions Taken — requester read-only view", async ({ page, request }) => {
  const { id } = await createClaimedTicket(request);
  await createActionViaApi(request, STAFF_EMAIL, id, {
    description: "Diagnosed the issue and scheduled a maintenance window.",
    result: "Maintenance booked for the weekend.",
  });

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  const section = page.locator("section.at-section");
  await forEachViewport(page, async (vp) => {
    await page.goto(`/tickets/${id}`);
    await expect(section.getByText("Actions Taken")).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "requester-readonly", vp.name) });
  });
});

test("screenshots: resolve-blocked message and empty state", async ({ page, request }) => {
  // resolve-blocked: a ticket with an OPEN action, Resolve attempted.
  const blocked = await createClaimedTicket(request);
  await createActionViaApi(request, STAFF_EMAIL, blocked.id, {
    description: "Pending diagnostic step still in progress.",
  });
  // empty-state: a freshly claimed ticket with no actions yet.
  const empty = await createClaimedTicket(request);

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");

  await forEachViewport(page, async (vp) => {
    await page.goto(`/staff/tickets/${blocked.id}`);
    await page.getByRole("combobox", { name: "Status" }).selectOption("RESOLVED");
    const summary = page.getByLabel("Resolution summary");
    await summary.fill("Attempting to resolve while an action is still open.");
    await page.getByRole("button", { name: "Apply status change" }).click();
    const ops = page.getByTestId("operations-panel");
    await expect(ops.getByText(/open action/i)).toBeVisible();
    await ops.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "resolve-blocked", vp.name) });

    await page.goto(`/staff/tickets/${empty.id}`);
    const section = page.locator("section.at-section");
    await expect(section.getByText("No actions yet.")).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("actions-taken", "empty-state", vp.name) });
  });
});

test("screenshots: forbidden page", async ({ page }) => {
  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await forEachViewport(page, async (vp) => {
    await page.goto("/staff/queue");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" })
    ).toBeVisible();
    await page.screenshot({ path: shot("actions-taken", "forbidden", vp.name) });
  });
});
