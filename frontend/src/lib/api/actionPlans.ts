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
  is_training: boolean;
  training_id: number | null;
  training_description: string | null;
  expected_increase: number | null;
  skill_increase_applied: boolean;
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

/** LUK_1's "Szkolenie" checkbox — picks an internal training + expected
 * rating increase instead of a free-text description/responsible/date.
 * `POST /workers/api/action-plans` branches on `is_training` (see
 * routes/workers/routes.py's api_create_action_plan). */
export interface ActionPlanTrainingCreatePayload {
  worker_id: string;
  skill_id: string;
  is_training: true;
  training_id: number;
  expected_increase: number;
  /** Becomes the auto-created training_participants row's start_date, and
   * the action plan's own planned_date. */
  training_start_date: string;
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
  create: (payload: ActionPlanCreatePayload | ActionPlanTrainingCreatePayload) => api.post<{ success: boolean; id: number }>(BASE, payload),
  update: (id: number, payload: ActionPlanUpdatePayload) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  /** Soft delete (is_deleted/deleted_at) — see ActionPlanRepository.delete's docstring. */
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),
  history: (id: number) => api.get<{ events: ActionPlanHistoryEvent[]; count: number }>(`${BASE}/${id}/history`),
};
