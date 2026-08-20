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
