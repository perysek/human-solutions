import { api } from './client';

export interface WorkerListItem {
  id: string;
  firstname: string;
  surname: string;
  full_name: string;
  job_id: string | null;
  job_description: string | null;
  /** True when the worker's own job-position is 'kierownicze' — combined
   * with department_name to render "kierownik działu xxxxx" (task1). */
  job_is_managerial: boolean;
  department_id: number | null;
  department_name: string | null;
  /** task3 — competence gap, or no currently-valid BHP training/medical
   * exam despite having records of that kind. List-only (api_list). */
  needs_attention: boolean;
  /** Derived, not manually assigned — whoever holds the is_managerial job
   * in this worker's own job's department (comma-joined if more than one
   * holds it). null if their job has no department, or that department has
   * no manager assigned. */
  boss_name: string | null;
  /** "Szkolenia wstępne" (worker_onboarding_status, keyed by worker_id +
   * this worker's current job_id). Both null = "Nie zaplanowane" — nobody's
   * ever run the bulk-schedule flow for this worker's current job. */
  onboarding_completed: boolean | null;
  onboarding_completion_pct: number | null;
  gender: 'Male' | 'Female' | 'UNKNOWN';
  hire_date: string | null;
  fire_date: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ForeignerData {
  document_kind: string | null;
  document_validity: string | null;
  employment_basis: string | null;
  employment_basis_validity: string | null;
}

/** A worker's notice of termination ("Złożenie wypowiedzenia") — replaces
 * the old instant "Dezaktywuj". `status: 'pending'` means the notice is
 * submitted but planned_fire_date hasn't been reached yet (workers.fire_date
 * is still null); once reached, the backend finalizes it lazily (no
 * scheduler in this app — every worker/dashboard read path checks first)
 * and the worker's own fire_date/is_active reflect it. */
export interface WorkerTermination {
  id: number;
  worker_id: string;
  worker_name: string;
  submission_date: string;
  reason: string;
  notice_period_days: number;
  default_notice_period_days: number;
  shortening_reason: string | null;
  planned_fire_date: string;
  status: 'pending' | 'finalized';
  created_at: string | null;
}

export interface TerminationDefault {
  submission_date: string;
  default_notice_period_days: number;
  planned_fire_date: string;
}

export interface SubmitTerminationPayload {
  submission_date: string;
  reason: string;
  notice_period_days: number;
  shortening_reason?: string | null;
}

export interface WorkerProfile extends WorkerListItem {
  birth: { birth_date: string | null; birth_place: string | null };
  nationalities: string[];
  foreigner: ForeignerData | null;
  pending_termination: WorkerTermination | null;
}

export interface WorkerPayload {
  firstname: string;
  surname: string;
  job_id?: string | null;
  gender: string;
  hire_date?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  nationalities?: string[];
  foreigner?: Partial<ForeignerData> | null;
}

export interface WorkersListParams {
  status?: 'active' | 'inactive' | 'all';
  search?: string;
  /** task3 — WorkersListPage's "Wymaga uwagi" filter dropdown. */
  needs_attention?: 'yes' | 'no' | 'all';
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface ExpiringForeignerDoc {
  worker_id: string;
  full_name: string;
  document_kind: string | null;
  document_validity: string | null;
}

export interface WorkerSkillItem {
  id: number;
  skill_id: string;
  skill_description: string;
  current_rating: number | null;
  last_update: string | null;
}

export interface SkillGap {
  skill_id: string;
  skill_description: string;
  required_rating: number;
  current_rating: number | null;
  gap: number;
}

export interface CompetencyGapRow {
  worker_id: string;
  full_name: string;
  job_description: string | null;
  boss_name: string | null;
  skill_id: string;
  skill_description: string;
  required_rating: number;
  current_rating: number | null;
  gap: number;
  last_update: string | null;
  action_plan_id: number | null;
  action_description: string | null;
  action_planned_date: string | null;
  action_status: string | null;
  action_is_training: boolean | null;
  action_training_description: string | null;
}

export interface SkillRemark {
  id: number;
  remarks: string;
  created_at: string | null;
}

/** SKL_5 — one worker_skills.current_rating change (manual edit, or the
 * automatic bump LUK_1's "Szkolenie" plans apply once a linked training's
 * effectiveness is confirmed). Read from audit_log — see
 * routes/workers/routes.py's api_skill_rating_history. */
export interface SkillRatingHistoryEvent {
  id: number;
  action: string;
  old_value: string | null;
  new_value: string | null;
  user_name: string | null;
  timestamp: string | null;
}

const BASE = '/workers/api';

function buildQuery(params: WorkersListParams): string {
  const usp = new URLSearchParams();
  if (params.status) usp.set('status', params.status);
  if (params.search) usp.set('search', params.search);
  if (params.needs_attention && params.needs_attention !== 'all') usp.set('needs_attention', params.needs_attention);
  if (params.sort) usp.set('sort', params.sort);
  if (params.order) usp.set('order', params.order);
  if (params.page) usp.set('page', String(params.page));
  if (params.page_size) usp.set('page_size', String(params.page_size));
  const qs = usp.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/** "Szkolenia wstępne" bulk-schedule result — see WorkerOnboardingTrainingsPage.
 * `end_date` is null only when every selected training was already an
 * active enrollment (scheduled_count === 0). */
export interface OnboardingScheduleResult {
  success: boolean;
  scheduled_count: number;
  skipped_count: number;
  start_date: string;
  end_date: string | null;
  participant_ids: number[];
}

export interface OnboardingSchedulePayload {
  training_ids: number[];
  start_date: string;
}

export interface NeedsAttentionSummary {
  gap_count: number;
  medical_count: number;
  bhp_count: number;
  /** Literal sum of the three counts above — a worker in two categories
   * at once counts toward `total` twice, not a distinct-worker count. */
  total: number;
}

export const workersApi = {
  list: (params: WorkersListParams = {}) =>
    api.get<{ workers: WorkerListItem[]; count: number; page: number; page_size: number }>(buildQuery(params)),
  get: (id: string) => api.get<WorkerProfile>(`${BASE}/${encodeURIComponent(id)}`),
  needsAttentionSummary: () => api.get<NeedsAttentionSummary>(`${BASE}/needs-attention-summary`),
  create: (payload: WorkerPayload) => api.post<{ success: boolean; id: string }>(BASE, payload),
  update: (id: string, payload: WorkerPayload) => api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}`, payload),
  terminationDefault: (id: string, submissionDate?: string) =>
    api.get<TerminationDefault>(
      `${BASE}/${encodeURIComponent(id)}/termination-default${submissionDate ? `?submission_date=${submissionDate}` : ''}`,
    ),
  submitTermination: (id: string, payload: SubmitTerminationPayload) =>
    api.post<{ success: boolean; id: number }>(`${BASE}/${encodeURIComponent(id)}/termination`, payload),
  subordinates: (id: string) => api.get<{ subordinates: WorkerListItem[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/subordinates`),
  scheduleOnboardingTrainings: (id: string, payload: OnboardingSchedulePayload) =>
    api.post<OnboardingScheduleResult>(`${BASE}/${encodeURIComponent(id)}/onboarding-trainings/schedule`, payload),
  expiringForeignerDocs: (days = 30) =>
    api.get<{ workers: ExpiringForeignerDoc[]; count: number }>(`${BASE}/expiring-foreigner-docs?days=${days}`),

