/**
 * Drops and recreates toktickit_test, applies all Prisma migrations,
 * and seeds Categories and Related Systems.
 * The test database intentionally contains no User rows (spec section 7).
 *
 * Refuses to run unless TEST_DATABASE_URL ends in "_test" and differs
 * from DATABASE_URL.
 *
 * If any prisma command runs > 60 s stop and run manually:
 *   CHECKPOINT_DISABLE=1 DATABASE_URL=<TEST_DATABASE_URL> npx prisma migrate deploy
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
let parsed: URL;
try {
  parsed = new URL(testUrl);
  dbName = parsed.pathname.slice(1).split("?")[0];
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

// Build an admin connection URL (same host/user, database=postgres)
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const adminUrlStr = adminUrl.toString();

// Drop and recreate via psql (no interactive prompts, no hang)
console.log("Dropping database (if exists)...");
execSync(
  `psql "${adminUrlStr}" -c "DROP DATABASE IF EXISTS \\"${dbName}\\";"`,
  { stdio: "inherit" }
);

console.log("Creating database...");
execSync(
  `psql "${adminUrlStr}" -c "CREATE DATABASE \\"${dbName}\\";"`,
  { stdio: "inherit" }
);

// Build the deploy URL without the ?schema= query parameter
// (prisma migrate deploy accepts ?schema= but we strip it for clean output)
const deployUrl = new URL(testUrl);
deployUrl.search = "";
const deployUrlStr = deployUrl.toString();

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const serverDir = path.join(__dirname, "..");

console.log("Applying migrations...");
execSync(
  `CHECKPOINT_DISABLE=1 npx prisma migrate deploy --schema="${schemaPath}"`,
  {
    env: { ...process.env, DATABASE_URL: deployUrlStr },
    stdio: "inherit",
    cwd: serverDir,
  }
);

// Seed reference data using the Prisma client
import("@prisma/client").then(async ({ PrismaClient }) => {
  const prisma = new PrismaClient({ datasources: { db: { url: deployUrlStr } } });

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

  await prisma.$disconnect();
  console.log(`\nTest database "${dbName}" is ready.`);
});
