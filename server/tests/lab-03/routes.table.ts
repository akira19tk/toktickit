// Route authorization table — one entry per API route that requires authentication.
// Used by API-16 (no-session → 401), API-17 (Requester on staff/admin → 403),
// API-18 (Staff/Admin on Requester routes → 403), API-19 (Staff on admin → 403).
//
// allowedRoles: roles that may call this route.
//   [] means any authenticated role (REQUESTER, IT_STAFF, or ADMIN).
//   Non-empty means the listed roles only; any other authenticated role gets 403.
//
// requesterOwnership: true means a non-owner Requester gets 404 (not 403) for
//   another user's resource. Used in API-20.
//
// Later Issues append their routes here. API-16..19 automatically gain coverage.

export type RouteEntry = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; // concrete path; numeric ids may be placeholders (e.g. /api/tickets/1)
  allowedRoles: ("REQUESTER" | "IT_STAFF" | "ADMIN")[]; // [] = any authenticated role
  requesterOwnership: boolean;
};

export const routes: RouteEntry[] = [
  // ── Auth (any authenticated role) ──────────────────────────────────────────
  { method: "GET",    path: "/api/auth/me",                                 allowedRoles: [],              requesterOwnership: false },
  { method: "POST",   path: "/api/auth/change-password",                    allowedRoles: [],              requesterOwnership: false },

  // ── Reference data (any authenticated role) ────────────────────────────────
  { method: "GET",    path: "/api/categories",                              allowedRoles: [],              requesterOwnership: false },
  { method: "GET",    path: "/api/related-systems",                         allowedRoles: [],              requesterOwnership: false },

  // ── Requester ticket routes (REQUESTER only) ───────────────────────────────
  { method: "POST",   path: "/api/tickets",                                 allowedRoles: ["REQUESTER"],   requesterOwnership: false },
  { method: "GET",    path: "/api/tickets",                                 allowedRoles: ["REQUESTER"],   requesterOwnership: false },
  { method: "GET",    path: "/api/tickets/1",                               allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "POST",   path: "/api/tickets/1/attachments",                   allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "GET",    path: "/api/tickets/1/attachments/1/download",        allowedRoles: ["REQUESTER"],   requesterOwnership: true  },
  { method: "DELETE", path: "/api/tickets/1/attachments/1",                 allowedRoles: ["REQUESTER"],   requesterOwnership: true  },

  // ── Staff routes (IT_STAFF only, some also ADMIN read-only) ───────────────
  // Appended by Issue #25 (Stage E). Examples:
  //   { method: "GET",  path: "/api/staff/tickets",           allowedRoles: ["IT_STAFF", "ADMIN"], requesterOwnership: false },
  //   { method: "POST", path: "/api/staff/tickets/1/claim",   allowedRoles: ["IT_STAFF"],          requesterOwnership: false },

  // ── Admin routes (ADMIN only) ─────────────────────────────────────────────
  // Appended by Issue #26 (Stage F). Examples:
  //   { method: "GET",  path: "/api/admin/users",             allowedRoles: ["ADMIN"],             requesterOwnership: false },
];
