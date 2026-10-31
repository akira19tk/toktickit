// Vite/Vitest loads .env before this file runs.
// Redirect all Prisma clients to the test database so tests never touch
// the development database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Every isolated test file releases its pool; not all older suites had teardown.
import { afterAll } from "vitest";
afterAll(async () => {
  // Import only after the test-database redirect above has taken effect.
  const { prisma } = await import("../src/prismaClient.js");
  await prisma.$disconnect();
});
