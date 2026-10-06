/**
 * Drops and recreates the E2E database (toktickit_e2e), applies all Prisma
 * migrations, and seeds Categories and Related Systems (reference data only).
 * User accounts and tickets are added separately by `prisma/seed-e2e.ts`.
 *
 * Refuses to run unless E2E_DATABASE_URL ends in "_e2e" and differs from
 * DATABASE_URL, so it can never touch the development database.
 *
 * If any prisma command runs > 60 s stop and run manually:
 *   CHECKPOINT_DISABLE=1 DATABASE_URL=<E2E_DATABASE_URL> npx prisma migrate deploy
 */

import { execSync } from "child_process";
import { config } from "dotenv";
import path from "path";

config();

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
  console.error(
    `ERROR: E2E_DATABASE_URL database name must end with "_e2e" (got: "${dbName}")`
  );
  process.exit(1);
}

if (e2eUrl === devUrl) {
  console.error(
    "ERROR: E2E_DATABASE_URL must differ from DATABASE_URL to prevent data loss"
  );
  process.exit(1);
}

console.log(`Setting up E2E database: ${dbName}`);

// Admin connection (same host/user, database=postgres) for DROP/CREATE.
const adminUrl = new URL(e2eUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const adminUrlStr = adminUrl.toString();

console.log("Dropping database (if exists)...");
execSync(`psql "${adminUrlStr}" -c "DROP DATABASE IF EXISTS \\"${dbName}\\";"`, {
  stdio: "inherit",
});

console.log("Creating database...");
execSync(`psql "${adminUrlStr}" -c "CREATE DATABASE \\"${dbName}\\";"`, {
  stdio: "inherit",
});

const deployUrl = new URL(e2eUrl);
deployUrl.search = "";
const deployUrlStr = deployUrl.toString();

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const serverDir = path.join(__dirname, "..");

console.log("Applying migrations...");
execSync(`CHECKPOINT_DISABLE=1 npx prisma migrate deploy --schema="${schemaPath}"`, {
  env: { ...process.env, DATABASE_URL: deployUrlStr },
  stdio: "inherit",
  cwd: serverDir,
});

// Seed reference data (Categories + Related Systems) with the Prisma client.
import("@prisma/client").then(async ({ PrismaClient }) => {
  const prisma = new PrismaClient({ datasources: { db: { url: deployUrlStr } } });

  const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];
  for (const name of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
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
  console.log(
    `\nE2E database "${dbName}" is ready. Run \`npm run prisma:seed:e2e\` to load accounts and tickets.`
  );
});
