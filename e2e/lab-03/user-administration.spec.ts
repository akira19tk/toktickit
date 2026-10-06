import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Stage 5 — Administrator user management E2E (E2E-05, E2E-06).
 *
 * Rerun safety: every user the tests create uses a unique email per run, so
 * reruns never collide and nothing depends on earlier state. The seeded
 * admin.e2e / staff.e2e / requester.e2e accounts are never deactivated, demoted
 * or password-reset, so later specs keep working.
 *
 * Last-admin (AC-64): E2E-06 exercises the SAFE clause — deactivating an admin
 * succeeds while other active admins remain — using a throwaway admin, so the
 * active-admin count never drops below what the seed started with (2). The
 * LAST_ADMIN 409 itself is covered safely by API-61 (empty DB) and UI-23 (mocked),
 * which can reach a true sole-admin state without risking the shared E2E DB.
 *
 * Selectors use accessible names/roles; dialogs are found by role="dialog" + name.
 * Row-level queries are scoped to the Users <table> to avoid the mobile-card copy.
 */

const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD || process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
const ADMIN_EMAIL = "admin.e2e@example.com";
const ADMIN_NAME = "Admin E2E";
const ADMIN2_EMAIL = "admin2.e2e@example.com"; // the second seeded admin (the toggle for the sole-admin case)
const REQUESTER_EMAIL = "requester.e2e@example.com";
const STAFF_EMAIL = "staff.e2e@example.com";

// API server started by playwright.config.ts on port 4100 (isolated e2e database).
const API = "http://localhost:4100";
const CSRF = { "X-Requested-With": "TokTickIT" } as const;

async function apiAdminLogin(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API}/api/auth/login`, {
    headers: CSRF,
    data: { email: ADMIN_EMAIL, password: SEED_PASSWORD },
  });
  expect(res.ok(), "API admin login should succeed").toBeTruthy();
}

// Sorted emails of the currently active Administrators.
async function activeAdminEmails(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${API}/api/admin/users?role=ADMIN`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: Array<{ email: string; isActive: boolean }> };
  return body.data.filter((u) => u.isActive).map((u) => u.email).sort();
}

async function adminIdByEmail(request: APIRequestContext, email: string): Promise<number> {
  const res = await request.get(`${API}/api/admin/users?role=ADMIN`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: Array<{ id: number; email: string }> };
  const match = body.data.find((u) => u.email === email);
  expect(match, `admin ${email} should exist`).toBeTruthy();
  return match!.id;
}

async function setUserActiveViaApi(request: APIRequestContext, id: number, isActive: boolean): Promise<void> {
  const res = await request.patch(`${API}/api/admin/users/${id}`, { headers: CSRF, data: { isActive } });
  expect(res.ok(), `set user ${id} active=${isActive} should succeed`).toBeTruthy();
}

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

function usersTable(page: Page) {
  return page.getByRole("table", { name: "Users" });
}

async function searchUsers(page: Page, term: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Search users" }).fill(term);
}

async function openEdit(page: Page, name: string) {
  await usersTable(page).getByRole("button", { name: `Edit ${name}` }).click();
  return page.getByRole("dialog", { name: `Edit ${name}` });
}

// Complete the mandatory first-login change and submit.
async function completeForcedChange(page: Page, current: string, next: string): Promise<void> {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByRole("textbox", { name: "Current password", exact: true }).fill(current);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(next);
  await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
}

