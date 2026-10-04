// Vitest's main process does not load env via Vite; use dotenv directly.
// We call config() (not configDotenv which hangs in v17) to load .env.
import { config } from "dotenv";

export async function setup() {
  config(); // loads .env into process.env in the main process

  const testUrl = process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set in .env. Add it and run: npm run test:db:setup"
    );
  }

  let dbName: string;
  try {
    dbName = new URL(testUrl).pathname.slice(1);
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a valid URL: ${testUrl}`);
  }

  if (!dbName.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL database name must end with "_test" (got: "${dbName}")`
    );
  }

  if (testUrl === devUrl) {
    throw new Error(
      "TEST_DATABASE_URL must differ from DATABASE_URL to prevent accidental data loss"
    );
  }
}
