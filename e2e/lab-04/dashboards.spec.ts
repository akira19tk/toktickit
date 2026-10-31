import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  STAFF_EMAIL,
  REQUESTER_EMAIL,
  REQUESTER2_EMAIL,
  loginAs,
  apiLogin,
  apiLogout,
  createTicketViaApi,
  createClaimedTicket,
  createActionViaApi,
  userIdByEmail,
  staffMetricsFromDb,
  requesterMetricsFromDb,
  disconnectDb,
} from "./helpers";

/**
 * E2E-L4-03 — Dashboards (AC-15, AC-16, AC-17) and a representative Lab 1–3
 * regression touchpoint (AC-20, E2E-L4-04).
 *
 * Every dashboard count is asserted against a DIRECT Prisma query on the
 * isolated toktickit_e2e database (ground truth) at the same instant the page
 * loads — the serial Playwright runner (workers=1) guarantees no concurrent
 * writer, so API and DB agree. Each card is also proven to drill into the
 * correctly-filtered queue / tickets route.
 */

test.afterAll(async () => {
  await disconnectDb();
});

async function cardCount(page: Page, key: string): Promise<number> {
  const card = page.getByTestId(`metric-${key}`);
  await expect(card).toBeVisible();
  const text = (await card.locator(".zen-dash-card-count").textContent()) ?? "";
  return Number(text.trim());
}

// Assert a card points at `href`, clicking it lands on `urlRe` with `heading`
// visible, then return to the dashboard ready for the next card.
async function checkDrilldown(
  page: Page,
  key: string,
  href: string,
  urlRe: RegExp,
  heading: string,
  anchorKey: string
): Promise<void> {
  const card = page.getByTestId(`metric-${key}`);
  await expect(card).toHaveAttribute("href", href);
  await card.click();
  await expect(page).toHaveURL(urlRe);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByTestId(`metric-${anchorKey}`)).toBeVisible();
}

async function resolveTicketViaApi(request: APIRequestContext, ticketId: number): Promise<void> {
  await apiLogin(request, STAFF_EMAIL);
  const res = await request.patch(`${API}/api/staff/tickets/${ticketId}/status`, {
    headers: CSRF,
    data: { status: "RESOLVED", resolutionSummary: "Resolved for dashboard metric evidence." },
  });
  expect(res.ok(), `resolve ticket ${ticketId}`).toBeTruthy();
  await apiLogout(request);
}

const STAFF_CARDS = [
  { key: "new", href: "/staff/queue?status=NEW", url: /\/staff\/queue\?status=NEW$/ },
  { key: "open", href: "/staff/queue?status=OPEN", url: /\/staff\/queue\?status=OPEN$/ },
  { key: "inProgress", href: "/staff/queue?status=IN_PROGRESS", url: /\/staff\/queue\?status=IN_PROGRESS$/ },
  { key: "waitingForRequester", href: "/staff/queue?status=WAITING_FOR_REQUESTER", url: /\/staff\/queue\?status=WAITING_FOR_REQUESTER$/ },
  { key: "myAssigned", href: "/staff/queue?owner=ME", url: /\/staff\/queue\?owner=ME$/ },
  { key: "unassigned", href: "/staff/queue?owner=UNASSIGNED", url: /\/staff\/queue\?owner=UNASSIGNED$/ },
  { key: "myOpenActions", href: "/staff/queue?actionAssignee=ME&actionStatus=OPEN", url: /\/staff\/queue\?actionAssignee=ME&actionStatus=OPEN$/ },
] as const;

