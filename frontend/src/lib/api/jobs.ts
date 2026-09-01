import { api } from './client';
import type { OrgChartRevisionDelta } from './departments';
import type { SkillGap } from './workers';

export interface JobListItem {
  id: string;
  description: string | null;
  department_id: number | null;
  department_name: string | null;
  is_managerial: boolean;
  is_director: boolean;
  supervisor_job_id: string | null;
  supervisor_job_description: string | null;
  worker_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobPayload {
  id: string;
  description?: string | null;
  department_id?: number | null;
  is_managerial?: boolean;
  is_director?: boolean;
}

export interface JobSkillRequirement {
  skill_id: string;
  skill_description: string;
  required_rating: number;
}

export interface JobWorker {
  id: string;
  full_name: string;
  is_active: boolean;
}

export interface JobGapWorker {
  worker_id: string;
  full_name: string;
  is_active: boolean;
  gaps: SkillGap[];
}

const BASE = '/jobs/api';

export const jobsApi = {
  list: (search?: string) =>
    api.get<{ jobs: JobListItem[]; count: number }>(search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE),
  get: (id: string) => api.get<JobListItem>(`${BASE}/${encodeURIComponent(id)}`),
  create: (payload: JobPayload) =>
    api.post<{ success: boolean; id: string; warning?: string | null; org_chart_revision: OrgChartRevisionDelta | null }>(BASE, payload),
  update: (id: string, payload: Omit<JobPayload, 'id'>) =>
    api.put<{ success: boolean; warning?: string | null; org_chart_revision: OrgChartRevisionDelta | null }>(
      `${BASE}/${encodeURIComponent(id)}`, payload,
    ),
  remove: (id: string) =>
    api.del<{ success: boolean; org_chart_revision: OrgChartRevisionDelta | null }>(`${BASE}/${encodeURIComponent(id)}`),

  // Competency matrix (JOB_2/4/5/6, Phase 3)
  getSkills: (id: string) => api.get<{ skills: JobSkillRequirement[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/skills`),
  setSkills: (id: string, skills: { skill_id: string; required_rating: number }[]) =>
    api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}/skills`, { skills }),
  getWorkers: (id: string) => api.get<{ workers: JobWorker[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/workers`),
  getGapAnalysis: (id: string) => api.get<{ workers: JobGapWorker[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/gap-analysis`),
};
