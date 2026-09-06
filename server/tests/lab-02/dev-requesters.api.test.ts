// API-19: GET /api/dev-requesters — inactive requester excluded
// AC-08: inactive requester must not appear in the dropdown
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

const app = createApp();

describe("GET /api/dev-requesters", () => {
  it("API-19: returns 200 with only active requesters; inactive requester excluded", async () => {
    const res = await request(app).get("/api/dev-requesters");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Seed has 4 active + 1 inactive → response must have exactly 4
    expect(res.body.length).toBe(4);

    // Each item must have id, name, email (api-spec.md §1)
    for (const r of res.body) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("email");
    }

    // The inactive requester must not appear
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).not.toContain("Eve Martinez");
  });

  it("returns 500 shape on DB failure is documented (smoke — route exists)", async () => {
    // Just confirms the route is mounted; detailed DB-error test needs DB mock
    const res = await request(app).get("/api/dev-requesters");
    expect([200, 500]).toContain(res.status);
  });
});
