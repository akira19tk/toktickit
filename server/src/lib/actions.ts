// Pure validators for Actions Taken (Lab 4, spec §5 / §7).
// Kept free of Prisma/DB access so they are unit-testable (UNIT-L4-02/03) and
// reusable by the Action routes delivered in later issues.

import type { ActionStatus } from "@prisma/client";

// BR-09: the only legal Action lifecycle moves are OPEN→COMPLETED and
// OPEN→CANCELLED; COMPLETED and CANCELLED are terminal.
export const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  OPEN: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Allowed target statuses from `from`, as a fresh array (never the stored one). */
export function allowedActionTransitions(from: ActionStatus): ActionStatus[] {
  return [...ACTION_TRANSITIONS[from]];
}

/** True iff `from → to` is a legal Action lifecycle transition (BR-09). */
export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export type ActionTransitionResult =
  | { ok: true }
  | { ok: false; code: "INVALID_ACTION_STATE" | "RESULT_REQUIRED" };

/**
 * Validate a requested lifecycle transition (BR-06, BR-09).
 * - Illegal transition → INVALID_ACTION_STATE (409), checked first.
 * - Completing with an empty/whitespace `result` → RESULT_REQUIRED (400).
 * `result` upper-bound (≤2000) is a field-shape check handled with the other
 * field validators; here we only enforce the completion-requires-result rule.
 */
export function validateActionTransition(
  from: ActionStatus,
  to: ActionStatus,
  ctx: { result?: string | null }
): ActionTransitionResult {
  if (!canTransitionAction(from, to)) {
    return { ok: false, code: "INVALID_ACTION_STATE" };
  }
  if (to === "COMPLETED" && (ctx.result ?? "").trim().length === 0) {
    return { ok: false, code: "RESULT_REQUIRED" };
  }
  return { ok: true };
}

export type FollowUpResult = { valid: true } | { valid: false; error: string };

/**
 * BR-07: `followUpNote` is required iff `followUpRequired`.
 * - required=true  → note present, 1–1000 chars after trimming.
 * - required=false → note empty/omitted (a stray note is rejected).
 */
export function validateFollowUp(
  followUpRequired: boolean,
  followUpNote: string | null | undefined
): FollowUpResult {
  const trimmed = (followUpNote ?? "").trim();

  if (followUpRequired) {
    if (trimmed.length === 0) {
      return { valid: false, error: "followUpNote is required when followUpRequired is true" };
    }
    if (trimmed.length > 1000) {
      return { valid: false, error: "followUpNote must be 1000 characters or fewer" };
    }
    return { valid: true };
  }

  // followUpRequired = false: a note must not be present.
  if (trimmed.length > 0) {
    return { valid: false, error: "followUpNote must be empty when followUpRequired is false" };
  }
  return { valid: true };
}