test("E2E-05: admin creates a user, rejects a duplicate email, edits the user, and resets the initial password", async ({
  page,
  browser,
}) => {
  const runId = `${Date.now()}`;
  const email = `e2e-user-${runId}@example.com`;
  const name = `E2E User ${runId}`;
  const renamed = `E2E User ${runId} Renamed`;
  const initialPassword = SEED_PASSWORD;
  const userChosenPassword = "UserChosen#2026";
  const adminResetPassword = "AdminReset#2026";

  await uiLogin(page, ADMIN_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/users$/);

  // Create a user (AC-59). Default role Requester, active.
  await page.getByRole("button", { name: "Create User" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create User" });
  await createDialog.getByRole("textbox", { name: "Name" }).fill(name);
  await createDialog.getByRole("textbox", { name: "Email" }).fill(email);
  await createDialog.getByRole("textbox", { name: "Initial password" }).fill(initialPassword);
  await createDialog.getByRole("button", { name: "Create User" }).click();
  await expect(createDialog).toBeHidden();

  await searchUsers(page, email);
  await expect(usersTable(page).getByRole("button", { name: `Edit ${name}` })).toBeVisible();

  // Duplicate email is rejected with a field error (AC-60).
  await page.getByRole("button", { name: "Create User" }).click();
  const dupDialog = page.getByRole("dialog", { name: "Create User" });
  await dupDialog.getByRole("textbox", { name: "Name" }).fill(`Dup ${runId}`);
  await dupDialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dupDialog.getByRole("textbox", { name: "Initial password" }).fill(initialPassword);
  await dupDialog.getByRole("button", { name: "Create User" }).click();
  await expect(dupDialog.getByText("That email address is already in use.")).toBeVisible();
  await dupDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dupDialog).toBeHidden();

  // The new user is forced to change the password at first login (AC-59).
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  try {
    await uiLogin(userPage, email, initialPassword);
    await completeForcedChange(userPage, initialPassword, userChosenPassword);
    await expect(userPage).toHaveURL(/\/my-tickets$/);

    // Edit name and role; the list reflects the changes (AC-62).
    await searchUsers(page, email);
    const editDialog = await openEdit(page, name);
    await editDialog.getByRole("textbox", { name: "Name" }).fill(renamed);
    const roleSelect = editDialog.getByRole("combobox", { name: "Role" });
    await roleSelect.selectOption("IT_STAFF");
    await expect(roleSelect).toHaveValue("IT_STAFF");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).toBeHidden();

    await searchUsers(page, email);
    await expect(usersTable(page).getByText(renamed)).toBeVisible();
    await expect(usersTable(page).getByText("IT Staff")).toBeVisible();

    // Admin sets a new initial password (AC-65): revokes the user's sessions,
    // the old password stops working, the new one works but forces a change.
    const editForPw = await openEdit(page, renamed);
    await editForPw.getByRole("button", { name: "Set new initial password" }).click();
    const pwDialog = page.getByRole("dialog", { name: `Set initial password for ${renamed}` });
    await pwDialog.getByRole("textbox", { name: "New initial password" }).fill(adminResetPassword);
    await pwDialog.getByRole("button", { name: "Set Password" }).click();
    await expect(pwDialog).toBeHidden();

    // The user's live session is revoked -> any protected route returns to Login.
    await userPage.goto("/my-tickets");
    await expect(userPage).toHaveURL(/\/login$/);

    // The password the user had chosen no longer works.
    await uiLogin(userPage, email, userChosenPassword);
    await expect(userPage.getByText("Invalid email or password.")).toBeVisible();

    // The admin-set password works and forces another change.
    await uiLogin(userPage, email, adminResetPassword);
    await expect(userPage).toHaveURL(/\/change-password$/);
  } finally {
    await userContext.close();
  }

  // Self password reset is prevented in the UI (AC-65, SELF_PASSWORD_RESET):
  // the admin's own row offers no "Set new initial password" action.
  await searchUsers(page, ADMIN_EMAIL);
  const editSelf = await openEdit(page, ADMIN_NAME);
  await expect(editSelf.getByRole("button", { name: "Set new initial password" })).toHaveCount(0);
  await editSelf.getByRole("button", { name: "Cancel" }).click();
});

