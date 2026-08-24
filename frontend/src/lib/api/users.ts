import { api } from './client';

export interface UserListItem {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string | null;
  failed_logins: number;
  is_locked: boolean;
  locked_until: string | null;
}

export interface RoleOption {
  id: number;
  name: string;
  display_name: string;
}

export interface UserFormOptions {
  roles: RoleOption[];
}

export interface UserPayload {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
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
  /** AUTH_5 manual-unlock side — superadmin only (routes/users/routes.py). */
  unlock: (id: number) => api.put<{ success: boolean }>(`${BASE}/${id}/unlock`),
};
