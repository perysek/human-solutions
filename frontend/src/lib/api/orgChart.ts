import { api } from './client';

export interface OrgChartJobNode {
  job_id: string;
  job_description: string | null;
  workers: { id: string; full_name: string }[];
}

export interface OrgChartWorkerEntry {
  id: string;
  full_name: string;
  job_id: string;
  job_description: string | null;
}

export interface OrgChartDepartmentNode {
  id: number;
  name: string;
  manager: OrgChartJobNode | null;
  workers: OrgChartWorkerEntry[];
  children: OrgChartDepartmentNode[];
}

export interface OrgChartTree {
  director: OrgChartJobNode | null;
  departments: OrgChartDepartmentNode[];
}

/** One org_chart_revisions row, humanized server-side
 * (services/org_chart_service.py's humanize_revision). `label` is the
 * revision's summary (manually-created revisions: "Ręczna rewizja — N
 * zmian"); `created_by` is who clicked "Utwórz rewizję" — null for the
 * one-time historical cutover revision migration d6d10b667838 creates, or
 * for any revision predating that migration. */
export interface OrgChartRevision {
  id: number;
  revised_at: string;
  label: string;
  created_by: string | null;
}

/** One audit_log row not yet folded into a revision — NewRevisionModal's
 * list. `description` is already a full "was -> is" sentence in Polish
 * (services/org_chart_service.py's _describe_pending_change). */
export interface OrgChartPendingChange {
  id: number;
  description: string;
  changed_by: string;
  changed_at: string;
}

const BASE = '/org-chart/api';

export const orgChartApi = {
  tree: () => api.get<OrgChartTree>(`${BASE}/tree`),
  latestRevision: () => api.get<OrgChartRevision | null>(`${BASE}/revisions/latest`),
  /** Gated on the 'audit' module server-side (routes/org_chart/routes.py) —
   * a caller without that grant gets a 403 ApiError, same as every other
   * module_permission_required route in this app. */
  revisions: (params: { page: number; page_size: number }) =>
    api.get<{ revisions: OrgChartRevision[]; count: number; page: number; page_size: number }>(
      `${BASE}/revisions?page=${params.page}&page_size=${params.page_size}`,
    ),
  /** NewRevisionModal's list — gated on 'jobs' (same as editing), not
   * 'audit'. */
  pendingChanges: () => api.get<OrgChartPendingChange[]>(`${BASE}/pending-changes`),
  /** NewRevisionModal's "Utwórz rewizję" — folds every currently-pending
   * change into one new revision. 400 ValidationError if nothing is
   * pending (routes/org_chart/routes.py's api_create_revision). */
  createRevision: () => api.post<OrgChartRevision>(`${BASE}/revisions`),
};
