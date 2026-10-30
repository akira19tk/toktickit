// Actions Taken — API + authorization (Issue #50)
// Covers every #50 row in docs/lab-04/tests.md:
//   API-L4-01  Create a valid Action (AC-01)
//   API-L4-02  Assign to active vs inactive staff/admin (AC-02)
//   API-L4-03  Assign to a Requester / unknown id (AC-03)
//   API-L4-04  Complete OPEN with/without result; complete non-OPEN (AC-04)
//   API-L4-05  Cancel OPEN then repeat (AC-05)
//   API-L4-06  Edit a COMPLETED/CANCELLED Action (AC-06)
//   API-L4-07  followUpRequired true with empty note; valid note (AC-07)
//   API-L4-08  Create/edit Action on RESOLVED/CLOSED/CANCELLED Ticket (AC-14)
//   API-L4-09  Multiple Actions list order — newest-first, stable (AC-19)
//   API-L4-10  Staff B (not author) edits/completes staff A's Action (AC-22)
//   API-L4-11  Action PATCH with stale/omitted expectedUpdatedAt (AC-13)
//   API-L4-12  Requester reads own Ticket Actions; non-owned (AC-08)
//   API-L4-13  Requester attempts Action write under /staff/* (AC-09)
//   API-L4-14  Admin creates/updates Action (AC-18)
//   API-L4-31  Create on RESOLVED, then reopen and create (AC-14)
//   API-L4-32  Requester read model excludes Internal Notes; 404; /notes 403 (AC-28)
//   API-L4-33  404 edge cases (unknown actionId / unknown Ticket) (AC-29)
//   API-L4-34  400 field bounds (AC-30)

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { TicketStatus, ActionStatus } from "@prisma/client";

const app = createApp();
const PW = "Action#1234";

// Exact set of keys the Action object exposes (api-spec §1). Used to prove the
// Requester read model carries only Action fields — no Internal Note leakage.
const ACTION_KEYS = [
  "id", "ticketId", "actionDate", "description", "result", "status",
  "followUpRequired", "followUpNote", "attachmentNotes",
  "performedBy", "assignee", "updatedBy", "createdAt", "updatedAt",
].sort();

// Users
let requester: { id: number };
let requester2: { id: number };
let staffA: { id: number; name: string };
let staffB: { id: number; name: string };
let staffInactive: { id: number };
let admin: { id: number; name: string };
let adminInactive: { id: number };

let staffASession: string;
let staffBSession: string;
let adminSession: string;
let requesterSession: string;
let requester2Session: string;

let catId: number;
let sysId: number;
let seq = 0;

