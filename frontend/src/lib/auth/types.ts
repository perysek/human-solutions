/**
 * Mirrors database/models.py `User.role`. Kept as a union of the 3 roles
 * this build's seed data (scripts/seed_dev_data.py) actually creates —
 * the backend's `roles` table is the real source of truth and could have
 * more/fewer rows; this is just what the UI knows how to label.
 */
export type Role = 'superuser' | 'admin' | 'receptionist';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
}

export interface ModulePermission {
  hasAccess: boolean;
  readOnly: boolean;
  ownData: boolean;
}

/** Raw shape returned by GET /auth/me's `permissions` field (snake_case, one entry per backend module). */
export type RawPermissions = Record<string, { has_access: boolean; read_only: boolean; own_data: boolean }>;

export interface MeResponse {
  authenticated: boolean;
  user?: {
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    last_login: string | null;
  };
  permissions?: RawPermissions;
  is_supervisor?: boolean;
  has_linked_employee?: boolean;
}
