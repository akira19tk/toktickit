// API client wrapper — all functions mockable via vi.spyOn(api, 'fnName').

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// ── Types ──────────────────────────────────────────────────────────────────

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

export async function fetchTickets(
  requesterId: number,
  params: TicketListParams = {}
): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) {
      query.set(k, String(v));
    }
  }
  const url = `${API_BASE_URL}/api/tickets${query.toString() ? "?" + query : ""}`;
  const res = await fetch(url, {
    headers: { "x-requester-id": String(requesterId) },
  });
  if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
  return res.json();
}

// Thrown when the server responds 400 with field-level errors.
export class ApiValidationError extends Error {
  constructor(
    public readonly errors: Record<string, string>,
    public readonly status: number
  ) {
    super("Validation failed");
    this.name = "ApiValidationError";
  }
}

// ── Fetchers ───────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/api/categories`);
  if (!res.ok) throw new Error(`Categories request failed with status ${res.status}`);
  return res.json();
}

export async function fetchDevRequesters(): Promise<DevRequester[]> {
  const res = await fetch(`${API_BASE_URL}/api/dev-requesters`);
  if (!res.ok) throw new Error(`Failed to load requesters: ${res.status}`);
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_BASE_URL}/api/related-systems`);
  if (!res.ok) throw new Error(`Failed to load related systems: ${res.status}`);
  return res.json();
}

export async function createTicket(
  payload: CreateTicketPayload,
  requesterId: number
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

  const res = await fetch(`${API_BASE_URL}/api/tickets`, {
    method: "POST",
    headers: { "x-requester-id": String(requesterId) },
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
