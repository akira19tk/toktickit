/**
 * Deterministic seed for the Playwright E2E database (toktickit_e2e).
 *
 * Separate from prisma/seed.ts because E2E needs accounts whose
 * mustChangePassword state is chosen per scenario (e.g. a requester that is NOT
 * gated, plus a first-login requester that IS gated), and a known, small set of
 * tickets. Reference data (categories, related systems) is upserted here too so
 * the seed is self-sufficient after migrations.
 *
 * Safety:
 *   - refuses to run unless E2E_DATABASE_URL ends in "_e2e" and differs from
 *     DATABASE_URL;
 *   - the Prisma client is pinned to E2E_DATABASE_URL, so it can never write to
 *     the development database even if run with the dev .env loaded.
 *
 * Passwords come from E2E_SEED_PASSWORD (falls back to SEED_INITIAL_PASSWORD,
 * then the documented local default). No secret is hard-coded; the Playwright
 * specs read the same E2E_SEED_PASSWORD variable.
 */

import "dotenv/config";
import { PrismaClient, Role, Priority, TicketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const e2eUrl = process.env.E2E_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;

if (!e2eUrl) {
  console.error("ERROR: E2E_DATABASE_URL is not set in .env");
  process.exit(1);
}

let dbName: string;
try {
  dbName = new URL(e2eUrl).pathname.slice(1).split("?")[0];
} catch {
  console.error(`ERROR: E2E_DATABASE_URL is not a valid URL: ${e2eUrl}`);
  process.exit(1);
}
if (!dbName.endsWith("_e2e")) {
  console.error(`ERROR: E2E_DATABASE_URL database name must end with "_e2e" (got: "${dbName}")`);
  process.exit(1);
}
if (e2eUrl === devUrl) {
  console.error("ERROR: E2E_DATABASE_URL must differ from DATABASE_URL to prevent data loss");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: e2eUrl } } });

const SEED_PASSWORD =
  process.env.E2E_SEED_PASSWORD || process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || "10", 10);

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];
const RELATED_SYSTEMS = [
  { name: "Email", isActive: true },
  { name: "Campus Wi-Fi", isActive: true },
  { name: "VPN", isActive: true },
  { name: "Student Information System", isActive: true },
  { name: "Learning Management System", isActive: true },
  { name: "Library Database", isActive: true },
  { name: "Legacy CRM", isActive: false },
];

type UserSeed = {
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
};

// Accounts chosen to cover the Stage 3-6 scenarios deterministically.
const USERS: UserSeed[] = [
  { email: "admin.e2e@example.com", name: "Admin E2E", role: Role.ADMIN, isActive: true, mustChangePassword: false },
  { email: "admin2.e2e@example.com", name: "Second Admin E2E", role: Role.ADMIN, isActive: true, mustChangePassword: false },
  { email: "staff.e2e@example.com", name: "Staff E2E", role: Role.IT_STAFF, isActive: true, mustChangePassword: false },
  { email: "staff.inactive.e2e@example.com", name: "Inactive Staff E2E", role: Role.IT_STAFF, isActive: false, mustChangePassword: false },
  { email: "requester.e2e@example.com", name: "Requester E2E", role: Role.REQUESTER, isActive: true, mustChangePassword: false },
  { email: "requester2.e2e@example.com", name: "Second Requester E2E", role: Role.REQUESTER, isActive: true, mustChangePassword: false },
  { email: "firstlogin.e2e@example.com", name: "First Login E2E", role: Role.REQUESTER, isActive: true, mustChangePassword: true },
];

async function main() {
  // Reference data (idempotent).
  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const s of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name: s.name },
      update: { isActive: s.isActive },
      create: s,
    });
  }

  // Clear per-run data in FK-safe order (safe: this is the guarded _e2e database).
  await prisma.publicComment.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  const userByEmail = new Map<string, number>();
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        passwordHash,
      },
      select: { id: true },
    });
    userByEmail.set(u.email, created.id);
  }
  console.log(`Seeded ${USERS.length} E2E users.`);

  const catId = (name: string) => prisma.category.findUniqueOrThrow({ where: { name }, select: { id: true } });
  const sysId = (name: string) => prisma.relatedSystem.findUniqueOrThrow({ where: { name }, select: { id: true } });

  const accountAccess = (await catId("Account and Access")).id;
  const software = (await catId("Software")).id;
  const email = (await sysId("Email")).id;
  const vpn = (await sysId("VPN")).id;

  const requesterId = userByEmail.get("requester.e2e@example.com")!;
  const staffId = userByEmail.get("staff.e2e@example.com")!;

  // A small, known set of tickets: one claimable NEW unassigned ticket for the
  // staff flow, and one already-open owned ticket.
  await prisma.ticket.create({
    data: {
      ticketNumber: "TKT-2026-950001",
      requesterId,
      ownerId: null,
      categoryId: accountAccess,
      relatedSystemId: email,
      summary: "E2E: cannot sign in to email",
      description: "Seeded E2E ticket — unassigned and NEW so staff can claim it.",
      requestedPriority: Priority.MEDIUM,
      itPriority: Priority.MEDIUM,
      currentStatus: TicketStatus.NEW,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: "TKT-2026-950002",
      requesterId,
      ownerId: staffId,
      categoryId: software,
      relatedSystemId: vpn,
      summary: "E2E: VPN disconnects frequently",
      description: "Seeded E2E ticket — already owned and OPEN.",
      requestedPriority: Priority.HIGH,
      itPriority: Priority.HIGH,
      currentStatus: TicketStatus.OPEN,
    },
  });

  console.log(`Seeded 2 E2E tickets. E2E database "${dbName}" is ready.`);
}

main()
  .catch((err) => {
    console.error("E2E seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
