// UNIT-01: Ticket Number generator produces TKT-YYYY-NNNNNN format
// Tests the pure formatting function — no DB required.
import { describe, it, expect } from "vitest";
import { formatTicketNumber } from "../../src/lib/ticketNumber";

const TICKET_RE = /^TKT-\d{4}-\d{6}$/;

describe("formatTicketNumber", () => {
  it("UNIT-01: matches TKT-YYYY-NNNNNN regex", () => {
    expect(formatTicketNumber(2026, 1)).toMatch(TICKET_RE);
  });

  it("zero-pads the sequence to exactly 6 digits", () => {
    expect(formatTicketNumber(2026, 1)).toBe("TKT-2026-000001");
    expect(formatTicketNumber(2026, 42)).toBe("TKT-2026-000042");
    expect(formatTicketNumber(2026, 999999)).toBe("TKT-2026-999999");
  });

  it("UNIT-01: different sequences produce unique ticket numbers", () => {
    expect(formatTicketNumber(2026, 1)).not.toBe(formatTicketNumber(2026, 2));
  });

  it("uses the supplied year", () => {
    expect(formatTicketNumber(2025, 1)).toBe("TKT-2025-000001");
    expect(formatTicketNumber(2030, 1)).toBe("TKT-2030-000001");
  });
});
