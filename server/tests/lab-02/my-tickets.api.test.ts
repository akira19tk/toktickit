// API-06: ownership scoping   (AC-11)
// API-08: search filter        (AC-13)
// API-09: category+status AND  (AC-14, AC-15)
// API-10: default sort         (AC-16)
// API-11: page=2               (AC-17)
// API-12: invalid params       (AC-18)
// Converted for Lab 3: session cookie authentication instead of x-requester-id.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

let sessionA: string; // Carol (requester A)
let sessionB: string; // David (requester B)
let requesterBTicketId: number;
let defaultCategoryId: number;
let hardwareCategoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  await clearDatabase();

  await createUser({ email: "carol@mytickets.test", password: "Test#1234", name: "Carol", role: "REQUESTER", mustChangePassword: false });
  await createUser({ email: "david@mytickets.test", password: "Test#1234", name: "David", role: "REQUESTER", mustChangePassword: false });

  sessionA = await loginAs(app, { email: "carol@mytickets.test", password: "Test#1234" });
  sessionB = await loginAs(app, { email: "david@mytickets.test", password: "Test#1234" });

  const defCat = await prisma.category.findFirst({ where: { name: "Account and Access" } });
  const hwCat = await prisma.category.findFirst({ where: { name: "Hardware" } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  defaultCategoryId = defCat!.id;
  hardwareCategoryId = hwCat!.id;
  relatedSystemId = sys!.id;

  // Create 12 generic tickets for A (needed for page-2 test, total ≥13 with hw ticket below)
  for (let i = 1; i <= 12; i++) {
    await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionA)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(defaultCategoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", i === 1 ? "Laptop battery drains quickly" : `Generic ticket number ${i}`)
      .field("description", "Description for testing purposes only.")
      .field("requestedPriority", "MEDIUM");
  }

  // One Hardware-category ticket for A (for category filter test)
  await request(app)
    .post("/api/tickets")
    .set("Cookie", sessionA)
    .set("X-Requested-With", "TokTickIT")
    .field("categoryId", String(hardwareCategoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", "Hardware screen is flickering")
    .field("description", "Screen flickers randomly during boot and normal usage.")
    .field("requestedPriority", "HIGH");

  // One ticket for requester B (must NOT appear in A's list)
  const b = await request(app)
    .post("/api/tickets")
    .set("Cookie", sessionB)
    .set("X-Requested-With", "TokTickIT")
    .field("categoryId", String(defaultCategoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", "David's own ticket")
    .field("description", "This ticket belongs to David, not Carol.")
    .field("requestedPriority", "LOW");
  requesterBTicketId = b.body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/tickets", () => {
  it("API-06: returns only tickets owned by the current requester (AC-11)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    // All returned tickets must belong to A — verified by checking none have B's id
    const returnedIds = res.body.data.map((t: { id: number }) => t.id);
    expect(returnedIds).not.toContain(requesterBTicketId);
  });

  it("API-08: search='battery' returns matching ticket(s) only (AC-13)", async () => {
    const res = await request(app)
      .get("/api/tickets?search=battery")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const t of res.body.data as { summary: string; ticketNumber: string }[]) {
      const matchesSummary = t.summary.toLowerCase().includes("battery");
      const matchesNumber = t.ticketNumber.toLowerCase().includes("battery");
      expect(matchesSummary || matchesNumber).toBe(true);
    }
  });

  it("API-09: categoryId=hardware filter returns only hardware tickets (AC-14/15)", async () => {
    const res = await request(app)
      .get(`/api/tickets?categoryId=${hardwareCategoryId}&status=NEW`)
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    for (const t of res.body.data as { category: string }[]) {
      expect(t.category).toBe("Hardware");
    }
    const summaries = res.body.data.map((t: { summary: string }) => t.summary);
    expect(summaries).toContain("Hardware screen is flickering");
  });

  it("API-10: no sort params → default order is createdAt descending (AC-16)", async () => {
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

  it("API-11: page=2 with >10 tickets returns correct slice + metadata (AC-17)", async () => {
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

    expect(page2.body.pagination.totalCount).toBeGreaterThanOrEqual(13);
    expect(page2.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
    expect(page2.body.pagination.pageSize).toBe(10);
  });

  it("API-12: invalid page/pageSize fall back to defaults, returns 200 (AC-18)", async () => {
    const res = await request(app)
      .get("/api/tickets?page=-1&pageSize=9999")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
    expect(res.body).toHaveProperty("data");
  });

  it("response data items have the required fields from api-spec §5", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", sessionA);

    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("ticketNumber");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("summary");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("requestedPriority");
      expect(item).toHaveProperty("currentStatus");
      expect(item).toHaveProperty("updatedAt");
    }
  });
});
