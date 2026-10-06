// Ticket Detail screen — ui-spec.md §4.3 (Lab 3 additions: status fields, tabs, comments, resolved button)
import { useEffect, useRef, useState } from "react";
import {
  fetchTicketDetail,
  fetchTicketComments,
  postTicketComment,
  markTicketResolved,
  addAttachment,
  removeAttachment,
  downloadAttachment,
  ApiError,
  type TicketDetail as TicketDetailData,
  type TicketAttachment,
  type TicketComment,
} from "../api";
import StatusBadge from "./StatusBadge";
import PriorityBadge from "./PriorityBadge";

interface Props {
  ticketId: number;
  onBack: () => void;
}

const RESOLVED_ALLOWED = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

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

export default function TicketDetail({ ticketId, onBack }: Props) {
  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activeTab, setActiveTab] = useState<"comments" | "attachments">("comments");
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [markingResolved, setMarkingResolved] = useState(false);
  const [requesterResolvedAt, setRequesterResolvedAt] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TicketAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Tabs are keyboard operable with the arrow keys (ui-spec §5).
  const TAB_ORDER = ["comments", "attachments"] as const;
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

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    Promise.all([fetchTicketDetail(ticketId), fetchTicketComments(ticketId)])
      .then(([t, c]) => {
        if (!active) return;
        setTicket(t);
        setAttachments(t.attachments);
        setRequesterResolvedAt(t.requesterResolvedAt ?? null);
        setComments(c);
        setLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });
    return () => { active = false; };
  }, [ticketId]);

  async function handleMarkResolved() {
    if (markingResolved) return;
    setMarkingResolved(true);
    try {
      const result = await markTicketResolved(ticketId);
      setRequesterResolvedAt(result.requesterResolvedAt);
    } catch {
      // stay enabled on failure; server is authoritative
    } finally {
      setMarkingResolved(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body || postingComment) return;
    setCommentError(null);
    setPostingComment(true);
    try {
      const comment = await postTicketComment(ticketId, body);
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    } catch (err) {
      if (err instanceof ApiError && err.errors?.body) {
        setCommentError(err.errors.body);
      } else {
        setCommentError("Failed to post comment. Please try again.");
      }
    } finally {
      setPostingComment(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const att = await addAttachment(ticketId, file);
      setAttachments((prev) => [...prev, att]);
    } catch (err: unknown) {
      const msg = (err as { body?: { error?: string } })?.body?.error ?? "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div>
        <button className="zen-btn zen-btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Back
        </button>
        <div className="zen-card" role="status" aria-live="polite">
          <div className="zen-spinner" aria-label="Loading ticket" />
          <p className="zen-muted">Loading ticket…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (loadState === "error" || !ticket) {
    return (
      <div>
        <button className="zen-btn zen-btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Back
        </button>
        <div className="zen-card" style={{ textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Ticket Not Found</h2>
          <p className="zen-muted">The ticket could not be loaded.</p>
        </div>
      </div>
    );
  }

  const canMarkResolved =
    RESOLVED_ALLOWED.includes(ticket.currentStatus) && !requesterResolvedAt;
  const alreadyMarked = !!requesterResolvedAt;

  // ── Success ──────────────────────────────────────────────────────────────
  return (
    <div>
      <button className="zen-btn zen-btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to My Tickets
      </button>

      {/* ── Read-only header ─────────────────────────────────────────────── */}
      <div className="zen-card td-header-card">
        <h2 className="zen-section-title">Ticket Detail</h2>
        <div className="td-fields">
          <ReadField label="Ticket No." value={ticket.ticketNumber} />
          <ReadField label="Ticket Date" value={new Date(ticket.createdAt).toLocaleString()} />
          <ReadField label="Category" value={ticket.category} />
          <ReadField label="Related System" value={ticket.relatedSystem} />
          <ReadField
            label="Requested Priority"
            value={<PriorityBadge priority={ticket.requestedPriority} />}
          />
          <ReadField
            label="Current Status"
            value={<StatusBadge status={ticket.currentStatus} />}
          />
          {ticket.itPriority && (
            <ReadField
              label="IT Priority"
              value={<PriorityBadge priority={ticket.itPriority} />}
            />
          )}
          <ReadField label="Ticket Owner" value={ticket.owner?.name ?? "Unassigned"} />
        </div>

        {ticket.resolutionSummary && (
          <div className="zen-field" style={{ marginTop: 16 }}>
            <span className="zen-label">Resolution Summary</span>
            <div className="td-readonly-text">{ticket.resolutionSummary}</div>
          </div>
        )}

        <div className="zen-field" style={{ marginTop: 16 }}>
          <span className="zen-label">Summary</span>
          <div className="td-readonly-text">{ticket.summary}</div>
        </div>

        <div className="zen-field">
          <span className="zen-label">Description</span>
          <div className="td-readonly-text td-desc">{ticket.description}</div>
        </div>
      </div>

      {/* ── Problem Appears Resolved ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <button
          className="zen-btn zen-btn-secondary"
          disabled={!canMarkResolved || markingResolved || alreadyMarked}
          onClick={handleMarkResolved}
          aria-busy={markingResolved}
        >
          {alreadyMarked ? "Marked as resolved" : "Problem Appears Resolved"}
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="zen-card">
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
            aria-selected={activeTab === "attachments"}
            tabIndex={activeTab === "attachments" ? 0 : -1}
            className={`zen-tab${activeTab === "attachments" ? " zen-tab--active" : ""}`}
            onClick={() => setActiveTab("attachments")}
            onKeyDown={handleTabKey}
          >
            Attachments ({attachments.length})
          </button>
        </div>

        {/* Comments panel */}
        {activeTab === "comments" && (
          <div role="tabpanel">
            <div className="td-comments-list">
              {comments.length === 0 && (
                <p className="zen-muted">No comments yet.</p>
              )}
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c} />
              ))}
            </div>

            <form onSubmit={handlePostComment} className="td-comment-form" style={{ marginTop: 16 }}>
              <div className="zen-field">
                <label htmlFor="td-comment-body" className="zen-label">
                  Post a comment
                </label>
                <textarea
                  id="td-comment-body"
                  className="zen-input zen-textarea"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Write your comment…"
                  disabled={postingComment}
                  aria-describedby="td-comment-counter"
                />
                <span id="td-comment-counter" className="zen-muted" style={{ fontSize: 12 }}>
                  {commentBody.length}/2000
                </span>
              </div>
              {commentError && (
                <span className="zen-field-error" role="alert">{commentError}</span>
              )}
              <button
                type="submit"
                className="zen-btn zen-btn-primary"
                disabled={postingComment || !commentBody.trim()}
                aria-busy={postingComment}
              >
                {postingComment ? "Posting…" : "Post comment"}
              </button>
            </form>
          </div>
        )}

        {/* Attachments panel */}
        {activeTab === "attachments" && (
          <div role="tabpanel">
            {attachments.length === 0 && (
              <p className="zen-muted">No attachments yet.</p>
            )}
            <ul className="td-attach-list">
              {attachments.map((a) => (
                <AttachmentRow
                  key={a.id}
                  attachment={a}
                  ticketId={ticketId}
                  onRemoveClick={() => setRemoveTarget(a)}
                />
              ))}
            </ul>

            <div className="td-upload-row">
              <label
                htmlFor="td-file"
                className="zen-btn zen-btn-secondary"
                style={{ cursor: "pointer" }}
              >
                {uploading ? "Uploading…" : "Add Attachment"}
              </label>
              <input
                id="td-file"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                style={{ display: "none" }}
                ref={fileRef}
                onChange={handleUpload}
                disabled={uploading}
              />
              {uploadError && (
                <span className="zen-field-error" role="alert">{uploadError}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Remove dialog ────────────────────────────────────────────────── */}
      {removeTarget && (
        <RemoveDialog
          attachment={removeTarget}
          ticketId={ticketId}
          onDone={(updated) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === updated.id
                  ? { ...a, removedAt: updated.removedAt, removalReason: updated.removalReason }
                  : a
              )
            );
            setRemoveTarget(null);
          }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="td-read-field">
      <span className="zen-label td-field-label">{label}</span>
      <span className="td-field-value">{value}</span>
    </div>
  );
}

function CommentRow({ comment }: { comment: TicketComment }) {
  return (
    <div className="td-comment-row" style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div className="td-comment-meta" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{comment.author.name}</span>
        <span className={roleBadgeClass(comment.author.role)}>{roleLabel(comment.author.role)}</span>
        <span className="zen-muted" style={{ fontSize: 12 }}>
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="td-comment-body" style={{ fontSize: 14 }}>{comment.body}</div>
    </div>
  );
}

interface AttachmentRowProps {
  attachment: TicketAttachment;
  ticketId: number;
  onRemoveClick: () => void;
}

function AttachmentRow({ attachment: a, ticketId, onRemoveClick }: AttachmentRowProps) {
  const removed = !!a.removedAt;
  const sizeKB = Math.round(a.sizeBytes / 1024);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadAttachment(ticketId, a.id, a.fileName);
    } catch {
      setDownloadError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className={`td-attach-item${removed ? " td-attach-removed" : ""}`}>
      <span className="td-attach-name">{a.fileName}</span>
      <span className="td-attach-meta">
        {sizeKB} KB · {new Date(a.uploadedAt).toLocaleDateString()}
      </span>

      {removed ? (
        <span className="mt-badge" style={{ background: "#5a6b62" }} aria-label="Removed">
          Removed
        </span>
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
          {downloadError && (
            <span className="zen-field-error" role="alert">{downloadError}</span>
          )}
          <button
            className="zen-btn zen-btn-destructive td-icon-btn"
            aria-label={`Remove ${a.fileName}`}
            onClick={onRemoveClick}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

interface RemoveDialogProps {
  attachment: TicketAttachment;
  ticketId: number;
  onDone: (updated: { id: number; removedAt: string; removalReason: string }) => void;
  onCancel: () => void;
}

function RemoveDialog({ attachment, ticketId, onDone, onCancel }: RemoveDialogProps) {
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = reason.trim().length >= 3;

  async function handleConfirm() {
    if (!canConfirm || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const result = await removeAttachment(ticketId, attachment.id, reason.trim());
      onDone(result);
    } catch (err: unknown) {
      const msg = (err as { body?: { error?: string } })?.body?.error ?? "Remove failed";
      setError(msg);
      setRemoving(false);
    }
  }

  return (
    <div
      className="zen-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Remove Attachment"
    >
      <div className="zen-card" style={{ maxWidth: 440, width: "100%" }}>
        <h3 className="zen-section-title" style={{ fontSize: 18 }}>
          Remove Attachment
        </h3>
        <p className="zen-muted" style={{ marginBottom: 16 }}>
          Removing <strong>{attachment.fileName}</strong>. This cannot be undone.
        </p>

        <div className="zen-field">
          <label htmlFor="remove-reason" className="zen-label">
            Reason<span className="zen-required"> *</span>
            <span className="zen-muted" style={{ fontWeight: 400 }}> (min 3 characters)</span>
          </label>
          <input
            id="remove-reason"
            type="text"
            className="zen-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you removing this file?"
            autoFocus
          />
        </div>

        {error && <p className="zen-field-error" role="alert">{error}</p>}

        <div className="zen-btn-row">
          <button className="zen-btn zen-btn-secondary" onClick={onCancel} disabled={removing}>
            Cancel
          </button>
          <button
            className="zen-btn zen-btn-destructive"
            disabled={!canConfirm || removing}
            onClick={handleConfirm}
            aria-label="Confirm removal"
          >
            {removing ? "Removing…" : "Confirm Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