async function makeTicket(overrides: {
  ownerId?: number | null;
  currentStatus?: TicketStatus;
  requesterId?: number;
} = {}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-ACT-${String(seq).padStart(4, "0")}`,
      requesterId: overrides.requesterId ?? requester.id,
      ownerId: overrides.ownerId ?? staffA.id,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: "Actions test ticket",
      description: "Seeded for actions-taken API tests.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "OPEN",
    },
  });
  return t.id;
}

async function makeAction(ticketId: number, overrides: {
  status?: ActionStatus;
  performedById?: number;
  result?: string | null;
  createdAt?: Date;
  assigneeId?: number | null;
} = {}): Promise<{ id: number; updatedAt: Date }> {
  const a = await prisma.actionTaken.create({
    data: {
      ticketId,
      description: "Seeded action.",
      performedById: overrides.performedById ?? staffA.id,
      status: overrides.status ?? "OPEN",
      result: overrides.result ?? null,
      assigneeId: overrides.assigneeId ?? null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
  return { id: a.id, updatedAt: a.updatedAt };
}

const get = (p: string, session: string) =>
  request(app).get(p).set("Cookie", session);
const post = (p: string, session: string) =>
  request(app).post(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");
const patch = (p: string, session: string) =>
  request(app).patch(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");

const countActions = () => prisma.actionTaken.count();

beforeAll(async () => {
  await clearDatabase();

  requester = await createUser({ email: "req@act.test", password: PW, name: "Rita Requester", role: "REQUESTER", mustChangePassword: false });
  requester2 = await createUser({ email: "req2@act.test", password: PW, name: "Rudy Requester", role: "REQUESTER", mustChangePassword: false });
  staffA = await createUser({ email: "a@act.test", password: PW, name: "Aaron Staff", role: "IT_STAFF", mustChangePassword: false });
  staffB = await createUser({ email: "b@act.test", password: PW, name: "Bianca Staff", role: "IT_STAFF", mustChangePassword: false });
  staffInactive = await createUser({ email: "inactive@act.test", password: PW, name: "Ingrid Inactive", role: "IT_STAFF", isActive: false, mustChangePassword: false });
  admin = await createUser({ email: "admin@act.test", password: PW, name: "Ada Admin", role: "ADMIN", mustChangePassword: false });
  adminInactive = await createUser({ email: "admininactive@act.test", password: PW, name: "Alan Inactive-Admin", role: "ADMIN", isActive: false, mustChangePassword: false });

  staffASession = await loginAs(app, { email: "a@act.test", password: PW });
  staffBSession = await loginAs(app, { email: "b@act.test", password: PW });
  adminSession = await loginAs(app, { email: "admin@act.test", password: PW });
  requesterSession = await loginAs(app, { email: "req@act.test", password: PW });
  requester2Session = await loginAs(app, { email: "req2@act.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  void requester2; void staffInactive; void adminInactive;
});

// ── API-L4-01 ───────────────────────────────────────────────────────────────

describe("API-L4-01: Create a valid Action (AC-01)", () => {
  it("API-L4-01: 201 under correct Ticket; performedBy=creator; status OPEN; updatedBy null", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      actionDate: "2026-10-28T02:30:00.000Z",
      description: "Replaced the faulty RAM module and re-ran diagnostics.",
    });
    expect(res.status).toBe(201);
    expect(res.body.ticketId).toBe(id);
    expect(res.body.performedBy).toMatchObject({ id: staffA.id, name: staffA.name });
    expect(res.body.status).toBe("OPEN");
    expect(res.body.updatedBy).toBeNull();

    const row = await prisma.actionTaken.findUnique({ where: { id: res.body.id } });
    expect(row!.performedById).toBe(staffA.id);
    expect(row!.ticketId).toBe(id);
    expect(row!.updatedById).toBeNull();
  });

  it("API-L4-01: performedBy is taken from the session, ignoring any client-supplied value", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Session identity wins.",
      performedById: staffB.id, // must be ignored
      updatedById: staffB.id,   // must be ignored
    });
    expect(res.status).toBe(201);
    expect(res.body.performedBy.id).toBe(staffA.id);
    expect(res.body.updatedBy).toBeNull();
  });
});

// ── API-L4-02 ───────────────────────────────────────────────────────────────

describe("API-L4-02: Assign to active vs inactive staff/admin (AC-02)", () => {
  it("API-L4-02: assign to an active IT Staff → 201 and assignee set", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Assigned action.", assigneeId: staffB.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.assignee).toMatchObject({ id: staffB.id, name: staffB.name });
  });

  it("API-L4-02: assign to an active Admin → 201 (admins are valid assignees)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Assigned to admin.", assigneeId: admin.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.assignee.id).toBe(admin.id);
  });

  it("API-L4-02: assign to an inactive IT Staff → 422 ASSIGNEE_INACTIVE, nothing written", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const before = await countActions();
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Should not persist.", assigneeId: staffInactive.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ASSIGNEE_INACTIVE");
    expect(await countActions()).toBe(before);
  });

  it("API-L4-02: assign to an inactive Admin → 422 ASSIGNEE_INACTIVE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Should not persist.", assigneeId: adminInactive.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ASSIGNEE_INACTIVE");
  });
});

// ── API-L4-03 ───────────────────────────────────────────────────────────────

describe("API-L4-03: Assign to a Requester / unknown id (AC-03)", () => {
  it("API-L4-03: assign to a Requester → 422 INVALID_ASSIGNEE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Bad assignee.", assigneeId: requester.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("INVALID_ASSIGNEE");
  });

  it("API-L4-03: assign to an unknown user id → 422 INVALID_ASSIGNEE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Bad assignee.", assigneeId: 999999,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("INVALID_ASSIGNEE");
  });
});

// ── API-L4-04 ───────────────────────────────────────────────────────────────

describe("API-L4-04: Complete OPEN with/without result; complete non-OPEN (AC-04)", () => {
  it("API-L4-04: complete an OPEN Action with a result → 200 COMPLETED", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      status: "COMPLETED", result: "All memory tests pass.",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.result).toBe("All memory tests pass.");
  });

  it("API-L4-04: complete an OPEN Action with no result → 400, unchanged", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { result: null });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      status: "COMPLETED",
    });
    expect(res.status).toBe(400);
    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    expect(row!.status).toBe("OPEN");
  });

  it("API-L4-04: complete a non-OPEN Action → 409 INVALID_ACTION_STATE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { status: "COMPLETED", result: "Already done." });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      status: "COMPLETED",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_ACTION_STATE");
  });
});

// ── API-L4-05 ───────────────────────────────────────────────────────────────

describe("API-L4-05: Cancel OPEN then repeat (AC-05)", () => {
  it("API-L4-05: cancel an OPEN Action → 200 CANCELLED; repeat → 409 INVALID_ACTION_STATE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const first = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({ status: "CANCELLED" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("CANCELLED");

    const second = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({ status: "CANCELLED" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("INVALID_ACTION_STATE");
  });
});

// ── API-L4-06 ───────────────────────────────────────────────────────────────

describe("API-L4-06: Edit a COMPLETED/CANCELLED Action (AC-06)", () => {
  it("API-L4-06: editing a COMPLETED Action's fields → 400 (read-only history)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { status: "COMPLETED", result: "Done." });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      description: "Trying to rewrite history.",
    });
    expect(res.status).toBe(400);
  });

  it("API-L4-06: editing a CANCELLED Action's fields → 400 (read-only history)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { status: "CANCELLED" });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      attachmentNotes: "late note",
    });
    expect(res.status).toBe(400);
  });
});

// ── API-L4-07 ───────────────────────────────────────────────────────────────

describe("API-L4-07: follow-up note rule on create (AC-07)", () => {
  it("API-L4-07: followUpRequired true with empty note → 400 errors.followUpNote", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Needs follow-up.", followUpRequired: true, followUpNote: "   ",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.followUpNote).toBeDefined();
  });

  it("API-L4-07: followUpRequired true with a valid note → 201", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Needs follow-up.", followUpRequired: true, followUpNote: "Confirm after 24h.",
    });
    expect(res.status).toBe(201);
    expect(res.body.followUpRequired).toBe(true);
    expect(res.body.followUpNote).toBe("Confirm after 24h.");
  });
});

// ── API-L4-08 ───────────────────────────────────────────────────────────────

describe("API-L4-08: Actions on RESOLVED/CLOSED/CANCELLED Tickets → 409 TICKET_CLOSED (AC-14)", () => {
  for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as TicketStatus[]) {
    it(`API-L4-08: create on a ${status} Ticket → 409 TICKET_CLOSED`, async () => {
      const id = await makeTicket({ currentStatus: status });
      const before = await countActions();
      const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
        description: "Should be blocked.",
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("TICKET_CLOSED");
      expect(await countActions()).toBe(before);
    });
  }

  it("API-L4-08: edit an Action under a RESOLVED Ticket → 409 TICKET_CLOSED", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    await prisma.ticket.update({ where: { id }, data: { currentStatus: "RESOLVED" } });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      description: "Edit under resolved ticket.",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });
});

// ── API-L4-09 ───────────────────────────────────────────────────────────────

describe("API-L4-09: Multiple Actions list order — newest-first, stable (AC-19)", () => {
  it("API-L4-09: ordered by createdAt desc, then id desc as a stable tie-breaker", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const t1 = new Date("2026-10-20T00:00:00.000Z");
    const t2 = new Date("2026-10-21T00:00:00.000Z");
    const t3 = new Date("2026-10-22T00:00:00.000Z");
    const a1 = await makeAction(id, { createdAt: t1 });
    const a2 = await makeAction(id, { createdAt: t2 });
    const a3 = await makeAction(id, { createdAt: t2 }); // same instant as a2, larger id
    const a4 = await makeAction(id, { createdAt: t3 });

    const res = await get(`/api/staff/tickets/${id}/actions`, staffASession);
    expect(res.status).toBe(200);
    const ids = res.body.actions.map((x: { id: number }) => x.id);
    expect(ids).toEqual([a4.id, a3.id, a2.id, a1.id]);
  });
});

// ── API-L4-10 ───────────────────────────────────────────────────────────────

describe("API-L4-10: Staff B (not author) edits/completes staff A's Action (AC-22)", () => {
  it("API-L4-10: 200; updatedBy=B; updatedAt refreshed", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { performedById: staffA.id });
    const before = (await prisma.actionTaken.findUnique({ where: { id: a.id } }))!.updatedAt;

    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffBSession).send({
      status: "COMPLETED", result: "Finished by a different staff member.",
    });
    expect(res.status).toBe(200);
    expect(res.body.updatedBy).toMatchObject({ id: staffB.id, name: staffB.name });
    expect(res.body.performedBy.id).toBe(staffA.id);

    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    expect(row!.updatedById).toBe(staffB.id);
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });
});

// ── API-L4-11 ───────────────────────────────────────────────────────────────

describe("API-L4-11: Action PATCH optimistic concurrency (AC-13)", () => {
  it("API-L4-11: stale expectedUpdatedAt → 409 STALE_UPDATE, nothing written", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const stale = new Date(Date.now() - 60_000).toISOString();
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      description: "Should not apply.", expectedUpdatedAt: stale,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_UPDATE");
    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    expect(row!.description).toBe("Seeded action.");
  });

  it("API-L4-11: correct expectedUpdatedAt → 200", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      description: "Applied with a fresh token.",
      expectedUpdatedAt: row!.updatedAt.toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Applied with a fresh token.");
  });

  it("API-L4-11: omitted expectedUpdatedAt → proceeds (Lab 3 clients keep working)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      description: "No token supplied.",
    });
    expect(res.status).toBe(200);
  });
});

// ── API-L4-12 ───────────────────────────────────────────────────────────────

describe("API-L4-12: Requester reads own Ticket Actions; non-owned (AC-08)", () => {
  it("API-L4-12: owner → 200, all fields, newest-first", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    await makeAction(id, { createdAt: new Date("2026-10-20T00:00:00.000Z") });
    const newer = await makeAction(id, { createdAt: new Date("2026-10-21T00:00:00.000Z") });

    const res = await get(`/api/tickets/${id}/actions`, requesterSession);
    expect(res.status).toBe(200);
    expect(res.body.actions[0].id).toBe(newer.id);
    expect(Object.keys(res.body.actions[0]).sort()).toEqual(ACTION_KEYS);
  });

  it("API-L4-12: a Requester reading a Ticket they do not own → 404", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    await makeAction(id);
    const res = await get(`/api/tickets/${id}/actions`, requester2Session);
    expect(res.status).toBe(404);
  });
});

// ── API-L4-13 ───────────────────────────────────────────────────────────────

describe("API-L4-13: Requester attempts Action write under /staff/* (AC-09)", () => {
  it("API-L4-13: POST /api/staff/.../actions as a Requester → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    const res = await post(`/api/staff/tickets/${id}/actions`, requesterSession).send({
      description: "Requester should not write.",
    });
    expect(res.status).toBe(403);
  });

  it("API-L4-13: PATCH /api/staff/.../actions/:id as a Requester → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    const a = await makeAction(id);
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, requesterSession).send({ status: "CANCELLED" });
    expect(res.status).toBe(403);
  });
});

// ── API-L4-14 ───────────────────────────────────────────────────────────────

describe("API-L4-14: Admin creates/updates Action (AC-18)", () => {
  it("API-L4-14: Admin POST → 201; Admin PATCH → 200", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const createRes = await post(`/api/staff/tickets/${id}/actions`, adminSession).send({
      description: "Created by an administrator.",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.performedBy.id).toBe(admin.id);

    const patchRes = await patch(`/api/staff/tickets/${id}/actions/${createRes.body.id}`, adminSession).send({
      status: "COMPLETED", result: "Closed out by admin.",
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.updatedBy.id).toBe(admin.id);
  });
});

// ── API-L4-31 ───────────────────────────────────────────────────────────────

describe("API-L4-31: Create on RESOLVED, then reopen and create (AC-14)", () => {
  it("API-L4-31: 409 TICKET_CLOSED on RESOLVED; after → REOPENED, 201", async () => {
    const id = await makeTicket({ currentStatus: "RESOLVED" });
    const blocked = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Blocked while resolved.",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("TICKET_CLOSED");

    await prisma.ticket.update({ where: { id }, data: { currentStatus: "REOPENED" } });
    const ok = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Allowed after reopen.",
    });
    expect(ok.status).toBe(201);
  });
});

// ── API-L4-32 ───────────────────────────────────────────────────────────────

describe("API-L4-32: Requester read model excludes Internal Notes (AC-28)", () => {
  it("API-L4-32: payload carries only Action fields; no Internal Note content", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    await makeAction(id);
    const secret = "INTERNAL-NOTE-SECRET-TOKEN";
    await prisma.internalNote.create({ data: { ticketId: id, authorId: staffA.id, body: secret } });

    const res = await get(`/api/tickets/${id}/actions`, requesterSession);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.actions[0]).sort()).toEqual(ACTION_KEYS);
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("API-L4-32: non-owned read → 404", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    await makeAction(id);
    const res = await get(`/api/tickets/${id}/actions`, requester2Session);
    expect(res.status).toBe(404);
  });

  it("API-L4-32: a Requester hitting the staff /notes route → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    const res = await get(`/api/staff/tickets/${id}/notes`, requesterSession);
    expect(res.status).toBe(403);
  });
});

// ── API-L4-33 ───────────────────────────────────────────────────────────────

describe("API-L4-33: 404 edge cases (AC-29)", () => {
  it("API-L4-33: PATCH an unknown actionId under a valid Ticket → 404", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await patch(`/api/staff/tickets/${id}/actions/999999`, staffASession).send({ status: "CANCELLED" });
    expect(res.status).toBe(404);
  });

  it("API-L4-33: PATCH an Action that belongs to a different Ticket → 404", async () => {
    const idA = await makeTicket({ currentStatus: "OPEN" });
    const idB = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(idA);
    const res = await patch(`/api/staff/tickets/${idB}/actions/${a.id}`, staffASession).send({ status: "CANCELLED" });
    expect(res.status).toBe(404);
  });

  it("API-L4-33: GET actions on an unknown Ticket → 404", async () => {
    const res = await get(`/api/staff/tickets/999999/actions`, staffASession);
    expect(res.status).toBe(404);
  });

  it("API-L4-33: POST actions on an unknown Ticket → 404", async () => {
    const res = await post(`/api/staff/tickets/999999/actions`, staffASession).send({ description: "nope" });
    expect(res.status).toBe(404);
  });
});

// ── API-L4-34 ───────────────────────────────────────────────────────────────

describe("API-L4-34: 400 field bounds (AC-30)", () => {
  it("API-L4-34: empty description → 400 errors.description, nothing written", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const before = await countActions();
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({ description: "   " });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors?.description).toBeDefined();
    expect(await countActions()).toBe(before);
  });

  it("API-L4-34: description over 2000 chars → 400 errors.description", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({ description: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.errors?.description).toBeDefined();
  });

  it("API-L4-34: actionDate in the future → 400 errors.actionDate", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "Future work?", actionDate: future,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.actionDate).toBeDefined();
  });

  it("API-L4-34: attachmentNotes over 500 chars → 400 errors.attachmentNotes", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "ok", attachmentNotes: "y".repeat(501),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.attachmentNotes).toBeDefined();
  });

  it("API-L4-34: followUpNote over 1000 chars → 400 errors.followUpNote", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/actions`, staffASession).send({
      description: "ok", followUpRequired: true, followUpNote: "z".repeat(1001),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors?.followUpNote).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Added in response to the PR #59 review (see docs/lab-04/reviewer.md).
// ─────────────────────────────────────────────────────────────────────────────

// ── API-L4-35 ───────────────────────────────────────────────────────────────
// Review item 1 (error handling): when a single PATCH violates several rules at
// once, the response code must follow api-spec §6:
//   400 fields → 422 assignee → 409 TICKET_CLOSED → INVALID_ACTION_STATE → STALE_UPDATE

describe("API-L4-35: PATCH error-ordering when several rules are violated (AC-14)", () => {
  it("API-L4-35: invalid transition on a CLOSED Ticket → TICKET_CLOSED wins over INVALID_ACTION_STATE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    // A terminal Action (COMPLETED→COMPLETED is an illegal transition) under a
    // Ticket we then close, plus a stale token — three conflicting signals.
    const a = await makeAction(id, { status: "COMPLETED", result: "Done." });
    await prisma.ticket.update({ where: { id }, data: { currentStatus: "CLOSED" } });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      status: "COMPLETED",
      expectedUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED"); // precedes INVALID_ACTION_STATE & STALE_UPDATE
  });

  it("API-L4-35: 422 assignee precedes 409 TICKET_CLOSED on a RESOLVED Ticket", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    await prisma.ticket.update({ where: { id }, data: { currentStatus: "RESOLVED" } });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      assigneeId: staffInactive.id, // 422 ASSIGNEE_INACTIVE, which comes before 409
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ASSIGNEE_INACTIVE");
  });
});

