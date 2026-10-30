// Lab 4 migration & seed tests (Issue #49).
// Run via: cd server && npm run test:migration
// Prerequisite: tsx scripts/setup-migration-db.ts must complete first — it builds
// toktickit_migration_test through the full Lab 1-3 schema + a Lab 3 fixture,
// snapshots the Lab 1-3 state, then applies the Lab 4 migration and re-runs the
// seed so ActionTaken rows exist.
//
// MIG-L4-02 scope: the behavioural resolution gate (409 OPEN_ACTIONS_EXIST) is
// route code delivered in #51. At this DB-only issue we assert the *data
// precondition* that gate depends on: legacy (zero-Action) Tickets have no OPEN
// Actions, so count(OPEN)=0 and the gate will pass for them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const serverDir = path.join(__dirname, "..", "..");
const snapshotPath = path.join(serverDir, ".migration-snapshot.json");
const lab4MigrationSqlPath = path.join(
  serverDir,
  "prisma",
  "migrations",
  "20261030000000_lab4_actions_taken",
  "migration.sql"
);

interface Snapshot {
  // Lab 3 -> 4 additive baseline: Lab 1-3 row counts captured after the Lab 3
  // seed, immediately before the Lab 4 migration. Lab 4 is additive and the
  // seed is idempotent, so these must be unchanged after migrate + reseed.
  preLab4: {
    userCount: number;
    ticketCount: number;
    attachmentCount: number;
    categoryCount: number;
    relatedSystemCount: number;
    publicCommentCount: number;
    internalNoteCount: number;
  };
  // Lab-2 fixture ticket numbers — legacy Tickets that never receive Actions.
  legacyTicketNumbers: string[];
}

let snapshot: Snapshot;

