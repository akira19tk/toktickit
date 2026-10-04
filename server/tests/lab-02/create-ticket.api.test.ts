// API-01 to API-05: POST /api/tickets validation and creation
// Converted for Lab 3: authentication via session cookie instead of x-requester-id.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

let validCategoryId: number;
let validRelatedSystemId: number;
let sessionCookie: string;

beforeAll(async () => {
  await clearDatabase();

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;

  await createUser({ email: "createticket@example.com", password: "Test#1234", role: "REQUESTER", mustChangePassword: false });
  sessionCookie = await loginAs(app, { email: "createticket@example.com", password: "Test#1234" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/tickets", () => {
  it("API-01: valid data returns 201 with ticketNumber in TKT-YYYY-NNNNNN format", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionCookie)
      .set("X-Requested-With", "TokTickIT")
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
  });

  it("API-02: empty summary returns 400 with field error on summary (AC-02)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionCookie)
      .set("X-Requested-With", "TokTickIT")
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
      .set("Cookie", sessionCookie)
      .set("X-Requested-With", "TokTickIT")
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
      .set("Cookie", sessionCookie)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", "999999")
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "Battery drains fast even when idle.")
      .field("requestedPriority", "LOW");

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("categoryId");
    expect(res.body).not.toHaveProperty("ticketNumber");
  });

  it("API-05: missing requestedPriority returns 400 with field error (AC-29)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionCookie)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "Battery drains fast even when idle.");
    // no requestedPriority

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("requestedPriority");
  });
});
