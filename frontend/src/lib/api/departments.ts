import { api } from './client';

export interface DepartmentListItem {
  id: number;
  name: string;
  description: string | null;
  /** Self-FK (migration 8f053c175547) — null for a top-level department. */
  parent_department_id: number | null;
  /** LEFT JOIN'd on the backend (_department_json) so the breadcrumb on
   * DepartmentEditPage and the "Dział nadrzędny" column on
   * DepartmentsListPage don't each need a second full department fetch just
   * to resolve one name. */
  parent_name: string | null;
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
  parent_department_id?: number | null;
}

/** {descriptions} — non-null on a departments/api mutation only when that
 * write actually recorded a new structural audit_log row (i.e. is now
 * pending a new org-chart revision). See
 * services/org_chart_service.py's capture_pending_change_delta docstring
 * for why this can be null even on a "successful" save (a no-op parent/
 * description edit changes nothing structural, or the trigger-era
 * job-position INSERT exclusion still applies). One mutation can produce
 * more than one structural audit row (e.g. a job's is_managerial AND
 * department_id both changing in one save) — hence a list, not one value. */
export interface OrgChartPendingChangeDelta {
  descriptions: string[];
}

const BASE = '/departments/api';

export const departmentsApi = {
  list: (search?: string) =>
    api.get<{ departments: DepartmentListItem[]; count: number }>(search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE),
  options: () => api.get<{ departments: DepartmentOption[] }>(`${BASE}/options`),
  get: (id: number) => api.get<DepartmentListItem>(`${BASE}/${id}`),
  create: (payload: DepartmentPayload) =>
    api.post<{ success: boolean; id: number; pending_change: OrgChartPendingChangeDelta | null }>(BASE, payload),
  update: (id: number, payload: DepartmentPayload) =>
    api.put<{ success: boolean; pending_change: OrgChartPendingChangeDelta | null }>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.del<{ success: boolean; pending_change: OrgChartPendingChangeDelta | null }>(`${BASE}/${id}`),
  /** Task 1 — Działy firmy's '+' modal: bulk-assign existing job-positions
   * to this department. Additive only — see routes/departments/routes.py's
   * api_add_jobs docstring. */
  addJobs: (id: number, jobIds: string[]) =>
    api.post<{ success: boolean; updated: number; pending_change: OrgChartPendingChangeDelta | null }>(
      `${BASE}/${id}/jobs`, { job_ids: jobIds },
    ),
  /** Dział edit page's per-row remove icon: unlinks one job-position from
   * this department (department_id -> NULL) — not a delete of the
   * job-position itself. See routes/departments/routes.py's api_remove_job. */
  removeJob: (id: number, jobId: string) =>
    api.del<{ success: boolean; pending_change: OrgChartPendingChangeDelta | null }>(`${BASE}/${id}/jobs/${encodeURIComponent(jobId)}`),
};
