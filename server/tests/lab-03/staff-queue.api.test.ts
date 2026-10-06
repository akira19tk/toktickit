// API-38: Default queue — active only, IT Priority desc then oldest, pagination + counts (AC-36)
// API-39: Queue search by Ticket Number, Summary, Requester name (AC-37)
// API-40: Queue filters combined; status=ALL; owner=ME/UNASSIGNED (AC-38)
// API-41: Queue sort fields and invalid-param fallback (AC-39)
// API-42: Queue row fields + assignees list contents and no secrets (AC-41, AC-78)
//
// Role/authorization for these routes (no session → 401, Requester → 403) is
// covered table-driven in authorization.api.test.ts (API-16, API-17).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";
import type { Priority, TicketStatus } from "@prisma/client";

const app = createApp();

const PW = "Queue#1234";

// Users
let alice: { id: number };
let bob: { id: number };
let staff1: { id: number };
let staff2: { id: number };
let staffInactive: { id: number };

let staff1Session: string;

// Reference data
let catA: number; // Hardware
let catB: number; // Software
let sysId: number;

// Tickets (ids)
let h1: number; // HIGH  OPEN                    owner staff1, catA, Alice
let h2: number; // HIGH  NEW                     unassigned,   catA, Bob
let h3: number; // HIGH  REOPENED                owner staff2, catA, Alice
let inact1: number; // HIGH OPEN                 owner staffInactive, catA, Alice
let m1: number; // MEDIUM IN_PROGRESS           owner staff1, catB, Alice
let l1: number; // LOW   WAITING_FOR_REQUESTER   owner staff2, catA, Alice, requester-resolved
let closed1: number; // LOW CLOSED               owner staff1, catA, Alice, requester-resolved
let cancelled1: number; // MEDIUM CANCELLED      unassigned,   catA, Bob

// Default-sort order of the six active tickets (itPriority desc, createdAt asc).
let defaultActiveOrder: number[];

const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min, 0));

async function createTicket(data: {
  ticketNumber: string;
  requesterId: number;
  ownerId?: number | null;
  categoryId: number;
  summary: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  requesterResolvedAt?: Date | null;
  createdAt: Date;
}): Promise<number> {
  const t = await prisma.ticket.create({
    data: {
      ticketNumber: data.ticketNumber,
      requesterId: data.requesterId,
      ownerId: data.ownerId ?? null,
      categoryId: data.categoryId,
      relatedSystemId: sysId,
      summary: data.summary,
      description: "Seeded ticket for staff-queue API tests.",
      requestedPriority: data.requestedPriority,
      itPriority: data.itPriority,
      currentStatus: data.currentStatus,
      requesterResolvedAt: data.requesterResolvedAt ?? null,
      createdAt: data.createdAt,
    },
  });
  return t.id;
}

function ids(res: request.Response): number[] {
  return (res.body.data as Array<{ id: number }>).map((r) => r.id);
}

function row(res: request.Response, id: number) {
  return (res.body.data as Array<{ id: number }>).find((r) => r.id === id) as
    | Record<string, unknown>
    | undefined;
}

