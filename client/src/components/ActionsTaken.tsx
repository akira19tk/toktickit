// Actions Taken on Ticket Detail — ui-spec.md §7.
// Staff/Admin get a create form plus per-row Assign / Complete / Cancel / Edit
// controls (editable only while OPEN). Requesters get the same list read-only,
// with every field visible and no write controls. The backend is the authority
// for every rule; this component only surfaces its errors inline and preserves
// the user's input on a recoverable failure.
import { useEffect, useState } from "react";
import {
  fetchStaffActions,
  fetchRequesterActions,
  createStaffAction,
  patchStaffAction,
  ApiError,
  type ActionTaken,
  type Assignee,
  type CreateActionPayload,
  type PatchActionPayload,
} from "../api";

interface Props {
  ticketId: number;
  mode: "staff" | "requester";
  assignees?: Assignee[];
  // Called after a successful mutation so the parent can refresh the Ticket
  // summary (status badge, resolved/closed times).
  onChanged?: () => void;
}

// Friendly, inline message for an Action mutation error, preferring a known
// machine code, then a field error, then the raw message.
function actionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "ASSIGNEE_INACTIVE":
        return "This staff member is inactive.";
      case "INVALID_ASSIGNEE":
        return "That assignee is not valid.";
      case "TICKET_CLOSED":
        return "This ticket is resolved, closed or cancelled — reopen it to change actions.";
      case "STALE_UPDATE":
        return "Reload — this action changed since you opened it.";
      case "INVALID_ACTION_STATE":
        return "This action can no longer be changed.";
      default:
        return err.message || "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

