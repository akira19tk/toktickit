// API-07: GET /api/tickets/:id owned by another requester returns 404 (AC-12)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";

const app = createApp();

let requesterAId: number; // Alice
let requesterBId: number; // Bob
let validCategoryId: number;
let validRelatedSystemId: number;
const createdTicketIds: number[] = [];

beforeAll(async () => {
  const requesters = await prisma.devRequester.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  requesterAId = requesters[0].id; // Alice
  requesterBId = requesters[1].id; // Bob

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;
});

afterAll(async () => {
  if (createdTicketIds.length) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.$disconnect();
});

describe("GET /api/tickets/:id", () => {
  it("API-07: accessing another requester's ticket returns 404 with no data leaked (AC-12)", async () => {
    // Create a ticket for requester A
    const createRes = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(requesterAId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Alice private ownership test")
      .field("description", "This ticket belongs exclusively to Alice.")
      .field("requestedPriority", "LOW");

    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;
    createdTicketIds.push(ticketId);

    // Requester B tries to access it → 404 (not 403, per §11 ownership-failure decision)
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("x-requester-id", String(requesterBId));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
    // Must not leak any ticket data
    expect(res.body).not.toHaveProperty("ticketNumber");
    expect(res.body).not.toHaveProperty("summary");
  });

  it("owner can retrieve their own ticket with 200 and correct shape", async () => {
    const createRes = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(requesterAId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Alice retrieve own ticket test")
      .field("description", "Checking that owner can read back their own ticket.")
      .field("requestedPriority", "MEDIUM");

    const ticketId = createRes.body.id;
    createdTicketIds.push(ticketId);

    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body).toHaveProperty("ticketNumber");
    expect(res.body).toHaveProperty("attachments");
    expect(Array.isArray(res.body.attachments)).toBe(true);
  });
});
