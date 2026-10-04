// Redirects the Prisma client to toktickit_migration_test for migration tests.
// Applied by vitest.migration.config.ts via setupFiles.
if (process.env.MIGRATION_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_TEST_DATABASE_URL;
}
