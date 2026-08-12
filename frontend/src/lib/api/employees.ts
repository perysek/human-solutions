import { api } from './client';

export interface EmployeeListItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  employment_status: string;
  hire_date: string | null;
  termination_date: string | null;
  base_salary: number | null;
  commission_rate: number | null;
  notes: string | null;
  is_active: boolean;
  user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EmployeePayload {
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  employment_status: string;
  hire_date?: string | null;
  termination_date?: string | null;
  base_salary?: number | null;
  commission_rate?: number | null;
  notes?: string | null;
  is_active: boolean;
}

export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Zatrudniony',
  on_leave: 'Na urlopie',
  terminated: 'Zwolniony',
};

const BASE = '/employees/api';

export const employeesApi = {
  list: () => api.get<{ employees: EmployeeListItem[]; count: number }>(BASE),
  get: (id: number) => api.get<EmployeeListItem>(`${BASE}/${id}`),
  create: (payload: EmployeePayload) => api.post<{ success: boolean; employee_id: number }>(BASE, payload),
  update: (id: number, payload: EmployeePayload) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),
};
