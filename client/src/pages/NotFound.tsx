import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}

export default function NotFound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dest = user ? roleHome(user.role) : "/login";

  return (
    <main className="zen-error-page">
      <div className="zen-card zen-error-card">
        <span className="zen-error-icon" aria-hidden="true">🔍</span>
        <h1 className="zen-section-title">Page not found</h1>
        <p className="zen-muted">
          The page you're looking for doesn't exist or has been moved.
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
