import { api } from './client';

export interface SkillListItem {
  id: string;
  description: string;
  /** Job-positions requiring this skill (job_skills) — task2, list-only. */
  job_count: number;
  /** Active workers with a competency gap (required - current >= 1) for
   * this skill — same definition as LUK_1's gap report. List-only. */
  gap_worker_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface SkillPayload {
  id: string;
  description: string;
}

export interface SkillJobRequirement {
  job_id: string;
  job_description: string | null;
  required_rating: number;
}

const BASE = '/skills/api';

export const skillsApi = {
  list: (search?: string) =>
    api.get<{ skills: SkillListItem[]; count: number }>(search ? `${BASE}?search=${encodeURIComponent(search)}` : BASE),
  get: (id: string) => api.get<SkillListItem>(`${BASE}/${encodeURIComponent(id)}`),
  create: (payload: SkillPayload) => api.post<{ success: boolean; id: string }>(BASE, payload),
  update: (id: string, description: string) =>
    api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`, { description }),
  remove: (id: string) => api.del<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`),
  // Reverse of jobsApi.getSkills — jobs requiring this skill (job_skills).
  getJobs: (id: string) => api.get<{ jobs: SkillJobRequirement[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/jobs`),
};
