import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/lab-03/migration-seed.test.ts",
      "tests/lab-04/migration.test.ts",
    ],
    // Files share one database and must never clear each other's fixtures.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 30000,
    globalSetup: "./tests/globalSetup.ts",
    setupFiles: ["./tests/setup.ts"],
  },
});