beforeAll(async () => {
  await clearDatabase();

  alice = await createUser({ email: "alice@sq.test", password: PW, name: "Alice Anderson", role: "REQUESTER", mustChangePassword: false });
  bob = await createUser({ email: "bob@sq.test", password: PW, name: "Bob Baker", role: "REQUESTER", mustChangePassword: false });
  staff1 = await createUser({ email: "michael@sq.test", password: PW, name: "Michael Brown", role: "IT_STAFF", mustChangePassword: false });
  staff2 = await createUser({ email: "sarah@sq.test", password: PW, name: "Sarah Johnson", role: "IT_STAFF", mustChangePassword: false });
  staffInactive = await createUser({ email: "emma@sq.test", password: PW, name: "Emma Clark", role: "IT_STAFF", isActive: false, mustChangePassword: false });
  // An Admin exists but owns nothing; here only to prove assignees excludes it.
  await createUser({ email: "admin@sq.test", password: PW, name: "Admin User", role: "ADMIN", mustChangePassword: false });

  staff1Session = await loginAs(app, { email: "michael@sq.test", password: PW });

  const hardware = await prisma.category.findFirst({ where: { name: "Hardware" } });
  const software = await prisma.category.findFirst({ where: { name: "Software" } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
  catA = hardware!.id;
  catB = software!.id;
  sysId = sys!.id;

  h1 = await createTicket({ ticketNumber: "TKT-SQ-0001", requesterId: alice.id, ownerId: staff1.id, categoryId: catA, summary: "Printer on fire", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "OPEN", createdAt: at(1) });
  h2 = await createTicket({ ticketNumber: "TKT-SQ-0002", requesterId: bob.id, ownerId: null, categoryId: catA, summary: "VPN keeps dropping", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "NEW", createdAt: at(2) });
  h3 = await createTicket({ ticketNumber: "TKT-SQ-0003", requesterId: alice.id, ownerId: staff2.id, categoryId: catA, summary: "Email sync broken", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "REOPENED", createdAt: at(3) });
  inact1 = await createTicket({ ticketNumber: "TKT-SQ-0004", requesterId: alice.id, ownerId: staffInactive.id, categoryId: catA, summary: "Server rack noise", requestedPriority: "HIGH", itPriority: "HIGH", currentStatus: "OPEN", createdAt: at(4) });
  m1 = await createTicket({ ticketNumber: "TKT-SQ-0005", requesterId: alice.id, ownerId: staff1.id, categoryId: catB, summary: "Laptop battery drains", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "IN_PROGRESS", createdAt: at(5) });
  l1 = await createTicket({ ticketNumber: "TKT-SQ-0006", requesterId: alice.id, ownerId: staff2.id, categoryId: catA, summary: "Monitor flicker", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "WAITING_FOR_REQUESTER", requesterResolvedAt: at(6), createdAt: at(6) });
  closed1 = await createTicket({ ticketNumber: "TKT-SQ-0007", requesterId: alice.id, ownerId: staff1.id, categoryId: catA, summary: "Keyboard replaced", requestedPriority: "LOW", itPriority: "LOW", currentStatus: "CLOSED", requesterResolvedAt: at(7), createdAt: at(7) });
  cancelled1 = await createTicket({ ticketNumber: "TKT-SQ-0008", requesterId: bob.id, ownerId: null, categoryId: catA, summary: "Duplicate request", requestedPriority: "MEDIUM", itPriority: "MEDIUM", currentStatus: "CANCELLED", createdAt: at(8) });

  // itPriority desc (HIGH, MEDIUM, LOW) then createdAt asc then id asc
  defaultActiveOrder = [h1, h2, h3, inact1, m1, l1];
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── API-38 ───────────────────────────────────────────────────────────────────

describe("API-38: Default queue", () => {
  it("API-38: active only, IT Priority desc then oldest, with pagination and counts (AC-36)", async () => {
    const res = await request(app).get("/api/staff/tickets").set("Cookie", staff1Session);

    expect(res.status).toBe(200);
    // Only active tickets (no CLOSED or CANCELLED), in default order
    expect(ids(res)).toEqual(defaultActiveOrder);
    for (const r of res.body.data as Array<{ currentStatus: string }>) {
      expect(r.currentStatus).not.toBe("CLOSED");
      expect(r.currentStatus).not.toBe("CANCELLED");
    }
    // IT Priority descending (HIGH first)
    expect((res.body.data as Array<{ itPriority: string }>).map((r) => r.itPriority)).toEqual([
      "HIGH", "HIGH", "HIGH", "HIGH", "MEDIUM", "LOW",
    ]);

    expect(res.body.pagination).toEqual({ page: 1, pageSize: 10, totalCount: 6, totalPages: 1 });
    // counts cover active tickets and ignore filters (BR-57); assignedToMe is staff1's
    expect(res.body.counts).toEqual({ unassigned: 1, assignedToMe: 2, requesterResolved: 1 });
  });
});

// ── API-39 ───────────────────────────────────────────────────────────────────

describe("API-39: Queue search", () => {
  it("API-39: search by Summary (case-insensitive substring) (AC-37)", async () => {
    const res = await request(app).get("/api/staff/tickets?search=battery").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m1]);
  });

  it("API-39: search by Requester name (case-insensitive) (AC-37)", async () => {
    const res = await request(app).get("/api/staff/tickets?search=bob").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    // Only Bob's active ticket (his cancelled one is excluded by default ACTIVE)
    expect(ids(res)).toEqual([h2]);
  });

  it("API-39: search by Ticket Number substring (AC-37)", async () => {
    const res = await request(app).get("/api/staff/tickets?search=SQ-0003").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([h3]);
  });

  it("API-39: no match returns an empty page (AC-37)", async () => {
    const res = await request(app).get("/api/staff/tickets?search=zzzznomatch").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([]);
    expect(res.body.pagination.totalCount).toBe(0);
  });
});

// ── API-40 ───────────────────────────────────────────────────────────────────

describe("API-40: Queue filters", () => {
  it("API-40: status=ALL includes CLOSED and CANCELLED (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?status=ALL").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([h1, h2, h3, inact1, m1, l1, closed1, cancelled1].sort());
    expect(ids(res)).toContain(closed1);
    expect(ids(res)).toContain(cancelled1);
  });

  it("API-40: owner=UNASSIGNED returns only unassigned active tickets (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?owner=UNASSIGNED").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([h2]);
  });

  it("API-40: owner=ME returns the caller's active tickets (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?owner=ME").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([h1, m1].sort());
  });

  it("API-40: filters combine with AND — status=ALL AND owner=UNASSIGNED (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?status=ALL&owner=UNASSIGNED").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([h2, cancelled1].sort());
  });

  it("API-40: priority=HIGH filter (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?priority=HIGH").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([h1, h2, h3, inact1].sort());
  });

  it("API-40: categoryId filter (AC-38)", async () => {
    const res = await request(app).get(`/api/staff/tickets?categoryId=${catB}`).set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([m1]);
  });

  it("API-40: priority=HIGH AND owner=ME combine with AND (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?priority=HIGH&owner=ME").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([h1]);
  });

  it("API-40: requesterResolved=true returns only active Requester-indicated-resolved tickets (AC-38)", async () => {
    const res = await request(app).get("/api/staff/tickets?requesterResolved=true").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    // l1 is active + requester-resolved; closed1 is requester-resolved but CLOSED
    // (not active under the default ACTIVE status), so it is excluded.
    expect(ids(res)).toEqual([l1]);
  });

  it("API-40: requesterResolved=true ANDs with another filter (AC-38)", async () => {
    // l1 is owned by staff2 → matches; combined AND yields l1
    const match = await request(app)
      .get(`/api/staff/tickets?requesterResolved=true&owner=${staff2.id}`)
      .set("Cookie", staff1Session);
    expect(match.status).toBe(200);
    expect(ids(match)).toEqual([l1]);

    // l1 is LOW priority → priority=HIGH AND requesterResolved yields nothing
    const none = await request(app)
      .get("/api/staff/tickets?requesterResolved=true&priority=HIGH")
      .set("Cookie", staff1Session);
    expect(none.status).toBe(200);
    expect(ids(none)).toEqual([]);
  });

  it("API-40: an invalid requesterResolved value is ignored (AC-38)", async () => {
    // requesterResolved=yes must be ignored → same as the default queue
    const res = await request(app).get("/api/staff/tickets?requesterResolved=yes").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(defaultActiveOrder);
  });
});

