import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

interface Props {
  children: ReactNode;
}

export default function AppShell({ children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const mandatory = user?.mustChangePassword ?? false;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <header className="zen-header">
        <div className="zen-header-inner">
          <NavLink to={user ? roleHome(user.role) : "/login"} className="zen-logo-btn">
            TokTickIT
          </NavLink>

          {!mandatory && (
            <nav className="zen-nav" aria-label="Main navigation">
              {user?.role === "REQUESTER" && (
                <>
                  <NavLink
                    to="/my-tickets"
                    className={({ isActive }) =>
                      `zen-nav-link${isActive ? " zen-nav-link--active" : ""}`
                    }
                  >
                    My Tickets
                  </NavLink>
                  <NavLink
                    to="/tickets/new"
                    className={({ isActive }) =>
                      `zen-nav-link${isActive ? " zen-nav-link--active" : ""}`
                    }
                  >
                    Create Ticket
                  </NavLink>
                </>
              )}
              {user?.role === "IT_STAFF" && (
                <NavLink
                  to="/staff/queue"
                  className={({ isActive }) =>
                    `zen-nav-link${isActive ? " zen-nav-link--active" : ""}`
                  }
                >
                  Ticket Queue
                </NavLink>
              )}
              {user?.role === "ADMIN" && (
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `zen-nav-link${isActive ? " zen-nav-link--active" : ""}`
                  }
                >
                  User Management
                </NavLink>
              )}
            </nav>
          )}

          <div className="zen-header-right">
            {/* Mobile menu toggle */}
            <button
              className="zen-mobile-menu-btn zen-btn-tertiary"
              aria-expanded={menuOpen}
              aria-label="Menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰ Menu
            </button>

            {/* Desktop user area */}
            <div className={`zen-user-area${menuOpen ? " zen-user-area--open" : ""}`}>
              {user && (
                <>
                  <span className="zen-user-name">{user.name}</span>
                  <span className={roleBadgeClass(user.role)}>{roleLabel(user.role)}</span>
                </>
              )}
              {!mandatory && (
                <NavLink
                  to="/change-password"
                  className="zen-btn zen-btn-tertiary"
                  onClick={() => setMenuOpen(false)}
                >
                  Change Password
                </NavLink>
              )}
              <button
                className="zen-btn zen-btn-tertiary"
                onClick={() => { setMenuOpen(false); handleLogout(); }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="zen-main">
        {children}
      </main>
    </>
  );
}

function roleHome(role: string): string {
  if (role === "IT_STAFF") return "/staff/queue";
  if (role === "ADMIN") return "/admin/users";
  return "/my-tickets";
}
