// Auth API tests for Stage C — API-01..API-15, API-70
// Tests run sequentially (fileParallelism: false in vitest.config.ts).
// Each describe block calls clearDatabase() in beforeEach so tests are isolated.

import crypto from "crypto";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { createUser, loginAs, clearDatabase } from "../helpers";
import { prisma } from "../../src/prismaClient";
import { resetThrottles } from "../../src/routes/auth";
import path from "path";
import fs from "fs";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Cookie-parsing helpers
// ---------------------------------------------------------------------------

function getSessionCookies(res: request.Response): string[] {
  const raw = res.headers["set-cookie"] as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function findSessionCookie(res: request.Response): string | undefined {
  return getSessionCookies(res).find((c) => c.startsWith("tt_session="));
}

/** Extract the token value from a Set-Cookie header string. */
function extractTokenFromSetCookie(cookie: string): string {
  return cookie.split(";")[0].split("=")[1];
}

/** Build a Cookie header string from a Set-Cookie header string. */
function toCookieHeader(setCookieValue: string): string {
  const nameValue = setCookieValue.split(";")[0];
  return nameValue; // e.g. "tt_session=abc123"
}

// ---------------------------------------------------------------------------
// API-01: Valid login — cookie attributes and identity
// ---------------------------------------------------------------------------
describe("API-01: Valid login", () => {
  beforeEach(clearDatabase);

  it("API-01: 200 with public user object (no hash) and correct cookie attributes", async () => {
    const user = await createUser({
      email: "api01@example.com",
      password: "Correct#1",
      name: "Api One",
      role: "REQUESTER",
      mustChangePassword: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api01@example.com", password: "Correct#1" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: "Api One",
      email: "api01@example.com",
      role: "REQUESTER",
      mustChangePassword: false,
    });
    // No password hash in response
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const sessionCookie = findSessionCookie(res);
    expect(sessionCookie).toBeTruthy();

    const cookieLower = sessionCookie!.toLowerCase();
    expect(cookieLower).toContain("httponly");
    expect(cookieLower).toContain("samesite=lax");
    expect(cookieLower).toContain("path=/");

    // Expiry should be ~8 hours from now
    const expiresPart = sessionCookie!
      .split(";")
      .find((p) => p.trim().toLowerCase().startsWith("expires="));
    expect(expiresPart).toBeTruthy();
    const expiresDate = new Date(expiresPart!.split("=").slice(1).join("=").trim());
    const nowMs = Date.now();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    expect(expiresDate.getTime()).toBeGreaterThan(nowMs + eightHoursMs - 60_000);
    expect(expiresDate.getTime()).toBeLessThan(nowMs + eightHoursMs + 60_000);

    // Secure must NOT be set when not in production
    expect(cookieLower).not.toContain("secure");
  });
});

// ---------------------------------------------------------------------------
// API-02: Login with mixed-case / padded email
// ---------------------------------------------------------------------------
describe("API-02: Login with mixed-case, padded email", () => {
  beforeEach(clearDatabase);

  it("API-02: normalises email and returns 200 for the same user", async () => {
    const user = await createUser({
      email: "mixedcase@example.com",
      password: "Correct#2",
      mustChangePassword: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "  MixedCase@EXAMPLE.COM  ", password: "Correct#2" });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe("mixedcase@example.com");
  });
});

// ---------------------------------------------------------------------------
// API-03: Unknown email vs wrong password — identical generic 401
// ---------------------------------------------------------------------------
describe("API-03: Unknown email vs wrong password", () => {
  beforeEach(clearDatabase);

  it("API-03: unknown email returns 401 INVALID_CREDENTIALS with no cookie", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "ghost-api03@example.com", password: "SomePass1" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(findSessionCookie(res)).toBeUndefined();
  });

  it("API-03: wrong password returns 401 INVALID_CREDENTIALS with no cookie", async () => {
    await createUser({
      email: "api03-known@example.com",
      password: "Correct#3",
      mustChangePassword: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api03-known@example.com", password: "WrongPass1" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(findSessionCookie(res)).toBeUndefined();
  });

  it("API-03: both 401 responses have the same body shape", async () => {
    await createUser({
      email: "api03-body@example.com",
      password: "Correct#3",
      mustChangePassword: false,
    });

    const unknownRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "nobody-api03@example.com", password: "Whatever1" });

    const wrongPwRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api03-body@example.com", password: "WrongPass1" });

    expect(unknownRes.body.code).toBe(wrongPwRes.body.code);
    expect(unknownRes.body.error).toBe(wrongPwRes.body.error);
  });
});

