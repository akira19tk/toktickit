// API client wrapper — all functions mockable via vi.spyOn(api, 'fnName').

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// ── 401 handler ────────────────────────────────────────────────────────────
// Fired on any 401 EXCEPT those from the login form and the startup /auth/me
// probe — both pass skipUnauthorized=true, so their own 401s can never surface
// the "session ended" banner, even if a handler is already registered (BR-66).
let _unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  _unauthorizedHandler = fn;
}

// Internal helper: adds credentials:include on every call and fires the 401
// handler unless skipUnauthorized is true (used by loginApi so the Login form
// can display its own error).
async function apiFetch(
  url: string,
  init: RequestInit = {},
  skipUnauthorized = false
): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (res.status === 401 && !skipUnauthorized && _unauthorizedHandler) {
    _unauthorizedHandler();
  }
  return res;
}

// ── Shared types ───────────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  role: "REQUESTER" | "IT_STAFF" | "ADMIN";
  mustChangePassword: boolean;
}

export interface DevRequester {
  id: number;
  name: string;
  email: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  attachments?: File[];
}

export interface CreatedAttachment {
  id: number;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface AttachmentError {
  fileName: string;
  reason: string;
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  attachments: CreatedAttachment[];
  attachmentErrors: AttachmentError[];
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  createdAt: string;
  summary: string;
  category: string;
  requestedPriority: string;
  currentStatus: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface TicketListResponse {
  data: TicketListItem[];
  pagination: Pagination;
}

export interface TicketListParams {
  search?: string;
  categoryId?: number;
  priority?: string;
  status?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

// ── Staff queue types (Issue #26) ────────────────────────────────────────────

export interface StaffQueueOwner {
  id: number;
  name: string;
  isActiveStaff: boolean;
}

export interface StaffQueueTicket {
  id: number;
  ticketNumber: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  category: string;
  requester: { id: number; name: string };
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  owner: StaffQueueOwner | null;
  requesterResolvedAt: string | null;
}

export interface StaffQueueCounts {
  unassigned: number;
  assignedToMe: number;
  requesterResolved: number;
}

export interface StaffQueueResponse {
  data: StaffQueueTicket[];
  pagination: Pagination;
  counts: StaffQueueCounts;
}

export interface StaffQueueParams {
  search?: string;
  status?: string;
  priority?: string;
  categoryId?: number;
  owner?: string; // ANY | ME | UNASSIGNED | <userId>
  requesterResolved?: boolean; // true → only Requester-indicated-resolved tickets
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export interface Assignee {
  id: number;
  name: string;
}

export interface TicketAttachment {
  id: number;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt?: string | null;
  removalReason?: string | null;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  category: string;
  relatedSystemId: number;
  relatedSystem: string;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  attachments: TicketAttachment[];
  // Lab 3 additions (optional so Lab 2 mocks do not need updating)
  itPriority?: string | null;
  owner?: { name: string } | null;
  resolutionSummary?: string | null;
  resolvedAt?: string | null;
  requesterResolvedAt?: string | null;
}

export interface TicketComment {
  id: number;
  body: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    role: string;
  };
}

// ── Error classes ──────────────────────────────────────────────────────────

// Structured error from the API (status + machine code + optional field errors).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: Record<string, string> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    errors?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

// Kept for backward compatibility with existing components (CreateTicket, etc.).
export class ApiValidationError extends Error {
  readonly errors: Record<string, string>;
  readonly status: number;

  constructor(errors: Record<string, string>, status: number) {
    super("Validation failed");
    this.name = "ApiValidationError";
    this.errors = errors;
    this.status = status;
  }
}

// ── Auth API ───────────────────────────────────────────────────────────────

export async function fetchMe(): Promise<User> {
  // skipUnauthorized=true: a 401 here just means "not signed in", which is the
  // normal signed-out/post-logout case and must never show the session-ended
  // banner — not even under React StrictMode's double-mount, where a second
  // probe could otherwise fire a handler the first probe registered (BR-66).
  const res = await apiFetch(`${API_BASE_URL}/api/auth/me`, {}, true);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code ?? "UNAUTHENTICATED", body.error ?? "Not authenticated");
  }
  const data = await res.json();
  return data.user as User;
}

export async function loginApi(email: string, password: string): Promise<User> {
  const res = await apiFetch(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "X-Requested-With": "TokTickIT",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
    true // skipUnauthorized: Login form handles 401 itself
  );
  if (res.ok) {
    const data = await res.json();
    return data.user as User;
  }
  const body = await res.json().catch(() => ({ error: "Server error", code: "INTERNAL_ERROR" }));
  throw new ApiError(res.status, body.code ?? "INTERNAL_ERROR", body.error ?? "Server error", body.errors);
}

export async function logoutApi(): Promise<void> {
  await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "X-Requested-With": "TokTickIT" },
  }).catch(() => {}); // idempotent — always succeeds from the client's perspective
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<User> {
  const res = await apiFetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "X-Requested-With": "TokTickIT",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  if (res.ok) {
    const data = await res.json();
    return data.user as User;
  }
  const body = await res.json().catch(() => ({ error: "Server error", code: "INTERNAL_ERROR" }));
  throw new ApiError(res.status, body.code ?? "INTERNAL_ERROR", body.error ?? "Server error", body.errors);
}

