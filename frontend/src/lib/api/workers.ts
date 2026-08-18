import { api } from './client';

export interface WorkerListItem {
  id: string;
  firstname: string;
  surname: string;
  full_name: string;
  job_id: string | null;
  job_description: string | null;
  boss_id: string | null;
  boss_name: string | null;
  gender: 'Male' | 'Female' | 'UNKNOWN';
  hire_date: string | null;
  fire_date: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ForeignerData {
  document_kind: string | null;
  document_validity: string | null;
  employment_basis: string | null;
  employment_basis_validity: string | null;
}

export interface WorkerProfile extends WorkerListItem {
  birth: { birth_date: string | null; birth_place: string | null };
  nationalities: string[];
  foreigner: ForeignerData | null;
}

export interface WorkerPayload {
  firstname: string;
  surname: string;
  job_id?: string | null;
  boss_id?: string | null;
  gender: string;
  hire_date?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  nationalities?: string[];
  foreigner?: Partial<ForeignerData> | null;
}

export interface WorkersListParams {
  status?: 'active' | 'inactive' | 'all';
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface ExpiringForeignerDoc {
  worker_id: string;
  full_name: string;
  document_kind: string | null;
  document_validity: string | null;
}

const BASE = '/workers/api';

function buildQuery(params: WorkersListParams): string {
  const usp = new URLSearchParams();
  if (params.status) usp.set('status', params.status);
  if (params.search) usp.set('search', params.search);
  if (params.sort) usp.set('sort', params.sort);
  if (params.order) usp.set('order', params.order);
  if (params.page) usp.set('page', String(params.page));
  if (params.page_size) usp.set('page_size', String(params.page_size));
  const qs = usp.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export const workersApi = {
  list: (params: WorkersListParams = {}) =>
    api.get<{ workers: WorkerListItem[]; count: number; page: number; page_size: number }>(buildQuery(params)),
  get: (id: string) => api.get<WorkerProfile>(`${BASE}/${encodeURIComponent(id)}`),
  create: (payload: WorkerPayload) => api.post<{ success: boolean; id: string }>(BASE, payload),
  update: (id: string, payload: WorkerPayload) => api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`, payload),
  deactivate: (id: string) => api.put<{ success: boolean; already_inactive: boolean }>(`${BASE}/${encodeURIComponent(id)}/deactivate`),
  subordinates: (id: string) => api.get<{ subordinates: WorkerListItem[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/subordinates`),
  expiringForeignerDocs: (days = 30) =>
    api.get<{ workers: ExpiringForeignerDoc[]; count: number }>(`${BASE}/expiring-foreigner-docs?days=${days}`),
};