// ---------------------------------------------------------------------------
// API-04: Inactive account
// ---------------------------------------------------------------------------
describe("API-04: Inactive account login", () => {
  beforeEach(clearDatabase);

  it("API-04: correct password on inactive account returns 403 ACCOUNT_INACTIVE, no cookie", async () => {
    await createUser({
      email: "inactive-api04@example.com",
      password: "Correct#4",
      isActive: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "inactive-api04@example.com", password: "Correct#4" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
    expect(findSessionCookie(res)).toBeUndefined();
  });

  it("API-04: wrong password on inactive account returns generic 401", async () => {
    await createUser({
      email: "inactive-wrong-api04@example.com",
      password: "Correct#4",
      isActive: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "inactive-wrong-api04@example.com", password: "WrongPass1" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });
});

// ---------------------------------------------------------------------------
// API-05: Login throttle (BR-08)
// Note: uses unique email addresses not used elsewhere to avoid throttle
// state interference between tests.
// ---------------------------------------------------------------------------
describe("API-05: Login throttle — 5 failures then 429", () => {
  beforeEach(clearDatabase);

  it("API-05: 6th login attempt returns 429 even with correct password (known email)", async () => {
    await createUser({
      email: "api05-lock@example.com",
      password: "Correct#5",
      mustChangePassword: false,
    });

    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-lock@example.com", password: "WrongPass1" });
      expect(r.status).toBe(401);
    }

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api05-lock@example.com", password: "Correct#5" });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(findSessionCookie(res)).toBeUndefined();
  });

  it("API-05: unknown email is throttled the same way after 5 failures", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-ghost@nowhere.invalid", password: "WrongPass1" });
      expect(r.status).toBe(401);
    }

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api05-ghost@nowhere.invalid", password: "Correct#5" });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("API-05: a successful login before the 5th failure resets the counter", async () => {
    await createUser({
      email: "api05-reset@example.com",
      password: "Correct#5",
      mustChangePassword: false,
    });

    // 2 failures
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-reset@example.com", password: "WrongPass1" });
    }

    // Successful login resets counter
    const ok = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api05-reset@example.com", password: "Correct#5" });
    expect(ok.status).toBe(200);

    // Now 4 more failures — should not reach the 5-failure threshold yet
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-reset@example.com", password: "WrongPass1" });
    }

    // 5th failure (first failure since reset)
    const fifth = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api05-reset@example.com", password: "WrongPass1" });
    expect(fifth.status).toBe(401); // still just 401 — only locked after 5th failure triggers lock
  });

  // ── Lockout duration — verified with fake timers ──────────────────────────
  // vi.useFakeTimers({ toFake: ["Date"] }) replaces Date.now globally.
  // resetThrottles() then calls createThrottle() which captures the fake
  // Date.now as its default clock. vi.setSystemTime moves the fake clock.
  // afterEach restores real timers and rebinds the throttle to real Date.now.
  describe("API-05: lockout duration (fake timers)", () => {
    const T0 = 1_800_000_000_000; // 2027-01-15T08:00:00.000Z — well-defined epoch

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(T0);
      resetThrottles(); // throttle now uses fake Date.now
    });

    afterEach(() => {
      vi.useRealTimers();
      resetThrottles(); // rebind to real Date.now for subsequent tests
    });

    it("API-05: lock holds at 14 minutes 59 seconds after the 5th failure", async () => {
      await createUser({
        email: "api05-t-lock@example.com",
        password: "Correct#5t",
        mustChangePassword: false,
      });

      for (let i = 0; i < 5; i++) {
        const r = await request(app)
          .post("/api/auth/login")
          .set("X-Requested-With", "TokTickIT")
          .send({ email: "api05-t-lock@example.com", password: "WrongPass1" });
        expect(r.status).toBe(401);
      }

      vi.setSystemTime(T0 + 14 * 60 * 1000 + 59 * 1000); // 14m 59s

      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-t-lock@example.com", password: "Correct#5t" });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    });

    it("API-05: lock expires and correct login succeeds at 15 minutes 1 second after the 5th failure", async () => {
      await createUser({
        email: "api05-t-expire@example.com",
        password: "Correct#5t",
        mustChangePassword: false,
      });

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/login")
          .set("X-Requested-With", "TokTickIT")
          .send({ email: "api05-t-expire@example.com", password: "WrongPass1" });
      }

      vi.setSystemTime(T0 + 15 * 60 * 1000 + 1000); // 15m 1s

      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-t-expire@example.com", password: "Correct#5t" });

      expect(res.status).toBe(200);
    });

    it("API-05: attempts during the lockout do not extend the 15-minute window", async () => {
      await createUser({
        email: "api05-t-noext@example.com",
        password: "Correct#5t",
        mustChangePassword: false,
      });

      // 5 failures at T0 → lock expires at T0 + 15m
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/login")
          .set("X-Requested-With", "TokTickIT")
          .send({ email: "api05-t-noext@example.com", password: "WrongPass1" });
      }

      // Three 429s during the lockout window (T0 + 5m)
      vi.setSystemTime(T0 + 5 * 60 * 1000);
      for (let i = 0; i < 3; i++) {
        const r = await request(app)
          .post("/api/auth/login")
          .set("X-Requested-With", "TokTickIT")
          .send({ email: "api05-t-noext@example.com", password: "WrongPass1" });
        expect(r.status).toBe(429);
      }

      // At T0 + 15m + 1s the lock must have expired (not pushed out to T0 + 20m)
      vi.setSystemTime(T0 + 15 * 60 * 1000 + 1000);
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Requested-With", "TokTickIT")
        .send({ email: "api05-t-noext@example.com", password: "Correct#5t" });

      expect(res.status).toBe(200);
    });
  });
});

