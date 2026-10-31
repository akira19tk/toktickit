// IT Staff dashboard — API + authorization (Issue #53)
// Covers every #53 API row in docs/lab-04/tests.md:
//   API-L4-25  Staff dashboard counts match direct DB queries (AC-16)
//   API-L4-26  My Open Actions count (AC-23)
//   API-L4-27  Urgent list contents/order (AC-24)
//   API-L4-28  Dashboards with empty scope → zeros / empty lists, 200 (AC-17)
//   API-L4-29  Staff dashboard requested by Requester → 403 (AC-18)
//
// All metrics are backend-computed (BR-18); urgent uses itPriority = HIGH not in
// {CLOSED,CANCELLED}, newest-first, ≤5 (BR-21). Shapes follow api-spec §5.

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { TicketStatus, Priority, ActionStatus } from "@prisma/client";

const app = createApp();
const PW = "Dash#1234";

// Users
let me: { id: number };
let otherStaff: { id: number };
let admin: { id: number };
let requester: { id: number };
let lonely: { id: number }; // IT Staff with nothing owned / assigned

let meSession: string;
let adminSession: string;
let requesterSession: string;
let lonelySession: string;

let catId: number;
let sysId: number;
let seq = 0;

async function makeTicket(overrides: {
  requesterId?: number;
  ownerId?: number | null;
  currentStatus?: TicketStatus;
  itPriority?: Priority;
  updatedAt?: Date;
} = {}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-SDH-${String(seq).padStart(4, "0")}`,
      requesterId: overrides.requesterId ?? requester.id,
      ownerId: overrides.ownerId ?? null,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: `Staff dashboard ticket ${seq}`,
      description: "Seeded for staff-dashboard API tests.",
      requestedPriority: "MEDIUM",
      itPriority: overrides.itPriority ?? "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
    },
  });
  // updatedAt carries @updatedAt — set it with raw SQL to control recent/urgent order.
  if (overrides.updatedAt) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Ticket" SET "updatedAt" = $1 WHERE id = $2`,
      overrides.updatedAt,
      t.id
    );
  }
  return t.id;
}

async function makeAction(overrides: {
  ticketId: number;
  assigneeId?: number | null;
  status?: ActionStatus;
}): Promise<void> {
  await prisma.actionTaken.create({
    data: {
      ticketId: overrides.ticketId,
      performedById: me.id,
      description: "Seeded action for dashboard metric.",
      ...(overrides.assigneeId !== undefined && overrides.assigneeId !== null
        ? { assigneeId: overrides.assigneeId }
        : {}),
      ...(overrides.status ? { status: overrides.status } : {}),
    },
  });
}

const get = (p: string, session: string) =>
  request(app).get(p).set("Cookie", session);

