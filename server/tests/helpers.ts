import { prisma } from "../src/prismaClient";
import bcryptjs from "bcryptjs";
import type { Application } from "express";
import request from "supertest";

// Returns true only for PostgreSQL error 42P01 (undefined_table), which
// Prisma surfaces as a P2010 raw-query error whose meta.code is "42P01".
function isUndefinedTable(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  return (
    typeof e === "object" &&
    e !== null &&
    e["code"] === "P2010" &&
    typeof e["meta"] === "object" &&
    (e["meta"] as Record<string, unknown>)["code"] === "42P01"
  );
}

// Clears transient test data. Uses raw SQL so the file compiles with both
// the Lab 2 schema (no User/Session tables) and the Lab 3 schema (with them).
// TODO (Stage B): remove the 42P01 skip once the Lab 3 migration creates
//                 User, Session, PublicComment and InternalNote.
async function tryDelete(table: string) {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE TRUE`);
  } catch (err) {
    if (isUndefinedTable(err)) return; // table not yet created — safe to skip
    throw err;               // all other errors are real and must surface
  }
}

export async function clearDatabase() {
  await tryDelete("InternalNote");
  await tryDelete("PublicComment");
  await tryDelete("Session");
  await tryDelete("Attachment");
  await tryDelete("Ticket");
  await tryDelete("TicketCounter");
  await tryDelete("User");
}

// Creates a User row via raw SQL so this helper compiles before the Lab 3
// Prisma migration runs. Cost 10 per BR-10.
export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  role?: "REQUESTER" | "IT_STAFF" | "ADMIN";
  isActive?: boolean;
  mustChangePassword?: boolean;
}): Promise<{
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}> {
  const passwordHash = await bcryptjs.hash(data.password, 10);
  const name = data.name ?? "Test User";
  const email = data.email.trim().toLowerCase();
  const role = data.role ?? "REQUESTER";
  const isActive = data.isActive ?? true;
  const mustChangePassword = data.mustChangePassword ?? true;

  const rows = (await prisma.$queryRawUnsafe(
    `INSERT INTO "User" (name, email, "passwordHash", role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4::\"Role\", $5, $6, NOW(), NOW())
     RETURNING id, name, email, role, "isActive", "mustChangePassword"`,
    name,
    email,
    passwordHash,
    role,
    isActive,
    mustChangePassword
  )) as Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
  }>;
  return rows[0];
}

// Logs in and returns the raw Set-Cookie header value for tt_session.
// Works after Stage C adds the auth routes.
export async function loginAs(
  app: Application,
  credentials: { email: string; password: string }
): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("X-Requested-With", "TokTickIT")
    .send(credentials);

  if (res.status !== 200) {
    throw new Error(
      `loginAs failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }

  const setCookie = res.headers["set-cookie"] as string[] | string | undefined;
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const session = cookies.find((c) => c.startsWith("tt_session="));
  if (!session) throw new Error("tt_session cookie not found in response");
  return session;
}
