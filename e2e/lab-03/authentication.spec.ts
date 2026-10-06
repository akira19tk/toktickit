import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Stage 3 — Authentication E2E (E2E-01, E2E-02, E2E-07).
 *
 * Rerun safety (no re-seed required between runs):
 *  - E2E-02 and E2E-07 only sign in / out; they never mutate persistent data.
 *  - E2E-01 provisions its OWN unique first-login requester per run via the admin
 *    API, so it never consumes or depends on the seeded first-login account.
 *
 * Throttle safety (BR-08: lock after the 5th consecutive failure per email):
 *  - failure cases use dedicated emails (an unknown address and FAILURE_EMAIL),
 *    at most one failed attempt each — well under the limit — and never the
 *    accounts used for successful logins.
 */

// API server started by playwright.config.ts on port 4100 (isolated e2e database).
const API = "http://localhost:4100";
const CSRF = { "X-Requested-With": "TokTickIT" } as const;

// Seeded by prisma/seed-e2e.ts; password comes from the same env the seed uses.
const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD || process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
const ADMIN_EMAIL = "admin.e2e@example.com";
const STAFF_EMAIL = "staff.e2e@example.com";
const REQUESTER_EMAIL = "requester.e2e@example.com";
const FAILURE_EMAIL = "requester2.e2e@example.com"; // dedicated to wrong-password cases

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Provision a fresh REQUESTER with mustChangePassword=true via the admin API.
// Uses a separate (API) request context, so the browser session stays clean.
async function provisionFirstLoginRequester(
  request: APIRequestContext,
  email: string,
  initialPassword: string
): Promise<void> {
  const login = await request.post(`${API}/api/auth/login`, {
    headers: CSRF,
    data: { email: ADMIN_EMAIL, password: SEED_PASSWORD },
  });
  expect(login.ok(), "admin login for provisioning should succeed").toBeTruthy();

  const created = await request.post(`${API}/api/admin/users`, {
    headers: CSRF,
    data: { name: "E2E First Login", email, role: "REQUESTER", isActive: true, initialPassword },
  });
  expect(created.status(), "admin create user should return 201").toBe(201);

  // Clear the admin session from this API context.
  await request.post(`${API}/api/auth/logout`, { headers: CSRF });
}

test("E2E-01: first login with an initial password forces a password change before the app opens", async ({
  page,
  request,
}) => {
  const email = `e2e-firstlogin-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const initialPassword = SEED_PASSWORD;
  const newPassword = "NewPass#2026";

  await provisionFirstLoginRequester(request, email, initialPassword);

  // Sign in with the initial password → gated to the mandatory change screen (AC-02).
  await uiLogin(page, email, initialPassword);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(
    page.getByRole("heading", { name: "You must choose a new password before continuing." })
  ).toBeVisible();

  // While gated, any other route redirects back to the change screen (AC-02).
  await page.goto("/my-tickets");
  await expect(page).toHaveURL(/\/change-password$/);

  // Rules are shown; a confirmation mismatch is flagged and blocks submission (AC-77).
  await expect(page.getByRole("list", { name: "Password requirements" })).toBeVisible();
  await page.getByLabel("Current password").fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill("Mismatch#9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("#cp-confirm-error")).toBeVisible();
  await expect(page).toHaveURL(/\/change-password$/); // not submitted

  // A valid change continues to the role's home (AC-17, AC-77).
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/my-tickets$/);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  // The new password works and the old one no longer does (AC-17).
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await uiLogin(page, email, initialPassword); // old password rejected
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  await uiLogin(page, email, newPassword); // new password accepted, no longer gated
  await expect(page).toHaveURL(/\/my-tickets$/);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
});

test("E2E-02: login failures show a safe message, and after logout protected data is unreachable", async ({
  page,
}) => {
  // Unknown email and a wrong password on an existing account give the same safe
  // message, with no account detail leaked (AC-05).
  await uiLogin(page, "nobody.e2e@example.com", "WrongPass#1");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  await uiLogin(page, FAILURE_EMAIL, "WrongPass#1");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  // A valid login, then logout, clears the session (AC-10).
  await uiLogin(page, REQUESTER_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/my-tickets$/);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // A direct URL to a protected route after logout redirects to Login and shows
  // no protected content (AC-10, AC-73).
  await page.goto("/my-tickets");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toHaveCount(0);

  // The Back button also exposes no protected data (AC-73).
  await page.goBack();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toHaveCount(0);
});

test("E2E-07: each role lands on its home and wrong-role or unknown URLs are blocked", async ({
  page,
}) => {
  // Requester home + wrong-role URL → Forbidden (AC-72).
  await uiLogin(page, REQUESTER_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/my-tickets$/);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // IT Staff home + wrong-role URL → Forbidden (AC-72).
  await uiLogin(page, STAFF_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/staff\/queue$/);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.goto("/my-tickets");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Administrator home + wrong-role URL → Forbidden (AC-72).
  await uiLogin(page, ADMIN_EMAIL, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await page.goto("/staff/queue");
  await expect(page).toHaveURL(/\/forbidden$/);

  // An unknown URL shows Not Found while signed in (AC-72).
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // An unauthenticated protected URL redirects to Login (AC-72).
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
});
