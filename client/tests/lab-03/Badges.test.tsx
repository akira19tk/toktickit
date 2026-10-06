// UI-12: shared StatusBadge and PriorityBadge render the human label defined in
// ui-spec §2 (not the raw enum) with text always accompanying colour. One
// assertion per status label and per priority label.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StatusBadge from "../../src/components/StatusBadge";
import PriorityBadge from "../../src/components/PriorityBadge";

describe("StatusBadge (ui-spec §2)", () => {
  const cases: Array<[string, string, string]> = [
    // [enum, visible label, status-specific modifier class]
    ["NEW", "New", "zen-status-badge--new"],
    ["OPEN", "Open", "zen-status-badge--open"],
    ["IN_PROGRESS", "In Progress", "zen-status-badge--in-progress"],
    ["WAITING_FOR_REQUESTER", "Waiting for Requester", "zen-status-badge--waiting"],
    ["RESOLVED", "Resolved", "zen-status-badge--resolved"],
    ["CLOSED", "Closed", "zen-status-badge--closed"],
    ["REOPENED", "Reopened", "zen-status-badge--reopened"],
    ["CANCELLED", "Cancelled", "zen-status-badge--cancelled"],
  ];

  it.each(cases)("UI-12: status %s renders label '%s' with a distinct style", (status, label, modifier) => {
    const { container } = render(<StatusBadge status={status} />);
    // Human label visible (text accompanies colour)
    expect(screen.getByText(label)).toBeInTheDocument();
    // Raw enum must NOT be shown when it differs from the label
    if (status !== label) {
      expect(screen.queryByText(status)).not.toBeInTheDocument();
    }
    // Distinct per-status style class
    expect(container.querySelector(`.${modifier}`)).not.toBeNull();
  });
});

describe("PriorityBadge (ui-spec §2)", () => {
  const cases: Array<[string, string, string]> = [
    ["LOW", "Low", "zen-priority-badge--low"],
    ["MEDIUM", "Medium", "zen-priority-badge--medium"],
    ["HIGH", "High", "zen-priority-badge--high"],
  ];

  it.each(cases)("UI-12: priority %s renders label '%s' with a distinct style", (priority, label, modifier) => {
    const { container } = render(<PriorityBadge priority={priority} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    if (priority !== label) {
      expect(screen.queryByText(priority)).not.toBeInTheDocument();
    }
    expect(container.querySelector(`.${modifier}`)).not.toBeNull();
  });
});
