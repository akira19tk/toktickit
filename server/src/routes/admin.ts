// Administrator User Management endpoints (Lab 3, Issue #28)
//   GET   /api/admin/users                      — list / search / role filter   (BR-55)
//   POST  /api/admin/users                      — create a user                 (BR-48..50, BR-68)
//   PATCH /api/admin/users/:id                  — edit name/email/role/isActive  (BR-49, BR-51..53, BR-67, BR-68)
//   POST  /api/admin/users/:id/initial-password — set an initial password        (BR-54)
//
// All routes are ADMIN-only (BR-23); auth (401) → pw-gate (403) → CSRF (403) run
// globally in app.ts, so requireRole("ADMIN") here is the role (403) step.
// Per-endpoint check order follows BR-24: role → 404 → 400 validation → 409 conflict.
// There is deliberately no DELETE route (BR-53); DELETE falls through to the
// global 404 handler.

import { Router, type Request, type Response, type RequestHandler } from "express";
import { prisma } from "../prismaClient";
import { requireRole } from "../middleware/auth";
import { validatePassword, normalizeEmail, hashPassword } from "../lib/auth";
import type { Prisma, Role } from "@prisma/client";

const router = Router();

const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMIN"];

// A single advisory-lock key shared by every admin-safety-affecting write
// (deactivating or demoting an Administrator). pg_advisory_xact_lock serializes
// the count-then-write of BR-51/BR-52 across concurrent requests (BR-67) without
// holding row locks across awaits; the lock is released automatically when the
// transaction ends. Any constant works as long as every such write uses it.
const ADMIN_LOCK_KEY = 528431;

// Fields returned to the client — never passwordHash (BR-10, BR-55).
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
};

