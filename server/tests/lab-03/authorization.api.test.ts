// API-16: Every protected route without session → 401 (AC-18) — table-driven
// API-17: Requester on /api/staff/* and /api/admin/* → 403 (AC-19) — PARTIAL (Issues #26/#27/#28)
// API-18: IT Staff and Admin on Requester endpoints → 403 (AC-20) — table-driven
// API-19: Requester and IT Staff on /api/admin/* → 403 (AC-21) — PARTIAL (Issue #28)
// API-20: Requester B reads A's Ticket / Attachment → 404 (AC-22)
// API-21: User deactivated mid-session → next request 401 (AC-23)
// API-22: Spoofed requesterId / x-requester-id ignored; /api/dev-requesters → 404 (AC-03, AC-24)
// API-66: Ticket creation with extra privileged fields — ignored (AC-81)
// API-68: Role changed mid-session → next request uses new role (AC-83)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join as joinPath } from "path";
import request from "supertest";
import { createApp, REGISTERED_PROTECTED_ROUTES } from "../../src/app";
import { createUser, loginAs, clearDatabase } from "../helpers";
import { prisma } from "../../src/prismaClient";
import { routes } from "./routes.table";

const app = createApp();

// ---------------------------------------------------------------------------
// Shared state — set once in beforeAll, used throughout the file
// ---------------------------------------------------------------------------

let reqUser: { id: number; email: string };
let staffUser: { id: number; email: string };
let adminUser: { id: number; email: string };
let requesterSession: string;
let staffSession: string;
let adminSession: string;

