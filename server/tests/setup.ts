// Vite/Vitest loads .env before this file runs.
// Redirect all Prisma clients to the test database so tests never touch
// the development database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
