import { api } from './client';

export interface DepartmentListItem {
  id: number;
  name: string;
  description: string | null;
  job_count: number;
  worker_count: number;
  manager_names: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DepartmentOption {
  id: number;
  name: string;
}

export interface DepartmentPayload {
  name: string;
  description?: string | null;
}

const BASE = '/departments/api';

export const departmentsApi = {
  list: (search?: string) =>
    api.get<{ departments: DepartmentListItem[]; count: number }>(search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE),
  options: () => api.get<{ departments: DepartmentOption[] }>(`${BASE}/options`),
  get: (id: number) => api.get<DepartmentListItem>(`${BASE}/${id}`),
  create: (payload: DepartmentPayload) => api.post<{ success: boolean; id: number }>(BASE, payload),
  update: (id: number, payload: DepartmentPayload) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),
  /** Task 1 — Działy firmy's '+' modal: bulk-assign existing job-positions
   * to this department. Additive only — see routes/departments/routes.py's
   * api_add_jobs docstring. */
  addJobs: (id: number, jobIds: string[]) => api.post<{ success: boolean; updated: number }>(`${BASE}/${id}/jobs`, { job_ids: jobIds }),
  /** Dział edit page's per-row remove icon: unlinks one job-position from
   * this department (department_id -> NULL) — not a delete of the
   * job-position itself. See routes/departments/routes.py's api_remove_job. */
  removeJob: (id: number, jobId: string) => api.del<{ success: boolean }>(`${BASE}/${id}/jobs/${encodeURIComponent(jobId)}`),
};
