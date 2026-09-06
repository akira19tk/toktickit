// API-06: ownership scoping   (AC-11)
// API-08: search filter        (AC-13)
// API-09: category+status AND  (AC-14, AC-15)
// API-10: default sort         (AC-16)
// API-11: page=2               (AC-17)
// API-12: invalid params       (AC-18)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";

const app = createApp();

// Use Carol (idx 2) and David (idx 3) as isolated test requesters
// so tests don't interfere with create-ticket suite (which uses Alice idx 0).
let requesterAId: number; // Carol
let requesterBId: number; // David
let defaultCategoryId: number; // Account and Access
let hardwareCategoryId: number; // Hardware
let relatedSystemId: number;
const createdTicketIds: number[] = [];

beforeAll(async () => {
  const requesters = await prisma.devRequester.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  requesterAId = requesters[2].id; // Carol
  requesterBId = requesters[3].id; // David

  const defCat = await prisma.category.findFirst({ where: { name: "Account and Access" } });
  const hwCat = await prisma.category.findFirst({ where: { name: "Hardware" } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  defaultCategoryId = defCat!.id;
  hardwareCategoryId = hwCat!.id;
  relatedSystemId = sys!.id;

  // Create 12 generic tickets for A (needed for page-2 test, total ≥13 with hw ticket below)
  for (let i = 1; i <= 12; i++) {
    const r = await request(app)
      .post("/api/tickets")
      .set("x-requester-id", String(requesterAId))
      .field("categoryId", String(defaultCategoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field(
        "summary",
        i === 1 ? "Laptop battery drains quickly" : `Generic ticket number ${i}`
      )
      .field("description", "Description for testing purposes only.")
      .field("requestedPriority", "MEDIUM");
    createdTicketIds.push(r.body.id);
  }

  // One Hardware-category ticket for A (for category filter test)
  const hw = await request(app)
    .post("/api/tickets")
    .set("x-requester-id", String(requesterAId))
    .field("categoryId", String(hardwareCategoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", "Hardware screen is flickering")
    .field("description", "Screen flickers randomly during boot and normal usage.")
    .field("requestedPriority", "HIGH");
  createdTicketIds.push(hw.body.id);

  // One ticket for requester B (must NOT appear in A's list)
  const b = await request(app)
    .post("/api/tickets")
    .set("x-requester-id", String(requesterBId))
    .field("categoryId", String(defaultCategoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", "David's own ticket")
    .field("description", "This ticket belongs to David, not Carol.")
    .field("requestedPriority", "LOW");
  createdTicketIds.push(b.body.id);
});

afterAll(async () => {
  if (createdTicketIds.length) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.$disconnect();
});

describe("GET /api/tickets", () => {
  it("API-06: returns only tickets owned by the current requester (AC-11)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    // All returned tickets must belong to A, none to B
    for (const t of res.body.data as { id: number }[]) {
      const db = await prisma.ticket.findUnique({ where: { id: t.id } });
      expect(db?.requesterId).toBe(requesterAId);
    }
    // B's ticket must not appear
    const bTicketId = createdTicketIds[createdTicketIds.length - 1];
    const returnedIds = res.body.data.map((t: { id: number }) => t.id);
    expect(returnedIds).not.toContain(bTicketId);
  });

  it("API-08: search='battery' returns matching ticket(s) only (AC-13)", async () => {
    const res = await request(app)
      .get("/api/tickets?search=battery")
      .set("x-requester-id", String(requesterAId));

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
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    for (const t of res.body.data as { category: string }[]) {
      expect(t.category).toBe("Hardware");
    }
    // Summary of the hardware ticket must appear
    const summaries = res.body.data.map((t: { summary: string }) => t.summary);
    expect(summaries).toContain("Hardware screen is flickering");
  });

  it("API-10: no sort params → default order is createdAt descending (AC-16)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("x-requester-id", String(requesterAId));

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
      .set("x-requester-id", String(requesterAId));
    const page2 = await request(app)
      .get("/api/tickets?page=2&pageSize=10")
      .set("x-requester-id", String(requesterAId));

    expect(page2.status).toBe(200);
    expect(page2.body.pagination.page).toBe(2);
    expect(page2.body.data.length).toBeGreaterThan(0);

    // No overlap between pages
    const p1Ids = page1.body.data.map((t: { id: number }) => t.id);
    const p2Ids = page2.body.data.map((t: { id: number }) => t.id);
    expect(p1Ids.filter((id: number) => p2Ids.includes(id))).toHaveLength(0);

    // Metadata is consistent
    expect(page2.body.pagination.totalCount).toBeGreaterThanOrEqual(13);
    expect(page2.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
    expect(page2.body.pagination.pageSize).toBe(10);
  });

  it("API-12: invalid page/pageSize fall back to defaults, returns 200 (AC-18)", async () => {
    const res = await request(app)
      .get("/api/tickets?page=-1&pageSize=9999")
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
    expect(res.body).toHaveProperty("data");
  });

  it("response data items have the required fields from api-spec §5", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("x-requester-id", String(requesterAId));

    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("ticketNumber");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("summary");
      expect(item).toHaveProperty("category"); // string name, not id
      expect(item).toHaveProperty("requestedPriority");
      expect(item).toHaveProperty("currentStatus");
      expect(item).toHaveProperty("updatedAt");
    }
  });
});
