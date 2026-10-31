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

// Field bounds (spec BR-05, BR-06, BR-08). Kept here so the route and any future
// caller share one source of truth.
export const MAX_DESCRIPTION = 2000;
export const MAX_RESULT = 2000;
export const MAX_ATTACHMENT_NOTES = 500;

export type FieldErrors = Record<string, string>;

/** Normalised, validated Action fields ready to persist (only keys that were present). */
export interface ActionFieldValues {
  actionDate?: Date;
  description?: string;
  result?: string | null;
  attachmentNotes?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
}

/**
 * Validate and normalise the allow-listed Action fields for a create or edit
 * (BR-05/06/07/08). `performedBy`/`updatedBy`/`status` are handled by the route,
 * never taken from the body. On `patch`, only present keys are validated and the
 * follow-up pair is merged over `current` so a lone `followUpNote` is checked
 * against the stored `followUpRequired`.
 */
export function validateActionFields(
  body: Record<string, unknown>,
  opts: { mode: "create" | "patch"; current?: { followUpRequired: boolean; followUpNote: string | null } }
): { ok: true; values: ActionFieldValues } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const values: ActionFieldValues = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // description — required on create, bounded 1–2000 whenever present.
  if (opts.mode === "create" || has("description")) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (d.length === 0) errors.description = "Description is required.";
    else if (d.length > MAX_DESCRIPTION) errors.description = `Description must be ${MAX_DESCRIPTION} characters or fewer.`;
    else values.description = d;
  }

  // actionDate — optional; must be a valid, non-future instant (BR-05).
  if (has("actionDate") && body.actionDate !== null && body.actionDate !== "") {
    const dt = new Date(String(body.actionDate));
    if (Number.isNaN(dt.getTime())) errors.actionDate = "actionDate must be a valid date/time.";
    else if (dt.getTime() > Date.now()) errors.actionDate = "actionDate cannot be in the future.";
    else values.actionDate = dt;
  }

  // result — optional free text (≤2000); empty collapses to null.
  if (has("result")) {
    const r = body.result === null ? "" : typeof body.result === "string" ? body.result.trim() : "";
    if (r.length > MAX_RESULT) errors.result = `Result must be ${MAX_RESULT} characters or fewer.`;
    else values.result = r.length === 0 ? null : r;
  }

  // attachmentNotes — optional free text (≤500); empty collapses to null (BR-08).
  if (has("attachmentNotes")) {
    const n = body.attachmentNotes === null ? "" : typeof body.attachmentNotes === "string" ? body.attachmentNotes.trim() : "";
    if (n.length > MAX_ATTACHMENT_NOTES) errors.attachmentNotes = `Attachment notes must be ${MAX_ATTACHMENT_NOTES} characters or fewer.`;
    else values.attachmentNotes = n.length === 0 ? null : n;
  }

  // follow-up pair (BR-07) — required iff followUpRequired, merged over current on patch.
  if (opts.mode === "create" || has("followUpRequired") || has("followUpNote")) {
    const effRequired = has("followUpRequired")
      ? body.followUpRequired === true
      : opts.mode === "create"
        ? false
        : (opts.current?.followUpRequired ?? false);
    const rawNote = has("followUpNote")
      ? body.followUpNote
      : opts.mode === "create"
        ? undefined
        : opts.current?.followUpNote;
    const note = rawNote == null ? "" : String(rawNote);
    const fu = validateFollowUp(effRequired, note);
    if (!fu.valid) errors.followUpNote = fu.error;
    else {
      values.followUpRequired = effRequired;
      values.followUpNote = effRequired ? note.trim() : null;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

// A {id,name} user reference, or null, as embedded in the Action view.
type UserRef = { id: number; name: string } | null;

/** The Action object returned by every Action endpoint — identical for staff and
 *  Requester reads, so no Internal Note or other data can leak (spec §1, BR-28). */
export function actionView(a: {
  id: number;
  ticketId: number;
  actionDate: Date;
  description: string;
  result: string | null;
  status: ActionStatus;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  performedBy: { id: number; name: string };
  assignee: UserRef;
  updatedBy: UserRef;
  createdAt: Date;
  updatedAt: Date;
}) {
  const ref = (u: UserRef) => (u ? { id: u.id, name: u.name } : null);
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionDate: a.actionDate,
    description: a.description,
    result: a.result,
    status: a.status,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    performedBy: { id: a.performedBy.id, name: a.performedBy.name },
    assignee: ref(a.assignee),
    updatedBy: ref(a.updatedBy),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
