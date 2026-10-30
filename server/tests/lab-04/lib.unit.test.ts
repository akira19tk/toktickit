// Lab 4 unit tests for pure Action helpers.
// Issue #49 implements UNIT-L4-02 (Action lifecycle validator) and
// UNIT-L4-03 (follow-up note rule). UNIT-L4-01 (ticket matrix) and
// UNIT-L4-04 (Asia/Bangkok boundary) are added by later issues.

import { describe, it, expect } from "vitest";
import type { ActionStatus } from "@prisma/client";
import {
  ACTION_TRANSITIONS,
  allowedActionTransitions,
  canTransitionAction,
  validateActionTransition,
  validateFollowUp,
} from "../../src/lib/actions";

const ALL_ACTION_STATUSES: ActionStatus[] = ["OPEN", "COMPLETED", "CANCELLED"];

// Independent copy of the spec lifecycle (BR-09). The test fails if the source
// drifts from the contract, so it is NOT imported from the source.
const EXPECTED_ACTION_MATRIX: Record<ActionStatus, ActionStatus[]> = {
  OPEN: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// UNIT-L4-02 — Action lifecycle validator (AC-04, AC-05)
// OPEN→COMPLETED / OPEN→CANCELLED only; completing needs a result (BR-06, BR-09)
// ---------------------------------------------------------------------------
describe("UNIT-L4-02: Action lifecycle validator", () => {
  it("UNIT-L4-02: allowedActionTransitions matches the BR-09 matrix for every status", () => {
    for (const from of ALL_ACTION_STATUSES) {
      expect(new Set(allowedActionTransitions(from))).toEqual(
        new Set(EXPECTED_ACTION_MATRIX[from])
      );
      expect(allowedActionTransitions(from)).toHaveLength(
        EXPECTED_ACTION_MATRIX[from].length
      );
    }
  });

  it("UNIT-L4-02: OPEN may transition to COMPLETED and CANCELLED", () => {
    expect(canTransitionAction("OPEN", "COMPLETED")).toBe(true);
    expect(canTransitionAction("OPEN", "CANCELLED")).toBe(true);
  });

  it("UNIT-L4-02: OPEN→OPEN is not a transition (no-op)", () => {
    expect(canTransitionAction("OPEN", "OPEN")).toBe(false);
  });

  it("UNIT-L4-02: COMPLETED and CANCELLED are terminal — no exits", () => {
    expect(allowedActionTransitions("COMPLETED")).toEqual([]);
    expect(allowedActionTransitions("CANCELLED")).toEqual([]);
    for (const to of ALL_ACTION_STATUSES) {
      expect(canTransitionAction("COMPLETED", to)).toBe(false);
      expect(canTransitionAction("CANCELLED", to)).toBe(false);
    }
  });

  it("UNIT-L4-02: every pair not in the matrix is rejected", () => {
    for (const from of ALL_ACTION_STATUSES) {
      const allowed = new Set(EXPECTED_ACTION_MATRIX[from]);
      for (const to of ALL_ACTION_STATUSES) {
        expect(canTransitionAction(from, to)).toBe(allowed.has(to));
      }
    }
  });

  it("UNIT-L4-02: allowedActionTransitions returns a fresh array (no matrix mutation)", () => {
    const first = allowedActionTransitions("OPEN");
    first.push("OPEN");
    expect(allowedActionTransitions("OPEN")).not.toContain("OPEN");
    expect(ACTION_TRANSITIONS.OPEN).not.toContain("OPEN");
  });

  it("UNIT-L4-02: completing with a non-empty result is OK", () => {
    expect(
      validateActionTransition("OPEN", "COMPLETED", { result: "Replaced RAM; tests pass." })
    ).toEqual({ ok: true });
  });

  it("UNIT-L4-02: completing with a missing/empty/whitespace result → RESULT_REQUIRED", () => {
    expect(validateActionTransition("OPEN", "COMPLETED", { result: undefined })).toEqual({
      ok: false,
      code: "RESULT_REQUIRED",
    });
    expect(validateActionTransition("OPEN", "COMPLETED", { result: "" })).toEqual({
      ok: false,
      code: "RESULT_REQUIRED",
    });
    expect(validateActionTransition("OPEN", "COMPLETED", { result: "   " })).toEqual({
      ok: false,
      code: "RESULT_REQUIRED",
    });
  });

  it("UNIT-L4-02: cancelling does not require a result", () => {
    expect(validateActionTransition("OPEN", "CANCELLED", { result: undefined })).toEqual({
      ok: true,
    });
  });

  it("UNIT-L4-02: an illegal transition → INVALID_ACTION_STATE (checked before result)", () => {
    expect(validateActionTransition("COMPLETED", "CANCELLED", { result: undefined })).toEqual({
      ok: false,
      code: "INVALID_ACTION_STATE",
    });
    expect(validateActionTransition("CANCELLED", "COMPLETED", { result: "done" })).toEqual({
      ok: false,
      code: "INVALID_ACTION_STATE",
    });
    expect(validateActionTransition("OPEN", "OPEN", { result: "x" })).toEqual({
      ok: false,
      code: "INVALID_ACTION_STATE",
    });
  });
});

// ---------------------------------------------------------------------------
// UNIT-L4-03 — Follow-up note rule (AC-07): required iff followUpRequired,
// 1–1000 chars trimmed when required; empty/omitted when not (BR-07)
// ---------------------------------------------------------------------------
describe("UNIT-L4-03: follow-up note rule", () => {
  it("UNIT-L4-03: required=true with a valid note is accepted", () => {
    expect(validateFollowUp(true, "Confirm with user after 24h of uptime.")).toEqual({
      valid: true,
    });
  });

  it("UNIT-L4-03: required=true with a missing note is rejected", () => {
    expect(validateFollowUp(true, undefined).valid).toBe(false);
    expect(validateFollowUp(true, null).valid).toBe(false);
  });

  it("UNIT-L4-03: required=true with an empty/whitespace note is rejected", () => {
    expect(validateFollowUp(true, "").valid).toBe(false);
    expect(validateFollowUp(true, "    ").valid).toBe(false);
  });

  it("UNIT-L4-03: required=true with a note longer than 1000 chars is rejected", () => {
    expect(validateFollowUp(true, "a".repeat(1001)).valid).toBe(false);
  });

  it("UNIT-L4-03: required=true with a note of exactly 1000 chars is accepted (at the limit)", () => {
    expect(validateFollowUp(true, "a".repeat(1000)).valid).toBe(true);
  });

  it("UNIT-L4-03: length is measured after trimming", () => {
    expect(validateFollowUp(true, "  " + "a".repeat(1000) + "  ").valid).toBe(true);
    expect(validateFollowUp(true, " a ").valid).toBe(true);
  });

  it("UNIT-L4-03: required=false with no note is accepted", () => {
    expect(validateFollowUp(false, undefined)).toEqual({ valid: true });
    expect(validateFollowUp(false, null)).toEqual({ valid: true });
  });

  it("UNIT-L4-03: required=false with an empty/whitespace note is accepted (treated as absent)", () => {
    expect(validateFollowUp(false, "").valid).toBe(true);
    expect(validateFollowUp(false, "   ").valid).toBe(true);
  });

  it("UNIT-L4-03: required=false with a non-empty note is rejected", () => {
    expect(validateFollowUp(false, "stray note").valid).toBe(false);
  });
});