// ---------------------------------------------------------------------------
// API-06: CSRF header check (BR-14)
// ---------------------------------------------------------------------------
describe("API-06: CSRF header check", () => {
  beforeEach(clearDatabase);

  it("API-06: login POST without X-Requested-With returns 403 CSRF_REJECTED", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "csrf-test@example.com", password: "Test#Pass1" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
  });

  it("API-06: mutating request with valid session but no CSRF header returns 403 CSRF_REJECTED", async () => {
    await createUser({
      email: "api06-csrf@example.com",
      password: "Correct#6",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api06-csrf@example.com",
      password: "Correct#6",
    });

    // POST change-password without CSRF header (has session, body is valid shape)
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .send({
        currentPassword: "Correct#6",
        newPassword: "NewPass#6",
        confirmPassword: "NewPass#6",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
  });

  it("API-06: same request WITH the CSRF header does not return 403 CSRF_REJECTED", async () => {
    await createUser({
      email: "api06-with-csrf@example.com",
      password: "Correct#6",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api06-with-csrf@example.com",
      password: "Correct#6",
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "Correct#6",
        newPassword: "NewPass#6",
        confirmPassword: "NewPass#6",
      });

    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe("CSRF_REJECTED");
  });
});

// ---------------------------------------------------------------------------
// API-07: Logout then reuse old cookie
// ---------------------------------------------------------------------------
describe("API-07: Logout clears the cookie; old cookie is rejected", () => {
  beforeEach(clearDatabase);

  it("API-07: logout returns 204, Set-Cookie clears the cookie, session row is deleted", async () => {
    await createUser({
      email: "api07@example.com",
      password: "Correct#7",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api07@example.com",
      password: "Correct#7",
    });
    const token = extractTokenFromSetCookie(cookie);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT");

    expect(logoutRes.status).toBe(204);

    // Set-Cookie should clear the session cookie (Expires in past or Max-Age=0)
    const clearCookie = findSessionCookie(logoutRes);
    expect(clearCookie).toBeTruthy();
    const cookieLower = clearCookie!.toLowerCase();
    const isCleared =
      cookieLower.includes("max-age=0") ||
      cookieLower.includes("expires=thu, 01 jan 1970") ||
      (() => {
        const expiresPart = clearCookie!
          .split(";")
          .find((p) => p.trim().toLowerCase().startsWith("expires="));
        if (!expiresPart) return false;
        const expiresDate = new Date(
          expiresPart.split("=").slice(1).join("=").trim()
        );
        return expiresDate.getTime() <= Date.now();
      })();
    expect(isCleared).toBe(true);

    // Session row should be deleted
    const sessionInDb = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "Session" WHERE "tokenHash" = $1`,
      tokenHash
    );
    expect(sessionInDb).toHaveLength(0);
  });

  it("API-07: GET /auth/me with the old cookie after logout returns 401", async () => {
    await createUser({
      email: "api07-reuse@example.com",
      password: "Correct#7",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api07-reuse@example.com",
      password: "Correct#7",
    });

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookie));

    expect(meRes.status).toBe(401);
  });

  it("API-07: logout is idempotent — 204 even when called with no session", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// API-08: GET /auth/me
// ---------------------------------------------------------------------------
describe("API-08: GET /auth/me", () => {
  beforeEach(clearDatabase);

  it("API-08: with valid session returns 200 and the user identity", async () => {
    const user = await createUser({
      email: "api08@example.com",
      password: "Correct#8",
      name: "Api Eight",
      role: "IT_STAFF",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api08@example.com",
      password: "Correct#8",
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookie));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: "Api Eight",
      email: "api08@example.com",
      role: "IT_STAFF",
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("API-08: without a session returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });
});

// ---------------------------------------------------------------------------
// API-09: Expired session
// ---------------------------------------------------------------------------
describe("API-09: Expired session returns 401", () => {
  beforeEach(clearDatabase);

  it("API-09: a session whose expiresAt is in the past returns 401", async () => {
    const user = await createUser({
      email: "api09@example.com",
      password: "Correct#9",
      mustChangePassword: false,
    });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Use prisma.session.create so the Date is serialised as UTC regardless of
    // the server's local timezone (raw SQL via pg would send local-time strings
    // into a "timestamp without time zone" column, shifting the value on UTC+7).
    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
      },
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `tt_session=${token}`);

    expect(res.status).toBe(401);
  });

  it("API-09: a session expiring 1 minute in the future is accepted", async () => {
    const user = await createUser({
      email: "api09-future@example.com",
      password: "Correct#9",
      mustChangePassword: false,
    });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000), // 1 minute in the future
      },
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `tt_session=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});

// ---------------------------------------------------------------------------
// API-10: No secrets in any response or stored value
// ---------------------------------------------------------------------------
describe("API-10: Responses never contain password or hash", () => {
  beforeEach(clearDatabase);

  it("API-10: login response never includes passwordHash", async () => {
    await createUser({
      email: "api10@example.com",
      password: "Secret#10",
      mustChangePassword: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api10@example.com", password: "Secret#10" });

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("Secret#10");
  });

  it("API-10: GET /auth/me response never includes passwordHash", async () => {
    await createUser({
      email: "api10-me@example.com",
      password: "Secret#10",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api10-me@example.com",
      password: "Secret#10",
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookie));

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("Secret#10");
  });

  it("API-10: stored password is a bcrypt hash, not plaintext", async () => {
    await createUser({
      email: "api10-hash@example.com",
      password: "Secret#10",
    });

    const rows = (await prisma.$queryRawUnsafe<{ passwordHash: string }[]>(
      `SELECT "passwordHash" FROM "User" WHERE email = $1`,
      "api10-hash@example.com"
    ));

    expect(rows[0].passwordHash).toMatch(/^\$2[ab]\$/);
    expect(rows[0].passwordHash).not.toBe("Secret#10");
  });
});

// ---------------------------------------------------------------------------
// API-11: CORS from allowed and foreign origins
// ---------------------------------------------------------------------------
describe("API-11: CORS allow-list", () => {
  beforeEach(clearDatabase);

  it("API-11: allowed origin gets Access-Control-Allow-Origin header with credentials", async () => {
    const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

    const res = await request(app)
      .get("/api/auth/me")
      .set("Origin", allowedOrigin);

    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("API-11: foreign origin does not get Access-Control-Allow-Origin header", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Origin", "http://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("API-11: OPTIONS preflight from allowed origin returns 204 with CORS headers, no auth required", async () => {
    const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-requested-with,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(
      res.headers["access-control-allow-headers"]?.toLowerCase()
    ).toContain("x-requested-with");
    expect(
      res.headers["access-control-allow-headers"]?.toLowerCase()
    ).toContain("content-type");
  });

  it("API-11: OPTIONS preflight for a protected route returns 204 with CORS headers, no auth required", async () => {
    const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

    // No cookie — cors must respond before any auth check runs
    const res = await request(app)
      .options("/api/auth/me")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("API-11: OPTIONS preflight from a foreign origin gets no Access-Control-Allow-Origin header", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "http://attacker.example.com")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-requested-with,content-type");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// API-12: Change password — invalid new password (shared vectors + extra rules)
// ---------------------------------------------------------------------------
describe("API-12: Change password rejects invalid new passwords", () => {
  type PasswordVector = { password: string; valid: boolean; reason: string };
  const vectorsPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "shared",
    "password-vectors.json"
  );
  const vectors: PasswordVector[] = JSON.parse(
    fs.readFileSync(vectorsPath, "utf-8")
  );
  const invalidVectors = vectors.filter((v) => !v.valid);

  beforeEach(clearDatabase);

  for (const { password, reason } of invalidVectors) {
    it(`API-12: rejects new password — ${reason}`, async () => {
      await createUser({
        email: `api12-${Buffer.from(reason).toString("base64url").slice(0, 12)}@example.com`,
        password: "OldPass#12",
        mustChangePassword: false,
      });
      const email = `api12-${Buffer.from(reason).toString("base64url").slice(0, 12)}@example.com`;
      const cookie = await loginAs(app, {
        email,
        password: "OldPass#12",
      });

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", toCookieHeader(cookie))
        .set("X-Requested-With", "TokTickIT")
        .send({
          currentPassword: "OldPass#12",
          newPassword: password,
          confirmPassword: password,
        });

      expect(res.status).toBe(400);
      expect(res.body.errors?.newPassword).toBeTruthy();
    });
  }

  it("API-12: rejects when newPassword matches currentPassword", async () => {
    await createUser({
      email: "api12-same@example.com",
      password: "SamePass#12",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api12-same@example.com",
      password: "SamePass#12",
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "SamePass#12",
        newPassword: "SamePass#12",
        confirmPassword: "SamePass#12",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.newPassword).toBeTruthy();
  });

  it("API-12: rejects when confirmPassword does not match newPassword", async () => {
    await createUser({
      email: "api12-mismatch@example.com",
      password: "OldPass#12",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api12-mismatch@example.com",
      password: "OldPass#12",
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "OldPass#12",
        newPassword: "NewPass#12",
        confirmPassword: "DifferentPass#12",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.confirmPassword).toBeTruthy();
  });

  it("API-12: password is unchanged after rejected change", async () => {
    await createUser({
      email: "api12-unchanged@example.com",
      password: "OldPass#12",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api12-unchanged@example.com",
      password: "OldPass#12",
    });

    await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "OldPass#12",
        newPassword: "short",
        confirmPassword: "short",
      });

    // Old password still works
    const loginRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api12-unchanged@example.com", password: "OldPass#12" });
    expect(loginRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// API-13: Change password — wrong current password
// ---------------------------------------------------------------------------
describe("API-13: Change password rejects wrong current password", () => {
  beforeEach(clearDatabase);

  it("API-13: wrong currentPassword returns 400 with errors.currentPassword", async () => {
    await createUser({
      email: "api13@example.com",
      password: "Correct#13",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api13@example.com",
      password: "Correct#13",
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "WrongPass#13",
        newPassword: "NewPass#13",
        confirmPassword: "NewPass#13",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.currentPassword).toBeTruthy();
  });

  it("API-13: password is unchanged after wrong currentPassword", async () => {
    await createUser({
      email: "api13-unchanged@example.com",
      password: "Correct#13",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api13-unchanged@example.com",
      password: "Correct#13",
    });

    await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "WrongPass#13",
        newPassword: "NewPass#13",
        confirmPassword: "NewPass#13",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api13-unchanged@example.com", password: "Correct#13" });
    expect(loginRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// API-14: Successful password change — BR-17
// ---------------------------------------------------------------------------
describe("API-14: Successful password change", () => {
  beforeEach(clearDatabase);

  it("API-14: mustChangePassword cleared, new password works, old fails", async () => {
    await createUser({
      email: "api14@example.com",
      password: "OldPass#14",
      mustChangePassword: true,
    });
    const cookie = await loginAs(app, {
      email: "api14@example.com",
      password: "OldPass#14",
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "OldPass#14",
        newPassword: "NewPass#14",
        confirmPassword: "NewPass#14",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(false);

    // Old password should no longer work
    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api14@example.com", password: "OldPass#14" });
    expect(oldLoginRes.status).toBe(401);

    // New password works
    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .set("X-Requested-With", "TokTickIT")
      .send({ email: "api14@example.com", password: "NewPass#14" });
    expect(newLoginRes.status).toBe(200);
  });

  it("API-14: current session stays valid; other sessions are revoked", async () => {
    await createUser({
      email: "api14-sessions@example.com",
      password: "OldPass#14",
      mustChangePassword: false,
    });

    // Create two sessions for the same user
    const cookieA = await loginAs(app, {
      email: "api14-sessions@example.com",
      password: "OldPass#14",
    });
    const cookieB = await loginAs(app, {
      email: "api14-sessions@example.com",
      password: "OldPass#14",
    });

    // Change password using session A
    const changeRes = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookieA))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "OldPass#14",
        newPassword: "NewPass#14a",
        confirmPassword: "NewPass#14a",
      });
    expect(changeRes.status).toBe(200);

    // Session A (current) must still work
    const meA = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookieA));
    expect(meA.status).toBe(200);

    // Session B must be revoked
    const meB = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookieB));
    expect(meB.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API-15: mustChangePassword gate (BR-18)
// ---------------------------------------------------------------------------
describe("API-15: mustChangePassword gate", () => {
  beforeEach(clearDatabase);

  it("API-15: GET /auth/me is exempt from the gate", async () => {
    await createUser({
      email: "api15@example.com",
      password: "Pass#15ok",
      mustChangePassword: true,
    });
    const cookie = await loginAs(app, {
      email: "api15@example.com",
      password: "Pass#15ok",
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", toCookieHeader(cookie));
    expect(res.status).toBe(200);
  });

  it("API-15: POST /auth/change-password is exempt from the gate", async () => {
    await createUser({
      email: "api15-cp@example.com",
      password: "OldPass#15",
      mustChangePassword: true,
    });
    const cookie = await loginAs(app, {
      email: "api15-cp@example.com",
      password: "OldPass#15",
    });

    // Should NOT get PASSWORD_CHANGE_REQUIRED — might get 200 or 400
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "OldPass#15",
        newPassword: "NewPass#15",
        confirmPassword: "NewPass#15",
      });
    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("API-15: other protected endpoints return 403 PASSWORD_CHANGE_REQUIRED", async () => {
    await createUser({
      email: "api15-gate@example.com",
      password: "Pass#15gate",
      mustChangePassword: true,
    });
    const cookie = await loginAs(app, {
      email: "api15-gate@example.com",
      password: "Pass#15gate",
    });

    // GET /api/categories requires auth and goes through the gate
    const res = await request(app)
      .get("/api/categories")
      .set("Cookie", toCookieHeader(cookie));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("API-15: POST /auth/logout is exempt from the gate (returns 204)", async () => {
    await createUser({
      email: "api15-logout@example.com",
      password: "Pass#15lo",
      mustChangePassword: true,
    });
    const cookie = await loginAs(app, {
      email: "api15-logout@example.com",
      password: "Pass#15lo",
    });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT");

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// API-70: Change-password throttle (BR-08 — per user id)
// Uses a unique email so throttle state doesn't bleed into other tests.
// ---------------------------------------------------------------------------
describe("API-70: Change-password throttle", () => {
  beforeEach(clearDatabase);

  it("API-70: 6th wrong-current-password attempt returns 429 TOO_MANY_ATTEMPTS", async () => {
    await createUser({
      email: "api70-throttle@example.com",
      password: "Correct#70",
      mustChangePassword: false,
    });
    const cookie = await loginAs(app, {
      email: "api70-throttle@example.com",
      password: "Correct#70",
    });

    // 5 attempts with wrong current password
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", toCookieHeader(cookie))
        .set("X-Requested-With", "TokTickIT")
        .send({
          currentPassword: "WrongPass#70",
          newPassword: "NewPass#70",
          confirmPassword: "NewPass#70",
        });
      expect(r.status).toBe(400);
    }

    // 6th attempt — even with correct current password
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", toCookieHeader(cookie))
      .set("X-Requested-With", "TokTickIT")
      .send({
        currentPassword: "Correct#70",
        newPassword: "NewPass#70",
        confirmPassword: "NewPass#70",
      });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
  });

  // ── Lockout duration — verified with fake timers ──────────────────────────
  describe("API-70: lockout duration (fake timers)", () => {
    const T0 = 1_800_000_000_000; // 2027-01-15T08:00:00.000Z

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(T0);
      resetThrottles(); // change-password throttle now uses fake Date.now
    });

    afterEach(() => {
      vi.useRealTimers();
      resetThrottles(); // rebind to real Date.now
    });

    it("API-70: lock holds at 14 minutes 59 seconds after 5 wrong current-password attempts", async () => {
      await createUser({
        email: "api70-t-lock@example.com",
        password: "Correct#70t",
        mustChangePassword: false,
      });
      const cookie = await loginAs(app, {
        email: "api70-t-lock@example.com",
        password: "Correct#70t",
      });

      for (let i = 0; i < 5; i++) {
        const r = await request(app)
          .post("/api/auth/change-password")
          .set("Cookie", toCookieHeader(cookie))
          .set("X-Requested-With", "TokTickIT")
          .send({
            currentPassword: "WrongPass#70t",
            newPassword: "NewPass#70t",
            confirmPassword: "NewPass#70t",
          });
        expect(r.status).toBe(400);
      }

      vi.setSystemTime(T0 + 14 * 60 * 1000 + 59 * 1000); // 14m 59s

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", toCookieHeader(cookie))
        .set("X-Requested-With", "TokTickIT")
        .send({
          currentPassword: "Correct#70t",
          newPassword: "NewPass#70t",
          confirmPassword: "NewPass#70t",
        });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    });

    it("API-70: lock expires and password change succeeds at 15 minutes 1 second after the 5th attempt", async () => {
      await createUser({
        email: "api70-t-expire@example.com",
        password: "Correct#70t",
        mustChangePassword: false,
      });
      const cookie = await loginAs(app, {
        email: "api70-t-expire@example.com",
        password: "Correct#70t",
      });

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/change-password")
          .set("Cookie", toCookieHeader(cookie))
          .set("X-Requested-With", "TokTickIT")
          .send({
            currentPassword: "WrongPass#70t",
            newPassword: "NewPass#70t",
            confirmPassword: "NewPass#70t",
          });
      }

      vi.setSystemTime(T0 + 15 * 60 * 1000 + 1000); // 15m 1s

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", toCookieHeader(cookie))
        .set("X-Requested-With", "TokTickIT")
        .send({
          currentPassword: "Correct#70t",
          newPassword: "NewPass#70t",
          confirmPassword: "NewPass#70t",
        });

      expect(res.status).toBe(200);
    });

    it("API-70: attempts during the lockout do not extend the 15-minute window", async () => {
      await createUser({
        email: "api70-t-noext@example.com",
        password: "Correct#70t",
        mustChangePassword: false,
      });
      const cookie = await loginAs(app, {
        email: "api70-t-noext@example.com",
        password: "Correct#70t",
      });

      // 5 failures at T0 → lock expires at T0 + 15m
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/change-password")
          .set("Cookie", toCookieHeader(cookie))
          .set("X-Requested-With", "TokTickIT")
          .send({
            currentPassword: "WrongPass#70t",
            newPassword: "NewPass#70t",
            confirmPassword: "NewPass#70t",
          });
      }

      // Three 429s during the lockout window (T0 + 5m)
      vi.setSystemTime(T0 + 5 * 60 * 1000);
      for (let i = 0; i < 3; i++) {
        const r = await request(app)
          .post("/api/auth/change-password")
          .set("Cookie", toCookieHeader(cookie))
          .set("X-Requested-With", "TokTickIT")
          .send({
            currentPassword: "WrongPass#70t",
            newPassword: "NewPass#70t",
            confirmPassword: "NewPass#70t",
          });
        expect(r.status).toBe(429);
      }

      // At T0 + 15m + 1s the lock must have expired (not pushed out to T0 + 20m)
      vi.setSystemTime(T0 + 15 * 60 * 1000 + 1000);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", toCookieHeader(cookie))
        .set("X-Requested-With", "TokTickIT")
        .send({
          currentPassword: "Correct#70t",
          newPassword: "NewPass#70t",
          confirmPassword: "NewPass#70t",
        });

      expect(res.status).toBe(200);
    });
  });
});
