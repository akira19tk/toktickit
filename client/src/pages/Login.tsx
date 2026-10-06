import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api";

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}

interface LocationState {
  sessionEnded?: boolean;
}

export default function Login() {
  const { login, sessionEnded: authSessionEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Show the banner if a 401 ended the session mid-use (context flag, reliable
  // across guard redirects) or if we were navigated here with the state set.
  const sessionEnded =
    authSessionEnded || ((location.state as LocationState)?.sessionEnded ?? false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: typeof fieldErrors = {};
    if (!email.trim()) newErrors.email = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(email.trim())) newErrors.email = "Enter a valid email.";
    if (!password) newErrors.password = "Password is required.";

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setFieldErrors({});
    setBanner(null);
    setSubmitting(true);

    try {
      const user = await login(email.trim(), password);
      navigate(user.mustChangePassword ? "/change-password" : roleHome(user.role), {
        replace: true,
      });
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError) {
        if (err.status === 401) setBanner("Invalid email or password.");
        else if (err.status === 403 && err.code === "ACCOUNT_INACTIVE")
          setBanner("This account is inactive. Contact an administrator.");
        else if (err.status === 429) setBanner("Too many attempts. Try again later.");
        else setBanner("Cannot reach the server. Please try again.");
      } else {
        setBanner("Cannot reach the server. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="zen-login-page">
      <div className="zen-card zen-login-card">
        <h1 className="zen-login-title">TokTickIT</h1>

        {sessionEnded && !banner && (
          <div role="status" className="zen-banner zen-banner--info" aria-live="polite">
            Your session has ended. Please sign in again.
          </div>
        )}

        {banner && (
          <div role="alert" aria-live="assertive" className="zen-banner zen-banner--error">
            {banner}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="zen-field">
            <label htmlFor="login-email" className="zen-label">
              Email <span className="zen-required" aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              type="email"
              className={`zen-input${fieldErrors.email ? " zen-field-invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
              aria-required="true"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            />
            {fieldErrors.email && (
              <span id="login-email-error" className="zen-field-error" role="alert">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className="zen-field">
            <label htmlFor="login-password" className="zen-label">
              Password <span className="zen-required" aria-hidden="true">*</span>
            </label>
            <div className="zen-input-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className={`zen-input${fieldErrors.password ? " zen-field-invalid" : ""}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                aria-required="true"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              />
              <button
                type="button"
                className="zen-show-hide-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.password && (
              <span id="login-password-error" className="zen-field-error" role="alert">
                {fieldErrors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="zen-btn zen-btn-primary zen-btn-full"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
