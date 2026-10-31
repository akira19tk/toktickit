// Requester dashboard — API + authorization (Issue #52)
// Covers every #52 API row in docs/lab-04/tests.md:
//   API-L4-21  Requester dashboard scope + counts (AC-15)
//   API-L4-22  Waiting for Me metric (AC-25)
//   API-L4-23  Recently Resolved uses Asia/Bangkok boundary (AC-26)
//   API-L4-24  Requester dashboard requested by IT Staff/Admin → 403 (AC-15)

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { TicketStatus } from "@prisma/client";

const app = createApp();
const PW = "Dash#1234";

// Authoritative Asia/Bangkok (UTC+7, no DST) "last 7 days" lower bound:
// start-of-day in Bangkok of (todayBangkok − 6 days), expressed as a UTC instant.
// Inclusive of that day boundary → 7 calendar days (today + previous 6).
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bangkokRecentCutoff(now: Date = new Date()): Date {
  const bkk = new Date(now.getTime() + BKK_OFFSET_MS); // shift so UTC fields read as Bangkok wall clock
  const y = bkk.getUTCFullYear();
  const m = bkk.getUTCMonth();
  const d = bkk.getUTCDate();
  return new Date(Date.UTC(y, m, d - 6, 0, 0, 0, 0) - BKK_OFFSET_MS);
}

// Users
let me: { id: number };
let other: { id: number };
let staff: { id: number };
let admin: { id: number };

let meSession: string;
let staffSession: string;
let adminSession: string;

let catId: number;
let sysId: number;
let seq = 0;

async function makeTicket(overrides: {
  requesterId?: number;
  currentStatus?: TicketStatus;
  resolvedAt?: Date | null;
  updatedAt?: Date;
} = {}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-DSH-${String(seq).padStart(4, "0")}`,
      requesterId: overrides.requesterId ?? me.id,
      ownerId: null,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: `Dashboard ticket ${seq}`,
      description: "Seeded for requester-dashboard API tests.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
      ...(overrides.resolvedAt !== undefined ? { resolvedAt: overrides.resolvedAt } : {}),
    },
  });
  // updatedAt carries @updatedAt — set it with raw SQL to control recent-list order.
  if (overrides.updatedAt) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Ticket" SET "updatedAt" = $1 WHERE id = $2`,
      overrides.updatedAt,
      t.id
    );
  }
  return t.id;
}

const get = (p: string, session: string) =>
  request(app).get(p).set("Cookie", session);

beforeAll(async () => {
  await clearDatabase();

  me = await createUser({ email: "me@dash.test", password: PW, name: "Mia Requester", role: "REQUESTER", mustChangePassword: false });
  other = await createUser({ email: "other@dash.test", password: PW, name: "Otis Requester", role: "REQUESTER", mustChangePassword: false });
  staff = await createUser({ email: "staff@dash.test", password: PW, name: "Sam Staff", role: "IT_STAFF", mustChangePassword: false });
  admin = await createUser({ email: "admin@dash.test", password: PW, name: "Ada Admin", role: "ADMIN", mustChangePassword: false });

  meSession = await loginAs(app, { email: "me@dash.test", password: PW });
  staffSession = await loginAs(app, { email: "staff@dash.test", password: PW });
  adminSession = await loginAs(app, { email: "admin@dash.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  const now = new Date();
  const cutoff = bangkokRecentCutoff(now);

  // ── My tickets across statuses ──────────────────────────────────────────
  // open = NEW,OPEN,REOPENED → 4
  await makeTicket({ currentStatus: "NEW", updatedAt: new Date(now.getTime() - 1000) });
  await makeTicket({ currentStatus: "NEW", updatedAt: new Date(now.getTime() - 2000) });
  await makeTicket({ currentStatus: "OPEN", updatedAt: new Date(now.getTime() - 3000) });
  await makeTicket({ currentStatus: "REOPENED", updatedAt: new Date(now.getTime() - 4000) });
  // inProgress → 2
  await makeTicket({ currentStatus: "IN_PROGRESS", updatedAt: new Date(now.getTime() - 5000) });
  await makeTicket({ currentStatus: "IN_PROGRESS", updatedAt: new Date(now.getTime() - 6000) });
  // waitingForMe → 1
  await makeTicket({ currentStatus: "WAITING_FOR_REQUESTER", updatedAt: new Date(now.getTime() - 7000) });
  // resolved → 3 (two resolvedAt inside window, one outside)
  await makeTicket({ currentStatus: "RESOLVED", resolvedAt: now, updatedAt: new Date(now.getTime() - 8000) });
  await makeTicket({ currentStatus: "RESOLVED", resolvedAt: cutoff, updatedAt: new Date(now.getTime() - 9000) });
  await makeTicket({ currentStatus: "RESOLVED", resolvedAt: new Date(cutoff.getTime() - 1000), updatedAt: new Date(now.getTime() - 10000) });
  // closed → 2
  await makeTicket({ currentStatus: "CLOSED", updatedAt: new Date(now.getTime() - 11000) });
  await makeTicket({ currentStatus: "CLOSED", updatedAt: new Date(now.getTime() - 12000) });

  // ── Other requester's tickets (must be excluded from my scope) ──────────
  await makeTicket({ requesterId: other.id, currentStatus: "NEW" });
  await makeTicket({ requesterId: other.id, currentStatus: "WAITING_FOR_REQUESTER" });
  await makeTicket({ requesterId: other.id, currentStatus: "RESOLVED", resolvedAt: now });
  await makeTicket({ requesterId: other.id, currentStatus: "CLOSED" });

  void staff; void admin;
});

// ── API-L4-21 ─────────────────────────────────────────────────────────────

describe("API-L4-21: Requester dashboard scope + counts (AC-15)", () => {
  it("API-L4-21: metrics match direct Prisma queries scoped to me, and exclude other requesters", async () => {
    const res = await get("/api/requester/dashboard", meSession);
    expect(res.status).toBe(200);

    const mine = { requesterId: me.id };
    const [open, inProgress, waitingForMe, resolved, closed] = await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: ["NEW", "OPEN", "REOPENED"] } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "IN_PROGRESS" } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "RESOLVED" } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "CLOSED" } }),
    ]);

    // Sanity: the seed produced the intended non-zero shape.
    expect({ open, inProgress, waitingForMe, resolved, closed }).toEqual({
      open: 4, inProgress: 2, waitingForMe: 1, resolved: 3, closed: 2,
    });

    expect(res.body.metrics.open).toBe(open);
    expect(res.body.metrics.inProgress).toBe(inProgress);
    expect(res.body.metrics.waitingForMe).toBe(waitingForMe);
    expect(res.body.metrics.resolved).toBe(resolved);
    expect(res.body.metrics.closed).toBe(closed);
  });

  it("API-L4-21: myRecentTickets = my top 5 by updatedAt desc, no other requester's tickets", async () => {
    const res = await get("/api/requester/dashboard", meSession);
    expect(res.status).toBe(200);

    const expected = await prisma.ticket.findMany({
      where: { requesterId: me.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, ticketNumber: true },
    });

    const list = res.body.myRecentTickets as Array<{ id: number; ticketNumber: string; summary: string; currentStatus: string; updatedAt: string }>;
    expect(list).toHaveLength(5);
    expect(list.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    // All belong to me (none of the other requester's tickets leak in).
    const otherIds = (await prisma.ticket.findMany({ where: { requesterId: other.id }, select: { id: true } })).map((t) => t.id);
    expect(list.some((t) => otherIds.includes(t.id))).toBe(false);
    // Shape carries only safe Ticket fields.
    for (const t of list) {
      expect(Object.keys(t).sort()).toEqual(["currentStatus", "id", "summary", "ticketNumber", "updatedAt"]);
    }
  });

  it("API-L4-21: empty scope returns zeros and an empty list (no error)", async () => {
    // other-requester data exists, but a brand-new requester has nothing.
    const fresh = await createUser({ email: "fresh@dash.test", password: PW, name: "Faye Fresh", role: "REQUESTER", mustChangePassword: false });
    void fresh;
    const freshSession = await loginAs(app, { email: "fresh@dash.test", password: PW });
    const res = await get("/api/requester/dashboard", freshSession);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      open: 0, inProgress: 0, waitingForMe: 0, resolved: 0, closed: 0, recentlyResolved: 0,
    });
    expect(res.body.myRecentTickets).toEqual([]);
  });
});

