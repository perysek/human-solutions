/**
 * Module names this frontend actually gates pages on. The backend computes
 * real access (config/auth_config.py's MODULE_PERMISSIONS + the dynamic
 * `roles`/`role_permissions` tables) and ships the result via GET /auth/me
 * — this type exists only so call sites get autocomplete/typo-checking,
 * not because the frontend holds its own copy of the access rules anymore.
 */
export type ModuleName = 'employees' | 'settings' | 'absences';
