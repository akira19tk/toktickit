// Auth routes: login, logout, me, change-password
// POST /api/auth/login     — public; CSRF required
// POST /api/auth/logout    — public; CSRF required; idempotent
// GET  /api/auth/me        — requireAuth; no gate; no CSRF (GET)
// POST /api/auth/change-password — requireAuth; CSRF required; no gate

import { Router, type Request, type Response } from "express";
import { prisma } from "../prismaClient";
import {
  normalizeEmail,
  validatePassword,
  generateSessionToken,
  hashSessionToken,
  hashPassword,
  verifyPassword,
  createThrottle,
} from "../lib/auth";
import { requireAuth, csrfCheck } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// Session TTL
// ---------------------------------------------------------------------------

function sessionTtlHours(): number {
  const raw = process.env.SESSION_TTL_HOURS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// ---------------------------------------------------------------------------
// Throttles — module-level singletons (in-memory, resets on server restart)
// Login keyed by normalized email; change-password keyed by user id.
// ---------------------------------------------------------------------------

let loginThrottle = createThrottle();
let changePasswordThrottle = createThrottle();

/**
 * Replace both throttle instances with freshly constructed ones.
 * Only available in NODE_ENV=test so the test suite can:
 *   1. Call vi.useFakeTimers({ toFake: ["Date"] }) first — this replaces Date.now.
 *   2. Call resetThrottles() — createThrottle() then captures the fake Date.now
 *      as its default clock, making the lock window controllable with vi.setSystemTime.
 *   3. Call vi.useRealTimers() + resetThrottles() in afterEach to restore real time.
 */
export function resetThrottles(): void {
  if (process.env.NODE_ENV !== "test") return;
  loginThrottle = createThrottle();
  changePasswordThrottle = createThrottle();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publicUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function setCookieAndRespond(
  res: Response,
  token: string,
  expiresAt: Date,
  body: object
) {
  res.cookie("tt_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction(),
    expires: expiresAt,
  });
  res.status(200).json(body);
}

function clearSessionCookie(res: Response) {
  res.cookie("tt_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction(),
    expires: new Date(0),
  });
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

router.post("/login", csrfCheck, async (req: Request, res: Response) => {
  const { email: rawEmail, password } = req.body as Record<string, unknown>;

  // Basic field presence check
  if (
    typeof rawEmail !== "string" ||
    !rawEmail.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    const errors: Record<string, string> = {};
    if (!rawEmail || typeof rawEmail !== "string" || !String(rawEmail).trim()) {
      errors.email = "Email is required";
    }
    if (!password || typeof password !== "string") {
      errors.password = "Password is required";
    }
    res.status(400).json({ error: "Invalid input", code: "VALIDATION_FAILED", errors });
    return;
  }

  const email = normalizeEmail(rawEmail);
  if (!email) {
    res.status(400).json({
      error: "Invalid input",
      code: "VALIDATION_FAILED",
      errors: { email: "Invalid email format" },
    });
    return;
  }

  // Throttle check (BR-08)
  if (loginThrottle.isLocked(email)) {
    res.status(429).json({
      error: "Too many failed login attempts. Try again in 15 minutes.",
      code: "TOO_MANY_ATTEMPTS",
    });
    return;
  }

  // Look up user
  const user = await prisma.user.findUnique({ where: { email } });

  // Generic 401 for unknown email, no hash, or wrong password (BR-07)
  if (!user || !user.passwordHash) {
    loginThrottle.increment(email);
    res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
    return;
  }

  const passwordMatch = await verifyPassword(password, user.passwordHash);
  if (!passwordMatch) {
    loginThrottle.increment(email);
    res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
    return;
  }

  // Correct password — check active status (BR-07)
  if (!user.isActive) {
    // Do NOT increment the throttle — the credential was correct
    res.status(403).json({
      error: "This account is inactive. Contact an administrator.",
      code: "ACCOUNT_INACTIVE",
    });
    return;
  }

  // Success — reset throttle, create session (BR-11)
  loginThrottle.reset(email);

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionTtlHours() * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash, userId: user.id, expiresAt },
  });

  setCookieAndRespond(res, token, expiresAt, { user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// POST /auth/logout — idempotent (BR-12)
// ---------------------------------------------------------------------------

router.post("/logout", csrfCheck, async (req: Request, res: Response) => {
  const token = (() => {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k.trim() === "tt_session") return decodeURIComponent(v.join("="));
    }
    return undefined;
  })();

  if (token) {
    const tokenHash = hashSessionToken(token);
    await prisma.session.delete({ where: { tokenHash } }).catch(() => {});
  }

  clearSessionCookie(res);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /auth/me — exempt from password-change gate (BR-18)
// ---------------------------------------------------------------------------

router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.status(200).json({ user: publicUser(req.user!) });
});

// ---------------------------------------------------------------------------
// POST /auth/change-password — exempt from password-change gate (BR-16, BR-17)
// ---------------------------------------------------------------------------

router.post(
  "/change-password",
  requireAuth,
  csrfCheck,
  async (req: Request, res: Response) => {
    const user = req.user!;
    const throttleKey = String(user.id);

    // Throttle check (BR-08, API-70)
    if (changePasswordThrottle.isLocked(throttleKey)) {
      res.status(429).json({
        error: "Too many failed attempts. Try again in 15 minutes.",
        code: "TOO_MANY_ATTEMPTS",
      });
      return;
    }

    const { currentPassword, newPassword, confirmPassword } =
      req.body as Record<string, unknown>;

    // Field presence
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      const errors: Record<string, string> = {};
      if (typeof currentPassword !== "string") errors.currentPassword = "Current password is required";
      if (typeof newPassword !== "string") errors.newPassword = "New password is required";
      if (typeof confirmPassword !== "string") errors.confirmPassword = "Confirmation is required";
      res.status(400).json({ error: "Invalid input", code: "VALIDATION_FAILED", errors });
      return;
    }

    // Verify current password — fetch fresh hash from DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.passwordHash) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_FAILED",
        errors: { currentPassword: "Current password is incorrect" },
      });
      return;
    }

    const currentMatch = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!currentMatch) {
      changePasswordThrottle.increment(throttleKey);
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_FAILED",
        errors: { currentPassword: "Current password is incorrect" },
      });
      return;
    }

    // Validate new password policy (BR-09)
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_FAILED",
        errors: { newPassword: validation.reason ?? "Invalid password" },
      });
      return;
    }

    // New password must differ from current (BR-09)
    const sameAsCurrent = await verifyPassword(newPassword, dbUser.passwordHash);
    if (sameAsCurrent) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_FAILED",
        errors: { newPassword: "New password must differ from the current password" },
      });
      return;
    }

    // Confirmation must match (BR-09)
    if (newPassword !== confirmPassword) {
      res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_FAILED",
        errors: { confirmPassword: "Passwords do not match" },
      });
      return;
    }

    // Determine current session token hash to keep
    const currentToken = (() => {
      const raw = req.headers.cookie;
      if (!raw) return undefined;
      for (const part of raw.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k.trim() === "tt_session") return decodeURIComponent(v.join("="));
      }
      return undefined;
    })();
    const currentTokenHash = currentToken ? hashSessionToken(currentToken) : undefined;

    // Persist changes — update password, clear flag, delete other sessions (BR-17)
    const newHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });

      // Delete all sessions except the current one
      await tx.session.deleteMany({
        where: {
          userId: user.id,
          ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
        },
      });
    });

    // Reset change-password throttle on success
    changePasswordThrottle.reset(throttleKey);

    // Return updated user
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    res.status(200).json({ user: publicUser(updatedUser!) });
  }
);

export default router;
