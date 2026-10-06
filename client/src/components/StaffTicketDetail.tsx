// IT Staff Ticket Detail — ui-spec.md §4.5
// Header strip + read-only facts panel + editable operations panel (Owner,
// IT Priority, Status) + tabs for Public Comments (green), Internal Notes
// (amber) and Attachments. Reuses the shared StatusBadge and PriorityBadge.
import { useEffect, useRef, useState } from "react";
import {
  fetchStaffTicketDetail,
  fetchStaffComments,
  fetchStaffNotes,
  fetchAssignees,
  claimStaffTicket,
  reassignStaffTicket,
  setStaffItPriority,
  changeStaffStatus,
  postStaffComment,
  postStaffNote,
  downloadStaffAttachment,
  ApiError,
  type StaffTicketDetail as StaffTicketDetailData,
  type TicketComment,
  type TicketAttachment,
  type Assignee,
} from "../api";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";

interface Props {
  ticketId: number;
  onBack: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

function roleBadgeClass(role: string): string {
  if (role === "IT_STAFF") return "zen-role-badge zen-role-badge--staff";
  if (role === "ADMIN") return "zen-role-badge zen-role-badge--admin";
  return "zen-role-badge zen-role-badge--requester";
}
function roleLabel(role: string): string {
  if (role === "IT_STAFF") return "IT Staff";
  if (role === "ADMIN") return "Administrator";
  return "Requester";
}

// Friendly message for an operation error, preferring a field error, then a
// known machine code, then the raw message.
function errorMessage(err: unknown, field?: string): string {
  if (err instanceof ApiError) {
    if (field && err.errors?.[field]) return err.errors[field];
    switch (err.code) {
      case "INVALID_TRANSITION": return "That status change is not allowed.";
      case "NO_CHANGE": return "That value is already set — nothing to change.";
      case "TICKET_UNASSIGNED": return "Claim the ticket before changing its status.";
      case "TICKET_CLOSED": return "This ticket is closed or cancelled.";
      case "ALREADY_OWNED": return "This ticket already has an owner.";
      default: return err.message;
    }
  }
  return "Something went wrong. Please try again.";
}

export default function StaffTicketDetail({ ticketId, onBack }: Props) {
  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [notes, setNotes] = useState<TicketComment[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loadState, setLoadState] =
    useState<"loading" | "success" | "error" | "forbidden" | "notfound">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"comments" | "notes" | "attachments">("comments");
  const [toast, setToast] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Operation-local state
  const [claimBusy, setClaimBusy] = useState(false);
  const [reassignTarget, setReassignTarget] = useState("");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [priorityValue, setPriorityValue] = useState("");
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<"CLOSED" | "CANCELLED" | null>(null);

  // Composers
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Load assignees once (for the reassign dropdown).
  useEffect(() => {
    fetchAssignees().then(setAssignees).catch(() => setAssignees([]));
  }, []);

  // Load / reload the ticket, comments and notes.
  useEffect(() => {
    let active = true;
    setLoadState("loading");
    fetchStaffTicketDetail(ticketId)
      .then(async (t) => {
        const [c, n] = await Promise.all([
          fetchStaffComments(ticketId),
          fetchStaffNotes(ticketId),
        ]);
        if (!active) return;
        setTicket(t);
        setComments(c);
        setNotes(n);
        setPriorityValue(t.itPriority);
        setReassignTarget("");
        setStatusTarget("");
        setResolutionSummary("");
        setLoadState("success");
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) setLoadState("forbidden");
        else if (err instanceof ApiError && err.status === 404) setLoadState("notfound");
        else setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [ticketId, reloadKey]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }
  function reload() {
    setReloadKey((k) => k + 1);
  }

  // Tabs are keyboard operable with the arrow keys (ui-spec §5). Left/Right (and
  // Up/Down, Home/End) move selection and focus along the tablist.
  const TAB_ORDER = ["comments", "notes", "attachments"] as const;
  function handleTabKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const idx = TAB_ORDER.indexOf(activeTab);
    let next = idx;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (idx + 1) % TAB_ORDER.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    setActiveTab(TAB_ORDER[next]);
    tabRefs.current[next]?.focus();
  }

  // ── Operations ─────────────────────────────────────────────────────────────
  async function doClaim() {
    setClaimBusy(true);
    setOwnerError(null);
    try {
      await claimStaffTicket(ticketId);
      showToast("Ticket claimed.");
      reload();
    } catch (err) {
      setOwnerError(errorMessage(err));
    } finally {
      setClaimBusy(false);
    }
  }

  async function doReassign() {
    if (!reassignTarget) return;
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      await reassignStaffTicket(ticketId, Number(reassignTarget));
      showToast("Owner updated.");
      reload();
    } catch (err) {
      setOwnerError(errorMessage(err, "ownerId"));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function doPriority() {
    setPriorityBusy(true);
    setPriorityError(null);
    try {
      await setStaffItPriority(ticketId, priorityValue);
      showToast("IT Priority updated.");
      reload();
    } catch (err) {
      setPriorityError(errorMessage(err, "itPriority"));
    } finally {
      setPriorityBusy(false);
    }
  }

  function applyStatus() {
    if (!statusTarget) return;
    if (statusTarget === "CLOSED" || statusTarget === "CANCELLED") {
      setConfirmTarget(statusTarget);
      return;
    }
    doStatusChange(
      statusTarget === "RESOLVED"
        ? { status: statusTarget, resolutionSummary: resolutionSummary.trim() }
        : { status: statusTarget }
    );
  }

  async function doStatusChange(payload: {
    status: string;
    resolutionSummary?: string;
    confirm?: boolean;
  }) {
    setStatusBusy(true);
    setStatusError(null);
    try {
      await changeStaffStatus(ticketId, payload);
      showToast("Status updated.");
      setConfirmTarget(null);
      reload();
    } catch (err) {
      setStatusError(errorMessage(err, "resolutionSummary"));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      const c = await postStaffComment(ticketId, body);
      setComments((prev) => [...prev, c]);
      setCommentBody("");
    } catch (err) {
      setCommentError(errorMessage(err, "body"));
    } finally {
      setPostingComment(false);
    }
  }

  async function handlePostNote(e: React.FormEvent) {
    e.preventDefault();
    const body = noteBody.trim();
    if (!body || postingNote) return;
    setPostingNote(true);
    setNoteError(null);
    try {
      const n = await postStaffNote(ticketId, body);
      setNotes((prev) => [...prev, n]);
      setNoteBody("");
    } catch (err) {
      setNoteError(errorMessage(err, "body"));
    } finally {
      setPostingNote(false);
    }
  }

  // ── Page-level states ──────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="zen-main">
        <BackButton onBack={onBack} />
        <div className="zen-card" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="zen-spinner" aria-label="Loading ticket" />
          <p className="zen-muted">Loading ticket…</p>
        </div>
      </div>
    );
  }
  if (loadState === "forbidden") {
    return (
      <StatePage testid="forbidden-state" icon="🔒" title="You don't have access to this ticket"
        message="This area is for IT Staff." onBack={onBack} />
    );
  }
  if (loadState === "notfound") {
    return (
      <StatePage testid="notfound-state" icon="🔍" title="Ticket not found"
        message="This ticket does not exist or has no id." onBack={onBack} />
    );
  }
  if (loadState === "error" || !ticket) {
    return (
      <div className="zen-main">
        <BackButton onBack={onBack} />
        <div className="zen-card" data-testid="failure-state" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Unable to load the ticket</h2>
          <p className="zen-muted">Could not connect to the server.</p>
          <button className="zen-btn zen-btn-primary" onClick={reload}>Try Again</button>
        </div>
      </div>
    );
  }

  const owner = ticket.owner;
  const ownerInactive = !!owner && !owner.isActiveStaff;
  const priorityChanged = priorityValue !== ticket.itPriority;
  const resolveNeedsSummary =
    statusTarget === "RESOLVED" && resolutionSummary.trim().length < 10;

  // Single Apply button reused in both layouts (inline for most transitions,
  // below the summary box for Resolved). Only one instance renders at a time.
  const applyStatusButton = (
    <button
      className="zen-btn zen-btn-primary"
      onClick={applyStatus}
      disabled={!statusTarget || statusBusy || resolveNeedsSummary}
      aria-busy={statusBusy}
      aria-label="Apply status change"
    >
      {statusBusy ? "Saving…" : "Apply"}
    </button>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  return (
    <div className="zen-main">
      {toast && (
        <div className="zen-toast" role="status" aria-live="polite" data-testid="toast">
          {toast}
        </div>
      )}

      {/* Header strip */}
      <div className="mt-header" data-testid="detail-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 className="zen-section-title" style={{ fontSize: 24 }}>{ticket.ticketNumber}</h1>
          <StatusBadge status={ticket.currentStatus} />
          <span className="sd-badge-label">
            IT Priority: <PriorityBadge priority={ticket.itPriority} />
          </span>
          {ticket.requesterResolvedAt && (
            <span className="sq-resolved-marker" data-testid="requester-resolved-marker">
              ✓ Requester says resolved
            </span>
          )}
        </div>
        <button className="zen-btn zen-btn-secondary" onClick={onBack}>← Back to Queue</button>
      </div>

      <div className="sd-layout">
        {/* Facts panel (read-only) */}
        <div className="zen-card sd-facts" data-testid="facts-panel">
          <h2 className="zen-section-title" style={{ fontSize: 18 }}>Details</h2>
          <div className="td-fields">
            <ReadField label="Ticket Date" value={new Date(ticket.createdAt).toLocaleString()} />
            <ReadField label="Requester" value={`${ticket.requester.name} · ${ticket.requester.email}`} />
            <ReadField label="Category" value={ticket.category} />
            <ReadField label="Related System" value={ticket.relatedSystem} />
            <ReadField label="Requested Priority" value={<PriorityBadge priority={ticket.requestedPriority} />} />
            {ticket.resolvedAt && <ReadField label="Resolved At" value={new Date(ticket.resolvedAt).toLocaleString()} />}
            {ticket.closedAt && <ReadField label="Closed At" value={new Date(ticket.closedAt).toLocaleString()} />}
          </div>
          <div className="zen-field" style={{ marginTop: 16 }}>
            <span className="zen-label">Summary</span>
            <div className="td-readonly-text">{ticket.summary}</div>
          </div>
          <div className="zen-field">
            <span className="zen-label">Description</span>
            <div className="td-readonly-text td-desc">{ticket.description}</div>
          </div>
          {ticket.resolutionSummary && (
            <div className="zen-field">
              <span className="zen-label">Resolution Summary</span>
              <div className="td-readonly-text">{ticket.resolutionSummary}</div>
            </div>
          )}
        </div>

        {/* Operations panel (editable) */}
        <div className="zen-card sd-ops" data-testid="operations-panel">
          <h2 className="zen-section-title" style={{ fontSize: 18 }}>Operations</h2>

          {/* Owner */}
          <div className="zen-field">
            <span className="zen-label">Ticket Owner</span>
            {owner ? (
              <p style={{ margin: "4px 0" }}>
                {owner.name}
                {ownerInactive && (
                  <span className="sq-inactive" data-testid="owner-inactive"> (no longer active IT Staff)</span>
                )}
              </p>
            ) : (
              <p className="zen-muted" style={{ margin: "4px 0" }}>Unassigned</p>
            )}

            {owner ? (
              <div className="sd-control-row">
                <select
                  className="zen-select"
                  aria-label="Reassign owner"
                  value={reassignTarget}
                  onChange={(e) => setReassignTarget(e.target.value)}
                >
                  <option value="">Reassign to…</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  className="zen-btn zen-btn-secondary"
                  onClick={doReassign}
                  disabled={!reassignTarget || ownerBusy}
                  aria-busy={ownerBusy}
                >
                  {ownerBusy ? "Saving…" : "Reassign"}
                </button>
              </div>
            ) : (
              <button
                className="zen-btn zen-btn-primary"
                onClick={doClaim}
                disabled={claimBusy}
                aria-busy={claimBusy}
              >
                {claimBusy ? "Claiming…" : "Claim"}
              </button>
            )}
            {ownerError && <span className="zen-field-error" role="alert">{ownerError}</span>}
          </div>

          {/* IT Priority */}
          <div className="zen-field">
            <label htmlFor="sd-priority" className="zen-label">IT Priority</label>
            <div className="sd-control-row">
              <select
                id="sd-priority"
                className="zen-select"
                value={priorityValue}
                onChange={(e) => setPriorityValue(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              <button
                className="zen-btn zen-btn-secondary"
                onClick={doPriority}
                disabled={!priorityChanged || priorityBusy}
                aria-busy={priorityBusy}
                aria-label="Apply IT Priority"
              >
                {priorityBusy ? "Saving…" : "Apply"}
              </button>
            </div>
            {priorityError && <span className="zen-field-error" role="alert">{priorityError}</span>}
          </div>

          {/* Status */}
          <div className="zen-field">
            <label htmlFor="sd-status" className="zen-label">Status</label>
            {ticket.allowedTransitions.length === 0 ? (
              <p className="zen-muted" style={{ margin: "4px 0" }}>No status changes are available.</p>
            ) : (
              <>
                {/* Status select; for Resolved the summary box appears before the
                    Apply button, so Apply sits below it (ui-spec §4.5). */}
                <div className="sd-control-row">
                  <select
                    id="sd-status"
                    className="zen-select"
                    value={statusTarget}
                    onChange={(e) => setStatusTarget(e.target.value)}
                  >
                    <option value="">Change status…</option>
                    {ticket.allowedTransitions.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                  {statusTarget !== "RESOLVED" && applyStatusButton}
                </div>
                {statusTarget === "RESOLVED" && (
                  <>
                    <div className="zen-field" style={{ marginTop: 8 }}>
                      <label htmlFor="sd-resolution" className="zen-label">Resolution summary</label>
                      <textarea
                        id="sd-resolution"
                        className="zen-input zen-textarea"
                        rows={3}
                        maxLength={1000}
                        value={resolutionSummary}
                        onChange={(e) => setResolutionSummary(e.target.value)}
                        placeholder="Describe how the issue was resolved (10–1000 characters)…"
                        aria-describedby="sd-resolution-counter"
                      />
                      <span id="sd-resolution-counter" className="zen-muted" style={{ fontSize: 12 }}>
                        {resolutionSummary.trim().length}/1000 (minimum 10)
                      </span>
                    </div>
                    <div style={{ marginTop: 8 }}>{applyStatusButton}</div>
                  </>
                )}
              </>
            )}
            {statusError && <span className="zen-field-error" role="alert">{statusError}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="zen-card" style={{ marginTop: 16 }}>
        <div role="tablist" className="zen-tablist" aria-label="Ticket detail sections">
          <button
            role="tab"
            ref={(el) => { tabRefs.current[0] = el; }}
            aria-selected={activeTab === "comments"}
            tabIndex={activeTab === "comments" ? 0 : -1}
            className={`zen-tab${activeTab === "comments" ? " zen-tab--active" : ""}`}
            onClick={() => setActiveTab("comments")}
            onKeyDown={handleTabKey}
          >
            Public Comments ({comments.length})
          </button>
          <button
            role="tab"
            ref={(el) => { tabRefs.current[1] = el; }}
            aria-selected={activeTab === "notes"}
            tabIndex={activeTab === "notes" ? 0 : -1}
            className={`zen-tab zen-tab--internal${activeTab === "notes" ? " zen-tab--active" : ""}`}
            onClick={() => setActiveTab("notes")}
            onKeyDown={handleTabKey}
          >
            Internal Notes ({notes.length})
          </button>
          <button
            role="tab"
            ref={(el) => { tabRefs.current[2] = el; }}
            aria-selected={activeTab === "attachments"}
            tabIndex={activeTab === "attachments" ? 0 : -1}
            className={`zen-tab${activeTab === "attachments" ? " zen-tab--active" : ""}`}
            onClick={() => setActiveTab("attachments")}
            onKeyDown={handleTabKey}
          >
            Attachments ({ticket.attachments.length})
          </button>
        </div>

        {/* Public Comments — green, visible to the Requester */}
        {activeTab === "comments" && (
          <div
            role="tabpanel"
            data-testid="public-panel"
            className="sd-public-panel"
            style={{ borderTop: "3px solid var(--color-public-accent)", paddingTop: 12 }}
          >
            <p className="zen-muted" data-testid="public-helper">Visible to the Requester</p>
            <EntryList entries={comments} emptyText="No comments yet." ticketId={ticketId} />
            <form onSubmit={handlePostComment} style={{ marginTop: 16 }}>
              <div className="zen-field">
                <label htmlFor="sd-comment" className="zen-label">Post a public comment</label>
                <textarea
                  id="sd-comment"
                  className="zen-input zen-textarea"
                  rows={3}
                  maxLength={2000}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a comment the requester can see…"
                  disabled={postingComment}
                  aria-describedby="sd-comment-counter"
                />
                <span id="sd-comment-counter" className="zen-muted" style={{ fontSize: 12 }}>
                  {commentBody.length}/2000
                </span>
              </div>
              {commentError && <span className="zen-field-error" role="alert">{commentError}</span>}
              <button
                type="submit"
                className="zen-btn zen-btn-primary"
                disabled={postingComment || !commentBody.trim()}
                aria-busy={postingComment}
              >
                {postingComment ? "Posting…" : "Post Public Comment"}
              </button>
            </form>
          </div>
        )}

        {/* Internal Notes — amber, private */}
        {activeTab === "notes" && (
          <div
            role="tabpanel"
            data-testid="internal-panel"
            className="sd-internal-panel"
            style={{
              background: "var(--color-internal-bg)",
              border: "1px solid var(--color-internal-border)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <p style={{ color: "var(--color-internal-border)", fontWeight: 600 }} data-testid="internal-helper">
              <span aria-hidden="true">🔒 </span>Internal — not visible to the Requester
            </p>
            <EntryList entries={notes} emptyText="No internal notes yet." ticketId={ticketId} />
            <form onSubmit={handlePostNote} style={{ marginTop: 16 }}>
              <div className="zen-field">
                <label htmlFor="sd-note" className="zen-label">Add an internal note</label>
                <textarea
                  id="sd-note"
                  className="zen-input zen-textarea"
                  rows={3}
                  maxLength={2000}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write a private note for IT Staff…"
                  disabled={postingNote}
                  aria-describedby="sd-note-counter"
                />
                <span id="sd-note-counter" className="zen-muted" style={{ fontSize: 12 }}>
                  {noteBody.length}/2000
                </span>
              </div>
              {noteError && <span className="zen-field-error" role="alert">{noteError}</span>}
              <button
                type="submit"
                className="zen-btn zen-btn-secondary"
                disabled={postingNote || !noteBody.trim()}
                aria-busy={postingNote}
              >
                {postingNote ? "Adding…" : "Add Internal Note"}
              </button>
            </form>
          </div>
        )}

        {/* Attachments */}
        {activeTab === "attachments" && (
          <div role="tabpanel" data-testid="attachments-panel">
            {ticket.attachments.length === 0 && <p className="zen-muted">No attachments.</p>}
            <ul className="td-attach-list">
              {ticket.attachments.map((a) => (
                <StaffAttachmentRow key={a.id} attachment={a} ticketId={ticketId} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Close / Cancel confirmation dialog */}
      {confirmTarget && (
        <div className="zen-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm status change">
          <div className="zen-card" style={{ maxWidth: 440, width: "100%" }}>
            <h3 className="zen-section-title" style={{ fontSize: 18 }}>
              {confirmTarget === "CLOSED" ? "Close this ticket?" : "Cancel this ticket?"}
            </h3>
            <p className="zen-muted" style={{ marginBottom: 16 }}>
              {confirmTarget === "CLOSED"
                ? "The ticket will be marked Closed. It can later be reopened."
                : "The ticket will be marked Cancelled. This stops further work on it."}
            </p>
            {statusError && <p className="zen-field-error" role="alert">{statusError}</p>}
            <div className="zen-btn-row">
              <button
                className="zen-btn zen-btn-secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={statusBusy}
              >
                Back
              </button>
              <button
                className="zen-btn zen-btn-destructive"
                onClick={() => doStatusChange({ status: confirmTarget, confirm: true })}
                disabled={statusBusy}
                aria-busy={statusBusy}
              >
                {statusBusy ? "Saving…" : confirmTarget === "CLOSED" ? "Close Ticket" : "Cancel Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="zen-btn zen-btn-secondary" onClick={onBack}>← Back to Queue</button>
  );
}

function StatePage({
  testid, icon, title, message, onBack,
}: { testid: string; icon: string; title: string; message: string; onBack: () => void }) {
  return (
    <div className="zen-main">
      <BackButton onBack={onBack} />
      <div className="zen-card" data-testid={testid} style={{ marginTop: 16, textAlign: "center" }}>
        <span className="zen-icon" aria-hidden="true">{icon}</span>
        <h2 className="zen-section-title">{title}</h2>
        <p className="zen-muted">{message}</p>
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="td-read-field">
      <span className="zen-label td-field-label">{label}</span>
      <span className="td-field-value">{value}</span>
    </div>
  );
}

function EntryList({
  entries, emptyText,
}: { entries: TicketComment[]; emptyText: string; ticketId: number }) {
  if (entries.length === 0) return <p className="zen-muted">{emptyText}</p>;
  return (
    <div className="td-comments-list">
      {entries.map((e) => (
        <div key={e.id} className="td-comment-row" style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{e.author.name}</span>
            <span className={roleBadgeClass(e.author.role)}>{roleLabel(e.author.role)}</span>
            <span className="zen-muted" style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          {/* Rendered as text — React escapes, so <script> never executes. */}
          <div style={{ fontSize: 14 }}>{e.body}</div>
        </div>
      ))}
    </div>
  );
}

function StaffAttachmentRow({ attachment: a, ticketId }: { attachment: TicketAttachment; ticketId: number }) {
  const removed = !!a.removedAt;
  const sizeKB = Math.round(a.sizeBytes / 1024);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadStaffAttachment(ticketId, a.id, a.fileName);
    } catch {
      setError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className={`td-attach-item${removed ? " td-attach-removed" : ""}`}>
      <span className="td-attach-name">{a.fileName}</span>
      <span className="td-attach-meta">{sizeKB} KB · {new Date(a.uploadedAt).toLocaleDateString()}</span>
      {removed ? (
        <span className="mt-badge" style={{ background: "#5a6b62" }} aria-label="Removed">Removed</span>
      ) : (
        <div className="td-attach-actions">
          <button
            className="zen-btn zen-btn-secondary td-icon-btn"
            aria-label={`Download ${a.fileName}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "…" : "⬇ Download"}
          </button>
          {error && <span className="zen-field-error" role="alert">{error}</span>}
        </div>
      )}
    </li>
  );
}
