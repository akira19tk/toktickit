// Ticket workflow — transition matrix, resolution gate, Admin status writes,
// concurrency (Issue #51; closes #38).
// Covers every #51 row in docs/lab-04/tests.md:
//   API-L4-15  Resolve with OPEN Action; all COMPLETED/CANCELLED; zero-Action (AC-10)
//   API-L4-16  Transition matrix over the API (AC-11)
//   API-L4-17  RESOLVED request violating several rules at once — ordering (AC-12)
//   API-L4-18  Status PATCH with stale/correct/omitted expectedUpdatedAt (AC-13)
//   API-L4-19  Admin changes status (200); admin claim/owner/priority/comment/note (403) (AC-18)
//   API-L4-20  Double-submitted status transition — consistent state (AC-21)
//   API-L4-30  Concurrent resolve + new-Action-create on an all-completed Ticket (AC-27)
//
// The resolution gate (BR-12/15/23) runs the OPEN-Actions check and the status
// UPDATE in one serializable transaction; a serialization failure retries once
// then fails safe with 409 STALE_UPDATE. Admin is now permitted on …/status
// (spec §11.4) but stays read-only on claim/owner/it-priority/comments/notes.

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { TicketStatus, ActionStatus } from "@prisma/client";

const app = createApp();
const PW = "Workflow#1234";

// Independent copy of the ticket transition matrix (BR-14 as implemented — the
// Lab 3 matrix is preserved, including NEW → IN_PROGRESS; the BR-14 doc table
// dropping that edge is a transcription error corrected in this PR). The test
// fails if the source drifts, so it is NOT imported from the source.
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
const VALID_SUMMARY = "Replaced the faulty component and verified the fix.";

let requester: { id: number };
let staffA: { id: number; name: string };
let staffB: { id: number; name: string };
let admin: { id: number; name: string };

let staffASession: string;
let adminSession: string;
let requesterSession: string;

let catId: number;
let sysId: number;
let seq = 0;

