import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { UsersListPage } from '@/pages/users/UsersListPage';
import { UserCreatePage } from '@/pages/users/UserCreatePage';
import { UserViewPage } from '@/pages/users/UserViewPage';
import { UserEditPage } from '@/pages/users/UserEditPage';
import { RolesListPage } from '@/pages/roles/RolesListPage';
import { RoleCreatePage } from '@/pages/roles/RoleCreatePage';
import { RoleViewPage } from '@/pages/roles/RoleViewPage';
import { RoleEditPage } from '@/pages/roles/RoleEditPage';
import { EmployeesListPage } from '@/pages/employees/EmployeesListPage';
import { EmployeeCreatePage } from '@/pages/employees/EmployeeCreatePage';
import { EmployeeViewPage } from '@/pages/employees/EmployeeViewPage';
import { EmployeeEditPage } from '@/pages/employees/EmployeeEditPage';
import { FormaZatrudnieniaPage } from '@/pages/employees/FormaZatrudnieniaPage';
import { EmployeeHierarchyPage } from '@/pages/employees/EmployeeHierarchyPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      {/* Everything below requires a logged-in user (mirrors @login_required). */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/profile" replace />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Salon-era employees pages, kept mounted but dormant — no role
              grants the 'employees' module in the Staamp RBAC rebuild
              (IMPLEMENTATION_PLAN.md §5.1/§5.5), so this route group is
              unreachable for everyone until Phase 1/2 replace it with the
              real workers/jobs pages under a live module. Uses `guard`
              (not `requireModule`) because 'employees' isn't part of the
              typed ModuleName union any more — see permissions.ts. */}
          <Route element={<ProtectedRoute guard={({ hasModuleAccess }) => hasModuleAccess('employees')} />}>
            <Route path="/employees" element={<EmployeesListPage />} />
            <Route path="/employees/create" element={<EmployeeCreatePage />} />
            <Route path="/employees/formy-zatrudnienia" element={<FormaZatrudnieniaPage />} />
            <Route path="/employees/hierarchy" element={<EmployeeHierarchyPage />} />
            <Route path="/employees/:id" element={<EmployeeViewPage />} />
            <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
          </Route>

          {/* role_required('superadmin') — routes/users/routes.py gates every
              endpoint to the literal role (a deliberate hard boundary, not a
              module grant — see that file's module docstring). */}
          <Route element={<ProtectedRoute guard={({ user }) => user.role === 'superadmin'} />}>
            <Route path="/users" element={<UsersListPage />} />
            <Route path="/users/create" element={<UserCreatePage />} />
            <Route path="/users/:id" element={<UserViewPage />} />
            <Route path="/users/:id/edit" element={<UserEditPage />} />
          </Route>

          {/* role_required('superadmin') — routes/roles/routes.py, same literal-role gate. */}
          <Route element={<ProtectedRoute guard={({ user }) => user.role === 'superadmin'} />}>
            <Route path="/roles" element={<RolesListPage />} />
            <Route path="/roles/create" element={<RoleCreatePage />} />
            <Route path="/roles/:id" element={<RoleViewPage />} />
            <Route path="/roles/:id/edit" element={<RoleEditPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
