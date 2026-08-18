import { api } from './client';

export interface JobListItem {
  id: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobPayload {
  id: string;
  description?: string | null;
}

const BASE = '/jobs/api';

export const jobsApi = {
  list: (search?: string) =>
    api.get<{ jobs: JobListItem[]; count: number }>(search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE),
  get: (id: string) => api.get<JobListItem>(`${BASE}/${encodeURIComponent(id)}`),
  create: (payload: JobPayload) => api.post<{ success: boolean; id: string }>(BASE, payload),
  update: (id: string, description: string | null) =>
    api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`, { description }),
  remove: (id: string) => api.del<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`),
};
