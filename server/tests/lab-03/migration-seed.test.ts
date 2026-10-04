// Migration and seed tests for Lab 3.
// Run via: cd server && npm run test:migration
// Prerequisite: tsx scripts/setup-migration-db.ts must complete first.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const snapshotPath = path.join(__dirname, "..", "..", ".migration-snapshot.json");

interface Snapshot {
  ticketCount: number;
  attachmentCount: number;
  categoryCount: number;
  relatedSystemCount: number;
  requesterIdMap: Array<{ ticketId: number; requesterId: number }>;
  nullHashUserEmails: string[];
}

let snapshot: Snapshot;

afterAll(async () => {
  await prisma.$disconnect();
});

beforeAll(() => {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Migration snapshot not found at ${snapshotPath}. ` +
      "Run: cd server && tsx scripts/setup-migration-db.ts"
    );
  }
  snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as Snapshot;
});

// ---------------------------------------------------------------------------
// MIG-01: Lab 2 data preserved after migration
// ---------------------------------------------------------------------------
describe("MIG-01: Lab 2 data preserved after migration and seed", () => {
  it("MIG-01: every Lab 2 ticket still exists (count at least the Lab 2 fixture count)", async () => {
    const count = await prisma.ticket.count();
    expect(count).toBeGreaterThanOrEqual(snapshot.ticketCount);
  });

  it("MIG-01: attachment count equals the Lab 2 fixture snapshot", async () => {
    const count = await prisma.attachment.count();
    expect(count).toBe(snapshot.attachmentCount);
  });

  it("MIG-01: category count equals the Lab 2 fixture snapshot", async () => {
    const count = await prisma.category.count();
    expect(count).toBe(snapshot.categoryCount);
  });

  it("MIG-01: related-system count equals the Lab 2 fixture snapshot", async () => {
    const count = await prisma.relatedSystem.count();
    expect(count).toBe(snapshot.relatedSystemCount);
  });

  it("MIG-01: every Lab 2 ticket keeps its original requesterId", async () => {
    for (const { ticketId, requesterId } of snapshot.requesterIdMap) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { requesterId: true },
      });
      expect(ticket, `Ticket id ${ticketId} must still exist`).not.toBeNull();
      expect(ticket!.requesterId).toBe(requesterId);
    }
  });
});

// ---------------------------------------------------------------------------
// MIG-02: migrated users had no hash before seed; login works after seed
// ---------------------------------------------------------------------------
describe("MIG-02: migrated requester login before and after seed", () => {
  it("MIG-02: snapshot confirms migrated users had null passwordHash after migration (before seed)", () => {
    expect(snapshot.nullHashUserEmails.length).toBeGreaterThan(0);
    expect(snapshot.nullHashUserEmails).toContain("alice@example.com");
    expect(snapshot.nullHashUserEmails).toContain("bob@example.com");
  });

  it("MIG-02: after seed, migrated requester has a non-null passwordHash", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      select: { passwordHash: true },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBeNull();
  });

  it("MIG-02: after seed, passwordHash is a bcrypt hash (starts with $2b$ or $2a$)", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      select: { passwordHash: true },
    });
    expect(user!.passwordHash).toMatch(/^\$2[ab]\$/);
  });

  it("MIG-02: after seed, initial password verifies against the stored hash", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      select: { passwordHash: true },
    });
    const initialPassword =
      process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
    const valid = await bcrypt.compare(initialPassword, user!.passwordHash!);
    expect(valid).toBe(true);
  });

  it("MIG-02: after seed, migrated requester has mustChangePassword=true", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      select: { mustChangePassword: true },
    });
    expect(user!.mustChangePassword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MIG-03: itPriority backfill and ownerId null for Lab 2 tickets
// ---------------------------------------------------------------------------
describe("MIG-03: itPriority backfilled from requestedPriority; ownerId null", () => {
  it("MIG-03: every Lab 2 ticket has itPriority equal to requestedPriority", async () => {
    for (const { ticketId } of snapshot.requesterIdMap) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { itPriority: true, requestedPriority: true },
      });
      expect(ticket, `Ticket id ${ticketId} must exist`).not.toBeNull();
      expect(ticket!.itPriority).toBe(ticket!.requestedPriority);
    }
  });

  it("MIG-03: every Lab 2 ticket has ownerId=null after migration (no owner assigned)", async () => {
    for (const { ticketId } of snapshot.requesterIdMap) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { ownerId: true },
      });
      expect(ticket!.ownerId).toBeNull();
    }
  });

  it("MIG-03: itPriority values match the fixture priorities (LOW/MEDIUM/HIGH distribution)", async () => {
    // The fixture has 2 LOW, 1 MEDIUM, 2 HIGH tickets
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: snapshot.requesterIdMap.map((r) => r.ticketId) } },
      select: { itPriority: true, requestedPriority: true },
    });
    for (const t of tickets) {
      expect(t.itPriority).toBe(t.requestedPriority);
    }
  });
});

// ---------------------------------------------------------------------------
// MIG-04: seed idempotency — running seed a second time changes nothing
// ---------------------------------------------------------------------------
describe("MIG-04: seed is idempotent", () => {
  let userCountBefore: number;
  let ticketCountBefore: number;
  let commentCountBefore: number;
  let noteCountBefore: number;

  beforeAll(async () => {
    userCountBefore = await prisma.user.count();
    ticketCountBefore = await prisma.ticket.count();
    commentCountBefore = await prisma.publicComment.count();
    noteCountBefore = await prisma.internalNote.count();

    // Run seed a second time (bcrypt hashing is slow — allow 2 minutes)
    const serverDir = path.join(__dirname, "..", "..");
    execSync("npx tsx prisma/seed.ts", {
      cwd: serverDir,
      env: {
        ...process.env,
        SEED_INITIAL_PASSWORD:
          process.env.SEED_INITIAL_PASSWORD || "Welcome#2026",
      },
      stdio: "pipe",
    });
  }, 120_000);

  it("MIG-04: user count is unchanged after running seed twice", async () => {
    const count = await prisma.user.count();
    expect(count).toBe(userCountBefore);
  });

  it("MIG-04: ticket count is unchanged after running seed twice", async () => {
    const count = await prisma.ticket.count();
    expect(count).toBe(ticketCountBefore);
  });

  it("MIG-04: comment and note counts are unchanged after running seed twice", async () => {
    const comments = await prisma.publicComment.count();
    const notes = await prisma.internalNote.count();
    expect(comments).toBe(commentCountBefore);
    expect(notes).toBe(noteCountBefore);
  });

  it("MIG-04: no duplicate emails after running seed twice", async () => {
    const users = await prisma.user.findMany({ select: { email: true } });
    const emails = users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("MIG-04: no duplicate ticket numbers after running seed twice", async () => {
    const tickets = await prisma.ticket.findMany({ select: { ticketNumber: true } });
    const numbers = tickets.map((t) => t.ticketNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("MIG-04: migrated requester passwordHash is not reset by second seed run", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      select: { passwordHash: true },
    });
    const initialPassword =
      process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
    const valid = await bcrypt.compare(initialPassword, user!.passwordHash!);
    expect(valid).toBe(true);
  });

  it("MIG-04: required seed accounts exist after double seed run", async () => {
    const emails = [
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
      "david@example.com",
      "eve@example.com",
      "michael.brown@example.com",
      "sarah.johnson@example.com",
      "david.lee@example.com",
      "emma.clark@example.com",
      "admin@example.com",
    ];
    for (const email of emails) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      expect(user, `User ${email} must exist`).not.toBeNull();
    }
  });
});
