// Shared priority badge (ui-spec §2): Low = green, Medium = amber-brown,
// High = red; text always accompanies colour. Used for Requested Priority and
// IT Priority (the field/column label distinguishes the two). Reused by the
// Staff screens in Issues #26/#27.

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const PRIORITY_MODIFIERS: Record<string, string> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

export default function PriorityBadge({ priority }: { priority: string }) {
  const label = PRIORITY_LABELS[priority] ?? priority;
  const modifier = PRIORITY_MODIFIERS[priority];
  return (
    <span
      className={`zen-priority-badge${modifier ? ` zen-priority-badge--${modifier}` : ""}`}
      aria-label={`Priority: ${label}`}
    >
      {label}
    </span>
  );
}
