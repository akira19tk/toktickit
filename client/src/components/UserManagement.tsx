// Administrator User Management — ui-spec.md §4.6
// One list screen (table on desktop, cards on mobile) with Create, Edit and
// Set-initial-password dialogs. Role badges match the shell (zen-role-badge).
// The initial password lives only in the dialog's local state and is discarded
// when the dialog unmounts — it is never lifted up, shown back or logged.
import { useEffect, useState } from "react";
import {
  fetchAdminUsers,
  createAdminUser,
  updateAdminUser,
  setUserInitialPassword,
  ApiError,
  type AdminUser,
} from "../api";
import { useAuth } from "../context/AuthContext";
import Dialog from "./Dialog";
import { validatePassword, isPasswordValid } from "../lib/passwordValidator";

const ROLE_OPTIONS: Array<{ value: AdminUser["role"]; label: string }> = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMIN", label: "Administrator" },
];

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

// A friendly, safe banner message for a conflict that is not a field error.
function conflictMessage(err: ApiError): string {
  switch (err.code) {
    case "SELF_DEACTIVATION":
      return "You cannot deactivate your own account.";
    case "LAST_ADMIN":
      return "There must always be at least one active Administrator.";
    case "SELF_PASSWORD_RESET":
      return "Use Change Password to update your own password.";
    default:
      return err.message || "Something went wrong. Please try again.";
  }
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadState, setLoadState] =
    useState<"loading" | "success" | "error" | "forbidden">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    fetchAdminUsers({ search: search || undefined, role: roleFilter || undefined })
      .then((data) => {
        if (!active) return;
        setUsers(data);
        setLoadState("success");
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) setLoadState("forbidden");
        else setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [search, roleFilter, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }
  function clearFilters() {
    setSearch("");
    setRoleFilter("");
  }

  const hasFilters = !!(search || roleFilter);

  // ── Forbidden (full page) ──────────────────────────────────────────────────
  if (loadState === "forbidden") {
    return (
      <div className="zen-main">
        <div className="zen-card" data-testid="forbidden-state" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">🔒</span>
          <h2 className="zen-section-title">You don't have access to this page</h2>
          <p className="zen-muted">This area is for Administrators.</p>
        </div>
      </div>
    );
  }

  // ── Error / safe failure (full page) ───────────────────────────────────────
  if (loadState === "error") {
    return (
      <div className="zen-main">
        <div className="zen-card" data-testid="failure-state" style={{ marginTop: 16, textAlign: "center" }}>
          <span className="zen-icon" aria-hidden="true">⚠️</span>
          <h2 className="zen-section-title">Unable to load users</h2>
          <p className="zen-muted">Could not connect to the server.</p>
          <button className="zen-btn zen-btn-primary" onClick={reload}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="zen-main">
      {toast && (
        <div className="um-toast zen-banner zen-banner--success" role="status" aria-live="polite" data-testid="toast">
          {toast}
        </div>
      )}

      <div className="mt-header">
        <h1 className="zen-section-title" style={{ fontSize: 24 }}>User Management</h1>
      </div>

      {/* Toolbar */}
      <div className="mt-filter-row">
        <input
          className="zen-input mt-search"
          type="search"
          placeholder="Search name or email…"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="zen-select mt-filter-select"
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button className="zen-btn zen-btn-primary" onClick={() => setCreateOpen(true)}>
          Create User
        </button>
      </div>

      {loadState === "loading" ? (
        <div className="zen-card" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <div className="zen-spinner" aria-label="Loading users" />
          <p className="zen-muted">Loading users…</p>
        </div>
      ) : (
        <>
          {users.length === 0 && !hasFilters && (
            <div className="zen-card" data-testid="empty-state" style={{ marginTop: 16, textAlign: "center" }}>
              <span className="zen-icon" aria-hidden="true">👥</span>
              <h2 className="zen-section-title">No users yet</h2>
              <p className="zen-muted">Create the first user to get started.</p>
            </div>
          )}

          {users.length === 0 && hasFilters && (
            <div className="zen-card" data-testid="no-results-state" style={{ marginTop: 16, textAlign: "center" }}>
              <span className="zen-icon" aria-hidden="true">🔍</span>
              <h2 className="zen-section-title">No matching users</h2>
              <p className="zen-muted" style={{ marginBottom: 16 }}>No users match your search or role filter.</p>
              <button className="zen-btn zen-btn-secondary" onClick={clearFilters}>Clear</button>
            </div>
          )}

          {users.length > 0 && (
            <div className="zen-card mt-tickets" data-testid="users-table">
              <div className="mt-table-wrap">
                <table className="mt-table" aria-label="Users">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td><span className={roleBadgeClass(u.role)}>{roleLabel(u.role)}</span></td>
                        <td><StatusPill active={u.isActive} /></td>
                        <td>
                          <button
                            className="zen-btn zen-btn-secondary mt-page-btn"
                            onClick={() => setEditing(u)}
                            aria-label={`Edit ${u.name}`}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-cards">
                {users.map((u) => (
                  <div key={u.id} className="mt-card zen-card">
                    <div className="mt-card-row">
                      <span className="mt-card-label">Name</span>
                      <span>{u.name}</span>
                    </div>
                    <div className="mt-card-row">
                      <span className="mt-card-label">Email</span>
                      <span>{u.email}</span>
                    </div>
                    <div className="mt-card-row">
                      <span className="mt-card-label">Role</span>
                      <span className={roleBadgeClass(u.role)}>{roleLabel(u.role)}</span>
                    </div>
                    <div className="mt-card-row">
                      <span className="mt-card-label">Status</span>
                      <StatusPill active={u.isActive} />
                    </div>
                    <div className="mt-card-row">
                      <button
                        className="zen-btn zen-btn-secondary"
                        style={{ width: "100%" }}
                        onClick={() => setEditing(u)}
                        aria-label={`Edit ${u.name}`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={(name) => {
            setCreateOpen(false);
            showToast(`User "${name}" created. They must change the password at first login.`);
            reload();
          }}
        />
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          isSelf={currentUser?.id === editing.id}
          onClose={() => setEditing(null)}
          onRequestPassword={(u) => {
            setEditing(null);
            setPasswordTarget(u);
          }}
          onSuccess={(name) => {
            setEditing(null);
            showToast(`Changes to "${name}" saved.`);
            reload();
          }}
        />
      )}

      {passwordTarget && (
        <SetPasswordDialog
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSuccess={(name) => {
            setPasswordTarget(null);
            showToast(`Initial password set for "${name}". They must change it at next login.`);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ── Active / Inactive pill (text always accompanies colour) ──────────────────
function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="mt-badge" style={{ background: active ? "#0B7A46" : "#6B7280" }}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ── Shared password rules list + field ───────────────────────────────────────
function PasswordRules() {
  return (
    <ul className="zen-pw-rules" aria-label="Password requirements">
      <li>At least 8 characters</li>
      <li>At most 72 bytes (about 24 Thai characters)</li>
      <li>At least one letter and one digit</li>
    </ul>
  );
}

// ── Create User dialog ───────────────────────────────────────────────────────
function CreateUserDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("REQUESTER");
  const [isActive, setIsActive] = useState(true);
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    // Client-side checks for instant feedback (server is authoritative).
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    const pwErrors = validatePassword(initialPassword);
    if (!isPasswordValid(pwErrors)) {
      next.initialPassword =
        pwErrors.tooShort ?? pwErrors.tooManyBytes ?? pwErrors.noLetter ?? pwErrors.noDigit ?? "Invalid password.";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    setBanner(null);
    try {
      const created = await createAdminUser({
        name: name.trim(),
        email: email.trim(),
        role,
        isActive,
        initialPassword,
      });
      // Never retain the password after a successful submit.
      setInitialPassword("");
      onSuccess(created.name);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else if (err instanceof ApiError) setBanner(conflictMessage(err));
      else setBanner("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Create User" onClose={onClose} locked={busy}>
      {banner && <div className="zen-banner zen-banner--error" role="alert">{banner}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="zen-field">
          <label htmlFor="cu-name" className="zen-label">Name <span className="zen-required">*</span></label>
          <input id="cu-name" className="zen-input" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <span className="zen-field-error" role="alert">{errors.name}</span>}
        </div>
        <div className="zen-field">
          <label htmlFor="cu-email" className="zen-label">Email <span className="zen-required">*</span></label>
          <input id="cu-email" className="zen-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <span className="zen-field-error" role="alert">{errors.email}</span>}
        </div>
        <div className="zen-field">
          <label htmlFor="cu-role" className="zen-label">Role</label>
          <select id="cu-role" className="zen-select" value={role} onChange={(e) => setRole(e.target.value as AdminUser["role"])}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {errors.role && <span className="zen-field-error" role="alert">{errors.role}</span>}
        </div>
        <div className="zen-field">
          <label>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
        </div>
        <div className="zen-field">
          <label htmlFor="cu-password" className="zen-label">Initial password <span className="zen-required">*</span></label>
          <div className="zen-input-wrap">
            <input
              id="cu-password"
              className="zen-input"
              type={showPassword ? "text" : "password"}
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button type="button" className="zen-show-hide-btn" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <PasswordRules />
          {errors.initialPassword && <span className="zen-field-error" role="alert">{errors.initialPassword}</span>}
        </div>
        <div className="zen-btn-row">
          <button type="button" className="zen-btn zen-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="zen-btn zen-btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : "Create User"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Edit User dialog ──────────────────────────────────────────────────────────
function EditUserDialog({
  user,
  isSelf,
  onClose,
  onRequestPassword,
  onSuccess,
}: {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onRequestPassword: (u: AdminUser) => void;
  onSuccess: (name: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<AdminUser["role"]>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    setBanner(null);
    try {
      const updated = await updateAdminUser(user.id, {
        name: name.trim(),
        email: email.trim(),
        role,
        isActive,
      });
      onSuccess(updated.name);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else if (err instanceof ApiError) setBanner(conflictMessage(err));
      else setBanner("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Edit ${user.name}`} onClose={onClose} locked={busy}>
      {banner && <div className="zen-banner zen-banner--error" role="alert">{banner}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="zen-field">
          <label htmlFor="eu-name" className="zen-label">Name <span className="zen-required">*</span></label>
          <input id="eu-name" className="zen-input" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <span className="zen-field-error" role="alert">{errors.name}</span>}
        </div>
        <div className="zen-field">
          <label htmlFor="eu-email" className="zen-label">Email <span className="zen-required">*</span></label>
          <input id="eu-email" className="zen-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <span className="zen-field-error" role="alert">{errors.email}</span>}
        </div>
        <div className="zen-field">
          <label htmlFor="eu-role" className="zen-label">Role</label>
          <select id="eu-role" className="zen-select" value={role} onChange={(e) => setRole(e.target.value as AdminUser["role"])}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {errors.role && <span className="zen-field-error" role="alert">{errors.role}</span>}
        </div>
        <div className="zen-field">
          <label title={isSelf ? "You cannot deactivate your own account." : undefined}>
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={(e) => setIsActive(e.target.checked)}
            /> Active
          </label>
          {isSelf && (
            <span className="zen-muted" style={{ display: "block", fontSize: 12 }}>
              You cannot deactivate your own account.
            </span>
          )}
        </div>
        {/* Set-initial-password applies to another user only (BR-54: own account
            is 409 SELF_PASSWORD_RESET), so it is omitted on your own row. Uses the
            secondary style — zen-btn-tertiary is white-on-dark header styling and
            would be invisible on the light dialog. */}
        {!isSelf && (
          <div className="zen-field">
            <button type="button" className="zen-btn zen-btn-secondary" onClick={() => onRequestPassword(user)} disabled={busy}>
              Set new initial password
            </button>
          </div>
        )}
        <div className="zen-btn-row">
          <button type="button" className="zen-btn zen-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="zen-btn zen-btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Set initial password dialog ──────────────────────────────────────────────
function SetPasswordDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const pwErrors = validatePassword(newPassword);
    if (!isPasswordValid(pwErrors)) {
      setFieldError(
        pwErrors.tooShort ?? pwErrors.tooManyBytes ?? pwErrors.noLetter ?? pwErrors.noDigit ?? "Invalid password."
      );
      return;
    }

    setBusy(true);
    setFieldError(null);
    setBanner(null);
    try {
      await setUserInitialPassword(user.id, newPassword);
      // Never retain the password after a successful submit.
      setNewPassword("");
      onSuccess(user.name);
    } catch (err) {
      if (err instanceof ApiError && err.errors?.initialPassword) setFieldError(err.errors.initialPassword);
      else if (err instanceof ApiError) setBanner(conflictMessage(err));
      else setBanner("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Set initial password for ${user.name}`} onClose={onClose} locked={busy}>
      {banner && <div className="zen-banner zen-banner--error" role="alert">{banner}</div>}
      <p className="zen-muted">
        The user will be required to change this password the next time they sign in, and all their
        current sessions will be ended.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="zen-field">
          <label htmlFor="sp-password" className="zen-label">New initial password <span className="zen-required">*</span></label>
          <div className="zen-input-wrap">
            <input
              id="sp-password"
              className="zen-input"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button type="button" className="zen-show-hide-btn" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <PasswordRules />
          {fieldError && <span className="zen-field-error" role="alert">{fieldError}</span>}
        </div>
        <div className="zen-btn-row">
          <button type="button" className="zen-btn zen-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="zen-btn zen-btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : "Set Password"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
