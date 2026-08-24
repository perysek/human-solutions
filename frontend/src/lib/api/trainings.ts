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
  /** Task 1 — total (non-deleted) participants, catalog-only (TrainingRepository.get_all). */
  participant_count: number;
  /** Task 3 — comma-joined trainer full names (ids instead, for `viewer` — RODO_3/OQ_3). */
  trainer_names: string | null;
  /** Task 3 — latest participant `finish_date` across the roster, or null if nobody's finished yet. */
  last_session_date: string | null;
}

/** `completion` is deliberately absent — it's auto-derived server-side from
 * the participant roster (TrainingRepository.recalculate_completion), never
 * caller-supplied. See TrainingForm.tsx. */
export interface TrainingPayload {
  description: string;
  remarks?: string | null;
  training_date?: string | null;
  related_docs?: string | null;
  training_details?: string | null;
}

export interface TrainingsListParams {
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
  /** Narrows to trainings linked (training_skills) to this skill — the
   * "Szkolenie" picker in ActionPlanModal. */
  skill_id?: string;
}

export interface TrainingJobLink {
  job_id: string;
  job_description: string | null;
}

export interface TrainingSkillLink {
  skill_id: string;
  skill_description: string;
}

/** Task 2 — a training's assigned trainer(s), training_trainers. Same shape
 * as TrainingJobLink/TrainingSkillLink. */
export interface TrainingTrainerLink {
  trainer_id: string;
  trainer_name: string;
}

export interface TrainingParticipant {
  id: number;
  training_id: number;
  worker_id: string;
  worker_name: string;
  start_date: string | null;
  finish_date: string | null;
  remarks: string | null;
  effectiveness_date: string | null;
  /** MOBILE_PRESENCE_CONFIRMATION_PLAN.md — mobile sign-in ✓ badge, true once
   * this participant has a training_presence_confirmations row. */
  confirmed: boolean;
}

/** Task 4 — one row of the "Szkolenia otwarte" report: a worker's single
 * not-yet-fully-completed enrollment. `status` is derived server-side
 * (training_participants has no status column) but reuses
 * ACTION_PLAN_STATUS_OPTIONS' label/color vocabulary — see
 * actionPlanStatus.ts and TrainingParticipantRepository._OPEN_REPORT_SELECT. */
export interface OpenTrainingRow {
  participant_id: number;
  training_id: number;
  worker_id: string;
  worker_name: string;
  training_description: string;
  planned_date: string | null;
  trainer_name: string | null;
  start_date: string | null;
  finish_date: string | null;
  effectiveness_date: string | null;
  status: 'defined' | 'in_progress' | 'completed';
}

export interface SignInLinkStatus {
  active: boolean;
  url: string | null;
  expires_at: string | null;
  confirmed: number;
  total: number;
}

export interface SignInLinkCreated {
  success: boolean;
  token: string;
  url: string;
  qr_png_base64: string;
  expires_at: string;
}

export interface ParticipantCreatePayload {
  worker_id: string;
  start_date?: string | null;
  finish_date?: string | null;
  remarks?: string | null;
}

export interface ParticipantUpdatePayload {
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
  if (params.skill_id) usp.set('skill_id', params.skill_id);
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

  // Job/skill/trainer links (TRN_3/4, Task 2)
  getJobLinks: (id: number) => api.get<{ jobs: TrainingJobLink[]; count: number }>(`${BASE}/${id}/job-links`),
  setJobLinks: (id: number, jobIds: string[]) => api.put<{ success: boolean }>(`${BASE}/${id}/job-links`, { job_ids: jobIds }),
  getSkillLinks: (id: number) => api.get<{ skills: TrainingSkillLink[]; count: number }>(`${BASE}/${id}/skill-links`),
  setSkillLinks: (id: number, skillIds: string[]) => api.put<{ success: boolean }>(`${BASE}/${id}/skill-links`, { skill_ids: skillIds }),
  getTrainerLinks: (id: number) => api.get<{ trainers: TrainingTrainerLink[]; count: number }>(`${BASE}/${id}/trainer-links`),
  setTrainerLinks: (id: number, trainerIds: string[]) => api.put<{ success: boolean }>(`${BASE}/${id}/trainer-links`, { trainer_ids: trainerIds }),

  // Participants (TRN_5/8/9/11)
  getParticipants: (id: number) => api.get<{ participants: TrainingParticipant[]; count: number }>(`${BASE}/${id}/participants`),
  addParticipant: (id: number, payload: ParticipantCreatePayload) =>
    api.post<{ success: boolean; id: number }>(`${BASE}/${id}/participants`, payload),
  updateParticipant: (participantId: number, payload: ParticipantUpdatePayload) =>
    api.put<{ success: boolean }>(`${BASE}/participants/${participantId}`, payload),
  /** Soft delete (is_deleted/deleted_at) — see TrainingParticipantRepository.delete's docstring. */
  removeParticipant: (participantId: number) => api.del<{ success: boolean }>(`${BASE}/participants/${participantId}`),
  /** Not fetched via `api` — this is a same-origin navigation URL (an `<a
   * href>`), so the browser's own download flow handles the
   * Content-Disposition response; the session cookie rides along because
   * it's a same-origin GET, same as any other browser navigation. */
  exportUrl: (id: number) => `${BASE}/${id}/participants/export`,

  // Worker profile (TRN_10)
  workerHistory: (workerId: string) =>
    api.get<{ history: WorkerTrainingHistoryItem[]; count: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}/history`),

  // Task 4 — "Szkolenia otwarte" tab
  openReport: () => api.get<{ results: OpenTrainingRow[]; count: number }>(`${BASE}/open-report`),

  // Mobile presence confirmation — sign-in link (MOBILE_PRESENCE_CONFIRMATION_PLAN.md §5.4)
  getSignInLink: (id: number) => api.get<SignInLinkStatus>(`${BASE}/${id}/sign-in-link`),
  createSignInLink: (id: number) => api.post<SignInLinkCreated>(`${BASE}/${id}/sign-in-link`),
  revokeSignInLink: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}/sign-in-link`),
};
