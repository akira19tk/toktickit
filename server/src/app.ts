// Builds the Express app. Kept separate from index.ts (server startup)
// so Supertest can import the app directly without opening a real port.
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import categoriesRouter from "./routes/categories";
import devRequestersRouter from "./routes/dev-requesters";
import relatedSystemsRouter from "./routes/related-systems";
import ticketsRouter from "./routes/tickets";
import staffRouter from "./routes/staff";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import { requireAuth, passwordChangeGate, csrfCheck } from "./middleware/auth";

// All protected routes served by this app.
// Update this list alongside every app.use() change so the route-coverage
// test in authorization.api.test.ts can enforce bidirectional sync with
// routes.table.ts. Paths use abstract Express notation (:param placeholders).
export const REGISTERED_PROTECTED_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  // Auth (any authenticated role)
  { method: "GET",    path: "/api/auth/me" },
  { method: "POST",   path: "/api/auth/change-password" },
  // Reference data (any authenticated role)
  { method: "GET",    path: "/api/categories" },
  { method: "GET",    path: "/api/related-systems" },
  // Requester ticket routes (REQUESTER only)
  { method: "POST",   path: "/api/tickets" },
  { method: "GET",    path: "/api/tickets" },
  { method: "GET",    path: "/api/tickets/:id" },
  { method: "POST",   path: "/api/tickets/:id/attachments" },
  { method: "GET",    path: "/api/tickets/:id/attachments/:attachmentId/download" },
  { method: "DELETE", path: "/api/tickets/:id/attachments/:attachmentId" },
  { method: "GET",    path: "/api/tickets/:id/comments" },
  { method: "POST",   path: "/api/tickets/:id/comments" },
  { method: "POST",   path: "/api/tickets/:id/resolved-indication" },
  // Staff routes — Issue #26 (Ticket Queue); detail/operations appended by Issue #27
  { method: "GET",    path: "/api/staff/tickets" },
  { method: "GET",    path: "/api/staff/assignees" },
  { method: "GET",    path: "/api/staff/tickets/:id" },
  { method: "POST",   path: "/api/staff/tickets/:id/claim" },
  { method: "PATCH",  path: "/api/staff/tickets/:id/owner" },
  { method: "PATCH",  path: "/api/staff/tickets/:id/it-priority" },
  { method: "PATCH",  path: "/api/staff/tickets/:id/status" },
  { method: "GET",    path: "/api/staff/tickets/:id/attachments/:attachmentId/download" },
  { method: "GET",    path: "/api/staff/tickets/:id/comments" },
  { method: "POST",   path: "/api/staff/tickets/:id/comments" },
  { method: "GET",    path: "/api/staff/tickets/:id/notes" },
  { method: "POST",   path: "/api/staff/tickets/:id/notes" },
  // Admin routes — Issue #28 (Administrator User Management), ADMIN only
  { method: "GET",    path: "/api/admin/users" },
  { method: "POST",   path: "/api/admin/users" },
  { method: "PATCH",  path: "/api/admin/users/:id" },
  { method: "POST",   path: "/api/admin/users/:id/initial-password" },
];

export function createApp() {
  const app = express();

  // ── CORS (BR-15) ──────────────────────────────────────────────────────────
  // Only the CLIENT_ORIGIN is allowed with credentials; the Lab 2 wildcard is
  // removed.
  const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  app.use(
    cors({
      // Callback form: cors's string-origin branch emits the configured value
      // unconditionally (no comparison against the request's Origin header).
      // The callback returns false for non-matching and absent Origins so the
      // Access-Control-Allow-Origin header is omitted entirely, satisfying
      // BR-15 / AC-14. Requests without an Origin header (curl, Supertest) are
      // unaffected because cors only invokes the callback when Origin is present.
      origin: (requestOrigin, callback) => {
        if (requestOrigin === allowedOrigin) {
          callback(null, true);   // reflect the matching origin
        } else {
          callback(null, false);  // no CORS header for foreign / absent origins
        }
      },
      credentials: true,
      allowedHeaders: ["X-Requested-With", "Content-Type"],
    })
  );

  app.use(express.json());

  // ── Public routes (no auth required) ─────────────────────────────────────
  app.use("/api/health", healthRouter);

  // ── Auth routes (mixed: login/logout are public with CSRF; me/change-pw need auth)
  // All middleware chains are applied inline inside authRouter.
  app.use("/api/auth", authRouter);

  // ── Removed routes (BR-61) — must return 404 for everyone, before auth ────
  app.use("/api/dev-requesters", devRequestersRouter);

  // ── Global auth stack for everything below ─────────────────────────────
  // Check order: auth (401) → pw-gate (403) → CSRF on mutating methods (403)
  // Role checks are applied per-route in later stages.
  app.use(requireAuth as express.RequestHandler);
  app.use(passwordChangeGate as express.RequestHandler);
  app.use(csrfCheck as express.RequestHandler);

  // ── Protected routes ──────────────────────────────────────────────────────
  app.use("/api/categories", categoriesRouter);
  app.use("/api/related-systems", relatedSystemsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/admin", adminRouter);

  // ── 404 for unknown routes ────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  // ── Global error handler (Express 5 auto-catches async errors) ────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  return app;
}
