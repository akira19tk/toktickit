// Authentication and authorization middleware for Lab 3
// Check order per BR-24: auth (401) → pw-gate (403) → CSRF (403) → role (403)

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prismaClient";
import { hashSessionToken } from "../lib/auth";

// ---------------------------------------------------------------------------
// Request type augmentation — attach the session user to req
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
        mustChangePassword: boolean;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Cookie parser — extract a single named cookie from the Cookie header
// ---------------------------------------------------------------------------

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// requireAuth — BR-11, BR-13, BR-20
// Reads role and isActive from the database on every request.
// Lazily deletes expired session rows (BR-11).
// ---------------------------------------------------------------------------

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = parseCookie(req.headers.cookie, "tt_session");

  if (!token) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    return;
  }

  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    return;
  }

  // Lazy expiry cleanup (BR-11)
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { tokenHash } }).catch(() => {});
    res.status(401).json({ error: "Session expired", code: "UNAUTHENTICATED" });
    return;
  }

  // isActive is read fresh from the DB on every request (BR-13)
  if (!session.user.isActive) {
    // Sessions should have been deleted on deactivation, but defend anyway
    await prisma.session.deleteMany({ where: { userId: session.userId } }).catch(() => {});
    res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    return;
  }

  req.user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    isActive: session.user.isActive,
    mustChangePassword: session.user.mustChangePassword,
  };

  next();
}

// ---------------------------------------------------------------------------
// passwordChangeGate — BR-18
// 403 PASSWORD_CHANGE_REQUIRED on any route except:
//   GET  /api/auth/me
//   POST /api/auth/logout
//   POST /api/auth/change-password
// Those three routes bypass the gate at the router level, so this middleware
// is applied only to the remaining protected routes.
// ---------------------------------------------------------------------------

export function passwordChangeGate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.mustChangePassword) {
    next();
    return;
  }
  res.status(403).json({
    error: "You must change your password before continuing.",
    code: "PASSWORD_CHANGE_REQUIRED",
  });
}

// ---------------------------------------------------------------------------
// csrfCheck — BR-14
// Applies to POST, PATCH, PUT, DELETE requests.
// GET / HEAD / OPTIONS pass through.
// ---------------------------------------------------------------------------

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function csrfCheck(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  if (req.headers["x-requested-with"] === "TokTickIT") {
    next();
    return;
  }
  res.status(403).json({
    error: "CSRF check failed. Send X-Requested-With: TokTickIT",
    code: "CSRF_REJECTED",
  });
}

// ---------------------------------------------------------------------------
// requireRole — BR-21..BR-23
// Call after requireAuth.
// ---------------------------------------------------------------------------

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
