import { api } from './client';

export interface DashboardSummary {
  active_workers: number;
  trainings_this_month: number;
}

export type AlertBucket = 'critical' | 'warning' | 'notice';

export interface MedicalAlert {
  id: number;
  worker_id: string;
  full_name: string;
  description: string | null;
  performed_on: string | null;
  valid_until: string | null;
  kind: 'Preliminary' | 'Periodic';
  bucket: AlertBucket;
}

export interface BhpAlert {
  id: number;
  worker_id: string;
  full_name: string;
  training_date: string | null;
  valid_until: string | null;
  kind: 'Initial' | 'Periodic' | 'Control';
  bucket: AlertBucket;
}

export interface ForeignerDocAlert {
  worker_id: string;
  full_name: string;
  document_kind: string | null;
  document_validity: string | null;
  /** DSH_4 — only ever 'critical' | 'warning' (OQ_1: this module has no notice tier). */
  bucket: Exclude<AlertBucket, 'notice'>;
}

/** Task 2 — a job-position with no department assigned (jobs.department_id
 * IS NULL). No `bucket`/date of its own (not an expiry alert) — AlertPanel
 * gives every orphan-jobs row a fixed 'notice' bucket, see DashboardPage. */
export interface OrphanJobAlert {
  id: string;
  description: string | null;
}

/** Pulpit's "N dni do zwolnienia" section — pending notices of termination
 * (submitted via the worker's "Dezaktywuj" flow) whose planned_fire_date
 * is coming up within the fixed 14-day window (services/alert_service.py's
 * WORKER_TERMINATION_WINDOW_DAYS). 2-tier bucket, no 'notice' tier — see
 * get_upcoming_terminations' docstring. */
export interface UpcomingTerminationAlert {
  worker_id: string;
  full_name: string;
  planned_fire_date: string | null;
  bucket: Exclude<AlertBucket, 'notice'>;
}

/** Pulpit's "Zaległe szkolenia" alert (Faza 7) — a training whose
 * training_date has passed with its roster still short of "done"
 * (TrainingRepository.get_overdue's docstring). 2-tier bucket, no 'notice'
 * tier — every row here is by definition already overdue. */
export interface OverdueTrainingAlert {
  id: number;
  description: string;
  training_date: string;
  pending_participants: number;
  delay_days: number;
  bucket: Exclude<AlertBucket, 'notice'>;
}

/** Pulpit's "Działania do luk kompetencji" alert (Faza 7) — an open action
 * plan (status defined/in_progress) whose planned_date has passed. Same
 * 2-tier bucket reasoning as OverdueTrainingAlert. */
export interface OverdueActionPlanAlert {
  id: number;
  description: string;
  responsible_name: string | null;
  planned_date: string;
  delay_days: number;
  bucket: Exclude<AlertBucket, 'notice'>;
}

export interface OwnTraining {
  id: number;
  description: string;
  training_date: string | null;
  completion: number | null;
}

/** Full-access shape (superadmin/hr_manager): the three employee-facing
 * alert panels (DSH_2/3/4). */
export interface FullAlerts {
  medical: MedicalAlert[];
  bhp: BhpAlert[];
  foreigner_docs: ForeignerDocAlert[];
  orphan_jobs: OrphanJobAlert[];
  upcoming_terminations: UpcomingTerminationAlert[];
  overdue_trainings: OverdueTrainingAlert[];
  overdue_action_plans: OverdueActionPlanAlert[];
}

/** `trainer` shape (own_data=TRUE on `dashboard`): RODO_2 blocks all three
 * employee-facing panels outright, replaced by the trainer's own upcoming
 * trainings — see services/dashboard_service.py's get_alerts docstring. */
export interface OwnTrainingsAlerts {
  own_trainings: OwnTraining[];
}

export type DashboardAlerts = FullAlerts | OwnTrainingsAlerts;

export function isOwnTrainingsAlerts(alerts: DashboardAlerts): alerts is OwnTrainingsAlerts {
  return 'own_trainings' in alerts;
}

export interface AlertThreshold {
  module: 'medical' | 'bhp' | 'foreigner_docs';
  warning_days: number;
  critical_days: number;
  notice_days: number;
  updated_at: string | null;
}

export interface AlertThresholdInput {
  module: string;
  critical_days: number;
  warning_days: number;
  notice_days: number;
}

const BASE = '/dashboard/api';

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>(`${BASE}/summary`),
  alerts: () => api.get<DashboardAlerts>(`${BASE}/alerts`),
  getThresholds: () => api.get<{ thresholds: AlertThreshold[] }>(`${BASE}/alert-thresholds`),
  updateThresholds: (thresholds: AlertThresholdInput[]) =>
    api.put<{ success: boolean }>(`${BASE}/alert-thresholds`, { thresholds }),
};