beforeAll(async () => {
  await clearDatabase();

  reqUser = await createUser({
    email: "req@authorization.test",
    password: "Auth#1234",
    name: "Auth Requester",
    role: "REQUESTER",
    mustChangePassword: false,
  });
  staffUser = await createUser({
    email: "staff@authorization.test",
    password: "Auth#1234",
    name: "Auth Staff",
    role: "IT_STAFF",
    mustChangePassword: false,
  });
  adminUser = await createUser({
    email: "admin@authorization.test",
    password: "Auth#1234",
    name: "Auth Admin",
    role: "ADMIN",
    mustChangePassword: false,
  });

  requesterSession = await loginAs(app, { email: "req@authorization.test",   password: "Auth#1234" });
  staffSession     = await loginAs(app, { email: "staff@authorization.test", password: "Auth#1234" });
  adminSession     = await loginAs(app, { email: "admin@authorization.test", password: "Auth#1234" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/** Send a request with no session cookie (no CSRF header needed — auth check is first). */
async function sendWithoutSession(method: string, abstractPath: string) {
  const testPath = abstractPath.replace(/:[\w]+/g, "99999");
  switch (method) {
    case "GET":    return request(app).get(testPath);
    case "POST":   return request(app).post(testPath).send({});
    case "PATCH":  return request(app).patch(testPath).send({});
    case "PUT":    return request(app).put(testPath).send({});
    case "DELETE": return request(app).delete(testPath).send({});
    default: throw new Error(`Unknown method: ${method}`);
  }
}

/** Send a request with a session cookie; adds CSRF header on mutating methods so
 *  the role check (step 4) fires, not the CSRF check (step 3). */
async function sendAsRole(method: string, abstractPath: string, session: string) {
  const testPath = abstractPath.replace(/:[\w]+/g, "99999");
  switch (method) {
    case "GET":
      return request(app).get(testPath).set("Cookie", session);
    case "POST":
      return request(app).post(testPath).set("Cookie", session).set("X-Requested-With", "TokTickIT").send({});
    case "PATCH":
      return request(app).patch(testPath).set("Cookie", session).set("X-Requested-With", "TokTickIT").send({});
    case "PUT":
      return request(app).put(testPath).set("Cookie", session).set("X-Requested-With", "TokTickIT").send({});
    case "DELETE":
      return request(app).delete(testPath).set("Cookie", session).set("X-Requested-With", "TokTickIT").send({});
    default: throw new Error(`Unknown method: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Route table coverage — three guards that together prevent a route from being
// added to the app without a corresponding row in routes.table.ts.
//
// Guard 1 & 2 (sync check): REGISTERED_PROTECTED_ROUTES (app.ts, hand-written,
//   co-located with app.use() calls) must match routes.table.ts exactly.
//   Fails if a developer updates one list but not the other.
//
// Guard 3 (source-file scan): scans src/routes/*.ts for router.method("path")
//   declarations. Catches the case where a route is added to an existing route
//   file and REGISTERED_PROTECTED_ROUTES is also updated, but routes.table.ts
//   is forgotten. When a new route FILE is added, add it to mountPaths below
//   (the sync check covers that omission via REGISTERED_PROTECTED_ROUTES).
//
// Express 5 does not expose a stable public API for route introspection, so
// the source-file scan is used instead of app._router.stack parsing.
// ---------------------------------------------------------------------------

describe("Route table coverage", () => {
  it("every route in app.ts REGISTERED_PROTECTED_ROUTES has a row in routes.table.ts", () => {
    const tableKeys = new Set(routes.map(r => `${r.method} ${r.path}`));
    const missing = REGISTERED_PROTECTED_ROUTES
      .map(r => `${r.method} ${r.path}`)
      .filter(k => !tableKeys.has(k));
    expect(missing, `Missing from routes.table.ts: [${missing.join(", ")}]`).toHaveLength(0);
  });

  it("every row in routes.table.ts is registered in app.ts REGISTERED_PROTECTED_ROUTES", () => {
    const appKeys = new Set(REGISTERED_PROTECTED_ROUTES.map(r => `${r.method} ${r.path}`));
    const orphans = routes
      .map(r => `${r.method} ${r.path}`)
      .filter(k => !appKeys.has(k));
    expect(orphans, `Orphan rows in routes.table.ts: [${orphans.join(", ")}]`).toHaveLength(0);
  });

  it("no route in src/routes/ is missing from routes.table.ts (source-file guard)", () => {
    const routesDir = joinPath(__dirname, "../../src/routes");
    const tableKeys = new Set(routes.map(r => `${r.method} ${r.path}`));

    // Mirror of app.ts app.use() calls for protected route files.
    // Add new entries here when new route files are mounted. The sync check
    // (guards 1 & 2) already enforces REGISTERED_PROTECTED_ROUTES; this guard
    // catches in-place additions to existing files.
    const mountPaths: Record<string, string> = {
      "auth.ts":            "/api/auth",
      "categories.ts":      "/api/categories",
      "related-systems.ts": "/api/related-systems",
      "tickets.ts":         "/api/tickets",
      "staff.ts":           "/api/staff",   // Issue #26 (queue); detail added by Issue #27
      "admin.ts":           "/api/admin",   // Issue #28 (Administrator User Management)
    };

    // Routes that are intentionally public (not required in routes.table.ts)
    const publicRouteKeys = new Set([
      "POST /api/auth/login",
      "POST /api/auth/logout",
    ]);

    const missing: string[] = [];
    for (const [file, mount] of Object.entries(mountPaths)) {
      const content = readFileSync(joinPath(routesDir, file), "utf8");
      // Match router.get/post/patch/put/delete("path", ...) — handles multi-line
      const pattern = /router\.(get|post|patch|put|delete)\s*\(\s*["']([^"']+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(content)) !== null) {
        const method = m[1].toUpperCase();
        const sub = m[2] === "/" ? "" : m[2];
        const key = `${method} ${mount}${sub}`;
        if (!publicRouteKeys.has(key) && !tableKeys.has(key)) {
          missing.push(key);
        }
      }
    }

    expect(
      missing,
      `Routes in src/routes/ missing from routes.table.ts: [${missing.join(", ")}]`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// API-16: Table-driven — every protected route without a session returns 401
// ---------------------------------------------------------------------------

describe("API-16: Every protected route without a session returns 401 (AC-18)", () => {
  for (const route of routes) {
    it(`API-16: ${route.method} ${route.path} → 401`, async () => {
      const res = await sendWithoutSession(route.method, route.path);
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// API-17: Requester on /api/staff/* and /api/admin/* → 403
// Table-driven over every staff-only and admin-only route. Now that Issues
// #26/#27 (staff) and #28 (admin) have added their rows to routes.table.ts,
// this is fully populated — the earlier it.todo placeholder is removed.
// ---------------------------------------------------------------------------

describe("API-17: Requester on staff/admin endpoints → 403 (AC-19)", () => {
  const staffOrAdminOnlyRoutes = routes.filter(
    r => r.allowedRoles.length > 0 && !r.allowedRoles.includes("REQUESTER")
  );

  for (const route of staffOrAdminOnlyRoutes) {
    it(`API-17: REQUESTER → ${route.method} ${route.path} → 403`, async () => {
      const res = await sendAsRole(route.method, route.path, requesterSession);
      expect(res.status).toBe(403);
    });
  }
});

// ---------------------------------------------------------------------------
// API-18: IT Staff and Admin on Requester-only endpoints → 403
// FULL for current routes. Gains additional coverage as later Issues add
// more REQUESTER-only routes.
// ---------------------------------------------------------------------------

describe("API-18: IT Staff and Admin on Requester endpoints → 403 (AC-20)", () => {
  const requesterOnlyRoutes = routes.filter(
    r =>
      r.allowedRoles.includes("REQUESTER") &&
      !r.allowedRoles.includes("IT_STAFF") &&
      !r.allowedRoles.includes("ADMIN")
  );

  for (const route of requesterOnlyRoutes) {
    it(`API-18: IT_STAFF → ${route.method} ${route.path} → 403`, async () => {
      const res = await sendAsRole(route.method, route.path, staffSession);
      expect(res.status).toBe(403);
    });

    it(`API-18: ADMIN → ${route.method} ${route.path} → 403`, async () => {
      const res = await sendAsRole(route.method, route.path, adminSession);
      expect(res.status).toBe(403);
    });
  }
});

// ---------------------------------------------------------------------------
// API-19: Requester and IT Staff on /api/admin/* → 403
// PARTIAL — no ADMIN-only routes exist yet.
//   Gains real it() blocks when Issue #28 adds admin routes
//   (allowedRoles: ["ADMIN"]) to routes.table.ts.
// ---------------------------------------------------------------------------

describe("API-19: Requester and IT Staff on admin endpoints → 403 (AC-21) [PARTIAL — Issue #28]", () => {
  const adminOnlyRoutes = routes.filter(
    r =>
      r.allowedRoles.includes("ADMIN") &&
      !r.allowedRoles.includes("REQUESTER") &&
      !r.allowedRoles.includes("IT_STAFF")
  );

  if (adminOnlyRoutes.length === 0) {
    // No admin-only routes registered yet. The todo below keeps Vitest happy
    // (non-empty suite) without faking a pass. When Issue #28 adds rows to
    // routes.table.ts the else branch creates real it() tests instead.
    it.todo("API-19: Requester/IT_STAFF → admin routes → 403 (no routes registered yet; completes in Issue #28)");
  } else {
    for (const route of adminOnlyRoutes) {
      it(`API-19: REQUESTER → ${route.method} ${route.path} → 403`, async () => {
        const res = await sendAsRole(route.method, route.path, requesterSession);
        expect(res.status).toBe(403);
      });

      it(`API-19: IT_STAFF → ${route.method} ${route.path} → 403`, async () => {
        const res = await sendAsRole(route.method, route.path, staffSession);
        expect(res.status).toBe(403);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// API-20: Requester B reads Requester A's Ticket and Attachment → 404
// ---------------------------------------------------------------------------

describe("API-20: Requester B reads Requester A's Ticket and Attachment → 404 (AC-22)", () => {
  let sessionB: string;
  let ticketId: number;
  let attachmentId: number;

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
    // Create Requester B (separate from the shared requester)
    await createUser({
      email: "req-b@authorization.test",
      password: "Auth#1234",
      name: "Auth Requester B",
      role: "REQUESTER",
      mustChangePassword: false,
    });
    sessionB = await loginAs(app, { email: "req-b@authorization.test", password: "Auth#1234" });

    // Create a ticket owned by Requester A (shared requester)
    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    const ticketRes = await request(app)
      .post("/api/tickets")
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(cat!.id))
      .field("relatedSystemId", String(sys!.id))
      .field("summary", "API-20 ownership test ticket")
      .field("description", "Ticket owned by Requester A for ownership test.")
      .field("requestedPriority", "LOW");

    ticketId = ticketRes.body.id;

    // Add an attachment to A's ticket
    const attRes = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "api20.jpg", contentType: "image/jpeg" });

    attachmentId = attRes.body.id;
  });

  it("API-20: B reads A's ticket → 404 (AC-22)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Cookie", sessionB);

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("summary");
    expect(res.body).not.toHaveProperty("ticketNumber");
  });

  it("API-20: B adds attachment to A's ticket → 404 (AC-22)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionB)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "b-spoof.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
  });

  it("API-20: B downloads A's attachment → 404 (AC-22)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}/download`)
      .set("Cookie", sessionB);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// API-21: User deactivated mid-session → next request 401, sessions deleted
// ---------------------------------------------------------------------------

describe("API-21: User deactivated mid-session → 401 on next request (AC-23)", () => {
  it("API-21: deactivated user gets 401 on next request; sessions are gone", async () => {
    // Create a fresh user and log in
    const freshUser = await createUser({
      email: "deactivate-me@authorization.test",
      password: "Auth#1234",
      name: "To Deactivate",
      role: "REQUESTER",
      mustChangePassword: false,
    });
    const freshSession = await loginAs(app, {
      email: "deactivate-me@authorization.test",
      password: "Auth#1234",
    });

    // Verify the session works
    const before = await request(app)
      .get("/api/auth/me")
      .set("Cookie", freshSession);
    expect(before.status).toBe(200);

    // Deactivate via Prisma (BR-13 — requireAuth reads isActive on every request)
    await prisma.user.update({
      where: { id: freshUser.id },
      data: { isActive: false },
    });

    // Next request with the same cookie → 401 (requireAuth detects inactive user)
    const after = await request(app)
      .get("/api/auth/me")
      .set("Cookie", freshSession);
    expect(after.status).toBe(401);

    // requireAuth cleans up sessions on inactive user detection (BR-13)
    const remainingSessions = await prisma.session.count({
      where: { userId: freshUser.id },
    });
    expect(remainingSessions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// API-22: Spoofed requesterId / x-requester-id ignored; /api/dev-requesters → 404
// ---------------------------------------------------------------------------

describe("API-22: Spoofed requesterId and x-requester-id ignored; dev-requesters removed (AC-03, AC-24)", () => {
  it("API-22: x-requester-id header is ignored — session identity used (AC-03)", async () => {
    // GET /api/tickets with a spoofed x-requester-id pointing to another user
    // Result: returns the session user's own tickets (empty list), not an error
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", requesterSession)
      .set("x-requester-id", String(staffUser.id));  // spoofed: another user's id

    expect(res.status).toBe(200);
    // All returned tickets must belong to the session user, not the spoofed id
    for (const t of res.body.data as Array<{ id: number }>) {
      const dbTicket = await prisma.ticket.findUnique({ where: { id: t.id } });
      expect(dbTicket?.requesterId).toBe(reqUser.id);
    }
  });

  it("API-22: GET /api/dev-requesters returns 404 for unauthenticated caller (AC-24)", async () => {
    const res = await request(app).get("/api/dev-requesters");
    expect(res.status).toBe(404);
  });

  it("API-22: GET /api/dev-requesters returns 404 for authenticated caller (AC-24)", async () => {
    const res = await request(app)
      .get("/api/dev-requesters")
      .set("Cookie", requesterSession);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// API-66: Ticket creation with extra privileged fields — fields are ignored
// ---------------------------------------------------------------------------

describe("API-66: Ticket creation ignores extra privileged fields (AC-81)", () => {
  it("API-66: currentStatus, ownerId, itPriority, requesterId in body are ignored (AC-81)", async () => {
    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", requesterSession)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(cat!.id))
      .field("relatedSystemId", String(sys!.id))
      .field("summary", "API-66 privilege field test")
      .field("description", "Extra privileged fields in the body must be silently ignored.")
      .field("requestedPriority", "MEDIUM")
      // Privileged fields that must be ignored (BR-68)
      .field("currentStatus", "CLOSED")   // must remain NEW
      .field("ownerId", "99999")           // must remain null
      .field("itPriority", "HIGH")         // must equal requestedPriority (MEDIUM)
      .field("requesterId", "99999");      // must be session user id

    expect(res.status).toBe(201);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.itPriority).toBe("MEDIUM");     // = requestedPriority, not "HIGH"
    expect(res.body.requesterId).toBe(reqUser.id);  // session user, not 99999

    // Verify ownerId in DB (not in the 201 response shape)
    const dbTicket = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(dbTicket?.ownerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API-68: Role changed mid-session → next request uses the new role
// ---------------------------------------------------------------------------

describe("API-68: Role changed mid-session → permissions change immediately (AC-83)", () => {
  it("API-68: IT_STAFF changed to REQUESTER can now access /api/tickets (AC-83)", async () => {
    // Create a fresh IT_STAFF user
    const roleChangeUser = await createUser({
      email: "role-change@authorization.test",
      password: "Auth#1234",
      name: "Role Change User",
      role: "IT_STAFF",
      mustChangePassword: false,
    });
    const roleChangeSession = await loginAs(app, {
      email: "role-change@authorization.test",
      password: "Auth#1234",
    });

    // Before role change: IT_STAFF cannot access Requester route → 403
    const before = await request(app)
      .get("/api/tickets")
      .set("Cookie", roleChangeSession);
    expect(before.status).toBe(403);

    // Change role to REQUESTER via Prisma (BR-13 — role is re-read on every request)
    await prisma.user.update({
      where: { id: roleChangeUser.id },
      data: { role: "REQUESTER" },
    });

    // After role change: same session cookie now has REQUESTER permissions → 200
    const after = await request(app)
      .get("/api/tickets")
      .set("Cookie", roleChangeSession);
    expect(after.status).toBe(200);
  });

  it("API-68: REQUESTER changed to IT_STAFF can no longer access /api/tickets (AC-83)", async () => {
    // Create a fresh REQUESTER user
    const demoteUser = await createUser({
      email: "demote-req@authorization.test",
      password: "Auth#1234",
      name: "Demote Requester",
      role: "REQUESTER",
      mustChangePassword: false,
    });
    const demoteSession = await loginAs(app, {
      email: "demote-req@authorization.test",
      password: "Auth#1234",
    });

    // Before role change: REQUESTER can access /api/tickets → 200
    const before = await request(app)
      .get("/api/tickets")
      .set("Cookie", demoteSession);
    expect(before.status).toBe(200);

    // Change role to IT_STAFF via Prisma
    await prisma.user.update({
      where: { id: demoteUser.id },
      data: { role: "IT_STAFF" },
    });

    // After role change: same session → IT_STAFF cannot access Requester routes → 403
    const after = await request(app)
      .get("/api/tickets")
      .set("Cookie", demoteSession);
    expect(after.status).toBe(403);
  });
});
