// Lab 4 unit tests for pure Action helpers.
// Issue #49 implements UNIT-L4-02 (Action lifecycle validator) and
// UNIT-L4-03 (follow-up note rule); UNIT-L4-01 covers the ticket matrix.
// Hardening #57 completes UNIT-L4-04 (Asia/Bangkok boundaries).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { ActionStatus, TicketStatus } from "@prisma/client";
import { bangkokRecentCutoff } from "../../src/lib/timezone";

describe("UNIT-L4-04: Bangkok seven-calendar-day boundary", () => {
  it.each([
    ["2026-10-31T16:59:59.999Z", "2026-10-24T17:00:00.000Z"],
    ["2026-10-31T17:00:00.000Z", "2026-10-25T17:00:00.000Z"],
    ["2026-01-01T00:00:00.000Z", "2025-12-25T17:00:00.000Z"],
    ["2024-03-01T00:00:00.000Z", "2024-02-23T17:00:00.000Z"],
  ])("%s has inclusive cutoff %s", (now, cutoff) => {
    expect(bangkokRecentCutoff(new Date(now)).toISOString()).toBe(cutoff);
  });
});
import {
  ACTION_TRANSITIONS,
  allowedActionTransitions,
  canTransitionAction,
  validateActionTransition,
  validateFollowUp,
} from "../../src/lib/actions";
import {
  STATUS_TRANSITIONS,
  allowedTransitions,
  canTransition,
} from "../../src/lib/ticketStatus";

const ALL_ACTION_STATUSES: ActionStatus[] = ["OPEN", "COMPLETED", "CANCELLED"];

// Independent copy of the spec lifecycle (BR-09). The test fails if the source
// drifts from the contract, so it is NOT imported from the source.
const EXPECTED_ACTION_MATRIX: Record<ActionStatus, ActionStatus[]> = {
  OPEN: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// UNIT-L4-01 — Ticket transition matrix incl. CANCELLED terminal (AC-11)
// Preserves the Lab 3 matrix (NEW → OPEN, IN_PROGRESS, CANCELLED). The BR-14
// doc table dropping NEW → IN_PROGRESS is a transcription error (the matrix is
// carried over from Lab 3), corrected in this PR's docs commit.
// ---------------------------------------------------------------------------
const ALL_TICKET_STATUSES: TicketStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER",
  "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];

// Independent copy of the matrix; the test fails if the source drifts, so it is
// NOT imported from the source.
const EXPECTED_TICKET_MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["OPEN", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};

describe("UNIT-L4-01: ticket transition matrix", () => {
  it("UNIT-L4-01: allowedTransitions matches the matrix for every status", () => {
    for (const from of ALL_TICKET_STATUSES) {
      expect(new Set(allowedTransitions(from))).toEqual(
        new Set(EXPECTED_TICKET_MATRIX[from])
      );
      expect(allowedTransitions(from)).toHaveLength(
        EXPECTED_TICKET_MATRIX[from].length
      );
    }
  });

  it("UNIT-L4-01: CANCELLED is terminal — no exits", () => {
    expect(allowedTransitions("CANCELLED")).toEqual([]);
    for (const to of ALL_TICKET_STATUSES) {
      expect(canTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("UNIT-L4-01: CLOSED may only reopen", () => {
    expect(allowedTransitions("CLOSED")).toEqual(["REOPENED"]);
  });

  it("UNIT-L4-01: every pair not in the matrix is rejected", () => {
    for (const from of ALL_TICKET_STATUSES) {
      const allowed = new Set(EXPECTED_TICKET_MATRIX[from]);
      for (const to of ALL_TICKET_STATUSES) {
        expect(canTransition(from, to)).toBe(allowed.has(to));
      }
    }
  });

  it("UNIT-L4-01: allowedTransitions returns a fresh array (no matrix mutation)", () => {
    const first = allowedTransitions("OPEN");
    first.push("NEW");
    expect(allowedTransitions("OPEN")).not.toContain("NEW");
    expect(STATUS_TRANSITIONS.OPEN).not.toContain("NEW");
  });
});

// ---------------------------------------------------------------------------
// UNIT-L4-01 (spec reconciliation) — the code matrix must equal the spec BR-14
// table, edge by edge. Rather than trusting a hand-copied expectation, this
// parses the actual BR-14 markdown table from docs/lab-04/specification.md and
// compares every (from → to) pair against canTransition(). It fails if the code
// and the spec ever disagree on a single edge — catching both silent code drift
// and an un-reconciled spec edit.
// ---------------------------------------------------------------------------

// Parse the BR-14 transition table out of the specification markdown. Returns a
// map from each source status to its allowed-target set.
function parseBr14Matrix(): Record<TicketStatus, Set<TicketStatus>> {
  const specPath = join(
    __dirname,
    "../../../docs/lab-04/specification.md"
  );
  const lines = readFileSync(specPath, "utf8").split("\n");

  const br14Idx = lines.findIndex((l) => l.includes("**BR-14**"));
  expect(br14Idx, "BR-14 must be present in the specification").toBeGreaterThanOrEqual(0);

  const headerIdx = lines.findIndex(
    (l, i) => i > br14Idx && /\|\s*From\s*\|\s*Allowed targets\s*\|/.test(l)
  );
  expect(headerIdx, "BR-14 table header must follow the BR-14 clause").toBeGreaterThan(br14Idx);

  const matrix = {} as Record<TicketStatus, Set<TicketStatus>>;
  // Data rows start two lines after the header (skip the |---|---| separator).
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    const row = lines[i].trim();
    if (!row.startsWith("|")) break; // table ended
    const cells = row.split("|").map((c) => c.trim());
    // cells[0] is the empty string before the first pipe.
    const from = cells[1] as TicketStatus;
    const targetsCell = cells[2] ?? "";
    const targets = /none/i.test(targetsCell)
      ? []
      : targetsCell.split(",").map((t) => t.trim()).filter(Boolean);
    matrix[from] = new Set(targets as TicketStatus[]);
  }
  return matrix;
}

describe("UNIT-L4-01: code matrix equals the spec BR-14 table (edge by edge)", () => {
  const SPEC_MATRIX = parseBr14Matrix();

  it("UNIT-L4-01: the spec table lists exactly the 8 statuses", () => {
    expect(new Set(Object.keys(SPEC_MATRIX))).toEqual(new Set(ALL_TICKET_STATUSES));
  });

  it("UNIT-L4-01: every (from → to) edge agrees between code and spec", () => {
    const disagreements: string[] = [];
    for (const from of ALL_TICKET_STATUSES) {
      const specAllows = SPEC_MATRIX[from];
      for (const to of ALL_TICKET_STATUSES) {
        const code = canTransition(from, to);
        const spec = specAllows.has(to);
        if (code !== spec) {
          disagreements.push(`${from} → ${to}: code=${code}, spec=${spec}`);
        }
      }
    }
    expect(disagreements, disagreements.join("; ")).toEqual([]);
  });
});

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
