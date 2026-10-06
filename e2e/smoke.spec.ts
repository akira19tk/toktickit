import { test, expect } from "@playwright/test";

/**
 * Stage 2 smoke test. Proves the E2E harness is wired end to end:
 *   - the isolated API server (port 4100, toktickit_e2e) is up and healthy;
 *   - the vite-preview client (port 4173) is up and renders the public Login screen.
 *
 * This is harness verification, not an AC-mapped test; the Test-ID specs
 * (E2E-*, RESP-*, STYLE-*) are added under e2e/lab-03 in later stages.
 */

test("SMOKE: API health endpoint responds ok", async ({ request }) => {
  const res = await request.get("http://localhost:4100/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ status: "ok" });
});

test("SMOKE: client renders the Login screen", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
