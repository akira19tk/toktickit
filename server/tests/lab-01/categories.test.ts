// GET /api/categories requires authentication in Lab 3 (BR-20).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

const EXPECTED_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

let sessionCookie: string;

beforeAll(async () => {
  await clearDatabase();
  await createUser({ email: "cattest@example.com", password: "Test#1234", role: "REQUESTER", mustChangePassword: false });
  sessionCookie = await loginAs(app, { email: "cattest@example.com", password: "Test#1234" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/categories", () => {
  it("returns 200 with the four seeded categories in a predictable order", async () => {
    const res = await request(app)
      .get("/api/categories")
      .set("Cookie", sessionCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual(EXPECTED_NAMES);

    for (const category of res.body) {
      expect(category).toHaveProperty("id");
      expect(category).toHaveProperty("name");
    }
  });

  it("returns 401 without a session (BR-20)", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(401);
  });
});
