/**
 * Mirrors config/auth_config.py's ROLE_HIERARCHY — the Staamp HR domain's
 * four roles (IMPLEMENTATION_PLAN.md §5.1). The backend's `roles` table is
 * the real source of truth (a superadmin can add further custom roles via
 * the Roles UI); this union is just what the UI knows how to label without
 * an extra round-trip.
 */
export type Role = 'superadmin' | 'hr_manager' | 'trainer' | 'viewer';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
  /** Faza 5 — links this account to a `workers` row (null for most
   * superadmin/hr_manager accounts). Lets the UI compare against a
   * training's `trainer_id` to decide whether a `trainer` owns it, without
   * a round trip — the real enforcement is server-side
   * (own_data_worker_id/assert_trainer_can_edit). */
  workerId: string | null;
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
    worker_id: string | null;
  };
  permissions?: RawPermissions;
}
