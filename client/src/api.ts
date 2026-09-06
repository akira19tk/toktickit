// Small API client wrapper. Kept separate from App.tsx so tests can mock it easily.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface DevRequester {
  id: number;
  name: string;
  email: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export async function fetchDevRequesters(): Promise<DevRequester[]> {
  const res = await fetch(`${API_BASE_URL}/api/dev-requesters`);
  if (!res.ok) {
    throw new Error(`Failed to load requesters: ${res.status}`);
  }
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_BASE_URL}/api/related-systems`);
  if (!res.ok) {
    throw new Error(`Failed to load related systems: ${res.status}`);
  }
  return res.json();
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Category {
  id: number;
  name: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/api/categories`);
  if (!res.ok) {
    throw new Error(`Categories request failed with status ${res.status}`);
  }
  return res.json();
}
