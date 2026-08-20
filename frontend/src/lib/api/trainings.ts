import { api } from './client';

export interface TrainingListItem {
  id: number;
  description: string;
  remarks: string | null;
  training_date: string | null;
  completion: number | null;
  related_docs: string | null;
  training_details: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TrainingPayload {
  description: string;
  remarks?: string | null;
  training_date?: string | null;
  completion?: number | null;
  related_docs?: string | null;
  training_details?: string | null;
}

export interface TrainingsListParams {
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface TrainingJobLink {
  job_id: string;
  job_description: string | null;
}

export interface TrainingSkillLink {
  skill_id: string;
  skill_description: string;
}

export interface TrainingParticipant {
  id: number;
  training_id: number;
  worker_id: string;
  worker_name: string;
  start_date: string | null;
  finish_date: string | null;
  remarks: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  effectiveness_date: string | null;
}

export interface ParticipantCreatePayload {
  worker_id: string;
  trainer_id?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  remarks?: string | null;
}

export interface ParticipantUpdatePayload {
  trainer_id?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  remarks?: string | null;
  effectiveness_date?: string | null;
}

export interface WorkerTrainingHistoryItem {
  participant_id: number;
  training_id: number;
  training_description: string;
  training_date: string | null;
  start_date: string | null;
  finish_date: string | null;
  remarks: string | null;
  trainer_name: string | null;
  effectiveness_date: string | null;
}

const BASE = '/trainings/api';

function buildQuery(params: TrainingsListParams): string {
  const usp = new URLSearchParams();
  if (params.search) usp.set('search', params.search);
  if (params.sort) usp.set('sort', params.sort);
  if (params.order) usp.set('order', params.order);
  if (params.page) usp.set('page', String(params.page));
  if (params.page_size) usp.set('page_size', String(params.page_size));
  const qs = usp.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export const trainingsApi = {
  list: (params: TrainingsListParams = {}) =>
    api.get<{ trainings: TrainingListItem[]; count: number; page: number; page_size: number }>(buildQuery(params)),
  get: (id: number) => api.get<TrainingListItem>(`${BASE}/${id}`),
  create: (payload: TrainingPayload) => api.post<{ success: boolean; id: number }>(BASE, payload),
  update: (id: number, payload: TrainingPayload) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),

  // Job/skill links (TRN_3/4)
  getJobLinks: (id: number) => api.get<{ jobs: TrainingJobLink[]; count: number }>(`${BASE}/${id}/job-links`),
  setJobLinks: (id: number, jobIds: string[]) => api.put<{ success: boolean }>(`${BASE}/${id}/job-links`, { job_ids: jobIds }),
  getSkillLinks: (id: number) => api.get<{ skills: TrainingSkillLink[]; count: number }>(`${BASE}/${id}/skill-links`),
  setSkillLinks: (id: number, skillIds: string[]) => api.put<{ success: boolean }>(`${BASE}/${id}/skill-links`, { skill_ids: skillIds }),

  // Participants (TRN_5/8/9/11)
  getParticipants: (id: number) => api.get<{ participants: TrainingParticipant[]; count: number }>(`${BASE}/${id}/participants`),
  addParticipant: (id: number, payload: ParticipantCreatePayload) =>
    api.post<{ success: boolean; id: number }>(`${BASE}/${id}/participants`, payload),
  updateParticipant: (participantId: number, payload: ParticipantUpdatePayload) =>
    api.put<{ success: boolean }>(`${BASE}/participants/${participantId}`, payload),
  /** Not fetched via `api` — this is a same-origin navigation URL (an `<a
   * href>`), so the browser's own download flow handles the
   * Content-Disposition response; the session cookie rides along because
   * it's a same-origin GET, same as any other browser navigation. */
  exportUrl: (id: number) => `${BASE}/${id}/participants/export`,

  // Worker profile (TRN_10)
  workerHistory: (workerId: string) =>
    api.get<{ history: WorkerTrainingHistoryItem[]; count: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}/history`),
};