function nowLocalDateTime(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ActionsTaken({ ticketId, mode, assignees = [], onChanged }: Props) {
  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "success" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    const load = mode === "staff" ? fetchStaffActions(ticketId) : fetchRequesterActions(ticketId);
    load
      .then((list) => {
        if (!active) return;
        setActions(list);
        setLoadState("success");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [ticketId, mode, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
    onChanged?.();
  }

  return (
    <section className="zen-card at-section" aria-labelledby="at-heading" style={{ marginTop: 16 }}>
      <h2 id="at-heading" className="zen-section-title" style={{ fontSize: 18 }}>
        Actions Taken
      </h2>

      {mode === "staff" && <CreateActionForm ticketId={ticketId} assignees={assignees} onCreated={refresh} />}

      {loadState === "loading" && (
        <div role="status" aria-live="polite" className="at-loading">
          <div className="zen-spinner" aria-label="Loading actions" />
          <p className="zen-muted">Loading actions…</p>
        </div>
      )}

      {loadState === "error" && (
        <div className="at-failure" data-testid="actions-failure">
          <p className="zen-muted">Could not load actions.</p>
          <button className="zen-btn zen-btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Try Again
          </button>
        </div>
      )}

      {loadState === "success" && actions.length === 0 && (
        <p className="zen-muted at-empty">No actions yet.</p>
      )}

      {loadState === "success" && actions.length > 0 && (
        <ul className="at-list" data-testid="actions-list">
          {actions.map((a) => (
            <ActionRow
              key={a.id}
              action={a}
              ticketId={ticketId}
              mode={mode}
              assignees={assignees}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Status badge (non-color cues: pale tint / check icon / strike-through) ──────
function ActionStatusBadge({ status }: { status: ActionTaken["status"] }) {
  if (status === "COMPLETED") {
    return (
      <span className="at-badge at-badge--done">
        <span aria-hidden="true">✓ </span>Completed
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="at-badge at-badge--cancelled">
        <s>Cancelled</s>
      </span>
    );
  }
  return <span className="at-badge at-badge--open">Open</span>;
}

// ── Create form (staff, collapsible) ────────────────────────────────────────────
function CreateActionForm({
  ticketId,
  assignees,
  onCreated,
}: {
  ticketId: number;
  assignees: Assignee[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [actionDate, setActionDate] = useState(nowLocalDateTime());
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [attachmentNotes, setAttachmentNotes] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDescription("");
    setResult("");
    setAssigneeId("");
    setActionDate(nowLocalDateTime());
    setFollowUpRequired(false);
    setFollowUpNote("");
    setAttachmentNotes("");
    setFieldErrors({});
    setFormError(null);
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Description is required.";
    if (actionDate && new Date(actionDate).getTime() > Date.now())
      errs.actionDate = "Action date cannot be in the future.";
    if (followUpRequired && !followUpNote.trim())
      errs.followUpNote = "Follow-up note is required when follow-up is checked.";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs = validate();
    setFieldErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    const payload: CreateActionPayload = {
      description: description.trim(),
      followUpRequired,
    };
    if (result.trim()) payload.result = result.trim();
    if (assigneeId) payload.assigneeId = Number(assigneeId);
    if (followUpRequired) payload.followUpNote = followUpNote.trim();
    if (attachmentNotes.trim()) payload.attachmentNotes = attachmentNotes.trim();
    if (actionDate) payload.actionDate = new Date(actionDate).toISOString();

    setSubmitting(true);
    try {
      await createStaffAction(ticketId, payload);
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      // Keep the entered data on a recoverable error; show field errors inline.
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      setFormError(actionErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="at-create-toggle">
        <button className="zen-btn zen-btn-primary" onClick={() => setOpen(true)}>
          Add Action
        </button>
      </div>
    );
  }

  return (
    <form className="at-create-form" onSubmit={handleSubmit} noValidate>
      <div className="zen-field">
        <label htmlFor="at-description" className="zen-label">
          Description<span className="zen-required"> *</span>
        </label>
        <textarea
          id="at-description"
          className="zen-input zen-textarea"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={!!fieldErrors.description}
        />
        {fieldErrors.description && (
          <span className="zen-field-error" role="alert">{fieldErrors.description}</span>
        )}
      </div>

      <div className="zen-field">
        <label htmlFor="at-result" className="zen-label">Result</label>
        <textarea
          id="at-result"
          className="zen-input zen-textarea"
          rows={2}
          maxLength={2000}
          value={result}
          onChange={(e) => setResult(e.target.value)}
        />
      </div>

      <div className="zen-field">
        <label htmlFor="at-assignee" className="zen-label">Assignee</label>
        <select
          id="at-assignee"
          className="zen-select"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="zen-field">
        <label htmlFor="at-date" className="zen-label">Action date &amp; time</label>
        <input
          id="at-date"
          type="datetime-local"
          className="zen-input"
          value={actionDate}
          max={nowLocalDateTime()}
          onChange={(e) => setActionDate(e.target.value)}
          aria-invalid={!!fieldErrors.actionDate}
        />
        {fieldErrors.actionDate && (
          <span className="zen-field-error" role="alert">{fieldErrors.actionDate}</span>
        )}
      </div>

      <div className="zen-field">
        <label className="zen-check">
          <input
            type="checkbox"
            checked={followUpRequired}
            onChange={(e) => setFollowUpRequired(e.target.checked)}
          />
          Follow-up required
        </label>
      </div>

      {followUpRequired && (
        <div className="zen-field">
          <label htmlFor="at-followup-note" className="zen-label">
            Follow-up note<span className="zen-required"> *</span>
          </label>
          <textarea
            id="at-followup-note"
            className="zen-input zen-textarea"
            rows={2}
            maxLength={1000}
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            aria-invalid={!!fieldErrors.followUpNote}
          />
          {fieldErrors.followUpNote && (
            <span className="zen-field-error" role="alert">{fieldErrors.followUpNote}</span>
          )}
        </div>
      )}

      <div className="zen-field">
        <label htmlFor="at-attach-notes" className="zen-label">Attachment notes</label>
        <textarea
          id="at-attach-notes"
          className="zen-input zen-textarea"
          rows={2}
          maxLength={500}
          value={attachmentNotes}
          onChange={(e) => setAttachmentNotes(e.target.value)}
        />
      </div>

      {formError && <p className="zen-field-error" role="alert">{formError}</p>}

      <div className="zen-btn-row">
        <button
          type="button"
          className="zen-btn zen-btn-secondary"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="zen-btn zen-btn-primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Saving…" : "Save Action"}
        </button>
      </div>
    </form>
  );
}

// ── One action row (view + inline edit for OPEN, read-only otherwise) ────────────
function ActionRow({
  action,
  ticketId,
  mode,
  assignees,
  onChanged,
}: {
  action: ActionTaken;
  ticketId: number;
  mode: "staff" | "requester";
  assignees: Assignee[];
  onChanged: () => void;
}) {
  const editable = mode === "staff" && action.status === "OPEN";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string>(action.assignee ? String(action.assignee.id) : "");

  // Edit drafts
  const [descDraft, setDescDraft] = useState(action.description);
  const [resultDraft, setResultDraft] = useState(action.result ?? "");
  const [followUpDraft, setFollowUpDraft] = useState(action.followUpRequired);
  const [followUpNoteDraft, setFollowUpNoteDraft] = useState(action.followUpNote ?? "");
  const [attachDraft, setAttachDraft] = useState(action.attachmentNotes ?? "");

  async function run(payload: PatchActionPayload) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await patchStaffAction(ticketId, action.id, {
        ...payload,
        expectedUpdatedAt: action.updatedAt,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleComplete() {
    const r = resultDraft.trim();
    if (!r) {
      setError("Result is required to complete this action.");
      return;
    }
    const payload: PatchActionPayload = { status: "COMPLETED" };
    if (r !== (action.result ?? "")) payload.result = r;
    run(payload);
  }

  function handleSaveEdit() {
    if (followUpDraft && !followUpNoteDraft.trim()) {
      setError("Follow-up note is required when follow-up is checked.");
      return;
    }
    run({
      description: descDraft.trim(),
      result: resultDraft.trim() || undefined,
      followUpRequired: followUpDraft,
      followUpNote: followUpDraft ? followUpNoteDraft.trim() : "",
      attachmentNotes: attachDraft.trim() || undefined,
    });
  }

  return (
    <li className="at-row" data-testid={`action-row-${action.id}`}>
      <div className="at-row-head">
        <ActionStatusBadge status={action.status} />
        {action.followUpRequired && <span className="at-chip">Follow-up</span>}
        <time className="zen-muted at-date" dateTime={action.actionDate}>
          {new Date(action.actionDate).toLocaleString()}
        </time>
      </div>

      {editing ? (
        <div className="at-row-edit">
          <div className="zen-field">
            <label htmlFor={`at-edit-desc-${action.id}`} className="zen-label">Description</label>
            <textarea
              id={`at-edit-desc-${action.id}`}
              className="zen-input zen-textarea"
              rows={2}
              maxLength={2000}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
            />
          </div>
          <div className="zen-field">
            <label htmlFor={`at-edit-result-${action.id}`} className="zen-label">Result</label>
            <textarea
              id={`at-edit-result-${action.id}`}
              className="zen-input zen-textarea"
              rows={2}
              maxLength={2000}
              value={resultDraft}
              onChange={(e) => setResultDraft(e.target.value)}
            />
          </div>
          <label className="zen-check">
            <input
              type="checkbox"
              checked={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.checked)}
            />
            Follow-up required
          </label>
          {followUpDraft && (
            <div className="zen-field">
              <label htmlFor={`at-edit-note-${action.id}`} className="zen-label">Follow-up note</label>
              <textarea
                id={`at-edit-note-${action.id}`}
                className="zen-input zen-textarea"
                rows={2}
                maxLength={1000}
                value={followUpNoteDraft}
                onChange={(e) => setFollowUpNoteDraft(e.target.value)}
              />
            </div>
          )}
          <div className="zen-field">
            <label htmlFor={`at-edit-attach-${action.id}`} className="zen-label">Attachment notes</label>
            <textarea
              id={`at-edit-attach-${action.id}`}
              className="zen-input zen-textarea"
              rows={2}
              maxLength={500}
              value={attachDraft}
              onChange={(e) => setAttachDraft(e.target.value)}
            />
          </div>
          {error && <span className="zen-field-error" role="alert">{error}</span>}
          <div className="zen-btn-row">
            <button className="zen-btn zen-btn-secondary" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>
              Cancel edit
            </button>
            <button className="zen-btn zen-btn-primary" onClick={handleSaveEdit} disabled={busy} aria-busy={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="at-row-body">
          <div className="at-field">
            <span className="zen-label at-field-label">Description</span>
            <span className="at-field-value">{action.description}</span>
          </div>
          {action.result && (
            <div className="at-field">
              <span className="zen-label at-field-label">Result</span>
              <span className="at-field-value">{action.result}</span>
            </div>
          )}
          <div className="at-field">
            <span className="zen-label at-field-label">Performed by</span>
            <span className="at-field-value">{action.performedBy.name}</span>
          </div>
          <div className="at-field">
            <span className="zen-label at-field-label">Assignee</span>
            <span className="at-field-value">{action.assignee ? action.assignee.name : "Unassigned"}</span>
          </div>
          {action.followUpRequired && action.followUpNote && (
            <div className="at-field">
              <span className="zen-label at-field-label">Note</span>
              <span className="at-field-value">{action.followUpNote}</span>
            </div>
          )}
          {action.attachmentNotes && (
            <div className="at-field">
              <span className="zen-label at-field-label">Attachments</span>
              <span className="at-field-value">{action.attachmentNotes}</span>
            </div>
          )}
        </div>
      )}

      {editable && !editing && (
        <div className="at-row-actions">
          <div className="at-assign">
            <label htmlFor={`at-assign-${action.id}`} className="zen-sr-only">Assign to</label>
            <select
              id={`at-assign-${action.id}`}
              className="zen-select"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              className="zen-btn zen-btn-secondary"
              onClick={() => run({ assigneeId: assignTarget ? Number(assignTarget) : null })}
              disabled={busy}
            >
              Assign
            </button>
          </div>
          <button className="zen-btn zen-btn-secondary" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
          <button className="zen-btn zen-btn-primary" onClick={handleComplete} disabled={busy} aria-busy={busy}>
            Complete
          </button>
          <button className="zen-btn zen-btn-destructive" onClick={() => run({ status: "CANCELLED" })} disabled={busy}>
            Cancel action
          </button>
        </div>
      )}

      {error && !editing && <span className="zen-field-error" role="alert">{error}</span>}
    </li>
  );
}
