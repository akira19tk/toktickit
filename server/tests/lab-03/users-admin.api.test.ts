// Administrator User Management (Issue #28) — behavior tests.
// API-55: Admin lists, searches and filters users; no password data (AC-58)
// API-56: Admin creates a user; new user logs in, first login gated (AC-59)
// API-57: Duplicate email (different case) on create and edit → 409 EMAIL_TAKEN (AC-60)
// API-58: Invalid name/email/role; weak initial password on create and set-initial-password (AC-61)
// API-59: Edit name/email/role/activation; deactivation revokes sessions (AC-62)
// API-60: Admin deactivates self → 409 SELF_DEACTIVATION (AC-63)
// API-61: Last active Admin demote/deactivate → 409 LAST_ADMIN; succeeds with a second Admin (AC-64)
// API-62: Set initial password for another and for self (AC-65)
// API-63: DELETE /api/admin/users/:id → 404 or 405 (AC-66)
// API-65: Two Admins deactivate each other simultaneously → at least one active Admin remains (AC-80)
//
// Role/no-session authorization (401/403) is covered table-driven in
// authorization.api.test.ts (API-16, API-17, API-19). The test database holds
// no seeded users; each test creates exactly the users it needs.

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import path from "path";
import { readFileSync } from "fs";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();
const CSRF = ["X-Requested-With", "TokTickIT"] as const;

type Vector = { password: string; valid: boolean; reason: string };
const vectors: Vector[] = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "..", "shared", "password-vectors.json"), "utf-8")
);
const invalidVectors = vectors.filter((v) => !v.valid);
const validVector = vectors.find((v) => v.valid)!.password;

// Create an active Administrator (password change not pending) and return both
// the row and a live session cookie.
async function makeAdmin(email = "admin@users.test", name = "Admin One") {
  const user = await createUser({
    email,
    password: "Admin#1234",
    name,
    role: "ADMIN",
    mustChangePassword: false,
  });
  const session = await loginAs(app, { email, password: "Admin#1234" });
  return { user, session };
}

beforeEach(async () => {
  await clearDatabase();
});

// ── API-55 ───────────────────────────────────────────────────────────────────

describe("API-55: Admin lists, searches and filters users (AC-58)", () => {
  it("API-55: lists all users sorted by name, with role filter and search, and no password data", async () => {
    const { session } = await makeAdmin();
    await createUser({ password: "Admin#1234", email: "alice@example.com", name: "Alice Adams", role: "REQUESTER" });
    await createUser({ password: "Admin#1234", email: "michael@example.com", name: "Michael Brown", role: "IT_STAFF" });
    await createUser({ password: "Admin#1234", email: "zeb@example.com", name: "Zeb Zephyr", role: "REQUESTER" });

    const all = await request(app).get("/api/admin/users").set("Cookie", session);
    expect(all.status).toBe(200);
    const names = all.body.data.map((u: { name: string }) => u.name);
    // Sorted by name then id ("Admin One" < "Alice Adams" < "Michael Brown" < "Zeb Zephyr")
    expect(names).toEqual(["Admin One", "Alice Adams", "Michael Brown", "Zeb Zephyr"]);
    // Shape: public fields only, never a password or hash
    for (const u of all.body.data) {
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("email");
      expect(u).toHaveProperty("role");
      expect(u).toHaveProperty("isActive");
      expect(u).toHaveProperty("mustChangePassword");
      expect(u).toHaveProperty("createdAt");
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("password");
    }
    expect(JSON.stringify(all.body).toLowerCase()).not.toContain("passwordhash");

    // Role filter (exact)
    const staffOnly = await request(app).get("/api/admin/users?role=IT_STAFF").set("Cookie", session);
    expect(staffOnly.status).toBe(200);
    expect(staffOnly.body.data.map((u: { email: string }) => u.email)).toEqual(["michael@example.com"]);

    // Search by name substring (case-insensitive)
    const byName = await request(app).get("/api/admin/users?search=ali").set("Cookie", session);
    expect(byName.body.data.map((u: { email: string }) => u.email)).toEqual(["alice@example.com"]);

    // Search by email substring (case-insensitive)
    const byEmail = await request(app).get("/api/admin/users?search=MICHAEL@").set("Cookie", session);
    expect(byEmail.body.data.map((u: { email: string }) => u.email)).toEqual(["michael@example.com"]);
  });
});

// ── API-56 ───────────────────────────────────────────────────────────────────