beforeAll(() => {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Migration snapshot not found at ${snapshotPath}. ` +
        "Run: cd server && tsx scripts/setup-migration-db.ts"
    );
  }
  snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as Snapshot;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// MIG-L4-01: Lab 4 migration applies additively on a Lab 3 DB
// ---------------------------------------------------------------------------
describe("MIG-L4-01: Lab 4 migration applies on a Lab 3 DB", () => {
  it("MIG-L4-01: the ActionStatus enum type exists with OPEN/COMPLETED/CANCELLED", async () => {
    const rows = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'ActionStatus'
        ORDER BY e.enumsortorder`
    );
    expect(rows.map((r) => r.enumlabel)).toEqual(["OPEN", "COMPLETED", "CANCELLED"]);
  });

  it("MIG-L4-01: the ActionTaken table exists and is queryable", async () => {
    const count = await prisma.actionTaken.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("MIG-L4-01: the three spec indexes exist on ActionTaken", async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'ActionTaken'`
    );
    const idx = rows.map((r) => r.indexname).join(" ");
    expect(idx).toContain("ticketId_createdAt");
    expect(idx).toContain("ticketId_status");
    expect(idx).toContain("assigneeId_status");
  });

  it("MIG-L4-01: all Lab 1-3 row counts are preserved (additive migration + idempotent reseed)", async () => {
    expect(await prisma.user.count()).toBe(snapshot.preLab4.userCount);
    expect(await prisma.ticket.count()).toBe(snapshot.preLab4.ticketCount);
    expect(await prisma.attachment.count()).toBe(snapshot.preLab4.attachmentCount);
    expect(await prisma.category.count()).toBe(snapshot.preLab4.categoryCount);
    expect(await prisma.relatedSystem.count()).toBe(snapshot.preLab4.relatedSystemCount);
    expect(await prisma.publicComment.count()).toBe(snapshot.preLab4.publicCommentCount);
    expect(await prisma.internalNote.count()).toBe(snapshot.preLab4.internalNoteCount);
  });
});

// ---------------------------------------------------------------------------
// MIG-L4-02: legacy (zero-Action) Tickets satisfy the resolution-gate
// precondition (no OPEN Actions) — no backfill required
// ---------------------------------------------------------------------------
describe("MIG-L4-02: legacy Tickets remain resolvable (no OPEN Actions)", () => {
  it("MIG-L4-02: the Lab 2 fixture Tickets survived the Lab 4 migration", async () => {
    expect(snapshot.legacyTicketNumbers.length).toBeGreaterThan(0);
    for (const ticketNumber of snapshot.legacyTicketNumbers) {
      const ticket = await prisma.ticket.findUnique({ where: { ticketNumber } });
      expect(ticket, `legacy ticket ${ticketNumber} must still exist`).not.toBeNull();
    }
  });

  it("MIG-L4-02: legacy Tickets have zero Actions, so count(OPEN)=0 (gate precondition)", async () => {
    for (const ticketNumber of snapshot.legacyTicketNumbers) {
      const ticket = await prisma.ticket.findUnique({
        where: { ticketNumber },
        select: { id: true },
      });
      const total = await prisma.actionTaken.count({ where: { ticketId: ticket!.id } });
      const open = await prisma.actionTaken.count({
        where: { ticketId: ticket!.id, status: "OPEN" },
      });
      expect(total).toBe(0);
      expect(open).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// MIG-L4-04: seed is idempotent and covers the required shapes
// ---------------------------------------------------------------------------
describe("MIG-L4-04: seed is idempotent and covers 0/1/many Actions and metric data", () => {
  let actionCountBefore: number;

  beforeAll(async () => {
    actionCountBefore = await prisma.actionTaken.count();
    // Run the seed a second time against the migration DB (bcrypt is slow).
    execSync("npx tsx prisma/seed.ts", {
      cwd: serverDir,
      env: {
        ...process.env,
        DATABASE_URL: process.env.MIGRATION_TEST_DATABASE_URL,
        SEED_INITIAL_PASSWORD: process.env.SEED_INITIAL_PASSWORD || "Welcome#2026",
      },
      stdio: "pipe",
    });
  }, 120_000);

  it("MIG-L4-04: re-running the seed does not create duplicate Actions", async () => {
    expect(actionCountBefore).toBeGreaterThan(0);
    expect(await prisma.actionTaken.count()).toBe(actionCountBefore);
  });

  it("MIG-L4-04: there is a Ticket with 0, a Ticket with exactly 1, and a Ticket with many (>1) Actions", async () => {
    const grouped = await prisma.actionTaken.groupBy({
      by: ["ticketId"],
      _count: { _all: true },
    });
    const counts = grouped.map((g) => g._count._all);
    const ticketsWithActions = grouped.length;
    const totalTickets = await prisma.ticket.count();

    expect(totalTickets).toBeGreaterThan(ticketsWithActions); // some ticket has 0
    expect(counts).toContain(1); // exactly one
    expect(counts.some((c) => c > 1)).toBe(true); // many
  });

  it("MIG-L4-04: every ActionStatus value is represented in the seed", async () => {
    const byStatus = await prisma.actionTaken.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const statuses = new Set(byStatus.map((s) => s.status));
    expect(statuses.has("OPEN")).toBe(true);
    expect(statuses.has("COMPLETED")).toBe(true);
    expect(statuses.has("CANCELLED")).toBe(true);
  });

  it("MIG-L4-04: the seed has both assigned and unassigned Actions", async () => {
    expect(await prisma.actionTaken.count({ where: { assigneeId: { not: null } } })).toBeGreaterThan(0);
    expect(await prisma.actionTaken.count({ where: { assigneeId: null } })).toBeGreaterThan(0);
  });

  it("MIG-L4-04: the seed has both a follow-up-required and a no-follow-up Action", async () => {
    expect(await prisma.actionTaken.count({ where: { followUpRequired: true } })).toBeGreaterThan(0);
    expect(await prisma.actionTaken.count({ where: { followUpRequired: false } })).toBeGreaterThan(0);
  });

  it("MIG-L4-04: assignees are all active IT_STAFF/ADMIN (BR-04)", async () => {
    const assigned = await prisma.actionTaken.findMany({
      where: { assigneeId: { not: null } },
      select: { assignee: { select: { role: true, isActive: true } } },
    });
    expect(assigned.length).toBeGreaterThan(0);
    for (const a of assigned) {
      expect(a.assignee!.isActive).toBe(true);
      expect(["IT_STAFF", "ADMIN"]).toContain(a.assignee!.role);
    }
  });

  it("MIG-L4-04: metric data is demonstrable — a staffer has >0 open assigned Actions and another has 0 (zero + non-zero)", async () => {
    // "My Open Actions" dashboard metric = count(assigneeId = me AND status = OPEN)
    const openByAssignee = await prisma.actionTaken.groupBy({
      by: ["assigneeId"],
      where: { status: "OPEN", assigneeId: { not: null } },
      _count: { _all: true },
    });
    // At least one active staff has a non-zero open-actions metric.
    expect(openByAssignee.some((g) => g._count._all > 0)).toBe(true);

    // At least one active IT_STAFF/ADMIN has a zero open-actions metric.
    const activeStaff = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } },
      select: { id: true },
    });
    const withOpen = new Set(openByAssignee.map((g) => g.assigneeId));
    expect(activeStaff.some((s) => !withOpen.has(s.id))).toBe(true);
  });

  it("MIG-L4-04: no RESOLVED/CLOSED/CANCELLED Ticket holds an OPEN Action (invariant)", async () => {
    const bad = await prisma.actionTaken.count({
      where: {
        status: "OPEN",
        ticket: { currentStatus: { in: ["RESOLVED", "CLOSED", "CANCELLED"] } },
      },
    });
    expect(bad).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MIG-L4-03: rollback drops ONLY ActionTaken + ActionStatus; Lab 1-3 intact
// (destructive — runs last, then re-applies the migration to restore the DB)
// ---------------------------------------------------------------------------
describe("MIG-L4-03: rollback drops only ActionTaken/ActionStatus", () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    before = {
      user: await prisma.user.count(),
      ticket: await prisma.ticket.count(),
      attachment: await prisma.attachment.count(),
      category: await prisma.category.count(),
      relatedSystem: await prisma.relatedSystem.count(),
      publicComment: await prisma.publicComment.count(),
      internalNote: await prisma.internalNote.count(),
      session: await prisma.session.count(),
    };
    // Apply the documented rollback (spec §7.3): drop table then enum, nothing else.
    await prisma.$executeRawUnsafe('DROP TABLE "ActionTaken";');
    await prisma.$executeRawUnsafe('DROP TYPE "ActionStatus";');
  });

  afterAll(() => {
    // Restore the DB by re-applying the Lab 4 migration so the suite leaves a
    // consistent state (idempotent reseed could run again if needed).
    execSync(
      `psql -v ON_ERROR_STOP=1 --single-transaction "${process.env.MIGRATION_TEST_DATABASE_URL!.split("?")[0]}" -f "${lab4MigrationSqlPath}"`,
      { stdio: "pipe" }
    );
  });

  it("MIG-L4-03: the ActionTaken table is gone after rollback", async () => {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_name = 'ActionTaken'`
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("MIG-L4-03: the ActionStatus enum type is gone after rollback", async () => {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM pg_type WHERE typname = 'ActionStatus'`
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it("MIG-L4-03: every Lab 1-3 table keeps exactly its pre-rollback row count", async () => {
    expect(await prisma.user.count()).toBe(before.user);
    expect(await prisma.ticket.count()).toBe(before.ticket);
    expect(await prisma.attachment.count()).toBe(before.attachment);
    expect(await prisma.category.count()).toBe(before.category);
    expect(await prisma.relatedSystem.count()).toBe(before.relatedSystem);
    expect(await prisma.publicComment.count()).toBe(before.publicComment);
    expect(await prisma.internalNote.count()).toBe(before.internalNote);
    expect(await prisma.session.count()).toBe(before.session);
  });
});