// ── API-L4-36 ───────────────────────────────────────────────────────────────
// Review item 2 (authorization / data exposure). API-L4-12 and API-L4-32 already
// prove owner-only access, the top-level field whitelist, and that no Internal
// Note body leaks. This adds the missing nested-user-field assertion: performedBy
// / assignee / updatedBy expose only {id,name} — never email, role, or passwordHash.

describe("API-L4-36: Requester Action view exposes no extra user fields (AC-28)", () => {
  it("API-L4-36: nested user refs are exactly {id,name}; no email/role/passwordHash anywhere", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    // An Action touching every user ref: performed by A, assigned to B, edited by B.
    const a = await makeAction(id, { performedById: staffA.id, assigneeId: staffB.id });
    await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffBSession).send({
      description: "Edited to populate updatedBy.",
    });

    const res = await get(`/api/tickets/${id}/actions`, requesterSession);
    expect(res.status).toBe(200);
    const action = res.body.actions[0];
    for (const key of ["performedBy", "assignee", "updatedBy"] as const) {
      expect(action[key]).not.toBeNull();
      expect(Object.keys(action[key]).sort()).toEqual(["id", "name"]);
    }
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("email");
    expect(raw).not.toContain("role");
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("@act.test"); // no email value leaked either
  });
});

