// API-07: GET /api/tickets/:id owned by another requester returns 404 (AC-12)
// Converted for Lab 3: session cookie authentication instead of x-requester-id.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

let sessionA: string; // Alice
let sessionB: string; // Bob
let validCategoryId: number;
let validRelatedSystemId: number;

beforeAll(async () => {
  await clearDatabase();

  await createUser({ email: "alice@ticketdetail.test", password: "Test#1234", name: "Alice", role: "REQUESTER", mustChangePassword: false });
  await createUser({ email: "bob@ticketdetail.test", password: "Test#1234", name: "Bob", role: "REQUESTER", mustChangePassword: false });

  sessionA = await loginAs(app, { email: "alice@ticketdetail.test", password: "Test#1234" });
  sessionB = await loginAs(app, { email: "bob@ticketdetail.test", password: "Test#1234" });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  validCategoryId = cat!.id;
  validRelatedSystemId = sys!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/tickets/:id", () => {
  it("API-07: accessing another requester's ticket returns 404 with no data leaked (AC-12)", async () => {
    // Create a ticket for Alice
    const createRes = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Alice private ownership test")
      .field("description", "This ticket belongs exclusively to Alice.")
      .field("requestedPriority", "LOW");

    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.id;

    // Bob tries to access it → 404 (not 403, per ownership-failure decision)
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", sessionB);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
    expect(res.body).not.toHaveProperty("ticketNumber");
    expect(res.body).not.toHaveProperty("summary");
  });

  it("owner can retrieve their own ticket with 200 and correct shape", async () => {
    const createRes = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(validCategoryId))
      .field("relatedSystemId", String(validRelatedSystemId))
      .field("summary", "Alice retrieve own ticket test")
      .field("description", "Checking that owner can read back their own ticket.")
      .field("requestedPriority", "MEDIUM");

    const ticketId = createRes.body.id;

    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body).toHaveProperty("ticketNumber");
    expect(res.body).toHaveProperty("attachments");
    expect(Array.isArray(res.body.attachments)).toBe(true);
  });
});