// ── API-41 ───────────────────────────────────────────────────────────────────

describe("API-41: Queue sort and invalid-param fallback", () => {
  it("API-41: sortBy=ticketNumber asc (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?sortBy=ticketNumber&sortDir=asc").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([h1, h2, h3, inact1, m1, l1]);
  });

  it("API-41: sortBy=ticketNumber desc (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?sortBy=ticketNumber&sortDir=desc").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([l1, m1, inact1, h3, h2, h1]);
  });

  it("API-41: sortBy=createdAt desc (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?sortBy=createdAt&sortDir=desc").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([l1, m1, inact1, h3, h2, h1]);
  });

  it("API-41: unsupported sortBy falls back to the default order, 200 (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?sortBy=bogus&sortDir=weird").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(defaultActiveOrder);
  });

  it("API-41: invalid page and pageSize fall back to defaults, 200 (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?page=abc&pageSize=999").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
  });

  it("API-41: pageSize=50 is accepted at the limit (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?pageSize=50").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(50);
  });

  it("API-41: pagination slices the result set (page=2,pageSize=2) (AC-39)", async () => {
    const res = await request(app).get("/api/staff/tickets?page=2&pageSize=2").set("Cookie", staff1Session);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([h3, inact1]); // items 3–4 of the default order
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 2, totalCount: 6, totalPages: 3 });
  });
});

