import { config } from "dotenv";

export async function setup() {
  config();

  const migrationUrl = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!migrationUrl) {
    throw new Error(
      "MIGRATION_TEST_DATABASE_URL is not set in .env. Run: tsx scripts/setup-migration-db.ts"
    );
  }

  let dbName: string;
  try {
    dbName = new URL(migrationUrl).pathname.slice(1).split("?")[0];
  } catch {
    throw new Error(
      `MIGRATION_TEST_DATABASE_URL is not a valid URL: ${migrationUrl}`
    );
  }

  if (!dbName.endsWith("_test")) {
    throw new Error(
      `MIGRATION_TEST_DATABASE_URL database name must end with "_test" (got: "${dbName}")`
    );
  }

  if (migrationUrl === process.env.DATABASE_URL) {
    throw new Error(
      "MIGRATION_TEST_DATABASE_URL must differ from DATABASE_URL to prevent data loss"
    );
  }
}