async function makeTicket(overrides: {
  ownerId?: number | null;
  currentStatus?: TicketStatus;
} = {}): Promise<number> {
  seq += 1;
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-WF-${String(seq).padStart(4, "0")}`,
      requesterId: requester.id,
      ownerId: overrides.ownerId !== undefined ? overrides.ownerId : staffA.id,
      categoryId: catId,
      relatedSystemId: sysId,
      summary: "Workflow test ticket",
      description: "Seeded for ticket-workflow API tests.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "OPEN",
    },
  });
  return t.id;
}

async function makeAction(
  ticketId: number,
  status: ActionStatus = "OPEN"
): Promise<number> {
  const a = await prisma.actionTaken.create({
    data: {
      ticketId,
      description: "Seeded action.",
      performedById: staffA.id,
      status,
      result: status === "COMPLETED" ? "Done." : null,
    },
  });
  return a.id;
}

const get = (p: string, session: string) =>
  request(app).get(p).set("Cookie", session);
const post = (p: string, session: string) =>
  request(app).post(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");
const patch = (p: string, session: string) =>
  request(app).patch(p).set("Cookie", session).set("X-Requested-With", "TokTickIT");

const setStatus = (id: number, session: string) =>
  patch(`/api/staff/tickets/${id}/status`, session);

beforeAll(async () => {
  await clearDatabase();

  requester = await createUser({ email: "req@wf.test", password: PW, name: "Rita Requester", role: "REQUESTER", mustChangePassword: false });
  staffA = await createUser({ email: "a@wf.test", password: PW, name: "Aaron Staff", role: "IT_STAFF", mustChangePassword: false });
  staffB = await createUser({ email: "b@wf.test", password: PW, name: "Bianca Staff", role: "IT_STAFF", mustChangePassword: false });
  admin = await createUser({ email: "admin@wf.test", password: PW, name: "Ada Admin", role: "ADMIN", mustChangePassword: false });

  staffASession = await loginAs(app, { email: "a@wf.test", password: PW });
  adminSession = await loginAs(app, { email: "admin@wf.test", password: PW });
  requesterSession = await loginAs(app, { email: "req@wf.test", password: PW });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catId = cat!.id;
  sysId = sys!.id;

  void staffB;
});

// ── API-L4-15 ─────────────────────────────────────────────────────────────────
// Resolution gate (AC-10, BR-12): an OPEN Action blocks RESOLVED; once every
// Action is COMPLETED/CANCELLED (or there are none) a valid summary resolves.

describe("API-L4-15: Resolution gate on RESOLVED (AC-10)", () => {
  it("API-L4-15: RESOLVED with an OPEN Action → 409 OPEN_ACTIONS_EXIST, nothing written", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "OPEN");

    const res = await setStatus(id, staffASession).send({
      status: "RESOLVED",
      resolutionSummary: VALID_SUMMARY,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OPEN_ACTIONS_EXIST");
    expect(res.body.openActions).toBe(1);

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("OPEN");
    expect(t!.resolvedAt).toBeNull();
  });

  it("API-L4-15: all Actions COMPLETED/CANCELLED → RESOLVED succeeds", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "COMPLETED");
    await makeAction(id, "CANCELLED");

    const res = await setStatus(id, staffASession).send({
      status: "RESOLVED",
      resolutionSummary: VALID_SUMMARY,
    });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("RESOLVED");
    expect(res.body.resolvedAt).not.toBeNull();

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("RESOLVED");
  });

  it("API-L4-15: a zero-Action Ticket resolves (legacy/simple Tickets unaffected)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await setStatus(id, staffASession).send({
      status: "RESOLVED",
      resolutionSummary: VALID_SUMMARY,
    });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("RESOLVED");
  });
});

// ── API-L4-16 ─────────────────────────────────────────────────────────────────
// Transition matrix over the API (AC-11): allowed targets succeed; others →
// 409 INVALID_TRANSITION listing the allowed targets for the current state.

describe("API-L4-16: Transition matrix over the API (AC-11)", () => {
  // Every source: an illegal target → 409 INVALID_TRANSITION with the exact
  // allowed-target list for that state.
  for (const from of ALL_STATUSES) {
    const invalid = ALL_STATUSES.find(
      (to) => to !== from && !MATRIX[from].includes(to)
    )!;
    it(`API-L4-16: ${from} → ${invalid} → 409 INVALID_TRANSITION with allowed=${JSON.stringify(MATRIX[from])}`, async () => {
      const id = await makeTicket({ currentStatus: from });
      const res = await setStatus(id, staffASession).send({
        status: invalid,
        resolutionSummary: VALID_SUMMARY,
        confirm: true,
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_TRANSITION");
      expect(new Set(res.body.allowed)).toEqual(new Set(MATRIX[from]));
    });
  }

  // A representative legal transition from each source succeeds (with the
  // summary/confirm the target requires).
  const VALID: Array<{ from: TicketStatus; to: TicketStatus; body?: Record<string, unknown> }> = [
    { from: "NEW", to: "OPEN" },
    { from: "NEW", to: "IN_PROGRESS" }, // preserved Lab 3 edge (BR-14 doc fix)
    { from: "OPEN", to: "IN_PROGRESS" },
    { from: "OPEN", to: "WAITING_FOR_REQUESTER" },
    { from: "OPEN", to: "CANCELLED", body: { confirm: true } },
    { from: "IN_PROGRESS", to: "OPEN" },
    { from: "WAITING_FOR_REQUESTER", to: "IN_PROGRESS" },
    { from: "REOPENED", to: "IN_PROGRESS" },
    { from: "RESOLVED", to: "REOPENED" },
    { from: "RESOLVED", to: "CLOSED", body: { confirm: true } },
    { from: "CLOSED", to: "REOPENED" },
  ];
  for (const { from, to, body } of VALID) {
    it(`API-L4-16: ${from} → ${to} → 200`, async () => {
      const id = await makeTicket({ currentStatus: from });
      const res = await setStatus(id, staffASession).send({ status: to, ...(body ?? {}) });
      expect(res.status).toBe(200);
      expect(res.body.currentStatus).toBe(to);
    });
  }
});

// ── API-L4-17 ─────────────────────────────────────────────────────────────────
// RESOLVED request violating several rules at once (AC-12, BR-15): the first
// applicable error wins — INVALID_TRANSITION → TICKET_UNASSIGNED →
// OPEN_ACTIONS_EXIST → 400 summary.

describe("API-L4-17: RESOLVED multi-violation ordering (AC-12)", () => {
  it("API-L4-17: invalid transition wins over unassigned/open-actions/summary", async () => {
    // NEW cannot go to RESOLVED; also unassigned, has an OPEN Action, no summary.
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    await makeAction(id, "OPEN");
    const res = await setStatus(id, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
  });

  it("API-L4-17: unassigned wins over open-actions/summary", async () => {
    // OPEN → RESOLVED is legal, but the Ticket is unassigned (plus OPEN Action, no summary).
    const id = await makeTicket({ currentStatus: "OPEN", ownerId: null });
    await makeAction(id, "OPEN");
    const res = await setStatus(id, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_UNASSIGNED");
  });

  it("API-L4-17: open-actions wins over the 400 summary check", async () => {
    // Owned, OPEN Action present, but no/short summary: the gate (409) precedes the 400.
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "OPEN");
    const res = await setStatus(id, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OPEN_ACTIONS_EXIST");
  });

  it("API-L4-17: with the gate clear, a missing summary → 400", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "COMPLETED");
    const res = await setStatus(id, staffASession).send({ status: "RESOLVED" });
    expect(res.status).toBe(400);
    expect(res.body.errors?.resolutionSummary).toBeDefined();
  });
});

// ── API-L4-18 ─────────────────────────────────────────────────────────────────
// Optimistic concurrency on status (AC-13, BR-16): a stale expectedUpdatedAt →
// 409 STALE_UPDATE (nothing written); a correct one proceeds; omitting it keeps
// Lab 3 clients working.

describe("API-L4-18: Status PATCH expectedUpdatedAt (AC-13)", () => {
  it("API-L4-18: stale expectedUpdatedAt → 409 STALE_UPDATE, nothing written", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const stale = new Date(Date.now() - 60_000).toISOString();
    const res = await setStatus(id, staffASession).send({
      status: "IN_PROGRESS",
      expectedUpdatedAt: stale,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_UPDATE");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("OPEN");
  });

  it("API-L4-18: correct expectedUpdatedAt → 200", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const token = (await prisma.ticket.findUnique({ where: { id } }))!.updatedAt.toISOString();
    const res = await setStatus(id, staffASession).send({
      status: "IN_PROGRESS",
      expectedUpdatedAt: token,
    });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("IN_PROGRESS");
  });

  it("API-L4-18: omitted expectedUpdatedAt → proceeds (Lab 3 compatibility)", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await setStatus(id, staffASession).send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
  });

  it("API-L4-18: stale expectedUpdatedAt on a RESOLVED (gated) path → 409 STALE_UPDATE", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "COMPLETED"); // gate clear
    const stale = new Date(Date.now() - 60_000).toISOString();
    const res = await setStatus(id, staffASession).send({
      status: "RESOLVED",
      resolutionSummary: VALID_SUMMARY,
      expectedUpdatedAt: stale,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_UPDATE");
    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("OPEN");
  });
});

// ── API-L4-19 ─────────────────────────────────────────────────────────────────
// Administrator authorization (AC-18, BR-17): ADMIN may change Ticket status
// (Lab 4 change) but remains read-only on claim/owner/it-priority/comment/note.

describe("API-L4-19: Admin status write; other staff writes still 403 (AC-18)", () => {
  it("API-L4-19: Admin changes status → 200", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await setStatus(id, adminSession).send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("IN_PROGRESS");
  });

  it("API-L4-19: Admin resolves (gate + summary) → 200", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "COMPLETED");
    const res = await setStatus(id, adminSession).send({
      status: "RESOLVED",
      resolutionSummary: VALID_SUMMARY,
    });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("RESOLVED");
  });

  it("API-L4-19: Admin cannot claim → 403", async () => {
    const id = await makeTicket({ currentStatus: "NEW", ownerId: null });
    const res = await post(`/api/staff/tickets/${id}/claim`, adminSession).send({});
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Admin cannot change owner → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await patch(`/api/staff/tickets/${id}/owner`, adminSession).send({ ownerId: staffA.id });
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Admin cannot change IT Priority → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await patch(`/api/staff/tickets/${id}/it-priority`, adminSession).send({ itPriority: "HIGH" });
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Admin cannot post a Public Comment → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/comments`, adminSession).send({ body: "admin comment" });
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Admin cannot post an Internal Note → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await post(`/api/staff/tickets/${id}/notes`, adminSession).send({ body: "admin note" });
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Requester cannot change status → 403", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await setStatus(id, requesterSession).send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(403);
  });

  it("API-L4-19: Admin GET detail returns a populated allowedTransitions", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const res = await get(`/api/staff/tickets/${id}`, adminSession);
    expect(res.status).toBe(200);
    expect(new Set(res.body.allowedTransitions)).toEqual(new Set(MATRIX.OPEN));
  });
});

