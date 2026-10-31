import { expect, type APIRequestContext } from "@playwright/test";
// Prisma client resolved from the server package (the only place it is
// generated). Imported by relative path because the root E2E harness is not an
// npm workspace and has no @prisma/client of its own.
import { PrismaClient, type Prisma } from "../../server/node_modules/@prisma/client";
import {
  API,
  CSRF,
  SEED_PASSWORD,
  STAFF_EMAIL,
  REQUESTER_EMAIL,
  apiLogin,
  apiLogout,
  createTicketViaApi,
} from "../lab-03/helpers";

// Re-export the Lab 3 primitives so Lab 4 specs import from one place.
export * from "../lab-03/helpers";

/**
 * Shared Lab 4 E2E helpers (Issue #55). Adds API shortcuts for the Actions Taken
 * and workflow endpoints, plus a thin Prisma client pinned to the isolated
 * toktickit_e2e database so the dashboard specs can assert each metric against a
 * *direct* DB query (ground truth), not against the API echoing itself.
 */

// Same fallback as playwright.config.ts: the Playwright process does not load
// server/.env, so an unset E2E_DATABASE_URL must resolve to the documented local
// default (never DATABASE_URL / *_test).
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/toktickit_e2e?schema=public";

let prismaSingleton: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  }
  return prismaSingleton;
}
export async function disconnectDb(): Promise<void> {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = null;
  }
}

export async function userIdByEmail(email: string): Promise<number> {
  const u = await db().user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return u.id;
}

// ── API shortcuts ────────────────────────────────────────────────────────────

// Staff claims a ticket (NEW → OPEN, owner = the staff user).
export async function claimTicketViaApi(
  request: APIRequestContext,
  ticketId: number,
  email: string = STAFF_EMAIL
): Promise<void> {
  await apiLogin(request, email);
  const res = await request.post(`${API}/api/staff/tickets/${ticketId}/claim`, { headers: CSRF });
  expect(res.ok(), `claim ticket ${ticketId} as ${email}`).toBeTruthy();
  await apiLogout(request);
}

// Create a fresh requester-owned ticket and immediately claim it so it is OPEN
// and owned by staff.e2e — the common starting point for Action/workflow specs.
export async function createClaimedTicket(
  request: APIRequestContext
): Promise<{ id: number; ticketNumber: string }> {
  const ticket = await createTicketViaApi(request);
  await claimTicketViaApi(request, ticket.id);
  return ticket;
}

export interface ActionInput {
  description: string;
  result?: string;
  assigneeId?: number | null;
  followUpRequired?: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
  actionDate?: string;
}

// Create an Action as a given staff/admin user; returns the created Action.
export async function createActionViaApi(
  request: APIRequestContext,
  email: string,
  ticketId: number,
  input: ActionInput
): Promise<{ id: number; status: string; updatedAt: string }> {
  await apiLogin(request, email);
  const res = await request.post(`${API}/api/staff/tickets/${ticketId}/actions`, {
    headers: CSRF,
    data: input,
  });
  expect(res.status(), `create action on ticket ${ticketId}`).toBe(201);
  const action = (await res.json()) as { id: number; status: string; updatedAt: string };
  await apiLogout(request);
  return action;
}

// Complete an Action via the API (sets a result if none yet).
export async function completeActionViaApi(
  request: APIRequestContext,
  email: string,
  ticketId: number,
  actionId: number,
  result = "Completed by the E2E setup."
): Promise<void> {
  await apiLogin(request, email);
  const res = await request.patch(`${API}/api/staff/tickets/${ticketId}/actions/${actionId}`, {
    headers: CSRF,
    data: { status: "COMPLETED", result },
  });
  expect(res.ok(), `complete action ${actionId}`).toBeTruthy();
  await apiLogout(request);
}

// GET the staff ticket detail (allowedTransitions, updatedAt, currentStatus, …).
export interface StaffTicketSnapshot {
  id: number;
  currentStatus: string;
  itPriority: string;
  updatedAt: string;
  requesterResolvedAt: string | null;
  allowedTransitions: string[];
}
export async function getStaffTicket(
  request: APIRequestContext,
  ticketId: number,
  email: string = STAFF_EMAIL
): Promise<StaffTicketSnapshot> {
  await apiLogin(request, email);
  const res = await request.get(`${API}/api/staff/tickets/${ticketId}`);
  expect(res.ok(), `get staff ticket ${ticketId}`).toBeTruthy();
  const t = (await res.json()) as StaffTicketSnapshot;
  await apiLogout(request);
  return t;
}

// Requester marks their own ticket as "appears resolved" (BR-40 signal; must NOT
// change currentStatus).
export async function requesterMarkResolvedViaApi(
  request: APIRequestContext,
  ticketId: number,
  email: string = REQUESTER_EMAIL
): Promise<void> {
  await apiLogin(request, email);
  const res = await request.post(`${API}/api/tickets/${ticketId}/resolved-indication`, { headers: CSRF });
  expect(res.ok(), `requester appears-resolved on ${ticketId}`).toBeTruthy();
  await apiLogout(request);
}

const FROZEN: Prisma.TicketWhereInput = { currentStatus: { notIn: ["CLOSED", "CANCELLED"] } };

// ── Ground-truth dashboard counts (direct DB queries) ────────────────────────
export async function staffMetricsFromDb(staffId: number) {
  const p = db();
  const [newC, open, inProgress, waitingForRequester, myAssigned, unassigned, myOpenActions] =
    await Promise.all([
      p.ticket.count({ where: { currentStatus: "NEW" } }),
      p.ticket.count({ where: { currentStatus: "OPEN" } }),
      p.ticket.count({ where: { currentStatus: "IN_PROGRESS" } }),
      p.ticket.count({ where: { currentStatus: "WAITING_FOR_REQUESTER" } }),
      p.ticket.count({ where: { ownerId: staffId, ...FROZEN } }),
      p.ticket.count({ where: { ownerId: null, ...FROZEN } }),
      p.actionTaken.count({ where: { assigneeId: staffId, status: "OPEN" } }),
    ]);
  return { new: newC, open, inProgress, waitingForRequester, myAssigned, unassigned, myOpenActions };
}

export async function requesterMetricsFromDb(requesterId: number) {
  const p = db();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [open, inProgress, waitingForMe, resolved, closed, recentlyResolved] = await Promise.all([
    p.ticket.count({ where: { requesterId, currentStatus: { in: ["NEW", "OPEN", "REOPENED"] } } }),
    p.ticket.count({ where: { requesterId, currentStatus: "IN_PROGRESS" } }),
    p.ticket.count({ where: { requesterId, currentStatus: "WAITING_FOR_REQUESTER" } }),
    p.ticket.count({ where: { requesterId, currentStatus: "RESOLVED" } }),
    p.ticket.count({ where: { requesterId, currentStatus: "CLOSED" } }),
    p.ticket.count({ where: { requesterId, resolvedAt: { gte: sevenDaysAgo } } }),
  ]);
  return { open, inProgress, waitingForMe, resolved, closed, recentlyResolved };
}
