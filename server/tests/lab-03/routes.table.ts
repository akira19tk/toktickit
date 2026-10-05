// Route authorization table — one entry per API route that requires authentication.
// Used by API-16 (no-session → 401), API-17 (Requester on staff/admin → 403),
// API-18 (Staff/Admin on Requester routes → 403), API-19 (Staff on admin → 403).
//
// path: abstract Express-style path with :param placeholders (e.g. /api/tickets/:id).
//   Tests substitute placeholders with 99999. Paths here MUST match the keys
//   in REGISTERED_PROTECTED_ROUTES exported from src/app.ts — the coverage
//   test enforces this bidirectionally.
//
// allowedRoles: roles that may call this route.
//   [] means any authenticated role (REQUESTER, IT_STAFF, or ADMIN).
//   Non-empty means the listed roles only; any other authenticated role gets 403.
//
// requesterOwnership: true means a non-owner Requester gets 404 (not 403) for
//   another user's resource. Used in API-20.
//
// Later Issues append their routes here. API-16..19 automatically gain coverage
// as soon as new rows are added.

export type RouteEntry = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  allowedRoles: ("REQUESTER" | "IT_STAFF" | "ADMIN")[]; // [] = any authenticated role
  requesterOwnership: boolean;
};

export const routes: RouteEntry[] = [
  // ── Auth (any authenticated role) ──────────────────────────────────────────
  { method: "GET",    path: "/api/auth/me",                                          allowedRoles: [],              requesterOwnership: false },
  { method: "POST",   path: "/api/auth/change-password",                             allowedRoles: [],              requesterOwnership: false },

  // ── Reference data (any authenticated role) ────────────────────────────────
  { method: "GET",    path: "/api/categories",                                       allowedRoles: [],              requesterOwnership: false },
  { method: "GET",    path: "/api/related-systems",                                  allowedRoles: [],              requesterOwnership: false },

  // ── Requester ticket routes (REQUESTER only) ───────────────────────────────
  { method: "POST",   path: "/api/tickets",                                          allowedRoles: ["REQUESTER"],   requesterOwnership: false },
  { method: "GET",    path: "/api/tickets",                                          allowedRoles: ["REQUESTER"],   requesterOwnership: false },
  { method: "GET",    path: "/api/tickets/:id",                                      allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "POST",   path: "/api/tickets/:id/attachments",                          allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "GET",    path: "/api/tickets/:id/attachments/:attachmentId/download",   allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "DELETE", path: "/api/tickets/:id/attachments/:attachmentId",            allowedRoles: ["REQUESTER"],   requesterOwnership: true  },

  // ── Requester comment and resolution routes (REQUESTER only) ─────────────
  { method: "GET",  path: "/api/tickets/:id/comments",            allowedRoles: ["REQUESTER"], requesterOwnership: true },
  { method: "POST", path: "/api/tickets/:id/comments",            allowedRoles: ["REQUESTER"], requesterOwnership: true },
  { method: "POST", path: "/api/tickets/:id/resolved-indication", allowedRoles: ["REQUESTER"], requesterOwnership: true },

  // ── Staff routes (IT_STAFF only, some also ADMIN read-only) ───────────────
  // Issue #26 (Staff Queue) — detail/operations appended by Issue #27.
  { method: "GET",  path: "/api/staff/tickets",   allowedRoles: ["IT_STAFF", "ADMIN"], requesterOwnership: false },
  { method: "GET",  path: "/api/staff/assignees", allowedRoles: ["IT_STAFF"],          requesterOwnership: false },
  // Issue #27 (Staff Ticket Detail + operations). GET detail allows ADMIN
  // read-only; every mutation is IT_STAFF only; comments/notes added in Stage 2.
  { method: "GET",   path: "/api/staff/tickets/:id",                                     allowedRoles: ["IT_STAFF", "ADMIN"], requesterOwnership: false },
  { method: "POST",  path: "/api/staff/tickets/:id/claim",                               allowedRoles: ["IT_STAFF"],          requesterOwnership: false },
  { method: "PATCH", path: "/api/staff/tickets/:id/owner",                               allowedRoles: ["IT_STAFF"],          requesterOwnership: false },
  { method: "PATCH", path: "/api/staff/tickets/:id/it-priority",                         allowedRoles: ["IT_STAFF"],          requesterOwnership: false },
  { method: "PATCH", path: "/api/staff/tickets/:id/status",                              allowedRoles: ["IT_STAFF"],          requesterOwnership: false },
  { method: "GET",   path: "/api/staff/tickets/:id/attachments/:attachmentId/download",  allowedRoles: ["IT_STAFF"],          requesterOwnership: false },

  // ── Admin routes (ADMIN only) ─────────────────────────────────────────────
  // PARTIAL — Issue #28 (Administrator User Management) appends entries here.
  // Until then API-19 iterates zero rows.
  // Example future entries:
  //   { method: "GET",  path: "/api/admin/users",           allowedRoles: ["ADMIN"],             requesterOwnership: false },
];
