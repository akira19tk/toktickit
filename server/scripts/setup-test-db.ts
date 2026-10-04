/**
 * Drops and recreates toktickit_test, applies all Prisma migrations,
 * and seeds Categories, Related Systems and DevRequesters (needed by
 * existing Lab 2 tests; DevRequester seeding will be removed in Stage D
 * once those tests are converted to use authenticated Users).
 *
 * Refuses to run unless TEST_DATABASE_URL ends in "_test" and differs
 * from DATABASE_URL.
 */

import { execSync } from "child_process";
import { config } from "dotenv";
import path from "path";

config();

const testUrl = process.env.TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;

if (!testUrl) {
  console.error("ERROR: TEST_DATABASE_URL is not set in .env");
  process.exit(1);
}

let dbName: string;
try {
  dbName = new URL(testUrl).pathname.slice(1);
} catch {
  console.error(`ERROR: TEST_DATABASE_URL is not a valid URL: ${testUrl}`);
  process.exit(1);
}

if (!dbName.endsWith("_test")) {
  console.error(
    `ERROR: TEST_DATABASE_URL database name must end with "_test" (got: "${dbName}")`
  );
  process.exit(1);
}

if (testUrl === devUrl) {
  console.error(
    "ERROR: TEST_DATABASE_URL must differ from DATABASE_URL to prevent data loss"
  );
  process.exit(1);
}

console.log(`Setting up test database: ${dbName}`);

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");

try {
  execSync(`npx prisma migrate reset --force --skip-seed --schema="${schemaPath}"`, {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
} catch {
  console.error("Migration reset failed");
  process.exit(1);
}

// Seed reference data
import("@prisma/client").then(async ({ PrismaClient }) => {
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });

  const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);

  const RELATED_SYSTEMS = [
    { name: "Email", isActive: true },
    { name: "Campus Wi-Fi", isActive: true },
    { name: "VPN", isActive: true },
    { name: "Student Information System", isActive: true },
    { name: "Learning Management System", isActive: true },
    { name: "Library Database", isActive: true },
    { name: "Legacy CRM", isActive: false },
  ];
  for (const s of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name: s.name },
      update: { isActive: s.isActive },
      create: s,
    });
  }
  console.log(`Seeded ${RELATED_SYSTEMS.length} related systems.`);

  // DevRequesters: seeded temporarily so Lab 2 tests pass.
  // Remove this block in Stage D when those tests use authenticated Users.
  const DEV_REQUESTERS = [
    { name: "Alice Johnson", email: "alice@example.com", isActive: true },
    { name: "Bob Smith", email: "bob@example.com", isActive: true },
    { name: "Carol Davis", email: "carol@example.com", isActive: true },
    { name: "David Wilson", email: "david@example.com", isActive: true },
    { name: "Eve Martinez", email: "eve@example.com", isActive: false },
  ];
  for (const r of DEV_REQUESTERS) {
    await prisma.devRequester.upsert({
      where: { email: r.email },
      update: { name: r.name, isActive: r.isActive },
      create: r,
    });
  }
  console.log(`Seeded ${DEV_REQUESTERS.length} dev requesters.`);

  await prisma.$disconnect();
  console.log(`\nTest database "${dbName}" is ready.`);
});
