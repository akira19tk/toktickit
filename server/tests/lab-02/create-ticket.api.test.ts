// API-01 to API-05: POST /api/tickets validation and creation
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";

const app = createApp();

let validCategoryId: number;
let validRelatedSystemId: number;
let validRequesterId: number;
const createdTicketIds: number[] = [];

beforeAll(async () => {
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  const req = await prisma.devRequester.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;
  validRequesterId = req!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.$disconnect();
});

describe("POST /api/tickets", () => {
  it("API-01: valid data returns 201 with ticketNumber in TKT-YYYY-NNNNNN format", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(validRequesterId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field(
        "description",
        "Battery drains fast even when idle, started after Windows update."
      )
      .field("requestedPriority", "MEDIUM");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("ticketNumber");
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body).toHaveProperty("id");
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.requestedPriority).toBe("MEDIUM");
    expect(res.body.attachments).toEqual([]);
    expect(res.body.attachmentErrors).toEqual([]);
    expect(res.body).toHaveProperty("updatedAt");

    if (res.body.id) createdTicketIds.push(res.body.id);
  });

  it("API-02: empty summary returns 400 with field error on summary (AC-02)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(validRequesterId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "")
      .field("description", "Battery drains fast even when idle, starts after update.")
      .field("requestedPriority", "MEDIUM");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("summary");
  });

  it("API-03: description > 2000 chars returns 400 with field error (AC-03)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(validRequesterId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "x".repeat(2001))
      .field("requestedPriority", "HIGH");

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("description");
  });

  it("API-04: invalid categoryId returns 400 with categoryId error, no ticket created (AC-06)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(validRequesterId))
      .field("categoryId", "999999")
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "Battery drains fast even when idle.")
      .field("requestedPriority", "LOW");

    // 400 status is the authoritative proof: the route returns before inserting any row.
    // A global ticket.count() check is unreliable because parallel test workers may
    // be creating tickets concurrently (my-tickets suite runs in a separate worker).
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("categoryId");
    // No ticketNumber in the response confirms nothing was created
    expect(res.body).not.toHaveProperty("ticketNumber");
  });

  it("API-05: missing requestedPriority returns 400 with field error (AC-29)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(validRequesterId))
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "Battery drains fast even when idle.");
    // no requestedPriority

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("requestedPriority");
  });
});
