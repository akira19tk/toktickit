// Staff queue — actionAssignee / actionStatus drill-down filters (Issue #53).
// PR #63 review, point 2: these filters must combine correctly with the existing
// status / owner / priority filters, and an over-constrained combination must
// return 200 with an empty list (never 404 / 500).
//   API-L4-41  action filter combined with status / owner / priority
//   API-L4-42  over-constrained combination → 200, []
//
// The filter is `actions: { some: { assigneeId, status } }` — a SINGLE action
// must match BOTH the assignee and the status, so a ticket whose only mine-action
// is COMPLETED (plus a separate OPEN action owned by someone else) does not match
// actionAssignee=ME&actionStatus=OPEN.

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { Priority, TicketStatus, ActionStatus } from "@prisma/client";

const app = createApp();
const PW = "Queue#1234";

let me: { id: number };
let otherStaff: { id: number };
let meSession: string;

let catId: number;
let sysId: number;
let seq = 0;

// Named ticket ids for set assertions.
let T1: number; // OPEN, owner me, HIGH, OPEN action mine
let T2: number; // IN_PROGRESS, owner me, LOW, OPEN action mine
let T3: number; // OPEN, owner otherStaff, HIGH, OPEN action mine
let T4: number; // OPEN, owner me, HIGH, COMPLETED action mine + OPEN action other
let T5: number; // OPEN, unassigned, MEDIUM, OPEN action other

async function makeTicket(o: {
  ownerId?: number | null;
  currentStatus: TicketStatus;
  itPriority: Priority;
}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-AQF-${String(seq).padStart(4, "0")}`,
      requesterId: me.id, // requester identity is irrelevant to these filters
      ownerId: o.ownerId ?? null,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: `Action-filter ticket ${seq}`,
      description: "Seeded for staff-queue action-filter tests.",
      requestedPriority: "MEDIUM",
      itPriority: o.itPriority,
      currentStatus: o.currentStatus,
    },
  });
  return t.id;
}

async function makeAction(ticketId: number, assigneeId: number | null, status: ActionStatus): Promise<void> {
  await prisma.actionTaken.create({
    data: {
      ticketId,
      performedById: me.id,
      description: "Seeded action for queue filter.",
      status,
      ...(assigneeId !== null ? { assigneeId } : {}),
    },
  });
}

// GET the queue with a query string; return the sorted ticket-id set + total.
async function queue(query: string): Promise<{ status: number; ids: number[]; total: number }> {
  const res = await request(app).get(`/api/staff/tickets?${query}`).set("Cookie", meSession);
  const ids = (res.body.data ?? []).map((t: { id: number }) => t.id).sort((a: number, b: number) => a - b);
  return { status: res.status, ids, total: res.body.pagination?.totalCount ?? -1 };
}

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

beforeAll(async () => {
  await clearDatabase();

  me = await createUser({ email: "me@aqf.test", password: PW, name: "Mia Me", role: "IT_STAFF", mustChangePassword: false });
  otherStaff = await createUser({ email: "other@aqf.test", password: PW, name: "Ola Other", role: "IT_STAFF", mustChangePassword: false });
  meSession = await loginAs(app, { email: "me@aqf.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  T1 = await makeTicket({ ownerId: me.id, currentStatus: "OPEN", itPriority: "HIGH" });
  await makeAction(T1, me.id, "OPEN");

  T2 = await makeTicket({ ownerId: me.id, currentStatus: "IN_PROGRESS", itPriority: "LOW" });
  await makeAction(T2, me.id, "OPEN");

  T3 = await makeTicket({ ownerId: otherStaff.id, currentStatus: "OPEN", itPriority: "HIGH" });
  await makeAction(T3, me.id, "OPEN");

  T4 = await makeTicket({ ownerId: me.id, currentStatus: "OPEN", itPriority: "HIGH" });
  await makeAction(T4, me.id, "COMPLETED"); // mine but not OPEN
  await makeAction(T4, otherStaff.id, "OPEN"); // OPEN but not mine

  T5 = await makeTicket({ ownerId: null, currentStatus: "OPEN", itPriority: "MEDIUM" });
  await makeAction(T5, otherStaff.id, "OPEN"); // unassigned ticket, action owned by other
});

// ── API-L4-41 ───────────────────────────────────────────────────────────────

describe("API-L4-41: action filter combines with status / owner / priority (AC-17)", () => {
  it("API-L4-41: actionAssignee=ME&actionStatus=OPEN alone → tickets with an OPEN action assigned to me", async () => {
    const { status, ids, total } = await queue("actionAssignee=ME&actionStatus=OPEN&status=ALL");
    expect(status).toBe(200);
    // T4 excluded: its only mine-action is COMPLETED; its OPEN action is someone
    // else's. T5 excluded: its OPEN action is not mine.
    expect(ids).toEqual(sorted([T1, T2, T3]));
    expect(total).toBe(3);
  });

  it("API-L4-41: + status=OPEN narrows to OPEN tickets (drops the IN_PROGRESS one)", async () => {
    const { status, ids } = await queue("actionAssignee=ME&actionStatus=OPEN&status=OPEN");
    expect(status).toBe(200);
    expect(ids).toEqual(sorted([T1, T3])); // T2 is IN_PROGRESS
  });

  it("API-L4-41: + owner=ME narrows to tickets I own", async () => {
    const { status, ids } = await queue("actionAssignee=ME&actionStatus=OPEN&owner=ME&status=ALL");
    expect(status).toBe(200);
    expect(ids).toEqual(sorted([T1, T2])); // T3 is owned by otherStaff
  });

  it("API-L4-41: + priority=HIGH narrows to HIGH IT priority", async () => {
    const { status, ids } = await queue("actionAssignee=ME&actionStatus=OPEN&priority=HIGH&status=ALL");
    expect(status).toBe(200);
    expect(ids).toEqual(sorted([T1, T3])); // T2 is LOW; T4 has no OPEN mine-action
  });
});

// ── API-L4-42 ───────────────────────────────────────────────────────────────

describe("API-L4-42: over-constrained action-filter combination → 200, [] (AC-17)", () => {
  it("API-L4-42: actionAssignee=ME&actionStatus=OPEN + owner=UNASSIGNED → empty (the unassigned ticket's action is not mine)", async () => {
    const { status, ids, total } = await queue("actionAssignee=ME&actionStatus=OPEN&owner=UNASSIGNED&status=ALL");
    expect(status).toBe(200);
    expect(ids).toEqual([]);
    expect(total).toBe(0);
  });

  it("API-L4-42: actionAssignee=ME&actionStatus=CANCELLED → empty (I have no cancelled actions)", async () => {
    const { status, ids, total } = await queue("actionAssignee=ME&actionStatus=CANCELLED&status=ALL");
    expect(status).toBe(200);
    expect(ids).toEqual([]);
    expect(total).toBe(0);
  });
});
