import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { ModuleName } from './permissions';
import type { AuthUser } from './types';

interface GuardCtx {
  user: AuthUser;
  hasModuleAccess: (moduleName: ModuleName | string) => boolean;
}

interface ProtectedRouteProps {
  /** Simple case: gate on a single module (mirrors module_permission_required). */
  requireModule?: ModuleName;
  /** Escape hatch for OR-of-conditions gates, e.g. absence_management_required
   * (module access OR is_supervisor) or has_linked_employee-only pages. Wins
   * over requireModule when both are given. */
  guard?: (ctx: GuardCtx) => boolean;
}

/**
 * Route guard — mirrors auth_config.module_permission_required /
 * @login_required. Unauthenticated users are bounced to /login with a
 * `next` param (see routes/auth/routes.py's `next_page` redirect); users
 * failing the permission check are bounced to the default landing page
 * rather than shown a blank/broken screen. Waits out the initial GET
 * /auth/me session-check (isLoading) before deciding, so a page refresh on
 * a protected route doesn't flash-redirect to /login before the real
 * session state is known.
 */
export function ProtectedRoute({ requireModule, guard }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, hasModuleAccess } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ next: location.pathname }} replace />;
  }

  const allowed = guard
    ? guard({ user, hasModuleAccess })
    : requireModule
      ? hasModuleAccess(requireModule)
      : true;

  if (!allowed) {
    return <Navigate to="/profile" replace />;
  }

  return <Outlet />;
}
