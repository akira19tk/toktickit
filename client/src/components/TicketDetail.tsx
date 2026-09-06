// Ticket Detail screen — ui-spec.md §10.5
// Read-only header block + Attachments section (add / download / soft-remove)
import { useEffect, useRef, useState } from "react";
import {
  fetchTicketDetail,
  addAttachment,
  removeAttachment,
  downloadAttachmentUrl,
  type TicketDetail as TicketDetailData,
  type TicketAttachment,
} from "../api";

interface Props {
  ticketId: number;
  requesterId: number;
  onBack: () => void;
}

export default function TicketDetail({ ticketId, requesterId, onBack }: Props) {
  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TicketAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    fetchTicketDetail(ticketId, requesterId)
      .then((t) => {
        if (!active) return;
        setTicket(t);
        setAttachments(t.attachments);
        setLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });
    return () => { active = false; };
  }, [ticketId, requesterId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const att = await addAttachment(ticketId, file, requesterId);
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
      <div className="zen-main">
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
      <div className="zen-main">
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

  // ── Success ──────────────────────────────────────────────────────────────
  return (
    <div className="zen-main">
      <button className="zen-btn zen-btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to My Tickets
      </button>

      {/* ── Read-only header block (ui-spec §10.5) ─────────────────────── */}
      <div className="zen-card td-header-card">
        <h2 className="zen-section-title">Ticket Detail</h2>

        <div className="td-fields">
          <ReadField label="Ticket No." value={ticket.ticketNumber} />
          <ReadField label="Ticket Date" value={new Date(ticket.createdAt).toLocaleString()} />
          <ReadField label="Category" value={String(ticket.categoryId)} />
          <ReadField label="Related System" value={String(ticket.relatedSystemId)} />
          <ReadField label="Requested Priority" value={ticket.requestedPriority} />
          <ReadField label="Current Status" value={ticket.currentStatus} />
        </div>

        <div className="zen-field" style={{ marginTop: 16 }}>
          <span className="zen-label">Summary</span>
          <div className="td-readonly-text">{ticket.summary}</div>
        </div>

        <div className="zen-field">
          <span className="zen-label">Description</span>
          <div className="td-readonly-text td-desc">{ticket.description}</div>
        </div>
      </div>

      {/* ── Attachments section ─────────────────────────────────────────── */}
      <div className="zen-card td-attach-card">
        <h3 className="zen-section-title" style={{ fontSize: 18 }}>
          Attachments
        </h3>

        {attachments.length === 0 && (
          <p className="zen-muted">No attachments yet.</p>
        )}

        <ul className="td-attach-list">
          {attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              ticketId={ticketId}
              requesterId={requesterId}
              onRemoveClick={() => setRemoveTarget(a)}
            />
          ))}
        </ul>

        {/* Upload area */}
        <div className="td-upload-row">
          <label htmlFor="td-file" className="zen-btn zen-btn-secondary" style={{ cursor: "pointer" }}>
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

      {/* ── Remove confirm dialog ───────────────────────────────────────── */}
      {removeTarget && (
        <RemoveDialog
          attachment={removeTarget}
          ticketId={ticketId}
          requesterId={requesterId}
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

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="td-read-field">
      <span className="zen-label td-field-label">{label}</span>
      <span className="td-field-value">{value}</span>
    </div>
  );
}

interface AttachmentRowProps {
  attachment: TicketAttachment;
  ticketId: number;
  requesterId: number;
  onRemoveClick: () => void;
}

function AttachmentRow({ attachment: a, ticketId, requesterId, onRemoveClick }: AttachmentRowProps) {
  const removed = !!a.removedAt;
  const sizeKB = Math.round(a.sizeBytes / 1024);

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
          <a
            href={downloadAttachmentUrl(ticketId, attachmentId(a, requesterId))}
            className="zen-btn zen-btn-secondary td-icon-btn"
            aria-label={`Download ${a.fileName}`}
            download
          >
            ⬇ Download
          </a>
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

// build download URL embedding requesterId as query param isn't needed since
// the header is sent by the browser only for XHR, not <a href>.
// For a href download we rely on the server's x-requester-id check;
// the link just passes ticketId + attachmentId.
function attachmentId(a: TicketAttachment, _requesterId: number) {
  return a.id;
}

interface RemoveDialogProps {
  attachment: TicketAttachment;
  ticketId: number;
  requesterId: number;
  onDone: (updated: { id: number; removedAt: string; removalReason: string }) => void;
  onCancel: () => void;
}

function RemoveDialog({ attachment, ticketId, requesterId, onDone, onCancel }: RemoveDialogProps) {
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = reason.trim().length >= 3;

  async function handleConfirm() {
    if (!canConfirm || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const result = await removeAttachment(ticketId, attachment.id, reason.trim(), requesterId);
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

        {error && (
          <p className="zen-field-error" role="alert">{error}</p>
        )}

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
