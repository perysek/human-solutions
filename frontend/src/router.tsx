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
import { AbsenceManagementPage } from '@/pages/absences/AbsenceManagementPage';
import { AbsenceBalancesPage } from '@/pages/absences/AbsenceBalancesPage';
import { MyAbsencesPage } from '@/pages/absences/MyAbsencesPage';
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

          {/* module_permission_required('employees') */}
          <Route element={<ProtectedRoute requireModule="employees" />}>
            <Route path="/employees" element={<EmployeesListPage />} />
            <Route path="/employees/create" element={<EmployeeCreatePage />} />
            <Route path="/employees/formy-zatrudnienia" element={<FormaZatrudnieniaPage />} />
            <Route path="/employees/hierarchy" element={<EmployeeHierarchyPage />} />
            <Route path="/employees/:id" element={<EmployeeViewPage />} />
            <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
          </Route>

          {/* role_required('superuser', 'admin') — routes/users/routes.py */}
          <Route element={<ProtectedRoute requireModule="settings" />}>
            <Route path="/users" element={<UsersListPage />} />
            <Route path="/users/create" element={<UserCreatePage />} />
            <Route path="/users/:id" element={<UserViewPage />} />
            <Route path="/users/:id/edit" element={<UserEditPage />} />
          </Route>

          {/* role_required('superuser') only — routes/roles/routes.py gates every
              endpoint to the literal role, not the 'settings' module an admin
              also has (see navConfig.ts's matching comment). */}
          <Route element={<ProtectedRoute guard={({ user }) => user.role === 'superuser'} />}>
            <Route path="/roles" element={<RolesListPage />} />
            <Route path="/roles/create" element={<RoleCreatePage />} />
            <Route path="/roles/:id" element={<RoleViewPage />} />
            <Route path="/roles/:id/edit" element={<RoleEditPage />} />
          </Route>

          {/* absence_management_required: module access OR is_supervisor */}
          <Route element={<ProtectedRoute guard={({ isSupervisor, hasModuleAccess }) => isSupervisor || hasModuleAccess('absences')} />}>
            <Route path="/absences" element={<AbsenceManagementPage />} />
            <Route path="/absences/balances" element={<AbsenceBalancesPage />} />
          </Route>

          {/* has_linked_employee only — any authenticated user tied to an employee record */}
          <Route element={<ProtectedRoute guard={({ hasLinkedEmployee }) => hasLinkedEmployee} />}>
            <Route path="/absences/my" element={<MyAbsencesPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
