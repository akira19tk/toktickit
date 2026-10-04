import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/lab-03/migration-seed.test.ts"],
    fileParallelism: false,
    globalSetup: "./tests/globalSetup-migration.ts",
    setupFiles: ["./tests/setup-migration.ts"],
  },
});