  // Competency matrix (SKL_2/3/4, Phase 3)
  getSkills: (id: string) => api.get<{ skills: WorkerSkillItem[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/skills`),
  setSkill: (id: string, skillId: string, currentRating: number | null, lastUpdate?: string | null) =>
    api.post<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}/skills`, {
      skill_id: skillId,
      current_rating: currentRating,
      last_update: lastUpdate,
    }),
  updateSkill: (id: string, skillId: string, currentRating: number | null, lastUpdate?: string | null) =>
    api.put<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillId)}`, {
      current_rating: currentRating,
      last_update: lastUpdate,
    }),
  removeSkill: (id: string, skillId: string) =>
    api.del<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillId)}`),
  getRemarks: (id: string, skillId: string) =>
    api.get<{ remarks: SkillRemark[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillId)}/remarks`),
  addRemark: (id: string, skillId: string, remarks: string) =>
    api.post<{ success: boolean }>(`${BASE}/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillId)}/remarks`, { remarks }),
  getRatingHistory: (id: string, skillId: string) =>
    api.get<{ events: SkillRatingHistoryEvent[]; count: number }>(
      `${BASE}/${encodeURIComponent(id)}/skills/${encodeURIComponent(skillId)}/rating-history`,
    ),
  getGapAnalysis: (id: string) => api.get<{ gaps: SkillGap[]; count: number }>(`${BASE}/${encodeURIComponent(id)}/gap-analysis`),
  skillGaps: (minGap = 1) =>
    api.get<{ results: CompetencyGapRow[]; count: number }>(`${BASE}/skill-gaps?min_gap=${minGap}`),
};
