import { api } from './client';

export interface BhpTraining {
  id: number;
  worker_id: string;
  training_date: string | null;
  valid_until: string | null;
  kind: 'Initial' | 'Periodic' | 'Control';
}

export interface ExpiringBhpTraining extends BhpTraining {
  full_name: string;
  bucket: 'critical' | 'warning' | 'notice';
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
