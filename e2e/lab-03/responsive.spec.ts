import { test, expect, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  REQUESTER_EMAIL,
  STAFF_EMAIL,
  STAFF_NAME,
  ADMIN_EMAIL,
  loginAs,
  logout,
  apiLogin,
  apiLogout,
  createTicketViaApi,
} from "./helpers";

/**
 * Stage 6 — Responsive + visual E2E (RESP-01..05, STYLE-01) and screenshots.
 *
 * These assert real layout (jsdom could not): no horizontal page overflow
 * (document scrollWidth <= viewport innerWidth), key controls visible, tables
 * become cards below 768px, dialogs fit the viewport. STYLE-01 compares COMPUTED
 * colours of status/priority/role badges across screens, not classes.
 *
 * Login helpers (./helpers) wait for the post-login screen, so captures never
 * race an unfinished login. Data is created per run via the API. No password text
 * is typed into a screenshotted screen (Login/Change Password are shot empty).
 *
 * Screenshots (15): artifacts/lab-03/screenshots/<folder>/<screen>-<viewport>.png
 *   authentication/     login-{mobile,tablet,desktop}.png, change-password-{...}.png
 *   staff-queue/        queue-{mobile,tablet,desktop}.png
 *   staff-ticket-detail/detail-{mobile,tablet,desktop}.png
 *   user-management/    users-{mobile,tablet,desktop}.png
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 850, height: 1100 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function shot(folder: string, screen: string, viewport: string): string {
  return `artifacts/lab-03/screenshots/${folder}/${screen}-${viewport}.png`;
}

async function forEachViewport(page: Page, fn: (vp: (typeof VIEWPORTS)[number]) => Promise<void>): Promise<void> {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await fn(vp);
  }
}

// Poll scrollWidth after the resize settles, then assert no horizontal overflow.
async function assertNoHorizontalOverflow(page: Page, width: number): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: `horizontal overflow at viewport width ${width}`,
    })
    .toBeLessThanOrEqual(0);
}

async function colorsOf(locator: Locator): Promise<{ bg: string; color: string }> {
  return locator.first().evaluate((el) => {
    const s = getComputedStyle(el as Element);
    return { bg: s.backgroundColor, color: s.color };
  });
}

function usersTable(page: Page) {
  return page.getByRole("table", { name: "Users" });
}
async function searchUsers(page: Page, term: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Search users" }).fill(term);
}

async function assertTableBecomesCards(page: Page, viewport: string): Promise<void> {
  if (viewport === "mobile") {
    await expect(page.locator(".mt-table-wrap").first()).toBeHidden();
    await expect(page.locator(".mt-cards").first()).toBeVisible();
  } else {
    await expect(page.locator(".mt-table-wrap").first()).toBeVisible();
    await expect(page.locator(".mt-cards").first()).toBeHidden();
  }
}

// A ticket claimed by staff with IT Priority HIGH → status OPEN, priority HIGH,
// so the queue and detail show Open/High badges for STYLE-01.
async function seedClaimedHighTicket(request: APIRequestContext): Promise<{ id: number; ticketNumber: string }> {
  const ticket = await createTicketViaApi(request);
  await apiLogin(request, STAFF_EMAIL);
  expect((await request.post(`${API}/api/staff/tickets/${ticket.id}/claim`, { headers: CSRF })).ok()).toBeTruthy();
  expect(
    (await request.patch(`${API}/api/staff/tickets/${ticket.id}/it-priority`, { headers: CSRF, data: { itPriority: "HIGH" } })).ok()
  ).toBeTruthy();
  await apiLogout(request);
  return ticket;
}

test("RESP-01: Login and Change Password have no overflow at 375/850/1440", async ({ page }) => {
  // Login — captured pristine (no password typed), so nothing sensitive is shown.
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await page.screenshot({ path: shot("authentication", "login", vp.name), fullPage: true });
  });

  // Change Password — logged in (non-mandatory), fields left empty.
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto("/change-password");
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("textbox", { name: "Current password", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New password", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Confirm new password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
    await page.screenshot({ path: shot("authentication", "change-password", vp.name), fullPage: true });
  });
});

test("RESP-02: Requester screens have no overflow and My Tickets becomes cards on mobile", async ({ page, request }) => {
  await createTicketViaApi(request); // ensure My Tickets is non-empty
  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await expect(page.getByRole("table", { name: "My Tickets" })).toBeVisible(); // data loaded

  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await assertTableBecomesCards(page, vp.name);
  });

  await page.goto("/tickets/new");
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("button", { name: "Submit Ticket" })).toBeVisible();
  });
});

test("RESP-03: Staff queue has no overflow and the table becomes cards on mobile", async ({ page, request }) => {
  await seedClaimedHighTicket(request); // non-empty queue with Open/High rows
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await expect(page.getByRole("table", { name: "Ticket Queue" })).toBeVisible(); // data loaded

  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search tickets" })).toBeVisible();
    await assertTableBecomesCards(page, vp.name);
    await page.screenshot({ path: shot("staff-queue", "queue", vp.name), fullPage: true });
  });
});

test("RESP-04: Staff ticket detail has no overflow and its panels/tabs stack", async ({ page, request }) => {
  const { id } = await seedClaimedHighTicket(request);
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto(`/staff/tickets/${id}`);
  await expect(page.getByTestId("detail-header")).toBeVisible();
  await expect(page.getByTestId("operations-panel")).toBeVisible(); // data loaded

  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByTestId("detail-header")).toBeVisible();
    await expect(page.getByTestId("facts-panel")).toBeVisible();
    await expect(page.getByTestId("operations-panel")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Public Comments/ })).toBeVisible();
    await page.screenshot({ path: shot("staff-ticket-detail", "detail", vp.name), fullPage: true });
  });
});

test("RESP-05: User Management has no overflow, becomes cards on mobile, and dialogs fit the viewport", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL, SEED_PASSWORD, "ADMIN");
  await expect(usersTable(page)).toBeVisible(); // data loaded

  await forEachViewport(page, async (vp) => {
    await assertNoHorizontalOverflow(page, vp.width);
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create User" })).toBeVisible();
    await assertTableBecomesCards(page, vp.name);
    await page.screenshot({ path: shot("user-management", "users", vp.name), fullPage: true });
  });

  // Dialogs fit within the viewport at every size, with no page overflow open.
  await forEachViewport(page, async (vp) => {
    await page.getByRole("button", { name: "Create User" }).click();
    const dialog = page.getByRole("dialog", { name: "Create User" });
    await expect(dialog).toBeVisible();
    await assertNoHorizontalOverflow(page, vp.width);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  // White-on-white guard (#28): the Set-password button on a non-self row must be
  // a visible, contrasting control (not white text that would vanish on the dialog).
  await page.setViewportSize({ width: 1440, height: 900 });
  await searchUsers(page, STAFF_EMAIL);
  await usersTable(page).getByRole("button", { name: `Edit ${STAFF_NAME}` }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${STAFF_NAME}` });
  const setPwButton = editDialog.getByRole("button", { name: "Set new initial password" });
  await expect(setPwButton).toBeVisible();
  const btn = await colorsOf(setPwButton);
  expect(btn.color, "button text colour must differ from its own background").not.toBe(btn.bg);
  expect(btn.color, "button text must not be white (invisible on the light dialog)").not.toBe("rgb(255, 255, 255)");
  await editDialog.getByRole("button", { name: "Cancel" }).click();
});

test("STYLE-01: status, priority and role badges render identical computed colours across screens", async ({ page, request }) => {
  const { id } = await seedClaimedHighTicket(request);

  // Queue (staff): read Open status and High priority badge colours.
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await expect(page.getByRole("table", { name: "Ticket Queue" })).toBeVisible();
  const statusQueue = await colorsOf(page.locator('[aria-label="Status: Open"]'));
  const priorityQueue = await colorsOf(page.locator('[aria-label="Priority: High"]'));

  // Detail (staff): same values in the header; plus the shell IT Staff role badge.
  await page.goto(`/staff/tickets/${id}`);
  const header = page.getByTestId("detail-header");
  await expect(header).toBeVisible();
  const statusDetail = await colorsOf(header.locator('[aria-label="Status: Open"]'));
  const priorityDetail = await colorsOf(header.locator('[aria-label="Priority: High"]'));
  const roleStaffShell = await colorsOf(page.locator(".zen-header .zen-role-badge--staff"));

  expect(statusDetail).toEqual(statusQueue);
  expect(priorityDetail).toEqual(priorityQueue);

  // User Management (admin): the IT Staff role badge in the table must match the
  // shell's IT Staff badge computed colours.
  await logout(page);
  await loginAs(page, ADMIN_EMAIL, SEED_PASSWORD, "ADMIN");
  await expect(page.getByRole("table", { name: "Users" })).toBeVisible();
  const roleStaffTable = await colorsOf(page.getByRole("table", { name: "Users" }).locator(".zen-role-badge--staff"));

  expect(roleStaffTable).toEqual(roleStaffShell);
});
