/**
 * Module names this frontend actually gates pages on. The backend computes
 * real access (config/auth_config.py's MODULE_PERMISSIONS + the dynamic
 * `roles`/`role_permissions` tables) and ships the result via GET /auth/me
 * — this type exists only so call sites get autocomplete/typo-checking,
 * not because the frontend holds its own copy of the access rules anymore.
 *
 * Staamp HR domain (IMPLEMENTATION_PLAN.md §5.1) — replaces the salon's
 * 'employees' | 'settings' | 'absences' module list. Phases 1-6 introduce
 * the pages that actually consume most of these; 'admin' has no dedicated
 * module-gated route yet (user/role management use a literal superadmin
 * role check instead — see routes/users/routes.py's module docstring).
 */
export type ModuleName = 'workers' | 'jobs' | 'medical' | 'bhp' | 'skills' | 'trainings' | 'dashboard' | 'audit' | 'admin';
