/**
 * Builds toktickit_migration_test and runs the full migration scenario:
 *
 *   1. Drop and recreate toktickit_migration_test
 *   2. Apply the Lab 1-2 migration SQL files (everything before the Lab 3
 *      "users_auth" migration) via psql -f
 *   3. Load a small Lab 2 fixture (categories, related systems, requesters,
 *      tickets with different priorities, attachments)
 *   4. Snapshot the pre-Lab-3 (DevRequester-era) state
 *   5. Apply the Lab 3 "users_auth" migration SQL via psql -f
 *   6. Record which migrated users have null passwordHash (before seed)
 *   7. Run the seed (pass 1 — Users, Tickets, Comments, Notes)
 *   8. Snapshot the Lab 1-3 row counts + legacy ticket numbers immediately
 *      before the Lab 4 migration (the additive baseline for MIG-L4-01)
 *   9. Apply the Lab 4 (and any later) migration SQL via psql -f
 *  10. Run the seed again (pass 2 — now also seeds Actions Taken)
 *  11. Write the combined snapshot to server/.migration-snapshot.json
 *
 * The partition in steps 2/5/9 is name-based (not "last folder = Lab 3"), so the
 * existing Lab 3 migration test keeps its exact pre-Lab-3 snapshot semantics and
 * stays green unchanged after the Lab 4 migration folder is added.
 *
 * Refuses to run unless MIGRATION_TEST_DATABASE_URL ends in "_test" and
 * differs from DATABASE_URL.
 */

import { execSync } from "child_process";
import { config } from "dotenv";
import path from "path";
import fs from "fs";

config();

const migrationUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;

if (!migrationUrl) {
  console.error("ERROR: MIGRATION_TEST_DATABASE_URL is not set in .env");
  process.exit(1);
}

let dbName: string;
let parsed: URL;
try {
  parsed = new URL(migrationUrl);
  dbName = parsed.pathname.slice(1).split("?")[0];
} catch {
  console.error(
    `ERROR: MIGRATION_TEST_DATABASE_URL is not a valid URL: ${migrationUrl}`
  );
  process.exit(1);
}

if (!dbName.endsWith("_test")) {
  console.error(
    `ERROR: MIGRATION_TEST_DATABASE_URL database name must end with "_test" (got: "${dbName}")`
  );
  process.exit(1);
}

if (migrationUrl === devUrl) {
  console.error(
    "ERROR: MIGRATION_TEST_DATABASE_URL must differ from DATABASE_URL to prevent data loss"
  );
  process.exit(1);
}

// Strip query params for psql connections
const cleanUrl = new URL(migrationUrl);
cleanUrl.search = "";
const dbUrl = cleanUrl.toString();

