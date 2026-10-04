import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";
import {
  validatePassword,
  isPasswordValid,
  type PasswordErrors,
} from "../lib/passwordValidator";

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}

export default function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const mandatory = user?.mustChangePassword ?? false;

  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientErrors, setClientErrors] = useState<PasswordErrors>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    setServerErrors({});

    const pwdErrors = validatePassword(newPwd, {
      currentPassword: current,
      confirmPassword: confirm,
    });
    setClientErrors(pwdErrors);
    if (!isPasswordValid(pwdErrors)) return;

    setSubmitting(true);
    try {
      await changePassword(current, newPwd, confirm);
      setSuccess(true);
      setTimeout(() => {
        navigate(user ? roleHome(user.role) : "/my-tickets", { replace: true });
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.errors && Object.keys(err.errors).length > 0) {
          setServerErrors(err.errors);
        } else if (err.status === 429) {
          setBanner("Too many attempts. Try again later.");
        } else {
          setBanner("Cannot reach the server. Please try again.");
        }
      } else {
        setBanner("Cannot reach the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (field: string) =>
    serverErrors[field] ?? undefined;

  return (
    <main className="zen-change-password-page">
      <div className="zen-card zen-cp-card">
        <h1 className="zen-section-title">
          {mandatory
            ? "You must choose a new password before continuing."
            : "Change Password"}
        </h1>

        <ul className="zen-pw-rules" aria-label="Password requirements">
          <li>At least 8 characters</li>
          <li>At most 72 bytes (about 24 Thai characters)</li>
          <li>At least one letter and one digit</li>
          <li>Different from the current password</li>
        </ul>

        {banner && (
          <div role="alert" aria-live="assertive" className="zen-banner zen-banner--error">
            {banner}
          </div>
        )}

        {success && (
          <div role="status" className="zen-banner zen-banner--success" aria-live="polite">
            Password changed. Redirecting…
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="zen-field">
            <label htmlFor="cp-current" className="zen-label">
              Current password <span className="zen-required" aria-hidden="true">*</span>
            </label>
            <input
              id="cp-current"
              type="password"
              className={`zen-input${fieldError("currentPassword") ? " zen-field-invalid" : ""}`}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
              aria-required="true"
              aria-invalid={!!fieldError("currentPassword")}
              aria-describedby={fieldError("currentPassword") ? "cp-current-error" : undefined}
            />
            {fieldError("currentPassword") && (
              <span id="cp-current-error" className="zen-field-error" role="alert">
                {fieldError("currentPassword")}
              </span>
            )}
          </div>

          <div className="zen-field">
            <label htmlFor="cp-new" className="zen-label">
              New password <span className="zen-required" aria-hidden="true">*</span>
            </label>
            <input
              id="cp-new"
              type="password"
              className={`zen-input${
                (clientErrors.tooShort ||
                  clientErrors.tooManyBytes ||
                  clientErrors.noLetter ||
                  clientErrors.noDigit ||
                  clientErrors.sameAsCurrent ||
                  fieldError("newPassword"))
                  ? " zen-field-invalid"
                  : ""
              }`}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
              aria-required="true"
              aria-invalid={
                !!(
                  clientErrors.tooShort ||
                  clientErrors.tooManyBytes ||
                  clientErrors.noLetter ||
                  clientErrors.noDigit ||
                  clientErrors.sameAsCurrent ||
                  fieldError("newPassword")
                )
              }
              aria-describedby="cp-new-errors"
            />
            <div id="cp-new-errors" aria-live="polite">
              {clientErrors.tooShort && (
                <span className="zen-field-error" role="alert">{clientErrors.tooShort}</span>
              )}
              {clientErrors.tooManyBytes && (
                <span className="zen-field-error" role="alert">{clientErrors.tooManyBytes}</span>
              )}
              {clientErrors.noLetter && (
                <span className="zen-field-error" role="alert">{clientErrors.noLetter}</span>
              )}
              {clientErrors.noDigit && (
                <span className="zen-field-error" role="alert">{clientErrors.noDigit}</span>
              )}
              {clientErrors.sameAsCurrent && (
                <span className="zen-field-error" role="alert">{clientErrors.sameAsCurrent}</span>
              )}
              {fieldError("newPassword") && (
                <span className="zen-field-error" role="alert">{fieldError("newPassword")}</span>
              )}
            </div>
          </div>

          <div className="zen-field">
            <label htmlFor="cp-confirm" className="zen-label">
              Confirm new password <span className="zen-required" aria-hidden="true">*</span>
            </label>
            <input
              id="cp-confirm"
              type="password"
              className={`zen-input${
                (clientErrors.confirmMismatch || fieldError("confirmPassword"))
                  ? " zen-field-invalid"
                  : ""
              }`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
              aria-required="true"
              aria-invalid={!!(clientErrors.confirmMismatch || fieldError("confirmPassword"))}
              aria-describedby={
                clientErrors.confirmMismatch || fieldError("confirmPassword")
                  ? "cp-confirm-error"
                  : undefined
              }
            />
            {(clientErrors.confirmMismatch || fieldError("confirmPassword")) && (
              <span id="cp-confirm-error" className="zen-field-error" role="alert">
                {clientErrors.confirmMismatch ?? fieldError("confirmPassword")}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="zen-btn zen-btn-primary zen-btn-full"
            disabled={submitting || success}
            aria-busy={submitting}
          >
            {submitting ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </main>
  );
}
