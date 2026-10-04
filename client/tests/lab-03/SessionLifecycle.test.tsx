// UI-10: session lifecycle / BR-66 — the "session ended" banner appears ONLY
// when a 401 arrives after a session existed, never on a signed-out load or a
// deliberate logout (AC-73).
//
// These tests drive the REAL AuthProvider and the REAL api.ts with global.fetch
// mocked — not a mocked auth state — so they exercise the actual handler
// registration/firing path that the browser hit.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "../../src/context/AuthContext";
import {
  PublicOnlyRoute,
  RequireAuth,
  ShellWhenSignedIn,
} from "../../src/components/RouteGuard";
import AppShell from "../../src/components/AppShell";
import Login from "../../src/pages/Login";
import NotFound from "../../src/pages/NotFound";
import * as api from "../../src/api";

const BANNER = /your session has ended\. please sign in again/i;

const ADMIN = {
  id: 1,
  name: "Admin User",
  email: "admin@example.com",
  role: "ADMIN",
  mustChangePassword: false,
};

interface MockConfig {
  me: number; // status returned by GET /auth/me (the probe)
  meUser?: unknown; // body user when me === 200
  categories?: number; // status returned by GET /categories (a "later" request)
  loginUser?: unknown; // user returned by POST /auth/login
}

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob(),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function installFetch(cfg: MockConfig) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/auth/me")) {
      return cfg.me === 200
        ? jsonResponse(200, { user: cfg.meUser })
        : jsonResponse(401, { code: "UNAUTHENTICATED", error: "No session" });
    }
    if (url.includes("/api/auth/login") && method === "POST") {
      return jsonResponse(200, { user: cfg.loginUser });
    }
    if (url.includes("/api/auth/logout") && method === "POST") {
      return jsonResponse(204, {});
    }
    if (url.includes("/api/categories")) {
      return (cfg.categories ?? 200) === 200
        ? jsonResponse(200, [])
        : jsonResponse(401, { code: "UNAUTHENTICATED", error: "No session" });
    }
    return jsonResponse(404, {});
  }) as unknown as typeof fetch;
}

// A protected page that sends one request on mount. It is only mounted behind a
// guard that waits for the probe, so by the time it fires the handler is already
// registered when a session exists.
function ProbePage() {
  useEffect(() => {
    api.fetchCategories().catch(() => {});
  }, []);
  return <div>Probe Page</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  api.setUnauthorizedHandler(null);
  global.fetch = originalFetch;
});

describe("Session lifecycle (BR-66 / AC-73)", () => {
  it("UI-10: probe 401 on a signed-out load of /abc shows Not Found, no shell, no banner", async () => {
    installFetch({ me: 401 });

    render(
      <MemoryRouter initialEntries={["/abc"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="*"
              element={
                <ShellWhenSignedIn>
                  <NotFound />
                </ShellWhenSignedIn>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument()
    );

    // No shell (standalone Not Found) and no session-ended banner.
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it("UI-10: signed in, clicking Logout goes to /login with no banner", async () => {
    installFetch({ me: 200, meUser: ADMIN });

    render(
      <MemoryRouter initialEntries={["/home"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/home"
              element={
                <RequireAuth>
                  <AppShell>
                    <div>Home Content</div>
                  </AppShell>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Shell visible once the probe resolves with a session.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument()
    );

    await userEvent.setup().click(screen.getByRole("button", { name: /logout/i }));

    // Landed on Login (email field present), and NO session-ended banner.
    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it("UI-10: probe 401, sign in via the form, then a later 401 shows /login WITH the banner", async () => {
    installFetch({ me: 401, loginUser: ADMIN, categories: 401 });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />
            {/* ADMIN home in the real app is /admin/users; this harness routes it to a request-sending page */}
            <Route
              path="/admin/users"
              element={
                <RequireAuth>
                  <ProbePage />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Login form shown (probe returned 401, no banner yet).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // login() registered the handler; the ProbePage request 401 fires it.
    await waitFor(() => expect(screen.getByText(BANNER)).toBeInTheDocument());
  });

  it("UI-10: probe 200, then a later 401 shows /login WITH the banner", async () => {
    installFetch({ me: 200, meUser: ADMIN, categories: 401 });

    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAuth>
                  <ProbePage />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Probe 200 registers the handler; the ProbePage request 401 fires it.
    await waitFor(() => expect(screen.getByText(BANNER)).toBeInTheDocument());
  });
});