const adminUrl = new URL(migrationUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const adminUrlStr = adminUrl.toString();

const serverDir = path.join(__dirname, "..");
const migrationsDir = path.join(serverDir, "prisma", "migrations");
const snapshotPath = path.join(serverDir, ".migration-snapshot.json");

function psqlFile(filePath: string) {
  execSync(
    `psql -v ON_ERROR_STOP=1 --single-transaction "${dbUrl}" -f "${filePath}"`,
    { stdio: "inherit" }
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- Step 1: Drop and recreate ---
  console.log(`\n=== Setting up migration test database: ${dbName} ===\n`);

  console.log("Dropping database (if exists)...");
  execSync(`psql "${adminUrlStr}" -c "DROP DATABASE IF EXISTS \\"${dbName}\\";"`, {
    stdio: "inherit",
  });
  console.log("Creating database...");
  execSync(`psql "${adminUrlStr}" -c "CREATE DATABASE \\"${dbName}\\";"`, {
    stdio: "inherit",
  });

  // --- Step 2: Apply Lab 2 migrations ---
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => !f.endsWith(".toml") && !f.startsWith("."))
    .sort();

  // Name-based partition so adding later-lab migrations never shifts the stages:
  //   • pre-User   = Lab 1-2 schema (DevRequester/Ticket/Attachment) — fixture loads here
  //   • users_auth = the Lab 3 migration that renames DevRequester → User
  //   • post-Lab-3 = Lab 4+ migrations (e.g. actions_taken), applied after the Lab 3 seed
  const userAuthIdx = migrationFolders.findIndex((f) => f.includes("users_auth"));
  if (userAuthIdx === -1) {
    throw new Error('Could not find the Lab 3 "users_auth" migration folder.');
  }
  const preUserFolders = migrationFolders.slice(0, userAuthIdx);
  const lab3Folder = migrationFolders[userAuthIdx];
  const postLab3Folders = migrationFolders.slice(userAuthIdx + 1);

  console.log(`\nApplying ${preUserFolders.length} Lab 1-2 migrations...`);
  for (const folder of preUserFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    console.log(`  ${folder}`);
    psqlFile(sqlFile);
  }

  // --- Step 3: Load Lab 2 fixture ---
  console.log("\nLoading Lab 2 fixture...");

  const FIXTURE_SQL = [
    // Categories (isActive column added in migration 2)
    `INSERT INTO "Category" (name, "isActive", "createdAt") VALUES`,
    `  ('Account and Access', true, NOW()),`,
    `  ('Hardware', true, NOW()),`,
    `  ('Software', true, NOW()),`,
    `  ('Network', true, NOW());`,
    ``,
    `INSERT INTO "RelatedSystem" (name, "isActive") VALUES`,
    `  ('Email', true),`,
    `  ('Campus Wi-Fi', true),`,
    `  ('VPN', true),`,
    `  ('Student Information System', true),`,
    `  ('Learning Management System', true),`,
    `  ('Library Database', true),`,
    `  ('Legacy CRM', false);`,
    ``,
    `INSERT INTO "DevRequester" (name, email, "isActive", "createdAt") VALUES`,
    `  ('Alice Johnson', 'alice@example.com', true,  NOW()),`,
    `  ('Bob Smith',     'bob@example.com',   true,  NOW()),`,
    `  ('Carol Davis',   'carol@example.com', true,  NOW()),`,
    `  ('David Wilson',  'david@example.com', true,  NOW()),`,
    `  ('Eve Martinez',  'eve@example.com',   false, NOW());`,
    ``,
    // Tickets: 2 LOW, 1 MEDIUM, 2 HIGH to test itPriority backfill coverage
    `INSERT INTO "Ticket"`,
    `  ("ticketNumber","requesterId","categoryId","relatedSystemId",`,
    `   summary, description, "requestedPriority", "currentStatus", "createdAt", "updatedAt")`,
    `VALUES`,
    `  ('TKT-2026-000001',1,1,1,'Email not working','Cannot send emails','LOW','NEW',NOW(),NOW()),`,
    `  ('TKT-2026-000002',2,2,2,'Keyboard broken','Keys not responding','MEDIUM','NEW',NOW(),NOW()),`,
    `  ('TKT-2026-000003',3,3,3,'VPN connection fails','Cannot connect to VPN','HIGH','NEW',NOW(),NOW()),`,
    `  ('TKT-2026-000004',1,4,1,'Network outage','No network in room 404','HIGH','NEW',NOW(),NOW()),`,
    `  ('TKT-2026-000005',2,1,1,'Password reset needed','Locked out of account','LOW','NEW',NOW(),NOW());`,
    ``,
    `INSERT INTO "Attachment"`,
    `  ("ticketId","fileName","storedFileName","mimeType","sizeBytes","uploadedAt")`,
    `VALUES`,
    `  (1,'error-log.txt','uuid-abc123.txt','text/plain',1024,NOW()),`,
    `  (3,'screenshot.png','uuid-def456.png','image/png',204800,NOW());`,
    ``,
    `INSERT INTO "TicketCounter" (year, count) VALUES (2026, 5);`,
  ].join("\n");

  const fixtureSqlPath = path.join(serverDir, ".fixture-lab2.sql");
  fs.writeFileSync(fixtureSqlPath, FIXTURE_SQL);
  try {
    psqlFile(fixtureSqlPath);
  } finally {
    fs.unlinkSync(fixtureSqlPath);
  }
  console.log("Lab 2 fixture loaded.");

  // --- Record pre-Lab-3-migration snapshot ---
  // Use dynamic import so we get the current Prisma client (raw queries are schema-agnostic)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  type CountRow = { count: string };
  type RequesterIdRow = { id: number; requesterId: number };

  const [ticketRows, attachRows, catRows, sysRows, mapRows] = await Promise.all([
    prisma.$queryRawUnsafe<CountRow[]>(
      'SELECT COUNT(*)::text AS count FROM "Ticket"'
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      'SELECT COUNT(*)::text AS count FROM "Attachment"'
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      'SELECT COUNT(*)::text AS count FROM "Category"'
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      'SELECT COUNT(*)::text AS count FROM "RelatedSystem"'
    ),
    prisma.$queryRawUnsafe<RequesterIdRow[]>(
      'SELECT id, "requesterId" FROM "Ticket" ORDER BY id'
    ),
  ]);

  const preMigCounts = {
    ticketCount: parseInt(ticketRows[0].count, 10),
    attachmentCount: parseInt(attachRows[0].count, 10),
    categoryCount: parseInt(catRows[0].count, 10),
    relatedSystemCount: parseInt(sysRows[0].count, 10),
    requesterIdMap: mapRows.map((r) => ({
      ticketId: Number(r.id),
      requesterId: Number(r.requesterId),
    })),
  };

  console.log("Pre-migration counts:", {
    tickets: preMigCounts.ticketCount,
    attachments: preMigCounts.attachmentCount,
    categories: preMigCounts.categoryCount,
    relatedSystems: preMigCounts.relatedSystemCount,
  });

  // --- Step 4: Apply Lab 3 migration ---
  console.log(`\nApplying Lab 3 migration: ${lab3Folder}`);
  psqlFile(path.join(migrationsDir, lab3Folder, "migration.sql"));
  console.log("Lab 3 migration applied.");

  // --- Step 5: Record null-hash users (after migration, before seed) ---
  type UserHashRow = { email: string; passwordHash: string | null };
  const usersPostMigration = await prisma.$queryRawUnsafe<UserHashRow[]>(
    'SELECT email, "passwordHash" FROM "User" ORDER BY email'
  );
  const nullHashUserEmails = usersPostMigration
    .filter((u) => u.passwordHash === null)
    .map((u) => u.email);

  console.log(
    `After Lab 3 migration (before seed): ${usersPostMigration.length} users, ` +
      `${nullHashUserEmails.length} with null hash.`
  );

  await prisma.$disconnect();

  // --- Step 7: Run seed (pass 1 — Users, Tickets, Comments, Notes) ---
  console.log("\nRunning seed (pass 1)...");
  execSync("npx tsx prisma/seed.ts", {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      SEED_INITIAL_PASSWORD:
        process.env.SEED_INITIAL_PASSWORD || "Welcome#2026",
    },
    stdio: "inherit",
  });
  console.log("Seed pass 1 completed.");

  // --- Step 8: Snapshot Lab 1-3 state immediately before the Lab 4 migration ---
  // These are the additive baseline: Lab 4 is additive and the seed is
  // idempotent, so every count here must be unchanged after migrate + reseed.
  const prisma2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const countOf = async (table: string) => {
    const rows = await prisma2.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::text AS count FROM "${table}"`
    );
    return parseInt(rows[0].count, 10);
  };
  const preLab4 = {
    userCount: await countOf("User"),
    ticketCount: await countOf("Ticket"),
    attachmentCount: await countOf("Attachment"),
    categoryCount: await countOf("Category"),
    relatedSystemCount: await countOf("RelatedSystem"),
    publicCommentCount: await countOf("PublicComment"),
    internalNoteCount: await countOf("InternalNote"),
  };
  // Legacy (pre-Lab-4) Tickets = the Lab 2 fixture rows, which never get Actions.
  const legacyIds = preMigCounts.requesterIdMap.map((r) => r.ticketId);
  const legacyRows = legacyIds.length
    ? await prisma2.$queryRawUnsafe<{ ticketNumber: string }[]>(
        `SELECT "ticketNumber" FROM "Ticket" WHERE id IN (${legacyIds.join(",")}) ORDER BY id`
      )
    : [];
  const legacyTicketNumbers = legacyRows.map((r) => r.ticketNumber);
  await prisma2.$disconnect();
  console.log("Pre-Lab4 counts:", preLab4);

  // --- Step 9: Apply Lab 4 (and any later) migrations ---
  for (const folder of postLab3Folders) {
    console.log(`\nApplying post-Lab-3 migration: ${folder}`);
    psqlFile(path.join(migrationsDir, folder, "migration.sql"));
  }

  // --- Step 10: Run seed (pass 2 — now also seeds Actions Taken) ---
  console.log("\nRunning seed (pass 2 — Actions)...");
  execSync("npx tsx prisma/seed.ts", {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      SEED_INITIAL_PASSWORD:
        process.env.SEED_INITIAL_PASSWORD || "Welcome#2026",
    },
    stdio: "inherit",
  });
  console.log("Seed pass 2 completed.");

  // --- Step 11: Write snapshot ---
  const snapshot = {
    ...preMigCounts,
    nullHashUserEmails,
    preLab4,
    legacyTicketNumbers,
  };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written to ${snapshotPath}`);
  console.log(`\n=== toktickit_migration_test is ready. ===`);
  console.log("Run: cd server && npm run test:migration\n");
}

main().catch((err) => {
  console.error("setup-migration-db failed:", err);
  process.exit(1);
});