beforeAll(async () => {
  await clearDatabase();

  me = await createUser({ email: "staff@sdh.test", password: PW, name: "Sam Staff", role: "IT_STAFF", mustChangePassword: false });
  otherStaff = await createUser({ email: "other@sdh.test", password: PW, name: "Ola Other", role: "IT_STAFF", mustChangePassword: false });
  admin = await createUser({ email: "admin@sdh.test", password: PW, name: "Ada Admin", role: "ADMIN", mustChangePassword: false });
  requester = await createUser({ email: "req@sdh.test", password: PW, name: "Ria Requester", role: "REQUESTER", mustChangePassword: false });
  lonely = await createUser({ email: "lonely@sdh.test", password: PW, name: "Lee Lonely", role: "IT_STAFF", mustChangePassword: false });

  meSession = await loginAs(app, { email: "staff@sdh.test", password: PW });
  adminSession = await loginAs(app, { email: "admin@sdh.test", password: PW });
  requesterSession = await loginAs(app, { email: "req@sdh.test", password: PW });
  lonelySession = await loginAs(app, { email: "lonely@sdh.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  const now = new Date();
  const t = (ms: number) => new Date(now.getTime() - ms);

  // ── Global status counts (ignore owner) ────────────────────────────────────
  // new = 2, open = 3, inProgress = 2, waitingForRequester = 1
  await makeTicket({ currentStatus: "NEW", updatedAt: t(1000) });
  await makeTicket({ currentStatus: "NEW", updatedAt: t(2000) });
  await makeTicket({ currentStatus: "OPEN", ownerId: me.id, updatedAt: t(3000) });
  await makeTicket({ currentStatus: "OPEN", ownerId: me.id, updatedAt: t(4000) });
  await makeTicket({ currentStatus: "OPEN", updatedAt: t(5000) });
  await makeTicket({ currentStatus: "IN_PROGRESS", ownerId: me.id, updatedAt: t(6000) });
  await makeTicket({ currentStatus: "IN_PROGRESS", ownerId: otherStaff.id, updatedAt: t(7000) });
  await makeTicket({ currentStatus: "WAITING_FOR_REQUESTER", ownerId: me.id, updatedAt: t(8000) });

  // ── My Assigned exclusions: a CLOSED / CANCELLED ticket owned by me is excluded
  await makeTicket({ currentStatus: "CLOSED", ownerId: me.id, updatedAt: t(9000) });
  await makeTicket({ currentStatus: "CANCELLED", ownerId: me.id, updatedAt: t(10000) });

  // ── Unassigned exclusions: CLOSED/CANCELLED unassigned excluded from count
  await makeTicket({ currentStatus: "CLOSED", ownerId: null, updatedAt: t(11000) });

  // ── Urgent list (HIGH, not Closed/Cancelled), 6 active → capped at 5 newest ──
  // Newest-first by updatedAt. High+closed and High+cancelled must be excluded.
  await makeTicket({ currentStatus: "OPEN", itPriority: "HIGH", ownerId: me.id, updatedAt: t(100) });
  await makeTicket({ currentStatus: "IN_PROGRESS", itPriority: "HIGH", updatedAt: t(200) });
  await makeTicket({ currentStatus: "NEW", itPriority: "HIGH", updatedAt: t(300) });
  await makeTicket({ currentStatus: "WAITING_FOR_REQUESTER", itPriority: "HIGH", updatedAt: t(400) });
  await makeTicket({ currentStatus: "REOPENED", itPriority: "HIGH", updatedAt: t(500) });
  await makeTicket({ currentStatus: "OPEN", itPriority: "HIGH", updatedAt: t(600) }); // 6th — should drop off
  await makeTicket({ currentStatus: "CLOSED", itPriority: "HIGH", updatedAt: t(50) }); // excluded
  await makeTicket({ currentStatus: "CANCELLED", itPriority: "HIGH", updatedAt: t(60) }); // excluded

  // ── My Open Actions: assigneeId = me AND status = OPEN ──────────────────────
  // Attach to an active ticket owned by me so BR-10 allows creation.
  const actionTicket = await makeTicket({ currentStatus: "IN_PROGRESS", ownerId: me.id, updatedAt: t(12000) });
  await makeAction({ ticketId: actionTicket, assigneeId: me.id, status: "OPEN" });
  await makeAction({ ticketId: actionTicket, assigneeId: me.id, status: "OPEN" });
  await makeAction({ ticketId: actionTicket, assigneeId: me.id, status: "OPEN" });
  await makeAction({ ticketId: actionTicket, assigneeId: me.id, status: "COMPLETED" }); // excluded (not OPEN)
  await makeAction({ ticketId: actionTicket, assigneeId: otherStaff.id, status: "OPEN" }); // excluded (not me)
  await makeAction({ ticketId: actionTicket, assigneeId: null, status: "OPEN" }); // excluded (unassigned)

  void admin;
});

// ── API-L4-25 ───────────────────────────────────────────────────────────────

describe("API-L4-25: Staff dashboard counts match direct DB queries (AC-16)", () => {
  it("API-L4-25: metrics equal direct Prisma queries (IT Staff)", async () => {
    const res = await get("/api/staff/dashboard", meSession);
    expect(res.status).toBe(200);

    const active = { notIn: ["CLOSED", "CANCELLED"] as TicketStatus[] };
    const [nw, open, inProgress, waitingForRequester, myAssigned, unassigned] =
      await Promise.all([
        prisma.ticket.count({ where: { currentStatus: "NEW" } }),
        prisma.ticket.count({ where: { currentStatus: "OPEN" } }),
        prisma.ticket.count({ where: { currentStatus: "IN_PROGRESS" } }),
        prisma.ticket.count({ where: { currentStatus: "WAITING_FOR_REQUESTER" } }),
        prisma.ticket.count({ where: { ownerId: me.id, currentStatus: active } }),
        prisma.ticket.count({ where: { ownerId: null, currentStatus: active } }),
      ]);

    // Sanity: the seed produced the intended non-zero shape. (Counts include the
    // HIGH-priority urgent-list tickets and the action ticket, which also carry
    // these working statuses.)
    expect({ nw, open, inProgress, waitingForRequester }).toEqual({
      nw: 3, open: 5, inProgress: 4, waitingForRequester: 2,
    });

    expect(res.body.metrics.new).toBe(nw);
    expect(res.body.metrics.open).toBe(open);
    expect(res.body.metrics.inProgress).toBe(inProgress);
    expect(res.body.metrics.waitingForRequester).toBe(waitingForRequester);
    expect(res.body.metrics.myAssigned).toBe(myAssigned);
    expect(res.body.metrics.unassigned).toBe(unassigned);
  });

  it("API-L4-25: myRecentTickets = my top 5 owned by updatedAt desc, safe fields only", async () => {
    const res = await get("/api/staff/dashboard", meSession);
    expect(res.status).toBe(200);

    const expected = await prisma.ticket.findMany({
      where: { ownerId: me.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true },
    });

    const list = res.body.myRecentTickets as Array<Record<string, unknown>>;
    expect(list).toHaveLength(5);
    expect(list.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(
        ["currentStatus", "id", "itPriority", "summary", "ticketNumber", "updatedAt"]
      );
    }
  });

  it("API-L4-25: Admin sees the same dashboard shape (200)", async () => {
    const res = await get("/api/staff/dashboard", adminSession);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual(
      expect.objectContaining({
        new: expect.any(Number),
        open: expect.any(Number),
        inProgress: expect.any(Number),
        waitingForRequester: expect.any(Number),
        myAssigned: expect.any(Number),
        unassigned: expect.any(Number),
        myOpenActions: expect.any(Number),
      })
    );
    expect(Array.isArray(res.body.myRecentTickets)).toBe(true);
    expect(Array.isArray(res.body.urgentTickets)).toBe(true);
  });
});

// ── API-L4-26 ───────────────────────────────────────────────────────────────

describe("API-L4-26: My Open Actions count (AC-23)", () => {
  it("API-L4-26: myOpenActions equals count(assigneeId = me AND status = OPEN)", async () => {
    const res = await get("/api/staff/dashboard", meSession);
    expect(res.status).toBe(200);

    const expected = await prisma.actionTaken.count({
      where: { assigneeId: me.id, status: "OPEN" },
    });
    expect(expected).toBe(3); // sanity: 3 OPEN assigned to me (others excluded)
    expect(res.body.metrics.myOpenActions).toBe(expected);
  });
});

// ── API-L4-27 ───────────────────────────────────────────────────────────────

describe("API-L4-27: Urgent list contents/order (AC-24)", () => {
  it("API-L4-27: exactly HIGH & not Closed/Cancelled, newest-first, capped at 5", async () => {
    const res = await get("/api/staff/dashboard", meSession);
    expect(res.status).toBe(200);

    const expected = await prisma.ticket.findMany({
      where: { itPriority: "HIGH", currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, currentStatus: true },
    });

    const list = res.body.urgentTickets as Array<{ id: number; currentStatus: string; itPriority: string }>;
    expect(list).toHaveLength(5); // 6 active HIGH seeded → capped at 5
    expect(list.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    // None closed or cancelled; all HIGH.
    for (const row of list) {
      expect(["CLOSED", "CANCELLED"]).not.toContain(row.currentStatus);
      expect(row.itPriority).toBe("HIGH");
    }
  });
});

// ── API-L4-29 ───────────────────────────────────────────────────────────────

describe("API-L4-29: Staff dashboard requested by Requester → 403 (AC-18)", () => {
  it("API-L4-29: Requester gets 403", async () => {
    const res = await get("/api/staff/dashboard", requesterSession);
    expect(res.status).toBe(403);
  });
});

// ── API-L4-28 ───────────────────────────────────────────────────────────────
// Kept LAST: the global-empty case clears the database, so it must run after the
// seeded tests above.

describe("API-L4-28: Dashboards with empty scope → zeros / empty lists, 200 (AC-17)", () => {
  it("API-L4-28: a staffer who owns nothing sees zero me-scoped metrics and empty lists", async () => {
    const res = await get("/api/staff/dashboard", lonelySession);
    expect(res.status).toBe(200);
    expect(res.body.metrics.myAssigned).toBe(0);
    expect(res.body.metrics.myOpenActions).toBe(0);
    expect(res.body.myRecentTickets).toEqual([]);
  });

  it("API-L4-28: an empty database returns all zeros and empty lists (no 404)", async () => {
    await clearDatabase();
    const fresh = await createUser({ email: "fresh@sdh.test", password: PW, name: "Fay Fresh", role: "IT_STAFF", mustChangePassword: false });
    void fresh;
    const freshSession = await loginAs(app, { email: "fresh@sdh.test", password: PW });

    const res = await get("/api/staff/dashboard", freshSession);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      new: 0, open: 0, inProgress: 0, waitingForRequester: 0,
      myAssigned: 0, unassigned: 0, myOpenActions: 0,
    });
    expect(res.body.myRecentTickets).toEqual([]);
    expect(res.body.urgentTickets).toEqual([]);
  });
});
