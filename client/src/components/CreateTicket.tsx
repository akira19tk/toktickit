// Create Ticket screen — ui-spec.md §10.3
// States: loading (fetch categories/systems) → form (idle/submitting) → success / server-error
import { useEffect, useReducer, useRef } from "react";
import {
  fetchCategories,
  fetchRelatedSystems,
  createTicket,
  ApiValidationError,
  type Category,
  type RelatedSystem,
  type CreatedTicket,
} from "../api";

interface Props {
  onBack?: () => void;
  onSuccess?: (ticket: CreatedTicket) => void;
}

// ── State machine ──────────────────────────────────────────────────────────

interface FormValues {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  summary: string;
  description: string;
}

interface State {
  loadState: "loading" | "error" | "ready";
  categories: Category[];
  systems: RelatedSystem[];
  form: FormValues;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  serverError: string | null;
  successTicket: CreatedTicket | null;
}

type Action =
  | { type: "LOAD_OK"; categories: Category[]; systems: RelatedSystem[] }
  | { type: "LOAD_FAIL" }
  | { type: "FIELD"; name: keyof FormValues; value: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_VALIDATION_FAIL"; errors: Record<string, string> }
  | { type: "SUBMIT_SERVER_ERROR"; message: string }
  | { type: "SUBMIT_SUCCESS"; ticket: CreatedTicket }
  | { type: "RESET_FORM" };

const EMPTY_FORM: FormValues = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOAD_OK":
      return {
        ...state,
        loadState: "ready",
        categories: action.categories,
        systems: action.systems,
      };
    case "LOAD_FAIL":
      return { ...state, loadState: "error" };
    case "FIELD":
      return {
        ...state,
        form: { ...state.form, [action.name]: action.value },
        // Clear the per-field error as the user types
        fieldErrors: { ...state.fieldErrors, [action.name]: "" },
      };
    case "SUBMIT_START":
      return { ...state, submitting: true, fieldErrors: {}, serverError: null };
    case "SUBMIT_VALIDATION_FAIL":
      return { ...state, submitting: false, fieldErrors: action.errors };
    case "SUBMIT_SERVER_ERROR":
      // BR-13 / FR-17: form values are unchanged
      return { ...state, submitting: false, serverError: action.message };
    case "SUBMIT_SUCCESS":
      return { ...state, submitting: false, successTicket: action.ticket };
    case "RESET_FORM":
      return {
        ...state,
        form: EMPTY_FORM,
        fieldErrors: {},
        serverError: null,
        successTicket: null,
      };
    default:
      return state;
  }
}

// ── Client-side validation ─────────────────────────────────────────────────