// ── Reference data ─────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/categories`);
  if (!res.ok) throw new Error(`Categories request failed with status ${res.status}`);
  return res.json();
}

// Kept for backward compatibility with Lab 2 tests; the server returns 404 in Lab 3.
export async function fetchDevRequesters(): Promise<DevRequester[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/dev-requesters`);
  if (!res.ok) throw new Error(`Failed to load requesters: ${res.status}`);
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/related-systems`);
  if (!res.ok) throw new Error(`Failed to load related systems: ${res.status}`);
  return res.json();
}

// ── Ticket endpoints ───────────────────────────────────────────────────────

export async function fetchTickets(
  params: TicketListParams = {}
): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) {
      query.set(k, String(v));
    }
  }
  const url = `${API_BASE_URL}/api/tickets${query.toString() ? "?" + query : ""}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
  return res.json();
}

// ── Staff queue endpoints (Issue #26) ────────────────────────────────────────

export async function fetchStaffTickets(
  params: StaffQueueParams = {}
): Promise<StaffQueueResponse> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) {
      query.set(k, String(v));
    }
  }
  const url = `${API_BASE_URL}/api/staff/tickets${query.toString() ? "?" + query : ""}`;
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.code ?? "INTERNAL_ERROR",
      body.error ?? "Failed to load the queue"
    );
  }
  return res.json();
}

// Active IT Staff for the Owner filter / reassign dropdown. IT_STAFF only.
export async function fetchAssignees(): Promise<Assignee[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/assignees`);
  if (!res.ok) throw new Error(`Failed to load assignees: ${res.status}`);
  return res.json();
}

export async function fetchTicketDetail(ticketId: number): Promise<TicketDetail> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}`);
  if (!res.ok) throw new Error(`Ticket not found: ${res.status}`);
  return res.json();
}

export async function fetchTicketComments(ticketId: number): Promise<TicketComment[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments`);
  if (!res.ok) {
    throw new ApiError(res.status, "INTERNAL_ERROR", "Failed to load comments");
  }
  return res.json();
}

export async function postTicketComment(
  ticketId: number,
  body: string
): Promise<TicketComment> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: {
      "X-Requested-With": "TokTickIT",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (res.ok) return res.json();
  const err = await res.json().catch(() => ({ error: "Server error", code: "INTERNAL_ERROR" }));
  throw new ApiError(res.status, err.code ?? "INTERNAL_ERROR", err.error ?? "Server error", err.errors);
}

export async function markTicketResolved(
  ticketId: number
): Promise<{ requesterResolvedAt: string }> {
  const res = await apiFetch(
    `${API_BASE_URL}/api/tickets/${ticketId}/resolved-indication`,
    {
      method: "POST",
      headers: { "X-Requested-With": "TokTickIT" },
    }
  );
  if (res.ok) return res.json();
  const err = await res.json().catch(() => ({ error: "Server error", code: "INTERNAL_ERROR" }));
  throw new ApiError(res.status, err.code ?? "INTERNAL_ERROR", err.error ?? "Server error", err.errors);
}

export async function addAttachment(
  ticketId: number,
  file: File
): Promise<TicketAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { "X-Requested-With": "TokTickIT" },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? "Upload failed"), { status: res.status, body });
  }
  return res.json();
}

