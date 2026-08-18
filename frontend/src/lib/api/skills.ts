import { api } from './client';

export interface SkillListItem {
  id: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface SkillPayload {
  id: string;
  description: string;
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
};
