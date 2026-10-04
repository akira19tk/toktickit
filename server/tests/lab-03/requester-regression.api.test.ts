// API-23: Create Ticket as authenticated Requester (AC-25)
// API-24: My Tickets list — only own tickets; Lab 2 behaviour preserved (AC-26)
// API-25: Attachment on own vs foreign Ticket (AC-27)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

let sessionA: string;
let sessionB: string;
let userAId: number;
let validCategoryId: number;
let validRelatedSystemId: number;

// 1-pixel white JPEG
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
  "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
  "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
  "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
  "AAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAA" +
  "AAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
  "base64"
);

beforeAll(async () => {
  await clearDatabase();

  const userA = await createUser({
    email: "requester-a@regression.test",
    password: "Test#1234",
    name: "Requester A",
    role: "REQUESTER",
    mustChangePassword: false,
  });
  await createUser({
    email: "requester-b@regression.test",
    password: "Test#1234",
    name: "Requester B",
    role: "REQUESTER",
    mustChangePassword: false,
  });

  userAId = userA.id;
  sessionA = await loginAs(app, { email: "requester-a@regression.test", password: "Test#1234" });
  sessionB = await loginAs(app, { email: "requester-b@regression.test", password: "Test#1234" });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── API-23: Create Ticket ──────────────────────────────────────────────────────

describe("API-23: Create Ticket as authenticated Requester", () => {
  it("API-23: 201; requesterId = session user, status NEW, ownerId null, itPriority = requestedPriority (AC-25)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Regression create ticket test")
      .field("description", "Verifying session-based requester identity on ticket creation.")
      .field("requestedPriority", "HIGH");

    expect(res.status).toBe(201);
    expect(res.body.requesterId).toBe(userAId);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.itPriority).toBe("HIGH");
    // Verify the ticket has no owner in the database
    const dbTicket = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(dbTicket?.ownerId).toBeNull();
    expect(dbTicket?.itPriority).toBe("HIGH");
    expect(dbTicket?.requestedPriority).toBe("HIGH");
  });

  it("API-23: client-supplied requesterId and x-requester-id are ignored (BR-03, BR-68)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .set("x-requester-id", "99999")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Should use session, not spoofed id")
      .field("description", "The x-requester-id header must be ignored by the server.")
      .field("requestedPriority", "LOW");

    expect(res.status).toBe(201);
    // requesterId must be the session user's id, not the spoofed 99999
    expect(res.body.requesterId).toBe(userAId);
    expect(res.body.requesterId).not.toBe(99999);
  });
});

// ── API-24: My Tickets list ────────────────────────────────────────────────────