// ── API-L4-20 ─────────────────────────────────────────────────────────────────
// Double-submitted status transition (AC-21, FR-16): two identical transitions
// fired in parallel leave a single, consistent final state — no 500, no
// inconsistent status.

describe("API-L4-20: Double-submitted status transition (AC-21)", () => {
  it("API-L4-20: two identical transitions → consistent final state", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    const [r1, r2] = await Promise.all([
      setStatus(id, staffASession).send({ status: "IN_PROGRESS" }),
      setStatus(id, staffASession).send({ status: "IN_PROGRESS" }),
    ]);

    // Neither request errors out (no 500); each is accepted or a benign conflict.
    for (const r of [r1, r2]) expect([200, 409]).toContain(r.status);
    expect([r1.status, r2.status]).toContain(200);

    const t = await prisma.ticket.findUnique({ where: { id } });
    expect(t!.currentStatus).toBe("IN_PROGRESS");
  });
});

// ── API-L4-30 ─────────────────────────────────────────────────────────────────
// Concurrent resolve + new-Action-create on an all-completed Ticket (AC-27,
// BR-23). The serializable gate must preserve the invariant: a RESOLVED Ticket
// never holds an OPEN Action. Either the resolve commits and the create is
// rejected TICKET_CLOSED, or the create commits (Ticket still active) and the
// resolve is rejected (OPEN_ACTIONS_EXIST, or STALE_UPDATE on a fail-safe retry).

