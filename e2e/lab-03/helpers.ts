import { expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Shared E2E helpers (Lab 3). Centralised so the login-wait fix cannot drift
 * between spec files. The e2e stack is started by playwright.config.ts: API on
 * port 4100 against the isolated toktickit_e2e database, client preview on 4173.
 */

export const API = "http://localhost:4100";
export const CSRF = { "X-Requested-With": "TokTickIT" } as const;
export const SEED_PASSWORD =
  process.env.E2E_SEED_PASSWORD || process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";

// Deterministic seeded accounts (prisma/seed-e2e.ts).
export const ADMIN_EMAIL = "admin.e2e@example.com";
export const ADMIN_NAME = "Admin E2E";
export const ADMIN2_EMAIL = "admin2.e2e@example.com";
export const STAFF_EMAIL = "staff.e2e@example.com";
export const STAFF_NAME = "Staff E2E";
export const REQUESTER_EMAIL = "requester.e2e@example.com";

export type Role = "REQUESTER" | "IT_STAFF" | "ADMIN";

const ROLE_HOME: Record<Role, { url: RegExp; heading: string }> = {
  REQUESTER: { url: /\/my-tickets$/, heading: "My Tickets" },
  IT_STAFF: { url: /\/staff\/queue$/, heading: "Ticket Queue" },
  ADMIN: { url: /\/admin\/users$/, heading: "User Management" },
};

// Fill and submit the login form (does NOT wait for the result).
async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Log in and WAIT for the role's home (URL + heading) before returning, so a
// following navigation can never race an unfinished login.
export async function loginAs(page: Page, email: string, password: string, role: Role): Promise<void> {
  await submitLogin(page, email, password);
  const home = ROLE_HOME[role];
  await expect(page).toHaveURL(home.url);
  await expect(page.getByRole("heading", { name: home.heading })).toBeVisible();
}

// Log in a user who must change the password; WAIT for the mandatory screen.
export async function loginFirstTime(page: Page, email: string, password: string): Promise<void> {
  await submitLogin(page, email, password);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(
    page.getByRole("heading", { name: "You must choose a new password before continuing." })
  ).toBeVisible();
}

// Attempt a login expected to FAIL; WAIT for the error message, then confirm we
// are still on Login. If the login unexpectedly succeeded, the message never
// appears and this fails — the wait cannot hide a success.
export async function loginExpectingError(
  page: Page,
  email: string,
  password: string,
  message: string
): Promise<void> {
  await submitLogin(page, email, password);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

// Fill and submit the Change Password form (callers assert the destination).
export async function completeForcedChange(page: Page, current: string, next: string): Promise<void> {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByRole("textbox", { name: "Current password", exact: true }).fill(current);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(next);
  await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string = SEED_PASSWORD
): Promise<void> {
  const res = await request.post(`${API}/api/auth/login`, { headers: CSRF, data: { email, password } });
  expect(res.ok(), `API login for ${email}`).toBeTruthy();
}

export async function apiLogout(request: APIRequestContext): Promise<void> {
  await request.post(`${API}/api/auth/logout`, { headers: CSRF });
}

// Create a ticket owned by the seeded requester, via the API. Returns its id.
export async function createTicketViaApi(
  request: APIRequestContext
): Promise<{ id: number; ticketNumber: string }> {
  await apiLogin(request, REQUESTER_EMAIL);
  const categories = (await (await request.get(`${API}/api/categories`)).json()) as Array<{ id: number; name: string }>;
  const systems = (await (await request.get(`${API}/api/related-systems`)).json()) as Array<{ id: number; name: string }>;
  const category = categories.find((c) => c.name === "Software") ?? categories[0];
  const system = systems.find((s) => s.name === "Email") ?? systems[0];
  const res = await request.post(`${API}/api/tickets`, {
    headers: CSRF,
    multipart: {
      categoryId: String(category.id),
      relatedSystemId: String(system.id),
      summary: "E2E ticket",
      description: "Seeded via API for an E2E test.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(res.status()).toBe(201);
  const ticket = (await res.json()) as { id: number; ticketNumber: string };
  await apiLogout(request);
  return ticket;
}
