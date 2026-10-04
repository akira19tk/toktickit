// API client wrapper — all functions mockable via vi.spyOn(api, 'fnName').

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// ── 401 handler ────────────────────────────────────────────────────────────
// Registered by AuthContext after the initial /auth/me probe so startup 401s
// do not trigger it (BR-66).
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
  const res = await apiFetch(`${API_BASE_URL}/api/auth/me`);
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
// requesterId parameter is kept for backward compatibility with Lab 2 component
// tests; it is no longer sent to the server (the session identifies the user).

export async function fetchTickets(
  _requesterId: number,
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

export async function fetchTicketDetail(
  ticketId: number,
  _requesterId: number
): Promise<TicketDetail> {
  const res = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}`);
  if (!res.ok) throw new Error(`Ticket not found: ${res.status}`);
  return res.json();
}

export async function addAttachment(
  ticketId: number,
  file: File,
  _requesterId: number
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
  reason: string,
  _requesterId: number
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
  fileName: string,
  _requesterId: number
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

export async function createTicket(
  payload: CreateTicketPayload,
  _requesterId: number
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
