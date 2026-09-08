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
  /** users.worker_id — the linked `workers` row, if any (null = unassigned). */
  worker_id: string | null;
  /** "Firstname Surname" of the linked worker, or null — see worker_id. */
  worker_name: string | null;
}

export interface RoleOption {
  id: number;
  name: string;
  display_name: string;
}

/** One row of the "Pracownik" picker in UserForm — every worker, active or
 * not, with linked_user_id telling the form which ones are already taken
 * (so it can filter them out, except the one currently being edited). */
export interface UserFormWorkerOption {
  id: string;
  full_name: string;
  is_active: boolean;
  linked_user_id: number | null;
  linked_user_name: string | null;
}

export interface UserFormOptions {
  roles: RoleOption[];
  workers: UserFormWorkerOption[];
}

export interface UserPayload {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  password?: string;
  new_password?: string;
  /** workers.id to link, or null to unlink. Omitted = unchanged only on the
   * password-only PUT branch (routes/users/routes.py) — every other create/
   * update call should pass it explicitly. */
  worker_id?: string | null;
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
