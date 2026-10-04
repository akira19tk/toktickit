import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}

export default function Forbidden() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dest = user ? roleHome(user.role) : "/login";

  return (
    <main className="zen-error-page">
      <div className="zen-card zen-error-card">
        <span className="zen-error-icon" aria-hidden="true">🚫</span>
        <h1 className="zen-section-title">You don't have access to this page</h1>
        <p className="zen-muted">
          Your role does not allow you to view this page. If you believe this is an error,
          contact an administrator.
        </p>
        <button
          className="zen-btn zen-btn-primary"
          onClick={() => navigate(dest, { replace: true })}
        >
          {user ? "Go to my home" : "Sign in"}
        </button>
      </div>
    </main>
  );
}