test("E2E-06: non-admins are blocked; admin cannot self-deactivate; last-admin rule enforced", async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;
  const ephEmail = `e2e-admin-${runId}@example.com`;
  const ephName = `E2E Admin ${runId}`;

  // A Requester cannot reach User Management (AC-19, AC-21, AC-67).
  await uiLogin(page, REQUESTER_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/my-tickets$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await logout(page);

  // Nor can IT Staff (AC-21).
  await uiLogin(page, STAFF_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/staff\/queue$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await logout(page);

  // Admin can open User Management.
  await uiLogin(page, ADMIN_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/users$/);

  // The admin cannot deactivate their own account (AC-63): the Active toggle on
  // the own row is disabled with an explanation.
  await searchUsers(page, ADMIN_EMAIL);
  const editSelf = await openEdit(page, ADMIN_NAME);
  await expect(editSelf.getByRole("checkbox", { name: "Active" })).toBeDisabled();
  await expect(editSelf.getByText("You cannot deactivate your own account.")).toBeVisible();
  await editSelf.getByRole("button", { name: "Cancel" }).click();
  await expect(editSelf).toBeHidden();

  // Last-admin safe clause (AC-64): deactivating an admin succeeds while other
  // active admins remain. Uses a throwaway admin so the active-admin count never
  // drops below the seed's starting count. (The LAST_ADMIN 409 itself is covered
  // by API-61 and UI-23, which can safely reach a sole-admin state.)
  await page.getByRole("button", { name: "Create User" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create User" });
  await createDialog.getByRole("textbox", { name: "Name" }).fill(ephName);
  await createDialog.getByRole("textbox", { name: "Email" }).fill(ephEmail);
  const roleSelect = createDialog.getByRole("combobox", { name: "Role" });
  await roleSelect.selectOption("ADMIN");
  await expect(roleSelect).toHaveValue("ADMIN");
  await createDialog.getByRole("textbox", { name: "Initial password" }).fill(SEED_PASSWORD);
  await createDialog.getByRole("button", { name: "Create User" }).click();
  await expect(createDialog).toBeHidden();

  await searchUsers(page, ephEmail);
  const editEph = await openEdit(page, ephName);
  await editEph.getByRole("checkbox", { name: "Active" }).uncheck();
  await editEph.getByRole("button", { name: "Save Changes" }).click();
  await expect(editEph).toBeHidden(); // success: not blocked by the last-admin rule

  await searchUsers(page, ephEmail);
  await expect(usersTable(page).getByText("Inactive")).toBeVisible();

  // ── Real LAST_ADMIN case (AC-64 failure clause) ─────────────────────────────
  // This briefly makes admin.e2e the ONLY active Administrator. It is safe only
  // because playwright.config.ts runs with workers=1 / fullyParallel=false, so no
  // other test runs concurrently and could observe or act on the sole-admin state.
  // The second seeded admin is restored in `finally`, so a failed assertion still
  // leaves the database with its starting admins. If that restore itself ever
  // fails (e.g. the server is down), the finally throws and `npm run e2e:setup`
  // reseeds as the fallback.
  await apiAdminLogin(request);
  const admin2Id = await adminIdByEmail(request, ADMIN2_EMAIL);

  try {
    // Make admin.e2e the sole active Administrator via the API.
    await setUserActiveViaApi(request, admin2Id, false);

    // SAFETY GUARD: never attempt the self role-change unless admin.e2e is provably
    // the only active admin — otherwise the change would succeed and demote it.
    expect(
      await activeAdminEmails(request),
      "admin.e2e must be the sole active admin before the demote attempt"
    ).toEqual([ADMIN_EMAIL]);

    // As admin.e2e, change own Role away from Administrator → blocked by LAST_ADMIN.
    await searchUsers(page, ADMIN_EMAIL);
    const editSelf2 = await openEdit(page, ADMIN_NAME);
    const roleSelect = editSelf2.getByRole("combobox", { name: "Role" });
    await roleSelect.selectOption("IT_STAFF");
    await expect(roleSelect).toHaveValue("IT_STAFF");
    await editSelf2.getByRole("button", { name: "Save Changes" }).click();
    await expect(
      editSelf2.getByText("There must always be at least one active Administrator.")
    ).toBeVisible();
    await editSelf2.getByRole("button", { name: "Cancel" }).click();
    await expect(editSelf2).toBeHidden();

    // The role was not changed: the badge still says Administrator.
    await searchUsers(page, ADMIN_EMAIL);
    await expect(usersTable(page).getByText("Administrator")).toBeVisible();
  } finally {
    // Always restore the second admin, even if an assertion above failed.
    await setUserActiveViaApi(request, admin2Id, true);
  }

  // After the restore, the active admins equal the seed's starting set (count = 2).
  expect(await activeAdminEmails(request)).toEqual([ADMIN_EMAIL, ADMIN2_EMAIL].sort());
});
