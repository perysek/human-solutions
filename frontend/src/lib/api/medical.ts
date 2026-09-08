import { api } from './client';

export interface MedicalExam {
  id: number;
  worker_id: string;
  description: string | null;
  performed_on: string | null;
  valid_until: string | null;
  kind: 'Preliminary' | 'Periodic';
}

/** UI-fixes-08092026 task3 — a 'missing' row ("brak zapisów", the worker
 * has zero medical_exams rows at all) has no real exam to describe, so
 * `id`/`performed_on`/`valid_until`/`kind` are all null on it — narrower
 * than the base MedicalExam (used by the real create/edit forms, where
 * these are always present). */
export interface ExpiringMedicalExam extends Omit<MedicalExam, 'id' | 'kind'> {
  id: number | null;
  kind: MedicalExam['kind'] | null;
  full_name: string;
  bucket: 'critical' | 'warning' | 'notice' | 'expired' | 'missing';
}

export interface MedicalExamPayload {
  description?: string | null;
  performed_on: string;
  valid_until?: string | null;
  kind: 'Preliminary' | 'Periodic';
}

const BASE = '/medical/api';

export const medicalApi = {
  listForWorker: (workerId: string) =>
    api.get<{ exams: MedicalExam[]; count: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}`),
  create: (workerId: string, payload: MedicalExamPayload) =>
    api.post<{ success: boolean; id: number }>(`${BASE}/worker/${encodeURIComponent(workerId)}`, payload),
  update: (examId: number, payload: MedicalExamPayload) =>
    api.put<{ success: boolean }>(`${BASE}/${examId}`, payload),
  remove: (examId: number) => api.del<{ success: boolean }>(`${BASE}/${examId}`),
  expiring: (days = 30) => api.get<{ exams: ExpiringMedicalExam[]; count: number }>(`${BASE}/expiring?days=${days}`),
};
