import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs fully isolated from the dev stack:
 *   - database: toktickit_e2e  (never DATABASE_URL / toktickit, never *_test)
 *   - API server: http://localhost:4100  (dev uses 4000)
 *   - client (vite preview of the production build): http://localhost:4173  (dev uses 5173)
 *
 * The same E2E_DATABASE_URL must be used by `npm run e2e:setup`, which seeds the
 * database the server here talks to. Override it in the shell to point elsewhere;
 * the server-side setup/seed scripts read the same variable (see server/.env).
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/toktickit_e2e?schema=public";

const SERVER_PORT = 4100;
const CLIENT_PORT = 4173;
const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
const API_BASE_URL = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Shared in-memory login throttle + one shared e2e database -> run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: CLIENT_ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // API server, pinned to the isolated e2e database and port.
      // dotenv in the server does not override vars we pass here, so DATABASE_URL
      // below wins over server/.env (which points at the dev database).
      command: "npm --prefix server run dev",
      url: `${API_BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        PORT: String(SERVER_PORT),
        CLIENT_ORIGIN,
        NODE_ENV: "test",
      },
    },
    {
      // Production build of the client, served by vite preview on a non-dev port.
      // VITE_API_BASE_URL is baked in at build time, so it must be set for `build`.
      command: `npm --prefix client run build && npm --prefix client run preview -- --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_API_BASE_URL: API_BASE_URL,
      },
    },
  ],
});
