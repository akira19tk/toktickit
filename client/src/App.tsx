import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PublicOnlyRoute, RequireAuth, RequireRole, ShellWhenSignedIn } from "./components/RouteGuard";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import StaffQueuePage from "./pages/StaffQueuePage";
import StaffTicketDetailPlaceholder from "./pages/StaffTicketDetailPlaceholder";
import AdminUsersPlaceholder from "./pages/AdminUsersPlaceholder";
import {
  CreateTicketPage,
  MyTicketsPage,
  TicketDetailPage,
} from "./pages/RequesterPages";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public: signed-in users are redirected to their home */}
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />

          {/* Change password: any authenticated user (including mustChangePassword) */}
          <Route
            path="/change-password"
            element={
              <RequireAuth>
                <AppShell>
                  <ChangePassword />
                </AppShell>
              </RequireAuth>
            }
          />

          {/* Requester routes */}
          <Route
            path="/my-tickets"
            element={
              <RequireRole role="REQUESTER">
                <AppShell>
                  <MyTicketsPage />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/tickets/new"
            element={
              <RequireRole role="REQUESTER">
                <AppShell>
                  <CreateTicketPage />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <RequireRole role="REQUESTER">
                <AppShell>
                  <TicketDetailPage />
                </AppShell>
              </RequireRole>
            }
          />

          {/* IT Staff routes — Queue (Issue #26); Detail placeholder until Issue #27 */}
          <Route
            path="/staff/queue"
            element={
              <RequireRole role="IT_STAFF">
                <AppShell>
                  <StaffQueuePage />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/staff/tickets/:id"
            element={
              <RequireRole role="IT_STAFF">
                <AppShell>
                  <StaffTicketDetailPlaceholder />
                </AppShell>
              </RequireRole>
            }
          />

          {/* Admin routes — placeholder until Issue #28 */}
          <Route
            path="/admin/users"
            element={
              <RequireRole role="ADMIN">
                <AppShell>
                  <AdminUsersPlaceholder />
                </AppShell>
              </RequireRole>
            }
          />

          {/* Forbidden: only reached by signed-in users; RequireAuth ensures
              unauthenticated direct visits redirect to /login instead. */}
          <Route
            path="/forbidden"
            element={
              <RequireAuth>
                <AppShell>
                  <Forbidden />
                </AppShell>
              </RequireAuth>
            }
          />

          {/* Not Found: shell for signed-in users, standalone when signed out. */}
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
    </BrowserRouter>
  );
}