describe("API-L4-30: Concurrent resolve + Action-create race (AC-27)", () => {
  it("API-L4-30: invariant holds — never RESOLVED with an OPEN Action", async () => {
    const id = await makeTicket({ currentStatus: "OPEN" });
    await makeAction(id, "COMPLETED"); // every existing Action already closed

    const [resolveRes, createRes] = await Promise.all([
      setStatus(id, staffASession).send({
        status: "RESOLVED",
        resolutionSummary: VALID_SUMMARY,
      }),
      post(`/api/staff/tickets/${id}/actions`, staffASession).send({
        description: "Follow-up work recorded concurrently with the resolve.",
      }),
    ]);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    const openCount = await prisma.actionTaken.count({ where: { ticketId: id, status: "OPEN" } });

    // Hard invariant: a RESOLVED Ticket may never hold an OPEN Action.
    if (ticket!.currentStatus === "RESOLVED") expect(openCount).toBe(0);

    // Each request ends in exactly one of its two legal outcomes.
    expect([200, 409]).toContain(resolveRes.status);
    expect([201, 409]).toContain(createRes.status);

    if (resolveRes.status === 200) {
      // Resolve won → Ticket RESOLVED, the concurrent create was rejected.
      expect(ticket!.currentStatus).toBe("RESOLVED");
      expect(createRes.status).toBe(409);
      expect(createRes.body.code).toBe("TICKET_CLOSED");
      expect(openCount).toBe(0);
    } else {
      // Resolve lost → it failed safely and the Ticket is still active.
      expect(resolveRes.body.code).toMatch(/OPEN_ACTIONS_EXIST|STALE_UPDATE/);
      expect(ticket!.currentStatus).not.toBe("RESOLVED");
    }
  });
});
