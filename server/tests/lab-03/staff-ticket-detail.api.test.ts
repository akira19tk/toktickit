// IT Staff Ticket Detail operations (Issue #27, Stage 1)
// API-43: Claim unassigned NEW → owner = caller, status OPEN atomically (AC-42)
// API-44: Claim an owned Ticket → 409 ALREADY_OWNED (AC-43)
// API-45: Reassign active/inactive/requester/unknown; deactivated owner (AC-44, AC-78)
// API-46: Change IT Priority; requested unchanged; invalid 400; Requester 403 (AC-45)
// API-47: Allowed status transitions → 200 (AC-46)
// API-48: Disallowed status transitions → 409 INVALID_TRANSITION (AC-46)
// API-49: Resolve with/without summary (AC-47)
// API-50: Close/cancel with/without confirm (AC-48)
// API-51: Reopen from RESOLVED and CLOSED (AC-49)
// API-52: Status change on unassigned Ticket → 409 TICKET_UNASSIGNED (AC-50)
// API-53: Owner/IT Priority on CLOSED/CANCELLED; status from CLOSED/CANCELLED (AC-51)
// API-54: Staff download active/removed; upload/remove rejected (AC-55)
// API-64: Two simultaneous claims → exactly one success (AC-79)
// API-67: Same-value status/owner/priority; invalid-transition body (AC-82)
// API-69: Status change on unassigned CANCELLED → INVALID_TRANSITION (AC-84)
//
// Role/authorization (no session → 401, Requester → 403) is covered table-driven
// in authorization.api.test.ts (API-16, API-17); this file proves behavior.

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import path from "path";
import { promises as fs } from "fs";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { Priority, TicketStatus } from "@prisma/client";

const app = createApp();
const PW = "Detail#1234";

// Spec transition matrix (§5.3) — kept independent of the source so these tests
// fail if the contract and implementation drift apart.
const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};
const ALL_STATUSES = Object.keys(MATRIX) as TicketStatus[];

// Users
let requester: { id: number };
let staffA: { id: number; name: string };
let staffB: { id: number; name: string };
let staffInactive: { id: number };
let admin: { id: number };

let staffASession: string;
let staffBSession: string;
let requesterSession: string;

// Reference data
let catId: number;
let sysId: number;

let seq = 0;

