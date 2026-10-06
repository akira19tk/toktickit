// API-26: Requester posts and reads Public Comment (AC-29)
// API-27: Comment validation and plain-text storage (AC-30)
// API-28: Requester comments on non-owned Ticket (AC-31)
// API-29: Problem Appears Resolved on allowed statuses (AC-32)
// API-31: Problem Appears Resolved on NEW/RESOLVED/CLOSED/CANCELLED (AC-34)
// API-32: Public comment on CLOSED and CANCELLED → 409 TICKET_CLOSED (AC-35)
//         Note half is an it.todo — completed by Issue #27
// API-34: Requester Ticket Detail and comments payloads contain no note content (AC-53)
//
// API-30, 33, 35, 36, 37 belong to Issue #27 and are not included here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { TicketStatus } from "@prisma/client";

const app = createApp();

// ---------------------------------------------------------------------------
// Shared state — created once per file in beforeAll
// ---------------------------------------------------------------------------

let requester: { id: number; name: string };
let otherRequester: { id: number };
let requesterSession: string;
let otherSession: string;
let validCategoryId: number;
let validRelatedSystemId: number;

beforeAll(async () => {
  await clearDatabase();

  const r = await createUser({
    email: "requester@comments.test",
    password: "Test#1234",
    name: "Comment Requester",
    role: "REQUESTER",
    mustChangePassword: false,
  });
  const o = await createUser({
    email: "other@comments.test",
    password: "Test#1234",
    name: "Other Requester",
    role: "REQUESTER",
    mustChangePassword: false,
  });

  requester = r;
  otherRequester = o;

  requesterSession = await loginAs(app, {
    email: "requester@comments.test",
    password: "Test#1234",
  });
  otherSession = await loginAs(app, {
    email: "other@comments.test",
    password: "Test#1234",
  });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helper: create a ticket owned by the shared requester, optionally in a
// specific status (updated via Prisma to bypass the Staff-only status routes).
// ---------------------------------------------------------------------------

async function createTicket(status: TicketStatus = "NEW"): Promise<number> {
  const res = await request(app)
    .post("/api/tickets")
    .set("Cookie", requesterSession)
    .set("X-Requested-With", "TokTickIT")
    .field("categoryId", String(validCategoryId))
    .field("relatedSystemId", String(validRelatedSystemId))
    .field("summary", "Comment test ticket")
    .field(
      "description",
      "Ticket created for testing comment and resolved-indication functionality."
    )
    .field("requestedPriority", "MEDIUM");

  if (res.status !== 201) {
    throw new Error(`createTicket failed: ${JSON.stringify(res.body)}`);
  }

  const id = res.body.id as number;

  if (status !== "NEW") {
    await prisma.ticket.update({ where: { id }, data: { currentStatus: status } });
  }

  return id;
}

// ===========================================================================
// API-26: Requester posts and reads Public Comment (AC-29)
// ===========================================================================

describe("API-26: Requester posts and reads Public Comment (AC-29)", () => {
  let ticketId: number;

  beforeAll(async () => {
    ticketId = await createTicket("OPEN");
  });

  it("API-26: POST /api/tickets/:id/comments returns 201 with author from session and backend timestamp", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "Thanks for looking into this!" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("number");
    expect(res.body.body).toBe("Thanks for looking into this!");
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThan(0);
    expect(res.body.author.id).toBe(requester.id);
    expect(res.body.author.name).toBe(requester.name);
    expect(res.body.author.role).toBe("REQUESTER");
  });

  it("API-26: GET /api/tickets/:id/comments returns list in chronological order (oldest first)", async () => {
    // Post a second comment after the one already added above
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "Still waiting for an update." });

    const res = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    // Verify non-decreasing timestamps (oldest first)
    const times = (res.body as Array<{ createdAt: string }>).map((c) =>
      new Date(c.createdAt).getTime()
    );
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }

    // Verify comment shape
    const first = res.body[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("body");
    expect(first).toHaveProperty("createdAt");
    expect(first.author).toHaveProperty("id");
    expect(first.author).toHaveProperty("name");
    expect(first.author).toHaveProperty("role");
  });
});

// ===========================================================================
// API-27: Comment validation and plain-text storage (AC-30)
// ===========================================================================

describe("API-27: Comment validation and plain-text storage (AC-30)", () => {
  let ticketId: number;

  beforeAll(async () => {
    ticketId = await createTicket("OPEN");
  });

  it("API-27: empty body → 400 errors.body", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("body");
  });

  it("API-27: whitespace-only body → 400 errors.body", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "   \n\t  " });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("body");
  });

  it("API-27: 2001-character body → 400 errors.body", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "a".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("body");
  });

  it("API-27: <script> body stored verbatim as plain text, not escaped (AC-30)", async () => {
    const xssBody = "<script>alert('xss')</script>";

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: xssBody });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe(xssBody);

    // Verify stored value in DB is also verbatim
    const comment = await prisma.publicComment.findUnique({ where: { id: res.body.id } });
    expect(comment?.body).toBe(xssBody);
  });
});

// ===========================================================================
// API-28: Requester comments on non-owned Ticket → 404 (AC-31)
// ===========================================================================

describe("API-28: Requester comments on non-owned Ticket → 404 (AC-31)", () => {
  let ownerTicketId: number;

  beforeAll(async () => {
    ownerTicketId = await createTicket("OPEN");
  });

  it("API-28: GET /api/tickets/:id/comments on non-owned ticket → 404", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownerTicketId}/comments`)
      .set("Cookie", otherSession);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("data");
  });

  it("API-28: POST /api/tickets/:id/comments on non-owned ticket → 404", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownerTicketId}/comments`)
      .set("Cookie", otherSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "Trying to comment on someone else's ticket" });

    expect(res.status).toBe(404);
    // Verify no comment was created
    const count = await prisma.publicComment.count({
      where: { ticketId: ownerTicketId },
    });
    expect(count).toBe(0);
  });
});

