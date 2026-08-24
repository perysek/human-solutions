import { api } from './client';

export interface MedicalExam {
  id: number;
  worker_id: string;
  description: string | null;
  performed_on: string | null;
  valid_until: string | null;
  kind: 'Preliminary' | 'Periodic';
}

export interface ExpiringMedicalExam extends MedicalExam {
  full_name: string;
  bucket: 'critical' | 'warning' | 'notice';
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
