// GET /api/dev-requesters → 404 (BR-61, AC-24)
// Lab 3 removes this endpoint entirely. It returns 404 for all callers,
// including unauthenticated ones, because it is mounted before the auth middleware.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

const app = createApp();

describe("GET /api/dev-requesters", () => {
  it("returns 404 for all callers after Lab 3 (BR-61, AC-24)", async () => {
    const res = await request(app).get("/api/dev-requesters");
    expect(res.status).toBe(404);
  });
});