// ===========================================================================
// API-29: Problem Appears Resolved on allowed statuses (AC-32)
// ===========================================================================

describe("API-29: Problem Appears Resolved on allowed statuses (AC-32)", () => {
  it("API-29: OPEN → 200 with requesterResolvedAt, status unchanged, repeat idempotent", async () => {
    const ticketId = await createTicket("OPEN");

    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res1.status).toBe(200);
    expect(res1.body.requesterResolvedAt).toBeTruthy();

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(dbTicket?.currentStatus).toBe("OPEN");

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res2.status).toBe(200);
    expect(res2.body.requesterResolvedAt).toBe(res1.body.requesterResolvedAt);
  });

  it("API-29: IN_PROGRESS → 200 with requesterResolvedAt, status unchanged, repeat idempotent", async () => {
    const ticketId = await createTicket("IN_PROGRESS");

    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res1.status).toBe(200);
    expect(res1.body.requesterResolvedAt).toBeTruthy();

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(dbTicket?.currentStatus).toBe("IN_PROGRESS");

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res2.status).toBe(200);
    expect(res2.body.requesterResolvedAt).toBe(res1.body.requesterResolvedAt);
  });

  it("API-29: WAITING_FOR_REQUESTER → 200 with requesterResolvedAt, status unchanged, repeat idempotent", async () => {
    const ticketId = await createTicket("WAITING_FOR_REQUESTER");

    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res1.status).toBe(200);
    expect(res1.body.requesterResolvedAt).toBeTruthy();

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(dbTicket?.currentStatus).toBe("WAITING_FOR_REQUESTER");

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res2.status).toBe(200);
    expect(res2.body.requesterResolvedAt).toBe(res1.body.requesterResolvedAt);
  });

  it("API-29: REOPENED → 200 with requesterResolvedAt, status unchanged, repeat idempotent", async () => {
    const ticketId = await createTicket("REOPENED");

    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res1.status).toBe(200);
    expect(res1.body.requesterResolvedAt).toBeTruthy();

    const dbTicket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(dbTicket?.currentStatus).toBe("REOPENED");

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res2.status).toBe(200);
    expect(res2.body.requesterResolvedAt).toBe(res1.body.requesterResolvedAt);
  });
});

// ===========================================================================
// API-31: Problem Appears Resolved on disallowed statuses → 409 INVALID_STATE (AC-34)
// ===========================================================================

describe("API-31: Problem Appears Resolved on NEW/RESOLVED/CLOSED/CANCELLED → 409 INVALID_STATE (AC-34)", () => {
  it("API-31: NEW → 409 INVALID_STATE", async () => {
    const ticketId = await createTicket("NEW");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("API-31: RESOLVED → 409 INVALID_STATE", async () => {
    const ticketId = await createTicket("RESOLVED");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("API-31: CLOSED → 409 INVALID_STATE", async () => {
    const ticketId = await createTicket("CLOSED");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("API-31: CANCELLED → 409 INVALID_STATE", async () => {
    const ticketId = await createTicket("CANCELLED");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/resolved-indication`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });
});

// ===========================================================================
// API-32: Public comment on CLOSED and CANCELLED → 409 TICKET_CLOSED (AC-35)
// Note half (Internal Notes) is completed by Issue #27.
// ===========================================================================

describe("API-32: public comment on CLOSED and CANCELLED returns 409 TICKET_CLOSED (AC-35)", () => {
  it("API-32: POST comment on CLOSED ticket → 409 TICKET_CLOSED", async () => {
    const ticketId = await createTicket("CLOSED");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "Trying to comment on a closed ticket" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it("API-32: POST comment on CANCELLED ticket → 409 TICKET_CLOSED", async () => {
    const ticketId = await createTicket("CANCELLED");

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "Trying to comment on a cancelled ticket" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_CLOSED");
  });

  it.todo(
    "API-32: Internal Note on CLOSED and CANCELLED returns 409 TICKET_CLOSED (note half — completed by Issue #27)"
  );
});

// ===========================================================================
// API-34: Requester Ticket Detail and comments payloads contain no note data (AC-53)
// ===========================================================================

describe("API-34: Requester Ticket Detail and comments payloads contain no note content (AC-53)", () => {
  let ticketId: number;

  beforeAll(async () => {
    ticketId = await createTicket("OPEN");

    // Add a public comment
    await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .send({ body: "A visible public comment" });

    // Insert an internal note directly via Prisma (bypasses the Staff-only guard).
    // This note must never appear in any Requester-facing payload.
    await prisma.internalNote.create({
      data: {
        ticketId,
        authorId: requester.id,
        body: "Secret internal note — must not appear in Requester payload",
      },
    });
  });

  it("API-34: GET /api/tickets/:id does not include internalNotes or note count", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", requesterSession);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("internalNotes");
    expect(res.body).not.toHaveProperty("noteCount");
    expect(res.body).not.toHaveProperty("internalNoteCount");
    // Confirm the ticket detail shape is present
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("currentStatus");
    expect(res.body).toHaveProperty("itPriority");
    expect(res.body).toHaveProperty("requesterResolvedAt");
  });

  it("API-34: GET /api/tickets/:id/comments returns only public comments, no note fields", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterSession);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    for (const item of res.body as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("internalNotes");
      expect(item).not.toHaveProperty("isInternal");
      expect(item).not.toHaveProperty("type");
      // Verify correct public comment shape
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("body");
      expect(item).toHaveProperty("createdAt");
      expect(item.author).toBeTruthy();
    }
  });
});
