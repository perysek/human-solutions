import { api } from './client';

export type ActionPlanStatus = 'defined' | 'in_progress' | 'completed' | 'effective';

export interface ActionPlan {
  id: number;
  worker_id: string;
  worker_name: string;
  skill_id: string;
  skill_description: string;
  description: string;
  responsible_id: string | null;
  responsible_name: string | null;
  planned_date: string | null;
  completed_date: string | null;
  effectiveness_date: string | null;
  status: ActionPlanStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface ActionPlanCreatePayload {
  worker_id: string;
  skill_id: string;
  description: string;
  responsible_id: string;
  planned_date: string;
  status: ActionPlanStatus;
}

export interface ActionPlanUpdatePayload {
  description: string;
  responsible_id: string;
  planned_date: string;
  status: ActionPlanStatus;
  completed_date: string | null;
  effectiveness_date: string | null;
}

export interface ActionPlanHistoryEvent {
  id: number;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string | null;
  timestamp: string | null;
}

const BASE = '/workers/api/action-plans';

export const actionPlansApi = {
  list: (params: { status?: string; worker_id?: string } = {}) => {
    const usp = new URLSearchParams();
    if (params.status) usp.set('status', params.status);
    if (params.worker_id) usp.set('worker_id', params.worker_id);
    const qs = usp.toString();
    return api.get<{ results: ActionPlan[]; count: number }>(qs ? `${BASE}?${qs}` : BASE);
  },
  create: (payload: ActionPlanCreatePayload) => api.post<{ success: boolean; id: number }>(BASE, payload),
  update: (id: number, payload: ActionPlanUpdatePayload) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  history: (id: number) => api.get<{ events: ActionPlanHistoryEvent[]; count: number }>(`${BASE}/${id}/history`),
};