function validateForm(form: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.categoryId) errors.categoryId = "Category is required";
  if (!form.relatedSystemId) errors.relatedSystemId = "Related system is required";
  if (!form.requestedPriority)
    errors.requestedPriority = "Requested priority is required";

  const summary = form.summary.trim();
  if (!summary) {
    errors.summary = "Summary is required";
  } else if (summary.length < 5 || summary.length > 120) {
    errors.summary = "Summary must be 5–120 characters";
  }

  const description = form.description.trim();
  if (!description) {
    errors.description = "Description is required";
  } else if (description.length < 10 || description.length > 2000) {
    errors.description = "Description must be 10–2000 characters";
  }

  return errors;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CreateTicket({ onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(reducer, {
    loadState: "loading",
    categories: [],
    systems: [],
    form: EMPTY_FORM,
    fieldErrors: {},
    submitting: false,
    serverError: null,
    successTicket: null,
  });

  // Load reference data on mount
  useEffect(() => {
    let active = true;
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([categories, systems]) => {
        if (active) dispatch({ type: "LOAD_OK", categories, systems });
      })
      .catch(() => {
        if (active) dispatch({ type: "LOAD_FAIL" });
      });
    return () => {
      active = false;
    };
  }, []);

  function handleField(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    dispatch({
      type: "FIELD",
      name: e.target.name as keyof FormValues,
      value: e.target.value,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.submitting) return;

    // Client-side validation first (UI-02: no API call on client error)
    const errors = validateForm(state.form);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "SUBMIT_VALIDATION_FAIL", errors });
      return;
    }

    dispatch({ type: "SUBMIT_START" });

    const files = fileInputRef.current?.files
      ? Array.from(fileInputRef.current.files)
      : [];

    try {
      const ticket = await createTicket(
        {
          categoryId: Number(state.form.categoryId),
          relatedSystemId: Number(state.form.relatedSystemId),
          summary: state.form.summary.trim(),
          description: state.form.description.trim(),
          requestedPriority: state.form.requestedPriority as
            | "LOW"
            | "MEDIUM"
            | "HIGH",
          attachments: files,
        },
      );
      dispatch({ type: "SUBMIT_SUCCESS", ticket });
    } catch (err) {
      if (err instanceof ApiValidationError) {
        dispatch({ type: "SUBMIT_SERVER_ERROR", message: "" });
        dispatch({ type: "SUBMIT_VALIDATION_FAIL", errors: err.errors });
      } else {
        dispatch({
          type: "SUBMIT_SERVER_ERROR",
          message: "Something went wrong. Please try again.",
        });
      }
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────

  if (state.loadState === "loading") {
    return (
      <div className="zen-main">
        <div className="zen-card" role="status" aria-live="polite">
          <div className="zen-spinner" aria-label="Loading form data" />
          <p className="zen-muted">Loading form…</p>
        </div>
      </div>
    );
  }

  if (state.loadState === "error") {
    return (
      <div className="zen-main">
        <div className="zen-card">
          <h2 className="zen-section-title">Unable to Load Form</h2>
          <p className="zen-muted">Could not load categories or related systems.</p>
          <button className="zen-btn zen-btn-primary" onClick={onBack}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Success state (ui-spec §10.3) ──────────────────────────────────────

  if (state.successTicket) {
    const t = state.successTicket;
    return (
      <div className="zen-main">
        <div
          className="zen-card zen-success-panel"
          role="status"
          aria-live="polite"
        >
          <span className="zen-icon" aria-hidden="true">✅</span>
          <h2 className="zen-section-title" style={{ color: "var(--color-success)" }}>
            Ticket Created Successfully
          </h2>
          <p className="zen-muted">Your ticket has been submitted.</p>

          <div className="zen-info-banner">
            <strong>Ticket Number:</strong>{" "}
            <span data-testid="ticket-number">{t.ticketNumber}</span>
          </div>
          <div className="zen-info-banner">
            <strong>Ticket Date:</strong>{" "}
            {new Date(t.createdAt).toLocaleString()}
          </div>

          {t.attachmentErrors.length > 0 && (
            <div className="zen-disclaimer-banner" role="alert">
              <strong>Some attachments failed to upload:</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                {t.attachmentErrors.map((e, i) => (
                  <li key={i}>
                    {e.fileName}: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="zen-btn-row">
            <button
              className="zen-btn zen-btn-secondary"
              onClick={() => dispatch({ type: "RESET_FORM" })}
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────

  const fe = state.fieldErrors;

  return (
    <div className="zen-main">
      <div className="zen-card">
        <h2 className="zen-section-title">Create Ticket</h2>

        {state.serverError && (
          <div className="zen-disclaimer-banner" role="alert">
            {state.serverError}
          </div>
        )}

        {/* Validation error summary for screen readers */}
        {Object.keys(fe).length > 0 && (
          <div aria-live="polite" className="zen-sr-only" role="alert">
            Please fix the errors below before submitting.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Read-only generated fields (ui-spec §10.3) ─────────────── */}
          <div className="ct-two-col">
            <div className="zen-field">
              <label className="zen-label">Ticket Number</label>
              <input
                className="zen-input zen-readonly"
                readOnly
                value="Generated after submission"
                tabIndex={0}
              />
            </div>
            <div className="zen-field">
              <label className="zen-label">Ticket Date</label>
              <input
                className="zen-input zen-readonly"
                readOnly
                value="Generated after submission"
                tabIndex={0}
              />
            </div>
          </div>

          {/* ── Classification group ────────────────────────────────────── */}
          <div className="ct-two-col">
            <div className="zen-field">
              <label htmlFor="categoryId" className="zen-label">
                Category<span className="zen-required"> *</span>
              </label>
              <select
                id="categoryId"
                name="categoryId"
                aria-label="Category"
                className={`zen-select${fe.categoryId ? " zen-field-invalid" : ""}`}
                value={state.form.categoryId}
                onChange={handleField}
                aria-describedby={fe.categoryId ? "err-categoryId" : undefined}
              >
                <option value="">— Select category —</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fe.categoryId && (
                <p id="err-categoryId" className="zen-field-error" role="alert">
                  {fe.categoryId}
                </p>
              )}
            </div>

            <div className="zen-field">
              <label htmlFor="relatedSystemId" className="zen-label">
                Related System<span className="zen-required"> *</span>
              </label>
              <select
                id="relatedSystemId"
                name="relatedSystemId"
                aria-label="Related System"
                className={`zen-select${fe.relatedSystemId ? " zen-field-invalid" : ""}`}
                value={state.form.relatedSystemId}
                onChange={handleField}
                aria-describedby={fe.relatedSystemId ? "err-relatedSystemId" : undefined}
              >
                <option value="">— Select system —</option>
                {state.systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {fe.relatedSystemId && (
                <p id="err-relatedSystemId" className="zen-field-error" role="alert">
                  {fe.relatedSystemId}
                </p>
              )}
            </div>

            <div className="zen-field">
              <label htmlFor="requestedPriority" className="zen-label">
                Requested Priority<span className="zen-required"> *</span>
              </label>
              <select
                id="requestedPriority"
                name="requestedPriority"
                aria-label="Requested Priority"
                className={`zen-select${fe.requestedPriority ? " zen-field-invalid" : ""}`}
                value={state.form.requestedPriority}
                onChange={handleField}
                aria-describedby={fe.requestedPriority ? "err-requestedPriority" : undefined}
              >
                <option value="">— Select priority —</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              {fe.requestedPriority && (
                <p id="err-requestedPriority" className="zen-field-error" role="alert">
                  {fe.requestedPriority}
                </p>
              )}
            </div>
          </div>

          {/* ── Summary (full width) ─────────────────────────────────────── */}
          <div className="zen-field">
            <label htmlFor="summary" className="zen-label">
              Summary<span className="zen-required"> *</span>
            </label>
            <input
              id="summary"
              name="summary"
              type="text"
              aria-label="Summary"
              className={`zen-input${fe.summary ? " zen-field-invalid" : ""}`}
              value={state.form.summary}
              onChange={handleField}
              maxLength={120}
              aria-describedby={fe.summary ? "err-summary" : undefined}
            />
            {fe.summary && (
              <p id="err-summary" className="zen-field-error" role="alert">
                {fe.summary}
              </p>
            )}
          </div>

          {/* ── Description (full width, resizable textarea) ─────────────── */}
          <div className="zen-field">
            <label htmlFor="description" className="zen-label">
              Description<span className="zen-required"> *</span>
            </label>
            <textarea
              id="description"
              name="description"
              aria-label="Description"
              className={`zen-input zen-textarea${fe.description ? " zen-field-invalid" : ""}`}
              rows={4}
              value={state.form.description}
              onChange={handleField}
              maxLength={2000}
              aria-describedby={fe.description ? "err-description" : undefined}
            />
            {fe.description && (
              <p id="err-description" className="zen-field-error" role="alert">
                {fe.description}
              </p>
            )}
          </div>

          {/* ── Attachments (optional) ───────────────────────────────────── */}
          <div className="zen-field">
            <label htmlFor="attachments" className="zen-label">
              Attachments
              <span className="zen-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                (JPG, PNG, WEBP, PDF · max 5 MB each · up to 5 files)
              </span>
            </label>
            <input
              id="attachments"
              name="attachments"
              type="file"
              className="zen-input"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              ref={fileInputRef}
            />
          </div>

          {/* ── Buttons ─────────────────────────────────────────────────── */}
          <div className="zen-btn-row">
            <button
              type="button"
              className="zen-btn zen-btn-secondary"
              onClick={() => {
                dispatch({ type: "RESET_FORM" });
                onBack?.();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="zen-btn zen-btn-primary"
              disabled={state.submitting}
              aria-busy={state.submitting}
            >
              {state.submitting ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