export async function removeAttachment(
  ticketId: number,
  attachmentId: number,
  reason: string
): Promise<{ id: number; removedAt: string; removalReason: string }> {
  const res = await apiFetch(
    `${API_BASE_URL}/api/tickets/${ticketId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
      headers: {
        "X-Requested-With": "TokTickIT",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? "Remove failed"), { status: res.status, body });
  }
  return res.json();
}

export async function downloadAttachment(
  ticketId: number,
  attachmentId: number,
  fileName: string
): Promise<void> {
  const url = `${API_BASE_URL}/api/tickets/${ticketId}/attachments/${attachmentId}/download`;
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? "Download failed"), {
      status: res.status,
      body,
    });
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ── Staff ticket detail & operations (Issue #27) ─────────────────────────────

export interface StaffOwner {
  id: number;
  name: string;
  isActiveStaff: boolean;
}

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  summary: string;
  description: string;
  category: string;
  relatedSystem: string;
  requester: { id: number; name: string; email: string };
  owner: StaffOwner | null;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  requesterResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: TicketAttachment[];
  allowedTransitions: string[];
  counts: { publicComments: number; internalNotes: number };
}

export interface StatusChangePayload {
  status: string;
  resolutionSummary?: string;
  confirm?: boolean;
}

export interface StatusChangeResult {
  currentStatus: string;
  resolvedAt: string | null;
  closedAt: string | null;
  requesterResolvedAt: string | null;
  resolutionSummary: string | null;
  allowedTransitions: string[];
}

// Parse a JSON success body, or throw a structured ApiError carrying the status,
// machine code and field errors so the detail screen can show inline messages.
async function jsonOrApiError<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.json().catch(() => ({}));
  throw new ApiError(res.status, body.code ?? "INTERNAL_ERROR", body.error ?? fallback, body.errors);
}

const CSRF_JSON = {
  "X-Requested-With": "TokTickIT",
  "Content-Type": "application/json",
} as const;

export async function fetchStaffTicketDetail(ticketId: number): Promise<StaffTicketDetail> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}`);
  return jsonOrApiError<StaffTicketDetail>(res, "Failed to load the ticket");
}

export async function claimStaffTicket(
  ticketId: number
): Promise<{ owner: StaffOwner; currentStatus: string }> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/claim`, {
    method: "POST",
    headers: { "X-Requested-With": "TokTickIT" },
  });
  return jsonOrApiError(res, "Failed to claim the ticket");
}

export async function reassignStaffTicket(
  ticketId: number,
  ownerId: number
): Promise<{ owner: StaffOwner }> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/owner`, {
    method: "PATCH",
    headers: CSRF_JSON,
    body: JSON.stringify({ ownerId }),
  });
  return jsonOrApiError(res, "Failed to reassign the ticket");
}

export async function setStaffItPriority(
  ticketId: number,
  itPriority: string
): Promise<{ itPriority: string }> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/it-priority`, {
    method: "PATCH",
    headers: CSRF_JSON,
    body: JSON.stringify({ itPriority }),
  });
  return jsonOrApiError(res, "Failed to change IT Priority");
}

export async function changeStaffStatus(
  ticketId: number,
  payload: StatusChangePayload
): Promise<StatusChangeResult> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: CSRF_JSON,
    body: JSON.stringify(payload),
  });
  return jsonOrApiError(res, "Failed to change status");
}

export async function fetchStaffComments(ticketId: number): Promise<TicketComment[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/comments`);
  return jsonOrApiError<TicketComment[]>(res, "Failed to load comments");
}

export async function postStaffComment(ticketId: number, body: string): Promise<TicketComment> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: CSRF_JSON,
    body: JSON.stringify({ body }),
  });
  return jsonOrApiError<TicketComment>(res, "Failed to post comment");
}

export async function fetchStaffNotes(ticketId: number): Promise<TicketComment[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/notes`);
  return jsonOrApiError<TicketComment[]>(res, "Failed to load notes");
}

export async function postStaffNote(ticketId: number, body: string): Promise<TicketComment> {
  const res = await apiFetch(`${API_BASE_URL}/api/staff/tickets/${ticketId}/notes`, {
    method: "POST",
    headers: CSRF_JSON,
    body: JSON.stringify({ body }),
  });
  return jsonOrApiError<TicketComment>(res, "Failed to post note");
}

export async function downloadStaffAttachment(
  ticketId: number,
  attachmentId: number,
  fileName: string
): Promise<void> {
  const url = `${API_BASE_URL}/api/staff/tickets/${ticketId}/attachments/${attachmentId}/download`;
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? "Download failed"), { status: res.status, body });
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function createTicket(
  payload: CreateTicketPayload
): Promise<CreatedTicket> {
  const formData = new FormData();
  formData.append("categoryId", String(payload.categoryId));
  formData.append("relatedSystemId", String(payload.relatedSystemId));
  formData.append("summary", payload.summary);
  formData.append("description", payload.description);
  formData.append("requestedPriority", payload.requestedPriority);
  for (const file of payload.attachments ?? []) {
    formData.append("attachments", file);
  }

  const res = await apiFetch(`${API_BASE_URL}/api/tickets`, {
    method: "POST",
    headers: { "X-Requested-With": "TokTickIT" },
    body: formData,
  });

  if (res.status === 400) {
    const body = await res.json();
    throw new ApiValidationError(body.errors ?? {}, 400);
  }
  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`);
  }
  return res.json();
}