const REQUESTER_CARDS = [
  { key: "open", href: "/tickets?status=OPEN", url: /\/tickets\?status=OPEN$/ },
  { key: "inProgress", href: "/tickets?status=IN_PROGRESS", url: /\/tickets\?status=IN_PROGRESS$/ },
  { key: "waitingForMe", href: "/tickets?status=WAITING_FOR_REQUESTER", url: /\/tickets\?status=WAITING_FOR_REQUESTER$/ },
  { key: "resolved", href: "/tickets?status=RESOLVED", url: /\/tickets\?status=RESOLVED$/ },
  { key: "closed", href: "/tickets?status=CLOSED", url: /\/tickets\?status=CLOSED$/ },
  { key: "recentlyResolved", href: "/tickets?status=RESOLVED", url: /\/tickets\?status=RESOLVED$/ },
] as const;

test("E2E-L4-03: IT staff dashboard counts equal direct DB queries and every card drills into the right queue", async ({
  page,
  request,
}) => {
  // Make several metrics non-trivial: a NEW unassigned ticket, an OPEN owned
  // ticket, and an OPEN action assigned to the staffer (My Open Actions).
  await createTicketViaApi(request);
  const { id: ownedId } = await createClaimedTicket(request);
  const staffId = await userIdByEmail(STAFF_EMAIL);
  await createActionViaApi(request, STAFF_EMAIL, ownedId, {
    description: "Open action owned by the dashboard staffer",
    assigneeId: staffId,
  });

  await loginAs(page, STAFF_EMAIL, SEED_PASSWORD, "IT_STAFF");
  await page.goto("/dashboard");

  const expected = await staffMetricsFromDb(staffId);
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    expect(await cardCount(page, key), `staff metric "${key}"`).toBe(expected[key]);
  }
  // Sanity: the data we seeded guarantees these are non-zero (not an all-empty pass).
  expect(expected.myOpenActions).toBeGreaterThan(0);
  expect(expected.unassigned).toBeGreaterThan(0);

  for (const c of STAFF_CARDS) {
    await checkDrilldown(page, c.key, c.href, c.url, "Ticket Queue", "new");
  }
});

test("E2E-L4-03: requester dashboard counts equal direct DB queries and cards drill into My Tickets", async ({
  page,
  request,
}) => {
  // Vary the requester's own statuses: a brand-new ticket plus a resolved one
  // (also exercises Resolved / Recently Resolved).
  await createTicketViaApi(request);
  const { id: toResolve } = await createClaimedTicket(request);
  await resolveTicketViaApi(request, toResolve);
  const requesterId = await userIdByEmail(REQUESTER_EMAIL);

  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto("/dashboard");

  const expected = await requesterMetricsFromDb(requesterId);
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    expect(await cardCount(page, key), `requester metric "${key}"`).toBe(expected[key]);
  }
  expect(expected.resolved).toBeGreaterThan(0);
  expect(expected.recentlyResolved).toBeGreaterThan(0);

  for (const c of REQUESTER_CARDS) {
    await checkDrilldown(page, c.key, c.href, c.url, "My Tickets", "open");
  }
});

test("E2E-L4-03: a requester with no tickets sees an all-zero dashboard and the empty state", async ({
  page,
}) => {
  await loginAs(page, REQUESTER2_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto("/dashboard");

  for (const c of REQUESTER_CARDS) {
    expect(await cardCount(page, c.key), `empty requester metric "${c.key}"`).toBe(0);
  }
  await expect(page.getByTestId("recent-empty")).toBeVisible();
});

test("E2E-L4-03: a requester is forbidden from the staff area (UI) and the staff dashboard API (403)", async ({
  page,
  request,
}) => {
  // UI: the staff-only surface redirects a Requester to the in-shell Forbidden
  // view (there is no distinct staff-dashboard route; /dashboard role-branches).
  await loginAs(page, REQUESTER_EMAIL, SEED_PASSWORD, "REQUESTER");
  await page.goto("/staff/queue");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" })
  ).toBeVisible();

  // API: the staff dashboard endpoint itself rejects a Requester.
  await apiLogin(request, REQUESTER_EMAIL);
  const res = await request.get(`${API}/api/staff/dashboard`);
  expect(res.status()).toBe(403);
  await apiLogout(request);
});