// ── API-L4-22 ─────────────────────────────────────────────────────────────

describe("API-L4-22: Waiting for Me metric (AC-25)", () => {
  it("API-L4-22: waitingForMe equals count(WAITING_FOR_REQUESTER) for me", async () => {
    const res = await get("/api/requester/dashboard", meSession);
    expect(res.status).toBe(200);
    const expected = await prisma.ticket.count({
      where: { requesterId: me.id, currentStatus: "WAITING_FOR_REQUESTER" },
    });
    expect(expected).toBe(1);
    expect(res.body.metrics.waitingForMe).toBe(expected);
  });
});

// ── API-L4-23 ─────────────────────────────────────────────────────────────

describe("API-L4-23: Recently Resolved uses Asia/Bangkok boundary (AC-26)", () => {
  it("API-L4-23: counts resolvedAt within the last 7 days by the Asia/Bangkok day boundary", async () => {
    const res = await get("/api/requester/dashboard", meSession);
    expect(res.status).toBe(200);

    const cutoff = bangkokRecentCutoff();
    const expected = await prisma.ticket.count({
      where: { requesterId: me.id, resolvedAt: { gte: cutoff } },
    });
    // Seeded: one resolvedAt = now (in), one = cutoff exactly (in, inclusive),
    // one = cutoff − 1s (out). The out-of-window one must not be counted.
    expect(expected).toBe(2);
    expect(res.body.metrics.recentlyResolved).toBe(expected);
  });

  it("API-L4-23: the cutoff instant is inclusive and an instant 1s earlier is excluded", async () => {
    // Prove the boundary discriminates at the Bangkok midnight instant (17:00 UTC
    // the previous day), not a UTC midnight. A fresh requester isolates the count.
    const u = await createUser({ email: "tz@dash.test", password: PW, name: "Tai Zone", role: "REQUESTER", mustChangePassword: false });
    void u;
    const s = await loginAs(app, { email: "tz@dash.test", password: PW });
    const cutoff = bangkokRecentCutoff();
    await makeTicket({ requesterId: u.id, currentStatus: "RESOLVED", resolvedAt: cutoff });
    await makeTicket({ requesterId: u.id, currentStatus: "RESOLVED", resolvedAt: new Date(cutoff.getTime() - 1000) });

    const res = await get("/api/requester/dashboard", s);
    expect(res.status).toBe(200);
    expect(res.body.metrics.recentlyResolved).toBe(1);
  });
});

// ── API-L4-24 ─────────────────────────────────────────────────────────────

describe("API-L4-24: Requester dashboard requested by IT Staff/Admin → 403 (AC-15)", () => {
  it("API-L4-24: IT Staff gets 403", async () => {
    const res = await get("/api/requester/dashboard", staffSession);
    expect(res.status).toBe(403);
  });

  it("API-L4-24: Admin gets 403", async () => {
    const res = await get("/api/requester/dashboard", adminSession);
    expect(res.status).toBe(403);
  });
});
