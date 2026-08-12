import { api } from './client';

export interface ModuleFlags {
  has_access: boolean;
  read_only: boolean;
  own_data: boolean;
  can_edit_price_history?: boolean;
  can_send_sms?: boolean;
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
  'invoices',
  'appointments',
  'clients',
  'employees',
  'services',
  'settings',
  'reports',
  'data_correction',
  'data_import',
  'absences',
  'service_prices',
] as const;

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  invoices: 'Faktury / Koszty',
  appointments: 'Wizyty',
  clients: 'Klienci',
  employees: 'Pracownicy',
  services: 'Usługi',
  settings: 'Ustawienia',
  reports: 'Historia / Raporty',
  data_correction: 'Korekta danych',
  data_import: 'Import danych',
  absences: 'Nieobecności',
  service_prices: 'Ceny usług (historia)',
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
