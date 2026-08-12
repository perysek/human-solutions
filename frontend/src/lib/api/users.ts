import { api } from './client';

export interface UserListItem {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string | null;
  employee_id: number | null;
  employee_name: string | null;
}

export interface RoleOption {
  id: number;
  name: string;
  display_name: string;
}

export interface EmployeeOption {
  id: number;
  first_name: string;
  last_name: string;
}

export interface UserFormOptions {
  roles: RoleOption[];
  available_employees: EmployeeOption[];
}

export interface UserPayload {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  employee_id?: number | null;
  password?: string;
  new_password?: string;
}

const BASE = '/system/users/api';

export const usersApi = {
  list: () => api.get<{ users: UserListItem[]; count: number }>(BASE),
  get: (id: number) => api.get<UserListItem>(`${BASE}/${id}`),
  formOptions: () => api.get<UserFormOptions>(`${BASE}/form-options`),
  create: (payload: UserPayload) => api.post<{ success: boolean; user_id: number }>(BASE, payload),
  update: (id: number, payload: Partial<UserPayload>) => api.put<{ success: boolean }>(`${BASE}/${id}`, payload),
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),
  toggleActive: (id: number) => api.put<{ success: boolean; is_active: boolean }>(`${BASE}/${id}/toggle-active`),
};
