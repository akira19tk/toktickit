// API-02: GET /api/categories returns the four seeded categories
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

const app = createApp();

const EXPECTED_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

describe("GET /api/categories", () => {
  it("returns 200 with the four seeded categories in a predictable order", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual(EXPECTED_NAMES);

    // Every category has an id and a name
    for (const category of res.body) {
      expect(category).toHaveProperty("id");
      expect(category).toHaveProperty("name");
    }
  });
});
