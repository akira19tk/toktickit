import crypto from "crypto";
import bcryptjs from "bcryptjs";

// ---------------------------------------------------------------------------
// Password policy (BR-09)
// ---------------------------------------------------------------------------

const MIN_CHARS = 8;
const MAX_BYTES = 72;

const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\d/;

export function validatePassword(password: string): {
  valid: boolean;
  reason?: string;
} {
  if (password.length < MIN_CHARS) {
    return { valid: false, reason: `too short (minimum ${MIN_CHARS} characters)` };
  }

  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength > MAX_BYTES) {
    return {
      valid: false,
      reason: `too long: ${byteLength} bytes exceeds ${MAX_BYTES}-byte limit`,
    };
  }

  if (!LETTER_RE.test(password)) {
    return { valid: false, reason: "must contain at least one letter" };
  }

  if (!DIGIT_RE.test(password)) {
    return { valid: false, reason: "must contain at least one digit" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Email normalizer (BR-06)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_BYTES = 254;

export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) return null;
  if (trimmed.length > MAX_EMAIL_BYTES) return null;

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1) return null; // missing or empty local part

  const domain = trimmed.slice(atIndex + 1);
  if (!domain) return null;

  if (!EMAIL_RE.test(trimmed)) return null;

  return trimmed;
}

// ---------------------------------------------------------------------------
// Session token — 256 bits of randomness, stored only as its SHA-256 hash
// (BR-11)
// ---------------------------------------------------------------------------

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// Login throttle (BR-08) — injectable clock for unit testing
// ---------------------------------------------------------------------------

export type Clock = () => number;

export interface Throttle {
  increment(key: string): void;
  isLocked(key: string): boolean;
  reset(key: string): void;
}

interface ThrottleEntry {
  count: number;
  lockedUntil: number;
}

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export function createThrottle(clock: Clock = () => Date.now()): Throttle {
  const map = new Map<string, ThrottleEntry>();

  return {
    increment(key: string) {
      const entry = map.get(key) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      // Only set the lock when not currently active (BR-08: "15 minutes counted
      // from that failure" — attempts during the lockout must not extend it).
      const alreadyLocked = clock() < entry.lockedUntil;
      if (entry.count >= LOCK_THRESHOLD && !alreadyLocked) {
        entry.lockedUntil = clock() + LOCK_DURATION_MS;
      }
      map.set(key, entry);
    },

    isLocked(key: string): boolean {
      const entry = map.get(key);
      if (!entry || entry.count < LOCK_THRESHOLD) return false;
      return clock() < entry.lockedUntil;
    },

    reset(key: string) {
      map.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Password hash / verify (BR-10) — bcrypt cost from env or default 10
// ---------------------------------------------------------------------------

function bcryptCost(): number {
  const raw = process.env.BCRYPT_COST;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 4 ? parsed : 10;
}

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, bcryptCost());
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}
