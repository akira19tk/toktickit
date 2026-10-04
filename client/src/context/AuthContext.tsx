import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const navigate = useNavigate();

  useEffect(() => {
    // BR-61: delete the legacy Development Requester key at startup
    sessionStorage.removeItem("toktickit_requester");

    fetchMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => {
        setLoading(false);
        // Register the 401 handler only after the initial probe so the probe's
        // own 401 does not trigger a session-ended redirect (BR-66).
        setUnauthorizedHandler(() => {
          setUser(null);
          navigate("/login", { state: { sessionEnded: true } });
        });
      });

    return () => {
      // Clear the handler on unmount so stale closures cannot fire.
      setUnauthorizedHandler(null);
    };
  }, [navigate]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const u = await loginApi(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
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
    },
    []
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
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
