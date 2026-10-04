import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}

// Redirect authenticated users away from /login.
// If mustChangePassword → /change-password; otherwise → role's home.
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <>{children}</>;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={roleHome(user.role)} replace />;
}

// Require authentication; unauthenticated → /login.
// mustChangePassword does NOT block this route (used for /change-password itself).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Require authentication + correct role.
// Unauthenticated → /login; mustChangePassword → /change-password; wrong role → /forbidden.
export function RequireRole({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
