// Accessible modal dialog (ui-spec §5): role="dialog" + aria-modal, focus moves
// into the dialog on open and returns to the trigger on close, focus is trapped
// with Tab/Shift+Tab, Escape closes (unless locked while saving), and a backdrop
// click never closes. Shared by the User Management Create / Edit / Set-password
// dialogs so they all behave identically.
import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // While true (e.g. a save is in flight) Escape does not close (ui-spec §5).
  locked?: boolean;
}

export default function Dialog({ title, onClose, children, locked = false }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    // Remember what had focus so we can restore it on close.
    triggerRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    return () => {
      triggerRef.current?.focus?.();
    };
  }, []);

  function focusables(): HTMLElement[] {
    const node = dialogRef.current;
    if (!node) return [];
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (locked) return;
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    const items = focusables();
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (active === first || !dialogRef.current?.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !dialogRef.current?.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    // Backdrop: a mousedown on the overlay itself is swallowed so a backdrop
    // click never closes the dialog (ui-spec §5).
    <div
      className="zen-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="zen-card um-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ maxWidth: 480, width: "100%" }}
      >
        <h2 id={titleId} className="zen-section-title" style={{ fontSize: 18, marginBottom: 12 }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