describe("API-24: My Tickets list — only own tickets, Lab 2 behaviour preserved", () => {
  let hardwareCategoryId: number;

  beforeAll(async () => {
    const hwCat = await prisma.category.findFirst({ where: { name: "Hardware" } });
    hardwareCategoryId = hwCat!.id;

    // Create 12 tickets for A + 1 hardware ticket for A + 1 ticket for B
    for (let i = 1; i <= 12; i++) {
      await request(app)
        .post("/api/tickets")
        .set("Cookie", sessionA)
        .set("X-Requested-With", "TokTickIT")
        .field("categoryId", String(validCategoryId))
        .field("relatedSystemId", String(validRelatedSystemId))
        .field("summary", `API-24 ticket ${i} for A`)
        .field("description", "Created for pagination regression test.")
        .field("requestedPriority", "MEDIUM");
    }
    await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(hardwareCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Hardware screen flickering regression")
      .field("description", "Hardware ticket for regression filter test.")
      .field("requestedPriority", "HIGH");
    await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionB)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "B's ticket must not appear in A's list")
      .field("description", "Requester B private ticket.")
      .field("requestedPriority", "LOW");
  });

  it("API-24: GET /api/tickets returns only A's own tickets (AC-26)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    const returnedIds: number[] = res.body.data.map((t: { id: number }) => t.id);

    // Verify all returned tickets belong to A via DB
    const dbTickets = await prisma.ticket.findMany({ where: { id: { in: returnedIds } } });
    for (const t of dbTickets) {
      expect(t.requesterId).toBe(userAId);
    }
  });

  it("API-24: search filter works (AC-26)", async () => {
    const res = await request(app)
      .get("/api/tickets?search=flickering")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const t of res.body.data as { summary: string }[]) {
      expect(t.summary.toLowerCase()).toContain("flickering");
    }
  });

  it("API-24: category filter returns only matching tickets (AC-26)", async () => {
    const res = await request(app)
      .get(`/api/tickets?categoryId=${hardwareCategoryId}`)
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const t of res.body.data as { category: string }[]) {
      expect(t.category).toBe("Hardware");
    }
  });

  it("API-24: page 2 with pageSize 10 returns correct slice (AC-26)", async () => {
    const page1 = await request(app)
      .get("/api/tickets?page=1&pageSize=10")
      .set("Cookie", sessionA);
    const page2 = await request(app)
      .get("/api/tickets?page=2&pageSize=10")
      .set("Cookie", sessionA);

    expect(page2.status).toBe(200);
    expect(page2.body.pagination.page).toBe(2);
    expect(page2.body.data.length).toBeGreaterThan(0);

    const p1Ids = page1.body.data.map((t: { id: number }) => t.id);
    const p2Ids = page2.body.data.map((t: { id: number }) => t.id);
    expect(p1Ids.filter((id: number) => p2Ids.includes(id))).toHaveLength(0);
    expect(page2.body.pagination.totalCount).toBeGreaterThanOrEqual(14);
  });

  it("API-24: default sort is createdAt descending (AC-26)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    const dates = (res.body.data as { createdAt: string }[]).map((t) =>
      new Date(t.createdAt).getTime()
    );
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });
});

// ── API-25: Attachments on own vs foreign Ticket ───────────────────────────────

describe("API-25: Attachments on own and foreign Ticket", () => {
  let ownTicketId: number;
  let foreignTicketId: number;
  let attachmentId: number;

  beforeAll(async () => {
    // A creates a ticket
    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    const own = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(cat!.id))
      .field("relatedSystemId", String(sys!.id))
      .field("summary", "API-25 A own attachment ticket")
      .field("description", "Used for attachment ownership regression test.")
      .field("requestedPriority", "LOW");
    ownTicketId = own.body.id;

    // B creates a ticket
    const foreign = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionB)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(cat!.id))
      .field("relatedSystemId", String(sys!.id))
      .field("summary", "API-25 B foreign ticket")
      .field("description", "Used for ownership rejection test.")
      .field("requestedPriority", "LOW");
    foreignTicketId = foreign.body.id;
  });

  it("API-25: add attachment to own ticket → 201 (AC-27)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownTicketId}/attachments`)
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "own.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    attachmentId = res.body.id;
  });

  it("API-25: download own attachment → 200 (AC-27)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownTicketId}/attachments/${attachmentId}/download`)
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
  });

  it("API-25: soft-remove own attachment → 200 (AC-27)", async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ownTicketId}/attachments/${attachmentId}`)
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .send({ reason: "Wrong file" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("removedAt");
  });

  it("API-25: add attachment to foreign ticket → 404 (AC-27)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${foreignTicketId}/attachments`)
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "foreign.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
  });

  it("API-25: download attachment on foreign ticket → 404 (AC-27)", async () => {
    // B adds an attachment to B's ticket
    const added = await request(app)
      .post(`/api/tickets/${foreignTicketId}/attachments`)
      .set("Cookie", sessionB)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "b-att.jpg", contentType: "image/jpeg" });
    expect(added.status).toBe(201);

    // A tries to download it → 404
    const res = await request(app)
      .get(`/api/tickets/${foreignTicketId}/attachments/${added.body.id}/download`)
      .set("Cookie", sessionA);

    expect(res.status).toBe(404);
  });
});