async function makeTicket(overrides: {
  ownerId?: number | null;
  requestedPriority?: Priority;
  itPriority?: Priority;
  currentStatus?: TicketStatus;
  requesterResolvedAt?: Date | null;
  resolutionSummary?: string | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  summary?: string;
} = {}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-DET-${String(seq).padStart(4, "0")}`,
      requesterId: requester.id,
      ownerId: overrides.ownerId ?? null,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: overrides.summary ?? "Detail test ticket",
      description: "Seeded for staff-ticket-detail API tests.",
      requestedPriority: overrides.requestedPriority ?? "MEDIUM",
      itPriority: overrides.itPriority ?? "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
      requesterResolvedAt: overrides.requesterResolvedAt ?? null,
      resolutionSummary: overrides.resolutionSummary ?? null,
      resolvedAt: overrides.resolvedAt ?? null,
      closedAt: overrides.closedAt ?? null,
    },
  });
  return t.id;
}

const get = (p: string, session: string) =>
  request(app).get(p).set("Cookie", session);
const post = (p: string, session: string) =>
  request(app).post(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");
const patch = (p: string, session: string) =>
  request(app).patch(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");
const del = (p: string, session: string) =>
  request(app).delete(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");

beforeAll(async () => {
  await clearDatabase();

  requester = await createUser({ email: "req@detail.test", password: PW, name: "Rita Requester", role: "REQUESTER", mustChangePassword: false });
  staffA = await createUser({ email: "a@detail.test", password: PW, name: "Aaron Staff", role: "IT_STAFF", mustChangePassword: false });
  staffB = await createUser({ email: "b@detail.test", password: PW, name: "Bianca Staff", role: "IT_STAFF", mustChangePassword: false });
  staffInactive = await createUser({ email: "inactive@detail.test", password: PW, name: "Ingrid Inactive", role: "IT_STAFF", isActive: false, mustChangePassword: false });
  admin = await createUser({ email: "admin@detail.test", password: PW, name: "Ada Admin", role: "ADMIN", mustChangePassword: false });

  staffASession = await loginAs(app, { email: "a@detail.test", password: PW });
  staffBSession = await loginAs(app, { email: "b@detail.test", password: PW });
  requesterSession = await loginAs(app, { email: "req@detail.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  // keep a reference so `admin`/`staffInactive` are not flagged unused
  void admin;
  void staffInactive;
});

// ── API-43 ────────────────────────────────────────────────────────────────────

describe("API-43: Claim an unassigned NEW Ticket (AC-42)", () => {
  it("API-43: claim sets owner to caller and status to OPEN in the same transaction", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    const res = await post(`/api/staff/tickets/${id}/claim`, staffASession);
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: staffA.id, name: staffA.name, isActiveStaff: true });
    expect(res.body.currentStatus).toBe("OPEN");

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffA.id);
    expect(t!.currentStatus).toBe("OPEN");
  });

  it("API-43: claiming a non-NEW unassigned Ticket sets the owner but keeps the status", async () => {
    const id = await makeTicket({ currentStatus: "REOPENED", ownerId: null });
    const res = await post(`/api/staff/tickets/${id}/claim`, staffASession);
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("REOPENED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffA.id);
    expect(t!.currentStatus).toBe("REOPENED");
  });
});

// ── API-44 ────────────────────────────────────────────────────────────────────

describe("API-44: Claim an already-owned Ticket (AC-43)", () => {
  it("API-44: claim on an owned Ticket → 409 ALREADY_OWNED, nothing changes", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffB.id });
    const res = await post(`/api/staff/tickets/${id}/claim`, staffASession);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_OWNED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffB.id);
    expect(t!.currentStatus).toBe("OPEN");
  });
});

// ── API-45 ────────────────────────────────────────────────────────────────────

describe("API-45: Reassign owner (AC-44, AC-78)", () => {
  it("API-45: reassign to an active IT Staff user → 200, owner changes, status unchanged", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffB.id });
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: staffB.id, isActiveStaff: true });
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffB.id);
    expect(t!.currentStatus).toBe("OPEN");
  });

  it("API-45: assign on an unassigned Ticket works and does not change the status (BR-28)", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffB.id });
    expect(res.status).toBe(200);
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffB.id);
    expect(t!.currentStatus).toBe("NEW");
  });

  it("API-45: reassign to an inactive user → 400 errors.ownerId", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffInactive.id });
    expect(res.status).toBe(400);
    expect(res.body.errors?.ownerId).toBeDefined();
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffA.id);
  });

  it("API-45: reassign to a Requester (non-staff) → 400 errors.ownerId", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: requester.id });
    expect(res.status).toBe(400);
    expect(res.body.errors?.ownerId).toBeDefined();
  });

  it("API-45: reassign to an unknown user id → 400 errors.ownerId", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.errors?.ownerId).toBeDefined();
  });

  it("API-45: a Ticket whose owner was later deactivated can be reassigned → 200 (AC-78)", async () => {
    const staffC = await createUser({ email: "c@detail.test", password: PW, name: "Carl Soon-Inactive", role: "IT_STAFF", mustChangePassword: false });
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffC.id });
    // deactivate the current owner after assignment
    await prisma.user.update({ where: { id: staffC.id }, data: { isActive: false } });

    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffB.id });
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: staffB.id, isActiveStaff: true });
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.ownerId).toBe(staffB.id);
  });

  it("API-45: GET detail marks an owner no longer active IT Staff as isActiveStaff:false (AC-78)", async () => {
    const staffD = await createUser({ email: "d@detail.test", password: PW, name: "Dan Demoted", role: "IT_STAFF", mustChangePassword: false });
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffD.id });
    await prisma.user.update({ where: { id: staffD.id }, data: { isActive: false } });

    const res = await get(`/api/staff/tickets/${id}`, staffASession);
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: staffD.id, name: "Dan Demoted", isActiveStaff: false });
  });
});

// ── API-46 ────────────────────────────────────────────────────────────────────

describe("API-46: Change IT Priority (AC-45)", () => {
  it("API-46: valid change → 200, saved, Requested Priority unchanged", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id, requestedPriority: "MEDIUM", itPriority: "MEDIUM" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe("HIGH");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.itPriority).toBe("HIGH");
    expect(t!.requestedPriority).toBe("MEDIUM");
  });

  it("API-46: IT Priority is changeable while the Ticket is unassigned (BR-38)", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null, itPriority: "LOW" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe("HIGH");
  });

  it("API-46: an invalid IT Priority value → 400 errors.itPriority", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id, itPriority: "MEDIUM" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "URGENT" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.itPriority).toBeDefined();
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.itPriority).toBe("MEDIUM");
  });

  it("API-46: a Requester calling the IT Priority endpoint → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id, itPriority: "MEDIUM" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, requesterSession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(403);
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.itPriority).toBe("MEDIUM");
  });
});

// ── API-47 ────────────────────────────────────────────────────────────────────

describe("API-47: Allowed status transitions (AC-46)", () => {
  it("API-47: every allowed transition in the matrix succeeds with 200 and the new status", async () => {
    for (const from of ALL_STATUSES) {
      for (const to of MATRIX[from]) {
        const id = await makeTicket({ currentStatus: from, ownerId: staffA.id });
        const payload: Record<string, unknown> = { status: to };
        if (to === "RESOLVED") payload.resolutionSummary = "Resolved for the allowed-transition test.";
        if (to === "CLOSED" || to === "CANCELLED") payload.confirm = true;

        const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send(payload);
        expect(res.status, `${from} → ${to}`).toBe(200);
        expect(res.body.currentStatus, `${from} → ${to}`).toBe(to);

        const t = await prisma.ticket.findUnique({ where: { id } });
        expect(t!.currentStatus, `${from} → ${to} persisted`).toBe(to);
      }
    }
  });

  it("API-47: GET detail returns allowedTransitions for the current state and zero counts (IT Staff)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await get(`/api/staff/tickets/${id}`, staffASession);
    expect(res.status).toBe(200);
    expect(new Set(res.body.allowedTransitions)).toEqual(new Set(MATRIX.OPEN));
    expect(res.body.counts).toEqual({ publicComments: 0, internalNotes: 0 });
  });
});

// ── API-48 ────────────────────────────────────────────────────────────────────

describe("API-48: Disallowed status transitions (AC-46)", () => {
  it("API-48: every pair not in the matrix → 409 INVALID_TRANSITION listing the allowed targets", async () => {
    for (const from of ALL_STATUSES) {
      const allowed = new Set(MATRIX[from]);
      for (const to of ALL_STATUSES) {
        if (to === from || allowed.has(to)) continue;
        const id = await makeTicket({ currentStatus: from, ownerId: staffA.id });
        const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: to });
        expect(res.status, `${from} → ${to}`).toBe(409);
        expect(res.body.code, `${from} → ${to}`).toBe("INVALID_TRANSITION");
        expect(new Set(res.body.allowed), `${from} → ${to} allowed list`).toEqual(allowed);
        const t = await prisma.ticket.findUnique({ where: { id } });
        expect(t!.currentStatus, `${from} → ${to} unchanged`).toBe(from);
      }
    }
  });
});

// ── API-49 ────────────────────────────────────────────────────────────────────

describe("API-49: Resolve with and without a summary (AC-47)", () => {
  it("API-49: RESOLVED with no summary → 400 errors.resolutionSummary, status unchanged", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.resolutionSummary).toBeDefined();
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("OPEN");
  });

  it("API-49: a summary shorter than 10 characters → 400", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "RESOLVED", resolutionSummary: "too short" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.resolutionSummary).toBeDefined();
  });

  it("API-49: a summary longer than 1000 characters → 400", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "RESOLVED", resolutionSummary: "x".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.errors?.resolutionSummary).toBeDefined();
  });

  it("API-49: valid summary → 200, resolvedAt set, Requester indicator cleared, Requester can read the summary", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id, requesterResolvedAt: new Date() });
    const summary = "Replaced the faulty RAM module and verified boot.";
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "RESOLVED", resolutionSummary: summary });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("RESOLVED");
    expect(res.body.resolvedAt).toBeTruthy();

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.resolvedAt).not.toBeNull();
    expect(t!.requesterResolvedAt).toBeNull();
    expect(t!.resolutionSummary).toBe(summary);

    // Requester (owner of the Ticket) can read the summary on their detail view
    const reqRes = await get(`/api/tickets/${id}`, requesterSession);
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.resolutionSummary).toBe(summary);
  });
});

// ── API-50 ────────────────────────────────────────────────────────────────────

describe("API-50: Close and cancel with and without confirm (AC-48)", () => {
  it("API-50: CLOSED without confirm → 400 errors.confirm", async () => {
    const id = await makeTicket({ currentStatus: "RESOLVED", ownerId: staffA.id, resolvedAt: new Date(), resolutionSummary: "Fixed earlier." });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "CLOSED" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.confirm).toBeDefined();
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("RESOLVED");
  });

  it("API-50: CLOSED from RESOLVED with confirm → 200 and closedAt set", async () => {
    const id = await makeTicket({ currentStatus: "RESOLVED", ownerId: staffA.id, resolvedAt: new Date(), resolutionSummary: "Fixed earlier." });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "CLOSED", confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("CLOSED");
    expect(res.body.closedAt).toBeTruthy();
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.closedAt).not.toBeNull();
  });

  it("API-50: CANCELLED without confirm → 400 errors.confirm", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "CANCELLED" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.confirm).toBeDefined();
  });

  it("API-50: CANCELLED with confirm → 200 and closedAt stays null", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "CANCELLED", confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("CANCELLED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.closedAt).toBeNull();
  });
});

// ── API-51 ────────────────────────────────────────────────────────────────────

describe("API-51: Reopen from RESOLVED and CLOSED (AC-49)", () => {
  it("API-51: REOPENED from RESOLVED clears resolvedAt and the indicator, keeps the summary", async () => {
    const id = await makeTicket({ currentStatus: "RESOLVED", ownerId: staffA.id, resolvedAt: new Date(), resolutionSummary: "Original fix.", requesterResolvedAt: new Date() });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "REOPENED" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("REOPENED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.resolvedAt).toBeNull();
    expect(t!.closedAt).toBeNull();
    expect(t!.requesterResolvedAt).toBeNull();
    expect(t!.resolutionSummary).toBe("Original fix."); // kept until replaced (BR-37)
  });

  it("API-51: REOPENED from CLOSED clears resolvedAt and closedAt, keeps the summary", async () => {
    const id = await makeTicket({ currentStatus: "CLOSED", ownerId: staffA.id, resolvedAt: new Date(), closedAt: new Date(), resolutionSummary: "Closed fix." });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "REOPENED" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("REOPENED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.resolvedAt).toBeNull();
    expect(t!.closedAt).toBeNull();
    expect(t!.resolutionSummary).toBe("Closed fix.");
  });
});

// ── API-52 ────────────────────────────────────────────────────────────────────

describe("API-52: Status change on an unassigned Ticket (AC-50)", () => {
  it("API-52: a valid transition on an unassigned Ticket → 409 TICKET_UNASSIGNED", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: null });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_UNASSIGNED");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("OPEN");
  });

  it("API-52: NEW → OPEN on an unassigned Ticket also requires a claim first → 409 TICKET_UNASSIGNED", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_UNASSIGNED");
  });
});

// ── API-53 ────────────────────────────────────────────────────────────────────

describe("API-53: Owner/IT Priority on CLOSED/CANCELLED; status from CLOSED/CANCELLED (AC-51)", () => {
  it("API-53: owner change on a CLOSED Ticket → 409 TICKET_CLOSED", async () => {
    const id = await makeTicket({ currentStatus: "CLOSED", ownerId: staffA.id, closedAt: new Date() });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffB.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it("API-53: IT Priority change on a CLOSED Ticket → 409 TICKET_CLOSED", async () => {
    const id = await makeTicket({ currentStatus: "CLOSED", ownerId: staffA.id, itPriority: "LOW", closedAt: new Date() });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it("API-53: owner change on a CANCELLED Ticket → 409 TICKET_CLOSED", async () => {
    const id = await makeTicket({ currentStatus: "CANCELLED", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffB.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it("API-53: IT Priority change on a CANCELLED Ticket → 409 TICKET_CLOSED", async () => {
    const id = await makeTicket({ currentStatus: "CANCELLED", ownerId: staffA.id, itPriority: "LOW" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it("API-53: CLOSED → REOPENED is allowed → 200", async () => {
    const id = await makeTicket({ currentStatus: "CLOSED", ownerId: staffA.id, closedAt: new Date(), resolvedAt: new Date() });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "REOPENED" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("REOPENED");
  });

  it("API-53: any status change from CANCELLED → 409 INVALID_TRANSITION (terminal, empty allowed)", async () => {
    const id = await makeTicket({ currentStatus: "CANCELLED", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
    expect(res.body.allowed).toEqual([]);
  });
});

// ── API-54 ────────────────────────────────────────────────────────────────────

describe("API-54: Staff attachment download; no staff upload or remove (AC-55)", () => {
  it("API-54: IT Staff downloads an active attachment → 200 file stream", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const uploadDir = path.join(process.cwd(), "uploads", "lab-02");
    await fs.mkdir(uploadDir, { recursive: true });
    const storedFileName = `det-${Date.now()}-active.pdf`;
    await fs.writeFile(path.join(uploadDir, storedFileName), Buffer.from("%PDF-1.4 staff download test"));
    const attachment = await prisma.attachment.create({
      data: { ticketId: id, fileName: "report.pdf", storedFileName, mimeType: "application/pdf", sizeBytes: 28 },
    });

    const res = await get(`/api/staff/tickets/${id}/attachments/${attachment.id}/download`, staffASession);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("report.pdf");
  });

  it("API-54: downloading a removed attachment → 410", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const attachment = await prisma.attachment.create({
      data: { ticketId: id, fileName: "gone.pdf", storedFileName: `det-${Date.now()}-removed.pdf`, mimeType: "application/pdf", sizeBytes: 10, removedAt: new Date(), removalReason: "Uploaded by mistake" },
    });
    const res = await get(`/api/staff/tickets/${id}/attachments/${attachment.id}/download`, staffASession);
    expect(res.status).toBe(410);
  });

  it("API-54: there is no staff upload route → POST /api/staff/tickets/:id/attachments → 404", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await post(`/api/staff/tickets/${id}/attachments`, staffASession).send({});
    expect(res.status).toBe(404);
  });

  it("API-54: there is no staff remove route → DELETE /api/staff/tickets/:id/attachments/:attachmentId → 404", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await del(`/api/staff/tickets/${id}/attachments/1`, staffASession).send({ reason: "nope" });
    expect(res.status).toBe(404);
  });

  it("API-54: IT Staff calling the Requester upload endpoint → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await post(`/api/tickets/${id}/attachments`, staffASession).send({});
    expect(res.status).toBe(403);
  });

  it("API-54: IT Staff calling the Requester attachment-remove endpoint → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await del(`/api/tickets/${id}/attachments/1`, staffASession).send({ reason: "remove please" });
    expect(res.status).toBe(403);
  });
});

// ── API-64 ────────────────────────────────────────────────────────────────────

describe("API-64: Two simultaneous claims on one unassigned Ticket (AC-79)", () => {
  it("API-64: exactly one claim succeeds (200) and the other receives 409 ALREADY_OWNED", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    const [r1, r2] = await Promise.all([
      post(`/api/staff/tickets/${id}/claim`, staffASession),
      post(`/api/staff/tickets/${id}/claim`, staffBSession),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.code).toBe("ALREADY_OWNED");

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect([staffA.id, staffB.id]).toContain(t!.ownerId);
    expect(t!.currentStatus).toBe("OPEN");
  });
});

// ── API-67 ────────────────────────────────────────────────────────────────────

describe("API-67: Same-value changes and invalid-transition body (AC-82)", () => {
  it("API-67: setting the status to its current value → 409 NO_CHANGE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_CHANGE");
  });

  it("API-67: reassigning to the current owner → 409 NO_CHANGE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/owner`, staffASession).send({ ownerId: staffA.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_CHANGE");
  });

  it("API-67: setting IT Priority to its current value → 409 NO_CHANGE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: staffA.id, itPriority: "MEDIUM" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, staffASession).send({ itPriority: "MEDIUM" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_CHANGE");
  });

  it("API-67: an invalid transition returns 409 INVALID_TRANSITION listing the allowed targets", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: staffA.id });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
    expect(new Set(res.body.allowed)).toEqual(new Set(MATRIX.NEW));
  });
});

// ── API-69 ────────────────────────────────────────────────────────────────────

describe("API-69: Status change on an unassigned CANCELLED Ticket (AC-84)", () => {
  it("API-69: INVALID_TRANSITION is returned before TICKET_UNASSIGNED", async () => {
    const id = await makeTicket({ currentStatus: "CANCELLED", ownerId: null });
    const res = await patch(`/api/staff/tickets/${id}/status`, staffASession).send({ status: "OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
  });
});
