import { api } from './client';

export interface BhpTraining {
  id: number;
  worker_id: string;
  training_date: string | null;
  valid_until: string | null;
  kind: 'Initial' | 'Periodic' | 'Control';
}

/** UI-fixes-08092026 task3 — see ExpiringMedicalExam's docstring; same
 * reasoning for bhp_trainings' 'missing' ("brak zapisów") rows. */
export interface ExpiringBhpTraining extends Omit<BhpTraining, 'id' | 'kind'> {
  id: number | null;
  kind: BhpTraining['kind'] | null;
  full_name: string;
  bucket: 'critical' | 'warning' | 'notice' | 'expired' | 'missing';
}

export interface BhpTrainingPayload {
  training_date: string;
  valid_until?: string | null;
  kind: 'Initial' | 'Periodic' | 'Control';
}

const BASE = '/bhp/api';

export const bhpApi = {
  listForWorker: (workerId: string) =>
    api.get<{ trainings: BhpTraining[]; count: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}`),
  create: (workerId: string, payload: BhpTrainingPayload) =>
    api.post<{ success: boolean; id: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}`, payload),
  update: (trainingId: number, payload: BhpTrainingPayload) =>
    api.put<{ success: boolean }>(`${BASE}/${trainingId}`, payload),
  remove: (trainingId: number) => api.del<{ success: boolean }>(`${BASE}/${trainingId}`),
  expiring: (days = 30) => api.get<{ trainings: ExpiringBhpTraining[]; count: number }>(`${BASE}/expiring?days=${days}`),
};