describe("API-56: Admin creates a user; first login is gated (AC-59)", () => {
  it("API-56: create returns 201 with mustChangePassword true and no password; new user's first login is gated", async () => {
    const { session } = await makeAdmin();

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", session)
      .set(...CSRF)
      .send({
        name: "New Person",
        email: "New.Person@Example.com",
        role: "IT_STAFF",
        isActive: true,
        initialPassword: "Welcome#2026",
      });

    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.email).toBe("new.person@example.com"); // normalized (BR-06)
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("password");

    // The new user can log in …
    const newSession = await loginAs(app, { email: "new.person@example.com", password: "Welcome#2026" });

    // … but every protected endpoint except me/logout/change-password is gated.
    const me = await request(app).get("/api/auth/me").set("Cookie", newSession);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);

    const gated = await request(app).get("/api/categories").set("Cookie", newSession);
    expect(gated.status).toBe(403);
    expect(gated.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

// ── API-57 ───────────────────────────────────────────────────────────────────

describe("API-57: Duplicate email on create and edit → 409 EMAIL_TAKEN (AC-60)", () => {
  it("API-57: creating with an existing email in a different case returns 409 EMAIL_TAKEN", async () => {
    const { session } = await makeAdmin();
    await createUser({ password: "Admin#1234", email: "bob@example.com", name: "Bob Smith", role: "REQUESTER" });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", session)
      .set(...CSRF)
      .send({ name: "Bob Two", email: "BOB@Example.com", role: "REQUESTER", isActive: true, initialPassword: validVector });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    expect(res.body.errors?.email).toBeTruthy();
  });

  it("API-57: editing a user to an email another user holds (different case) returns 409 EMAIL_TAKEN", async () => {
    const { session } = await makeAdmin();
    await createUser({ password: "Admin#1234", email: "bob@example.com", name: "Bob Smith", role: "REQUESTER" });
    const carol = await createUser({ password: "Admin#1234", email: "carol@example.com", name: "Carol King", role: "REQUESTER" });

    const res = await request(app)
      .patch(`/api/admin/users/${carol.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ email: "Bob@EXAMPLE.com" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    expect(res.body.errors?.email).toBeTruthy();
  });

  it("API-57: editing a user to its own current email (different case) is allowed", async () => {
    const { session } = await makeAdmin();
    const carol = await createUser({ password: "Admin#1234", email: "carol@example.com", name: "Carol King", role: "REQUESTER" });

    const res = await request(app)
      .patch(`/api/admin/users/${carol.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ email: "CAROL@example.com", name: "Carol Queen" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Carol Queen");
    expect(res.body.email).toBe("carol@example.com");
  });
});

// ── API-58 ───────────────────────────────────────────────────────────────────

describe("API-58: Invalid fields and weak passwords on create / set-initial-password (AC-61)", () => {
  it("API-58: empty name, malformed email and invalid role each return 400 field errors and save nothing", async () => {
    const { session } = await makeAdmin();
    const before = await prisma.user.count();

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", session)
      .set(...CSRF)
      .send({ name: "   ", email: "not-an-email", role: "SUPERUSER", isActive: true, initialPassword: validVector });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.name).toBeTruthy();
    expect(res.body.errors.email).toBeTruthy();
    expect(res.body.errors.role).toBeTruthy();
    expect(await prisma.user.count()).toBe(before);
  });

  for (const { password, reason } of invalidVectors) {
    it(`API-58: create rejects weak initialPassword (${reason}) with only errors.initialPassword`, async () => {
      const { session } = await makeAdmin();
      const res = await request(app)
        .post("/api/admin/users")
        .set("Cookie", session)
        .set(...CSRF)
        .send({ name: "Weak Pw", email: "weak@example.com", role: "REQUESTER", isActive: true, initialPassword: password });

      expect(res.status).toBe(400);
      expect(res.body.errors.initialPassword).toBeTruthy();
      // Admin-set passwords have no current-password or confirmation fields (BR-09)
      expect(res.body.errors.currentPassword).toBeUndefined();
      expect(res.body.errors.confirmPassword).toBeUndefined();
      expect(await prisma.user.findUnique({ where: { email: "weak@example.com" } })).toBeNull();
    });
  }

  for (const { password, reason } of invalidVectors) {
    it(`API-58: set-initial-password rejects weak password (${reason}) with only errors.initialPassword`, async () => {
      const { session } = await makeAdmin();
      const target = await createUser({ password: "Admin#1234", email: "target@example.com", name: "Target", role: "REQUESTER" });

      const res = await request(app)
        .post(`/api/admin/users/${target.id}/initial-password`)
        .set("Cookie", session)
        .set(...CSRF)
        .send({ initialPassword: password });

      expect(res.status).toBe(400);
      expect(res.body.errors.initialPassword).toBeTruthy();
      expect(res.body.errors.currentPassword).toBeUndefined();
      expect(res.body.errors.confirmPassword).toBeUndefined();
    });
  }
});

// ── API-59 ───────────────────────────────────────────────────────────────────

describe("API-59: Edit name, email, role, activation; deactivation revokes sessions (AC-62)", () => {
  it("API-59: edits are saved and reflected in the list", async () => {
    const { session } = await makeAdmin();
    const u = await createUser({ password: "Admin#1234", email: "edit@example.com", name: "Edit Me", role: "REQUESTER" });

    const res = await request(app)
      .patch(`/api/admin/users/${u.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ name: "Edited Name", email: "edited@example.com", role: "IT_STAFF", isActive: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Edited Name",
      email: "edited@example.com",
      role: "IT_STAFF",
      isActive: true,
    });

    const list = await request(app).get("/api/admin/users?search=edited@").set("Cookie", session);
    expect(list.body.data[0]).toMatchObject({ name: "Edited Name", role: "IT_STAFF" });
  });

  it("API-59: deactivating a user revokes their sessions — the old cookie now gets 401", async () => {
    const { session } = await makeAdmin();
    await createUser({ password: "Admin#1234", email: "victim@example.com", name: "Victim", role: "REQUESTER", mustChangePassword: false });
    const victim = await prisma.user.findUnique({ where: { email: "victim@example.com" } });
    const victimSession = await loginAs(app, { email: "victim@example.com", password: "Admin#1234" });

    // Session works before deactivation
    expect((await request(app).get("/api/auth/me").set("Cookie", victimSession)).status).toBe(200);

    const res = await request(app)
      .patch(`/api/admin/users/${victim!.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    // Revoked: the old cookie is now rejected, and no session rows remain
    const after = await request(app).get("/api/auth/me").set("Cookie", victimSession);
    expect(after.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: victim!.id } })).toBe(0);
  });
});

// ── API-60 ───────────────────────────────────────────────────────────────────

describe("API-60: Admin deactivates self → 409 SELF_DEACTIVATION (AC-63)", () => {
  it("API-60: the sole Administrator deactivating self gets SELF_DEACTIVATION (checked before LAST_ADMIN) and stays active", async () => {
    const { user, session } = await makeAdmin(); // exactly one admin exists

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SELF_DEACTIVATION");

    const still = await prisma.user.findUnique({ where: { id: user.id } });
    expect(still!.isActive).toBe(true);
  });
});

// ── API-61 ───────────────────────────────────────────────────────────────────

describe("API-61: Last active Administrator protection (AC-64)", () => {
  it("API-61: the sole Administrator demoting their own role returns 409 LAST_ADMIN and stays ADMIN", async () => {
    const { user, session } = await makeAdmin();

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ role: "REQUESTER" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_ADMIN");
    const still = await prisma.user.findUnique({ where: { id: user.id } });
    expect(still!.role).toBe("ADMIN");
    expect(still!.isActive).toBe(true);
  });

  it("API-61: with a second active Administrator, demoting and deactivating one succeeds (200)", async () => {
    const { session } = await makeAdmin("admin1@users.test", "Admin One");
    const second = await createUser({ password: "Admin#1234", email: "admin2@users.test", name: "Admin Two", role: "ADMIN", mustChangePassword: false });

    // Deactivating the other admin is allowed while admin1 remains active
    const deact = await request(app)
      .patch(`/api/admin/users/${second.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ isActive: false });
    expect(deact.status).toBe(200);
    expect(deact.body.isActive).toBe(false);

    // Re-activate then demote — still allowed because admin1 is active
    await prisma.user.update({ where: { id: second.id }, data: { isActive: true } });
    const demote = await request(app)
      .patch(`/api/admin/users/${second.id}`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ role: "IT_STAFF" });
    expect(demote.status).toBe(200);
    expect(demote.body.role).toBe("IT_STAFF");
  });
});

// ── API-62 ───────────────────────────────────────────────────────────────────

describe("API-62: Set initial password for another user and for self (AC-65)", () => {
  it("API-62: setting another user's initial password revokes sessions, invalidates the old password and forces a change", async () => {
    const { session } = await makeAdmin();
    await createUser({ password: "Admin#1234", email: "reset@example.com", name: "Reset Me", role: "REQUESTER", mustChangePassword: false });
    const target = await prisma.user.findUnique({ where: { email: "reset@example.com" } });
    const oldSession = await loginAs(app, { email: "reset@example.com", password: "Admin#1234" });

    const res = await request(app)
      .post(`/api/admin/users/${target!.id}/initial-password`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ initialPassword: "BrandNew#99" });
    expect(res.status).toBe(204);

    // Sessions revoked — the old cookie is now rejected (401)
    expect((await request(app).get("/api/auth/me").set("Cookie", oldSession)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: target!.id } })).toBe(0);

    // Old password fails; new one works and forces a password change
    const oldLogin = await request(app).post("/api/auth/login").set(...CSRF).send({ email: "reset@example.com", password: "Admin#1234" });
    expect(oldLogin.status).toBe(401);

    const newSession = await loginAs(app, { email: "reset@example.com", password: "BrandNew#99" });
    const me = await request(app).get("/api/auth/me").set("Cookie", newSession);
    expect(me.body.user.mustChangePassword).toBe(true);
    const gated = await request(app).get("/api/categories").set("Cookie", newSession);
    expect(gated.status).toBe(403);
    expect(gated.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("API-62: setting an initial password on one's own account returns 409 SELF_PASSWORD_RESET", async () => {
    const { user, session } = await makeAdmin();

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/initial-password`)
      .set("Cookie", session)
      .set(...CSRF)
      .send({ initialPassword: "Something#12" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SELF_PASSWORD_RESET");
  });
});

// ── API-63 ───────────────────────────────────────────────────────────────────

describe("API-63: No user deletion endpoint (AC-66)", () => {
  it("API-63: DELETE /api/admin/users/:id returns 404 or 405", async () => {
    const { session } = await makeAdmin();
    const u = await createUser({ password: "Admin#1234", email: "keep@example.com", name: "Keep", role: "REQUESTER" });

    const res = await request(app)
      .delete(`/api/admin/users/${u.id}`)
      .set("Cookie", session)
      .set(...CSRF);

    expect([404, 405]).toContain(res.status);
    // The user still exists — nothing was deleted
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });
});

// ── API-65 ───────────────────────────────────────────────────────────────────

describe("API-65: Concurrent admin deactivations keep at least one active Administrator (AC-80)", () => {
  it("API-65: two Admins deactivating each other at once → exactly one succeeds and one active Admin always remains", async () => {
    const a = await makeAdmin("concurrent-a@users.test", "Concurrent A");
    const b = await makeAdmin("concurrent-b@users.test", "Concurrent B");

    // A deactivates B while B deactivates A, at the same moment.
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/admin/users/${b.user.id}`)
        .set("Cookie", a.session)
        .set(...CSRF)
        .send({ isActive: false }),
      request(app)
        .patch(`/api/admin/users/${a.user.id}`)
        .set("Cookie", b.session)
        .set(...CSRF)
        .send({ isActive: false }),
    ]);

    // Each request's caller and the account it tried to deactivate (its target).
    const calls = [
      { res: resA, caller: a.user, target: b.user },
      { res: resB, caller: b.user, target: a.user },
    ];

    // Invariant 1: exactly one request succeeds (the one that committed first).
    const winners = calls.filter((c) => c.res.status === 200);
    const others = calls.filter((c) => c.res.status !== 200);
    expect(winners).toHaveLength(1);
    expect(others).toHaveLength(1);
    const other = others[0];

    // Invariant 2: the other request is refused in one of the two legitimate
    // ways, depending on scheduling — never a weaker outcome:
    //   • 409 LAST_ADMIN — both callers were still active when it ran its
    //     count-then-write, so the last-Administrator guard blocked it; or
    //   • 401 — the winner committed first and deleted this caller's sessions
    //     (BR-13) before this request's auth check ran, so it was unauthenticated.
    expect([401, 409]).toContain(other.res.status);
    if (other.res.status === 409) {
      expect(other.res.body.code).toBe("LAST_ADMIN");
    } else {
      // The deactivated account is precisely this refused request's caller
      // (equivalently, the winner's target). Its sessions must be gone and the
      // account inactive (BR-13).
      const deactivated = await prisma.user.findUnique({ where: { id: other.caller.id } });
      expect(deactivated!.isActive).toBe(false);
      expect(await prisma.session.count({ where: { userId: other.caller.id } })).toBe(0);
    }

    // Invariant 3: the system never drops below one active Administrator (BR-52,
    // BR-67). Exactly one of the two remains active in both orderings.
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    expect(activeAdmins).toBe(1);
  });
});
