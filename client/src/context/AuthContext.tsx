import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  changePasswordApi,
  fetchMe,
  loginApi,
  logoutApi,
  setUnauthorizedHandler,
  type User,
} from "../api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  // True after a 401 ended the session mid-use (BR-66). Login reads this so the
  // "session ended" banner survives whichever redirect reaches /login — the
  // handler's navigate-with-state OR a route guard's stateless <Navigate>.
  sessionEnded: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const navigate = useNavigate();

  // react-router's useNavigate() returns a NEW function identity on every
  // navigation. Reading it through a ref keeps handleSessionEnded stable, so the
  // startup-probe effect below runs exactly once on mount instead of re-running
  // (and re-firing fetchMe) on every navigation — which would log the user out
  // on any transient navigation-time 401 and spam /auth/me.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // The 401 handler (BR-66): clear auth and return to Login with the
  // session-ended banner. Stable identity (empty deps, navigate via ref). It is
  // registered only once a session is known to exist — after a successful
  // startup probe, a form login, or a password change — and the probe/login
  // 401s are excluded in api.ts, so a signed-out or post-logout load never
  // surfaces the banner.
  const handleSessionEnded = useCallback(() => {
    setSessionEnded(true);
    setUser(null);
    // Navigate explicitly too, for the common case where no guard intercepts;
    // the context flag above is what guarantees the banner regardless of which
    // redirect actually lands on /login.
    navigateRef.current("/login", { state: { sessionEnded: true } });
  }, []);

  useEffect(() => {
    // BR-61: delete the legacy Development Requester key at startup
    sessionStorage.removeItem("toktickit_requester");

    let active = true;
    fetchMe()
      .then((u) => {
        if (!active) return;
        setUser(u);
        setUnauthorizedHandler(handleSessionEnded);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      // Clear the handler on unmount so stale closures cannot fire.
      setUnauthorizedHandler(null);
    };
  }, [handleSessionEnded]);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const u = await loginApi(email, password);
      setSessionEnded(false);
      setUser(u);
      // BR-66: a user who signs in through the Login form without a page reload
      // (startup probe returned 401, so the handler was never registered) must
      // still get it — otherwise a later 401 would silently fail to redirect.
      setUnauthorizedHandler(handleSessionEnded);
      return u;
    },
    [handleSessionEnded]
  );

  const logout = useCallback(async () => {
    await logoutApi();
    // Clear the handler before nulling the user so any stale in-flight request
    // that returns 401 after this point does not show the "session ended" banner.
    setUnauthorizedHandler(null);
    // A deliberate logout is not a session-ended event — clear the flag.
    setSessionEnded(false);
    setUser(null);
  }, []);

  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
      confirmPassword: string
    ) => {
      const updated = await changePasswordApi(
        currentPassword,
        newPassword,
        confirmPassword
      );
      setUser((prev) =>
        prev ? { ...prev, mustChangePassword: updated.mustChangePassword } : null
      );
      // BR-66: keep the handler registered after a password change too (covers a
      // first-login change reached via form login, before any 200 probe ran).
      setUnauthorizedHandler(handleSessionEnded);
    },
    [handleSessionEnded]
  );

  return (
    <AuthContext.Provider value={{ user, loading, sessionEnded, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export type { User };