// ── API-L4-37 ───────────────────────────────────────────────────────────────
// Review item 3 (concurrency). Two PATCHes carrying the SAME expectedUpdatedAt,
// fired in parallel: exactly one 200 and one 409 STALE_UPDATE, and the persisted
// row matches the winner (no lost update, no inconsistent state).

describe("API-L4-37: Concurrent PATCH with the same expectedUpdatedAt (AC-13)", () => {
  it("API-L4-37: exactly one 200, one 409 STALE_UPDATE, final DB matches the winner", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const token = (await prisma.actionTaken.findUnique({ where: { id: a.id } }))!.updatedAt.toISOString();

    const [r1, r2] = await Promise.all([
      patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
        description: "concurrent-A", expectedUpdatedAt: token,
      }),
      patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffBSession).send({
        description: "concurrent-B", expectedUpdatedAt: token,
      }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winner = r1.status === 200 ? r1 : r2;
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.code).toBe("STALE_UPDATE");

    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    expect(["concurrent-A", "concurrent-B"]).toContain(row!.description);
    expect(row!.description).toBe(winner.body.description); // DB == winner's write
  });
});

// ── API-L4-38 ───────────────────────────────────────────────────────────────
// Review item 4 (PATCH edge cases). Requester-PATCH-403 (API-L4-13), edit of a
// non-OPEN Action (API-L4-06) and complete-without-result (API-L4-04) are already
// covered on PATCH; the gap was assignee semantics on PATCH (only create was
// tested, by API-L4-02/03). This closes it.

