import { api } from './client';
import type { OrgChartRevisionDelta } from './departments';

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
 * (services/org_chart_service.py's humanize_revision) — same shape as
 * OrgChartRevisionDelta (lib/api/departments.ts), kept as a separate alias
 * here since the two live in conceptually different places (a mutation's
 * side-effect vs. a read of the log itself) even though the wire shape
 * matches exactly. */
export type OrgChartRevision = OrgChartRevisionDelta;

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
};
