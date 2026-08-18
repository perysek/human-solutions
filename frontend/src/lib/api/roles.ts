import { api } from './client';

export interface ModuleFlags {
  has_access: boolean;
  read_only: boolean;
  own_data: boolean;
}

export interface RoleListItem {
  id: number;
  name: string;
  display_name: string;
  is_protected: boolean;
  access_count: number;
  permissions: Record<string, boolean>;
  permissions_detail: Record<string, ModuleFlags>;
}

/** Mirrors repositories/roles/role_repository.py's ALL_MODULES + MODULE_DISPLAY_NAMES
 * (the JSON API doesn't ship display names, so this is a small kept-in-sync copy). */
export const ALL_MODULES = [
  'workers',
  'jobs',
  'medical',
  'bhp',
  'skills',
  'trainings',
  'dashboard',
  'audit',
  'admin',
] as const;

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  workers: 'Pracownicy',
  jobs: 'Stanowiska',
  medical: 'Badania lekarskie',
  bhp: 'Szkolenia BHP',
  skills: 'Umiejętności',
  trainings: 'Szkolenia wewnętrzne',
  dashboard: 'Pulpit',
  audit: 'Historia zmian',
  admin: 'Administracja',
};

const BASE = '/system/roles/api';

export const rolesApi = {
  list: () => api.get<{ roles: RoleListItem[]; count: number }>(BASE),
  create: (name: string, display_name: string, permissions: Record<string, ModuleFlags>) =>
    api.post<{ success: boolean; role_id: number }>(BASE, { name, display_name, permissions }),
  update: (id: number, display_name: string, permissions: Record<string, ModuleFlags>) =>
    api.put<{ success: boolean }>(`${BASE}/${id}`, { display_name, permissions }),
  remove: (id: number) => api.del<{ success: boolean }>(`${BASE}/${id}`),
};
