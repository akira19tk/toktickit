// API-13: POST valid JPG <5MB          → 201, attachment saved        (AC-22)
// API-14: POST 10MB file               → 400 size-limit error         (AC-23)
// API-15: POST 6th attachment (5 active) → 400 limit error             (AC-24)
// API-16: GET download active          → 200, file returned            (AC-25)
// API-17: DELETE with reason           → 200, removedAt + reason set  (AC-26)
// API-18: GET download soft-removed   → 410 (or 404)                  (AC-27)
// Converted for Lab 3: session cookie authentication instead of x-requester-id.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/prismaClient";
import { createUser, loginAs, clearDatabase } from "../helpers";

const app = createApp();

let sessionOwner: string;
let sessionOther: string;
let ticketId: number;

// 1-pixel white JPEG (valid, ~631 bytes)
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
  "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
  "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
  "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
  "AAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAA" +
  "AAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
  "base64"
);

beforeAll(async () => {
  await clearDatabase();

  await createUser({ email: "alice@attachments.test", password: "Test#1234", name: "Alice", role: "REQUESTER", mustChangePassword: false });
  await createUser({ email: "bob@attachments.test", password: "Test#1234", name: "Bob", role: "REQUESTER", mustChangePassword: false });

  sessionOwner = await loginAs(app, { email: "alice@attachments.test", password: "Test#1234" });
  sessionOther = await loginAs(app, { email: "bob@attachments.test", password: "Test#1234" });

  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

  const res = await request(app)
    .post("/api/tickets")
    .set("Cookie", sessionOwner)
    .set("X-Requested-With", "TokTickIT")
    .field("categoryId", String(cat!.id))
    .field("relatedSystemId", String(sys!.id))
    .field("summary", "Attachment test ticket")
    .field("description", "Used exclusively for attachment API tests.")
    .field("requestedPriority", "LOW");

  ticketId = res.body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/tickets/:id/attachments", () => {
  it("API-13: valid JPG under 5MB → 201, attachment saved (AC-22)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "photo.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.fileName).toBe("photo.jpg");
    expect(res.body).toHaveProperty("sizeBytes");
    expect(res.body).toHaveProperty("uploadedAt");
  });

  it("API-14: file >5MB → 400 with size-limit error (AC-23)", async () => {
    const bigFile = Buffer.alloc(6 * 1024 * 1024); // 6 MB

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", bigFile, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5\s*MB|size|too large/i);
  });

  it("API-15: 6th attachment when 5 are active → 400 count-limit error (AC-24)", async () => {
    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    const sys = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    // Create a fresh ticket, add exactly 5 attachments
    const tr = await request(app)
      .post("/api/tickets")
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .field("categoryId", String(cat!.id))
      .field("relatedSystemId", String(sys!.id))
      .field("summary", "Five-attachment limit test")
      .field("description", "Ticket used to test the 5-attachment cap.")
      .field("requestedPriority", "LOW");

    const tid = tr.body.id;

    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post(`/api/tickets/${tid}/attachments`)
        .set("Cookie", sessionOwner)
        .set("X-Requested-With", "TokTickIT")
        .attach("file", TINY_JPEG, { filename: `file${i}.jpg`, contentType: "image/jpeg" });
      expect(r.status).toBe(201);
    }

    const res = await request(app)
      .post(`/api/tickets/${tid}/attachments`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "sixth.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5\s*active|limit|maximum/i);
  });

  it("wrong owner → 404 (ownership BR-17)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionOther)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "photo.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/tickets/:id/attachments/:attachmentId/download and DELETE", () => {
  let attachmentId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "download-test.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(201);
    attachmentId = res.body.id;
  });

  it("API-16: download active attachment → 200 with file stream (AC-25)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}/download`)
      .set("Cookie", sessionOwner);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/i);
    expect(res.headers["content-disposition"]).toMatch(/attachment/i);
    expect(res.body).toBeTruthy();
  });

  it("API-17: DELETE with reason → 200, removedAt + removalReason set (AC-26)", async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .send({ reason: "Uploaded wrong file" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", attachmentId);
    expect(res.body).toHaveProperty("removedAt");
    expect(res.body.removalReason).toBe("Uploaded wrong file");
  });

  it("API-18: download soft-removed attachment → 410 Gone (AC-27)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}/download`)
      .set("Cookie", sessionOwner);

    expect(res.status).toBe(410);
  });

  it("DELETE already-removed → 409 Conflict", async () => {
    const res = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .send({ reason: "Trying again" });

    expect(res.status).toBe(409);
  });

  it("DELETE without reason → 400 (BR-18)", async () => {
    const up = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .attach("file", TINY_JPEG, { filename: "noreasontest.jpg", contentType: "image/jpeg" });
    expect(up.status).toBe(201);

    const res = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/${up.body.id}`)
      .set("Cookie", sessionOwner)
      .set("X-Requested-With", "TokTickIT")
      .send({ reason: "ab" }); // <3 chars

    expect(res.status).toBe(400);
  });
});