describe("API-L4-38: PATCH assignee semantics (AC-02, AC-03)", () => {
  it("API-L4-38: reassign to an active Admin → 200 and assignee updated", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      assigneeId: admin.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.assignee.id).toBe(admin.id);
  });

  it("API-L4-38: reassign to an inactive staff/admin → 422 ASSIGNEE_INACTIVE, unchanged", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id, { assigneeId: staffB.id });
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      assigneeId: staffInactive.id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ASSIGNEE_INACTIVE");
    const row = await prisma.actionTaken.findUnique({ where: { id: a.id } });
    expect(row!.assigneeId).toBe(staffB.id); // unchanged
  });

  it("API-L4-38: reassign to a Requester / unknown id → 422 INVALID_ASSIGNEE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const a = await makeAction(id);
    const toRequester = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      assigneeId: requester.id,
    });
    expect(toRequester.status).toBe(422);
    expect(toRequester.body.code).toBe("INVALID_ASSIGNEE");

    const toUnknown = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, staffASession).send({
      assigneeId: 999999,
    });
    expect(toUnknown.status).toBe(422);
    expect(toUnknown.body.code).toBe("INVALID_ASSIGNEE");
  });

  it("API-L4-38: a Requester PATCH under /staff/* stays 403 (role gate, re-confirmed)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", requesterId: requester.id });
    const a = await makeAction(id);
    const res = await patch(`/api/staff/tickets/${id}/actions/${a.id}`, requesterSession).send({
      description: "nope",
    });
    expect(res.status).toBe(403);
  });
});