function userView(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function notFound(res: Response): void {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}

function validationFailed(res: Response, errors: Record<string, string>): void {
  res.status(400).json({ error: "Invalid input", code: "VALIDATION_FAILED", errors });
}

// ── GET /api/admin/users ─────────────────────────────────────────────────────
// All users, no pagination, sorted by name then id; case-insensitive substring
// search on name or email; exact role filter. An unknown role value is ignored
// (treated as no filter), matching the queue's "never an error" convention.

router.get(
  "/users",
  requireRole("ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const searchRaw = req.query.search;
    const roleRaw = req.query.role;

    const search = typeof searchRaw === "string" ? searchRaw.trim() : "";
    const role =
      typeof roleRaw === "string" && ROLES.includes(roleRaw as Role)
        ? (roleRaw as Role)
        : undefined;

    const where: Prisma.UserWhereInput = {
      AND: [
        role ? { role } : {},
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const users = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    res.status(200).json({ data: users.map(userView) });
  }
);

// ── POST /api/admin/users ────────────────────────────────────────────────────
// Create a user. mustChangePassword is always true (BR-48); privileged fields
// in the body are ignored (BR-68). Order: 400 field errors → 409 EMAIL_TAKEN.

router.post(
  "/users",
  requireRole("ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: Record<string, string> = {};

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
      errors.name = "Name is required and must be 1–100 characters.";
    }

    const email = typeof body.email === "string" ? normalizeEmail(body.email) : null;
    if (!email) {
      errors.email = "A valid email address is required.";
    }

    const role =
      typeof body.role === "string" && ROLES.includes(body.role as Role)
        ? (body.role as Role)
        : null;
    if (!role) {
      errors.role = "A valid role is required.";
    }

    const initialPassword =
      typeof body.initialPassword === "string" ? body.initialPassword : "";
    const pw = validatePassword(initialPassword);
    if (!pw.valid) {
      errors.initialPassword = pw.reason ?? "Invalid password.";
    }

    // isActive is optional on create and defaults to true (ambiguity #3).
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (Object.keys(errors).length > 0) {
      return void validationFailed(res, errors);
    }

    // Duplicate email (case-insensitive) — 409 after validation (BR-24, BR-49).
    const existing = await prisma.user.findUnique({ where: { email: email! } });
    if (existing) {
      return void res.status(409).json({
        error: "That email address is already in use.",
        code: "EMAIL_TAKEN",
        errors: { email: "That email address is already in use." },
      });
    }

    const passwordHash = await hashPassword(initialPassword);
    const created = await prisma.user.create({
      data: {
        name,
        email: email!,
        role: role!,
        isActive,
        passwordHash,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });

    res.status(201).json(userView(created));
  }
);

// ── PATCH /api/admin/users/:id ───────────────────────────────────────────────
// Edit any of name/email/role/isActive. Only these fields are read (BR-68).
// Order: 404 → 400 validation → 409 (EMAIL_TAKEN → SELF_DEACTIVATION → LAST_ADMIN).
// Deactivation revokes the target's sessions (BR-13); role change alone does not.

router.patch(
  "/users/:id",
  requireRole("ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) return void notFound(res);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: Record<string, string> = {};

    const data: Prisma.UserUpdateInput = {};

    const nameProvided = Object.prototype.hasOwnProperty.call(body, "name");
    if (nameProvided) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 100) {
        errors.name = "Name must be 1–100 characters.";
      } else {
        data.name = name;
      }
    }

    const emailProvided = Object.prototype.hasOwnProperty.call(body, "email");
    let normalizedEmail: string | null = null;
    if (emailProvided) {
      normalizedEmail = typeof body.email === "string" ? normalizeEmail(body.email) : null;
      if (!normalizedEmail) {
        errors.email = "A valid email address is required.";
      } else {
        data.email = normalizedEmail;
      }
    }

    const roleProvided = Object.prototype.hasOwnProperty.call(body, "role");
    let nextRole: Role = user.role;
    if (roleProvided) {
      if (typeof body.role === "string" && ROLES.includes(body.role as Role)) {
        nextRole = body.role as Role;
        data.role = nextRole;
      } else {
        errors.role = "A valid role is required.";
      }
    }

    const isActiveProvided = Object.prototype.hasOwnProperty.call(body, "isActive");
    let nextActive: boolean = user.isActive;
    if (isActiveProvided) {
      if (typeof body.isActive === "boolean") {
        nextActive = body.isActive;
        data.isActive = nextActive;
      } else {
        errors.isActive = "Active state must be true or false.";
      }
    }

    if (Object.keys(errors).length > 0) {
      return void validationFailed(res, errors);
    }

    // 409 EMAIL_TAKEN — another user already holds this email (BR-49).
    if (emailProvided && normalizedEmail) {
      const other = await prisma.user.findFirst({
        where: { email: normalizedEmail, NOT: { id } },
        select: { id: true },
      });
      if (other) {
        return void res.status(409).json({
          error: "That email address is already in use.",
          code: "EMAIL_TAKEN",
          errors: { email: "That email address is already in use." },
        });
      }
    }

    // 409 SELF_DEACTIVATION — an Administrator cannot deactivate their own
    // account (BR-51), checked before LAST_ADMIN (confirmed default #1).
    if (isActiveProvided && nextActive === false && id === req.user!.id) {
      return void res.status(409).json({
        error: "You cannot deactivate your own account.",
        code: "SELF_DEACTIVATION",
      });
    }

    // Does this change strip the last active Administrator of active-admin
    // status? Only then do we need the serialized last-admin guard (BR-52, BR-67).
    const wasActiveAdmin = user.role === "ADMIN" && user.isActive;
    const willBeActiveAdmin = nextRole === "ADMIN" && nextActive === true;
    const losesActiveAdmin = wasActiveAdmin && !willBeActiveAdmin;

    const deactivating = isActiveProvided && nextActive === false;

    if (losesActiveAdmin) {
      // Short, DB-only transaction: take a single transaction-scoped advisory
      // lock, then count-then-write. Every admin-safety write takes the SAME
      // lock, so reading the active-admin count and the write that changes it
      // are serialized against each other (BR-67) — no write skew, and no
      // deadlock because there is exactly one lock acquired first.
      //
      // The lock function returns void, so it uses $executeRaw ($queryRaw cannot
      // deserialize a void column). The key is cast to bigint to pin the
      // pg_advisory_xact_lock(bigint) overload. Only DB calls run inside;
      // explicit timeout.
      let result: { lastAdmin: true } | { user: UserRow };
      try {
        result = await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`;
            const activeAdmins = await tx.user.count({
              where: { role: "ADMIN", isActive: true },
            });
            // The target is an active admin, so it is counted. If it is the only
            // one, the change would leave zero active Administrators.
            if (activeAdmins <= 1) {
              return { lastAdmin: true as const };
            }
            const updated = await tx.user.update({
              where: { id },
              data,
              select: USER_SELECT,
            });
            if (deactivating) {
              await tx.session.deleteMany({ where: { userId: id } });
            }
            return { user: updated };
          },
          { timeout: 5000 }
        );
      } catch (err) {
        // Never leave the socket hanging: map any unexpected DB/transaction
        // failure to a safe JSON 500 (BR-64). Express's global handler would
        // also do this for ordinary rejections; this guards the raw-SQL path.
        console.error("PATCH /admin/users/:id last-admin transaction failed:", err);
        return void res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
      }

      if ("lastAdmin" in result) {
        return void res.status(409).json({
          error: "There must always be at least one active Administrator.",
          code: "LAST_ADMIN",
        });
      }
      return void res.status(200).json(userView(result.user));
    }

    // No admin-safety implication — a plain update is enough.
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
    if (deactivating) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    res.status(200).json(userView(updated));
  }
);

// ── POST /api/admin/users/:id/initial-password ───────────────────────────────
// Set an initial password for ANOTHER user (BR-54): sets mustChangePassword and
// deletes the target's sessions. Own account → 409 SELF_PASSWORD_RESET.
// Order: 404 → 400 (policy; no differs/confirm rules) → 409 self.

router.post(
  "/users/:id/initial-password",
  requireRole("ADMIN") as RequestHandler,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return void notFound(res);

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return void notFound(res);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const initialPassword =
      typeof body.initialPassword === "string" ? body.initialPassword : "";
    const pw = validatePassword(initialPassword);
    if (!pw.valid) {
      return void validationFailed(res, {
        initialPassword: pw.reason ?? "Invalid password.",
      });
    }

    if (id === req.user!.id) {
      return void res.status(409).json({
        error: "Use Change Password to update your own password.",
        code: "SELF_PASSWORD_RESET",
      });
    }

    const passwordHash = await hashPassword(initialPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);

    res.status(204).end();
  }
);

export default router;
