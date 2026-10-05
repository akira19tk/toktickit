import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  validatePassword,
  normalizeEmail,
  generateSessionToken,
  hashSessionToken,
  createThrottle,
  hashPassword,
  verifyPassword,
} from "../../src/lib/auth";
import { parseStaffQueueQuery } from "../../src/lib/staffQueue";

// Load shared password vectors from repo root
const vectorsPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "shared",
  "password-vectors.json"
);
type PasswordVector = { password: string; valid: boolean; reason: string };
const vectors: PasswordVector[] = JSON.parse(
  fs.readFileSync(vectorsPath, "utf-8")
);

// ---------------------------------------------------------------------------
// UNIT-01 — Password policy validator
// ---------------------------------------------------------------------------
describe("UNIT-01: validatePassword — shared/password-vectors.json", () => {
  for (const { password, valid, reason } of vectors) {
    it(`UNIT-01: "${password.length > 20 ? password.slice(0, 20) + "…" : password}" → valid=${valid} (${reason})`, () => {
      const result = validatePassword(password);
      expect(result.valid).toBe(valid);
    });
  }

  it("UNIT-01: exactly 72-byte password is accepted (at the limit)", () => {
    const p = "a".repeat(71) + "1";
    expect(validatePassword(p).valid).toBe(true);
  });

  it("UNIT-01: 73-byte password is rejected (over the limit)", () => {
    const p = "a".repeat(72) + "1";
    expect(validatePassword(p).valid).toBe(false);
  });

  it("UNIT-01: 25 Thai characters are rejected (75 bytes)", () => {
    const p = "ก".repeat(25);
    expect(validatePassword(p).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UNIT-02 — Email normalizer
// ---------------------------------------------------------------------------
describe("UNIT-02: normalizeEmail", () => {
  it("UNIT-02: trims surrounding whitespace", () => {
    expect(normalizeEmail("  bob@example.com  ")).toBe("bob@example.com");
  });

  it("UNIT-02: lowercases the entire address", () => {
    expect(normalizeEmail("Bob@EXAMPLE.COM")).toBe("bob@example.com");
  });

  it("UNIT-02: trims and lowercases together", () => {
    expect(normalizeEmail("  Bob@Example.Com  ")).toBe("bob@example.com");
  });

  it("UNIT-02: returns null for missing @ sign", () => {
    expect(normalizeEmail("notanemail")).toBeNull();
  });

  it("UNIT-02: returns null for empty local part", () => {
    expect(normalizeEmail("@example.com")).toBeNull();
  });

  it("UNIT-02: returns null for missing domain", () => {
    expect(normalizeEmail("user@")).toBeNull();
  });

  it("UNIT-02: returns null for empty string", () => {
    expect(normalizeEmail("")).toBeNull();
  });

  it("UNIT-02: returns null for address longer than 254 characters", () => {
    const longLocal = "a".repeat(250);
    expect(normalizeEmail(`${longLocal}@b.com`)).toBeNull();
  });

  it("UNIT-02: accepts a valid address with subdomains", () => {
    expect(normalizeEmail("user@mail.example.co.th")).toBe(
      "user@mail.example.co.th"
    );
  });
});

// ---------------------------------------------------------------------------
// UNIT-04 — Session token generator and SHA-256 hasher
// ---------------------------------------------------------------------------
describe("UNIT-04: generateSessionToken and hashSessionToken", () => {
  it("UNIT-04: generateSessionToken returns a 64-character hex string (256 bits)", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("UNIT-04: two calls return different tokens (random)", () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
  });

  it("UNIT-04: hashSessionToken returns a 64-character hex SHA-256 digest", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("UNIT-04: same token always produces the same hash (deterministic)", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("UNIT-04: different tokens produce different hashes", () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(hashSessionToken(t1)).not.toBe(hashSessionToken(t2));
  });

  it("UNIT-04: hash differs from the plaintext token (not stored raw)", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });
});

// ---------------------------------------------------------------------------
// UNIT-05 — Login throttle with injectable clock
// ---------------------------------------------------------------------------
describe("UNIT-05: createThrottle", () => {
  it("UNIT-05: not locked before 5 failures", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 4; i++) {
      throttle.increment("user@example.com");
      expect(throttle.isLocked("user@example.com")).toBe(false);
    }
  });

  it("UNIT-05: locked after the 5th consecutive failure", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 5; i++) throttle.increment("user@example.com");
    expect(throttle.isLocked("user@example.com")).toBe(true);
  });

  it("UNIT-05: still locked within 15 minutes of the 5th failure", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 5; i++) throttle.increment("u@e.com");

    clock.now = 14 * 60 * 1000 + 59_000; // 14m 59s — still locked
    expect(throttle.isLocked("u@e.com")).toBe(true);
  });

  it("UNIT-05: unlocked after 15 minutes have elapsed", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 5; i++) throttle.increment("u@e.com");

    clock.now = 15 * 60 * 1000 + 1; // 15m 0.001s — expired
    expect(throttle.isLocked("u@e.com")).toBe(false);
  });

  it("UNIT-05: reset() before the 5th failure clears the counter", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    throttle.increment("u@e.com");
    throttle.increment("u@e.com");
    throttle.reset("u@e.com"); // successful login

    for (let i = 0; i < 4; i++) throttle.increment("u@e.com");
    expect(throttle.isLocked("u@e.com")).toBe(false);
  });

  it("UNIT-05: different keys are tracked independently", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 5; i++) throttle.increment("alice@example.com");
    expect(throttle.isLocked("bob@example.com")).toBe(false);
  });

  it("UNIT-05: unknown email key is throttled the same way as a known one", () => {
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    for (let i = 0; i < 5; i++) throttle.increment("ghost@nowhere.invalid");
    expect(throttle.isLocked("ghost@nowhere.invalid")).toBe(true);
  });

  it("UNIT-05: a failure during the lockout does not extend the lock (BR-08)", () => {
    // BR-08: "15 minutes counted from that failure" — the 5th failure sets the
    // expiry; subsequent attempts during the lockout must not push it forward.
    const clock = { now: 0 };
    const throttle = createThrottle(() => clock.now);

    // 5 failures at t=0 → lock must expire at exactly t=15 min
    for (let i = 0; i < 5; i++) throttle.increment("u@e.com");

    // An increment at t=5 min (during the lock) must NOT push expiry to t=20 min
    clock.now = 5 * 60 * 1000;
    throttle.increment("u@e.com");

    // At t=15 min + 1 ms the original lock must have expired (not extended)
    clock.now = 15 * 60 * 1000 + 1;
    expect(throttle.isLocked("u@e.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UNIT-07 — Password hash and verify wrapper
// ---------------------------------------------------------------------------
describe("UNIT-07: hashPassword and verifyPassword", () => {
  it("UNIT-07: hash differs from the plaintext password", async () => {
    const hash = await hashPassword("Secret1!");
    expect(hash).not.toBe("Secret1!");
  });

  it("UNIT-07: stored hash is a bcrypt hash (starts with $2b$)", async () => {
    const hash = await hashPassword("Secret1!");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("UNIT-07: verifyPassword returns true for the correct password", async () => {
    const hash = await hashPassword("Secret1!");
    expect(await verifyPassword("Secret1!", hash)).toBe(true);
  });

  it("UNIT-07: verifyPassword returns false for a wrong password", async () => {
    const hash = await hashPassword("Secret1!");
    expect(await verifyPassword("WrongPass1!", hash)).toBe(false);
  });

  it("UNIT-07: two hashes of the same password differ (random salt)", async () => {
    const h1 = await hashPassword("Secret1!");
    const h2 = await hashPassword("Secret1!");
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// UNIT-06 — Staff queue query-parameter parser (BR-56, AC-39)
// Non-integer, <1, pageSize>50 and unsupported sort/filter values fall back to
// defaults; valid values are normalized.
// ---------------------------------------------------------------------------
describe("UNIT-06: parseStaffQueueQuery", () => {
  it("UNIT-06: empty query yields all defaults", () => {
    const p = parseStaffQueueQuery({});
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(10);
    expect(p.sortBy).toBe("itPriority");
    expect(p.sortDir).toBe("desc");
    expect(p.status).toBe("ACTIVE");
    expect(p.owner).toEqual({ kind: "ANY" });
    expect(p.priority).toBeUndefined();
    expect(p.categoryId).toBeUndefined();
    expect(p.search).toBeUndefined();
  });

  it("UNIT-06: non-integer page falls back to 1", () => {
    expect(parseStaffQueueQuery({ page: "abc" }).page).toBe(1);
    expect(parseStaffQueueQuery({ page: "2.5" }).page).toBe(1);
  });

  it("UNIT-06: page below 1 falls back to 1", () => {
    expect(parseStaffQueueQuery({ page: "0" }).page).toBe(1);
    expect(parseStaffQueueQuery({ page: "-3" }).page).toBe(1);
  });

  it("UNIT-06: a valid page is kept", () => {
    expect(parseStaffQueueQuery({ page: "4" }).page).toBe(4);
  });

  it("UNIT-06: non-integer pageSize falls back to 10", () => {
    expect(parseStaffQueueQuery({ pageSize: "xyz" }).pageSize).toBe(10);
  });

  it("UNIT-06: pageSize above 50 falls back to 10 (not clamped)", () => {
    expect(parseStaffQueueQuery({ pageSize: "51" }).pageSize).toBe(10);
    expect(parseStaffQueueQuery({ pageSize: "999" }).pageSize).toBe(10);
  });

  it("UNIT-06: pageSize of exactly 50 is accepted (at the limit)", () => {
    expect(parseStaffQueueQuery({ pageSize: "50" }).pageSize).toBe(50);
  });

  it("UNIT-06: a valid pageSize below the limit is kept", () => {
    expect(parseStaffQueueQuery({ pageSize: "25" }).pageSize).toBe(25);
  });

  it("UNIT-06: unsupported sortBy falls back to itPriority", () => {
    expect(parseStaffQueueQuery({ sortBy: "bogus" }).sortBy).toBe("itPriority");
  });

  it("UNIT-06: each supported sortBy is accepted", () => {
    for (const field of [
      "itPriority",
      "createdAt",
      "updatedAt",
      "ticketNumber",
      "currentStatus",
    ] as const) {
      expect(parseStaffQueueQuery({ sortBy: field }).sortBy).toBe(field);
    }
  });

  it("UNIT-06: unsupported sortDir falls back to desc", () => {
    expect(parseStaffQueueQuery({ sortDir: "sideways" }).sortDir).toBe("desc");
  });

  it("UNIT-06: sortDir asc and desc are accepted", () => {
    expect(parseStaffQueueQuery({ sortDir: "asc" }).sortDir).toBe("asc");
    expect(parseStaffQueueQuery({ sortDir: "desc" }).sortDir).toBe("desc");
  });

  it("UNIT-06: status ALL and a specific status are accepted; invalid falls back to ACTIVE", () => {
    expect(parseStaffQueueQuery({ status: "ALL" }).status).toBe("ALL");
    expect(parseStaffQueueQuery({ status: "all" }).status).toBe("ALL");
    expect(parseStaffQueueQuery({ status: "IN_PROGRESS" }).status).toBe("IN_PROGRESS");
    expect(parseStaffQueueQuery({ status: "NONSENSE" }).status).toBe("ACTIVE");
  });

  it("UNIT-06: priority is validated; invalid falls back to undefined (any)", () => {
    expect(parseStaffQueueQuery({ priority: "high" }).priority).toBe("HIGH");
    expect(parseStaffQueueQuery({ priority: "URGENT" }).priority).toBeUndefined();
  });

  it("UNIT-06: categoryId is a positive integer or undefined", () => {
    expect(parseStaffQueueQuery({ categoryId: "7" }).categoryId).toBe(7);
    expect(parseStaffQueueQuery({ categoryId: "0" }).categoryId).toBeUndefined();
    expect(parseStaffQueueQuery({ categoryId: "abc" }).categoryId).toBeUndefined();
  });

  it("UNIT-06: owner ANY/ME/UNASSIGNED and a numeric id are parsed; invalid falls back to ANY", () => {
    expect(parseStaffQueueQuery({ owner: "ANY" }).owner).toEqual({ kind: "ANY" });
    expect(parseStaffQueueQuery({ owner: "me" }).owner).toEqual({ kind: "ME" });
    expect(parseStaffQueueQuery({ owner: "UNASSIGNED" }).owner).toEqual({
      kind: "UNASSIGNED",
    });
    expect(parseStaffQueueQuery({ owner: "12" }).owner).toEqual({
      kind: "USER",
      id: 12,
    });
    expect(parseStaffQueueQuery({ owner: "-1" }).owner).toEqual({ kind: "ANY" });
    expect(parseStaffQueueQuery({ owner: "nobody" }).owner).toEqual({ kind: "ANY" });
  });

  it("UNIT-06: search is trimmed; blank becomes undefined", () => {
    expect(parseStaffQueueQuery({ search: "  printer  " }).search).toBe("printer");
    expect(parseStaffQueueQuery({ search: "   " }).search).toBeUndefined();
  });
});