// ── API-42 ───────────────────────────────────────────────────────────────────

describe("API-42: Queue row fields and assignees", () => {
  it("API-42: owner name/null/(inactive marker), requester, badges and resolved marker (AC-41, AC-78)", async () => {
    const res = await request(app).get("/api/staff/tickets").set("Cookie", staff1Session);
    expect(res.status).toBe(200);

    // Active owner → isActiveStaff true
    const rowH3 = row(res, h3)!;
    expect(rowH3.owner).toEqual({ id: staff2.id, name: "Sarah Johnson", isActiveStaff: true });

    // Owner later deactivated / non-active staff → kept but marked (AC-78)
    const rowInact = row(res, inact1)!;
    expect((rowInact.owner as Record<string, unknown>).id).toBe(staffInactive.id);
    expect((rowInact.owner as Record<string, unknown>).name).toBe("Emma Clark");
    expect((rowInact.owner as Record<string, unknown>).isActiveStaff).toBe(false);

    // Unassigned → owner null
    const rowH2 = row(res, h2)!;
    expect(rowH2.owner).toBeNull();
    expect(rowH2.requester).toEqual({ id: bob.id, name: "Bob Baker" });

    // Requester-indicated-resolved marker
    expect(row(res, l1)!.requesterResolvedAt).toBeTruthy();
    expect(row(res, h1)!.requesterResolvedAt).toBeNull();

    // Badge data and category name string
    const rowH1 = row(res, h1)!;
    expect(rowH1.currentStatus).toBe("OPEN");
    expect(rowH1.itPriority).toBe("HIGH");
    expect(rowH1.requestedPriority).toBe("HIGH");
    expect(rowH1.category).toBe("Hardware");

    // No password material anywhere in the queue payload
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/passwordHash/i);
    expect(json).not.toMatch(/"password"/i);
  });

  it("API-42: assignees lists only active IT Staff, id+name only, no secrets", async () => {
    const res = await request(app).get("/api/staff/assignees").set("Cookie", staff1Session);
    expect(res.status).toBe(200);

    const list = res.body as Array<{ id: number; name: string }>;
    const listIds = list.map((s) => s.id);

    // Active IT Staff only
    expect(listIds).toContain(staff1.id);
    expect(listIds).toContain(staff2.id);
    // No inactive staff, no Requester, no Admin
    expect(listIds).not.toContain(staffInactive.id);
    expect(listIds).not.toContain(alice.id);
    expect(listIds).not.toContain(bob.id);
    expect(list.length).toBe(2);

    // Sorted by name
    expect(list.map((s) => s.name)).toEqual(["Michael Brown", "Sarah Johnson"]);

    // Exactly {id, name} per entry — nothing else leaks
    for (const s of list) {
      expect(Object.keys(s).sort()).toEqual(["id", "name"]);
    }
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/passwordHash/i);
    expect(json).not.toMatch(/"password"/i);
    expect(json).not.toMatch(/email/i);
    expect(json).not.toMatch(/role/i);
  });
});
