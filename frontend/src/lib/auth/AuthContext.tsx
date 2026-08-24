import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { AuthUser, MeResponse, ModulePermission, Role } from './types';
import type { ModuleName } from './permissions';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until the initial GET /auth/me session-check resolves. */
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasModuleAccess: (moduleName: ModuleName | string) => boolean;
  /** True when the user's only grant to this module is read_only — mutating
   * actions (create/edit/delete) must hide/disable, not just rely on the
   * backend's 403 (module_permission_required already blocks the request;
   * this is for not showing a button that would just fail). */
  isModuleReadOnly: (moduleName: ModuleName | string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(raw: NonNullable<MeResponse['user']>): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.full_name,
    role: raw.role as Role,
    isActive: raw.is_active,
    lastLogin: raw.last_login,
    workerId: raw.worker_id,
  };
}

function toPermissionsMap(raw: MeResponse['permissions']): Record<string, ModulePermission> {
  const out: Record<string, ModulePermission> = {};
  for (const [module, flags] of Object.entries(raw ?? {})) {
    out[module] = { hasAccess: flags.has_access, readOnly: flags.read_only, ownData: flags.own_data };
  }
  return out;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, ModulePermission>>({});
  const [isLoading, setIsLoading] = useState(true);

  const applyMe = useCallback((me: MeResponse) => {
    if (me.authenticated && me.user) {
      setUser(toAuthUser(me.user));
      setPermissions(toPermissionsMap(me.permissions));
    } else {
      setUser(null);
      setPermissions({});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>('/auth/me')
      .then((me) => {
        if (!cancelled) applyMe(me);
      })
      .catch(() => {
        if (!cancelled) applyMe({ authenticated: false });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  const login = useCallback(
    async (email: string, password: string, remember = false) => {
      try {
        await api.post('/auth/login', { email, password, remember });
        const me = await api.get<MeResponse>('/auth/me');
        applyMe(me);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.' };
      }
    },
    [applyMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.get('/auth/logout');
    } finally {
      applyMe({ authenticated: false });
    }
  }, [applyMe]);

  const hasModuleAccess = useCallback(
    (moduleName: ModuleName | string) => permissions[moduleName]?.hasAccess ?? false,
    [permissions],
  );

  const isModuleReadOnly = useCallback(
    (moduleName: ModuleName | string) => permissions[moduleName]?.readOnly ?? false,
    [permissions],
  );

  const hasRole = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasModuleAccess,
      isModuleReadOnly,
      hasRole,
    }),
    [user, isLoading, login, logout, hasModuleAccess, isModuleReadOnly, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context + companion hook colocated deliberately (single call site pattern
// used by every provider in this app — see ConfirmProvider/ToastProvider) —
// react-refresh/only-export-components only affects HMR granularity, not
// correctness, and isn't worth a second file for one hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
