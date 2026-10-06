import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  ADMIN_EMAIL,
  STAFF_EMAIL,
  REQUESTER_EMAIL,
  loginAs,
  loginFirstTime,
  loginExpectingError,
  logout,
} from "./helpers";

/**
 * Stage 3 — Authentication E2E (E2E-01, E2E-02, E2E-07).
 *
 * Login helpers live in ./helpers and wait for the post-login screen before
 * returning, so no navigation races an unfinished login.
 *
 * Throttle safety (BR-08: lock after the 5th consecutive failure per email):
 * failure cases use dedicated emails at most once each, never the accounts used
 * for successful logins.
 */

const FAILURE_EMAIL = "requester2.e2e@example.com"; // dedicated to wrong-password cases

// Provision a fresh REQUESTER with mustChangePassword=true via the admin API.
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
  await loginFirstTime(page, email, initialPassword);

  // While gated, any other route redirects back to the change screen (AC-02).
  await page.goto("/my-tickets");
  await expect(page).toHaveURL(/\/change-password$/);

  // Rules are shown; a confirmation mismatch is flagged and blocks submission (AC-77).
  await expect(page.getByRole("list", { name: "Password requirements" })).toBeVisible();
  await page.getByRole("textbox", { name: "Current password", exact: true }).fill(initialPassword);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(newPassword);
  await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill("Mismatch#9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page).toHaveURL(/\/change-password$/); // not submitted

  // A valid change continues to the role's home (AC-17, AC-77).
  await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/my-tickets$/);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  // The new password works and the old one no longer does (AC-17).
  await logout(page);
  await loginExpectingError(page, email, initialPassword, "Invalid email or password.");
  await loginAs(page, email, newPassword, "REQUESTER");
});

test("E2E-02: login failures show a safe message, and after logout protected data is unreachable", async ({
  page,
}) => {
  // Unknown email and a wrong password on an existing account give the same safe
  // message, with no account detail leaked (AC-05).
  await loginExpectingError(page, "nobody.e2e@example.com", "WrongPass#1", "Invalid email or password.");
  await loginExpectingError(page, FAILURE_EMAIL, "WrongPass#1", "Invalid email or password.");

  // A valid login, then logout, clears the session (AC-10).
  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await logout(page);

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
  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await logout(page);

  // IT Staff home + wrong-role URL → Forbidden (AC-72).
  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto("/my-tickets");
  await expect(page).toHaveURL(/\/forbidden$/);
  await logout(page);

  // Administrator home + wrong-role URL → Forbidden (AC-72).
  await loginAs(page, ADMIN_EMAIL, SEED_PASSWORD, "ADMIN");
  await page.goto("/staff/queue");
  await expect(page).toHaveURL(/\/forbidden$/);

  // An unknown URL shows Not Found while signed in (AC-72).
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await logout(page);

  // An unauthenticated protected URL redirects to Login (AC-72).
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
});
