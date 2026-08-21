import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AlertThresholdsPage } from '@/pages/dashboard/AlertThresholdsPage';
import { UsersListPage } from '@/pages/users/UsersListPage';
import { UserCreatePage } from '@/pages/users/UserCreatePage';
import { UserViewPage } from '@/pages/users/UserViewPage';
import { UserEditPage } from '@/pages/users/UserEditPage';
import { RolesListPage } from '@/pages/roles/RolesListPage';
import { RoleCreatePage } from '@/pages/roles/RoleCreatePage';
import { RoleViewPage } from '@/pages/roles/RoleViewPage';
import { RoleEditPage } from '@/pages/roles/RoleEditPage';
import { JobsListPage } from '@/pages/jobs/JobsListPage';
import { JobCreatePage } from '@/pages/jobs/JobCreatePage';
import { JobViewPage } from '@/pages/jobs/JobViewPage';
import { JobEditPage } from '@/pages/jobs/JobEditPage';
import { SkillsListPage } from '@/pages/skills/SkillsListPage';
import { SkillCreatePage } from '@/pages/skills/SkillCreatePage';
import { SkillEditPage } from '@/pages/skills/SkillEditPage';
import { WorkersListPage } from '@/pages/workers/WorkersListPage';
import { WorkerCreatePage } from '@/pages/workers/WorkerCreatePage';
import { WorkerViewPage } from '@/pages/workers/WorkerViewPage';
import { WorkerEditPage } from '@/pages/workers/WorkerEditPage';
import { WorkerHierarchyPage } from '@/pages/workers/WorkerHierarchyPage';
import { CompetencyGapsReportPage } from '@/pages/workers/CompetencyGapsReportPage';
import { MedicalExpiringReportPage } from '@/pages/medical/MedicalExpiringReportPage';
import { BhpExpiringReportPage } from '@/pages/bhp/BhpExpiringReportPage';
import { TrainingsListPage } from '@/pages/trainings/TrainingsListPage';
import { TrainingCreatePage } from '@/pages/trainings/TrainingCreatePage';
import { TrainingViewPage } from '@/pages/trainings/TrainingViewPage';
import { TrainingEditPage } from '@/pages/trainings/TrainingEditPage';
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
          <Route path="/profile" element={<ProfilePage />} />

          {/* module_permission_required('dashboard') — routes/dashboard/routes.py.
              `viewer` has no dashboard grant (RBAC seed) so ProtectedRoute
              bounces it to /profile instead of a dead end. */}
          <Route element={<ProtectedRoute requireModule="dashboard" />}>
            <Route path="/" element={<DashboardPage />} />
          </Route>

          {/* role_required('superadmin') — routes/dashboard/routes.py's
              alert-thresholds endpoints (DSH_5). */}
          <Route element={<ProtectedRoute guard={({ user }) => user.role === 'superadmin'} />}>
            <Route path="/alert-thresholds" element={<AlertThresholdsPage />} />
          </Route>

          {/* module_permission_required('workers') — routes/workers/routes.py */}
          <Route element={<ProtectedRoute requireModule="workers" />}>
            <Route path="/workers" element={<WorkersListPage />} />
            <Route path="/workers/create" element={<WorkerCreatePage />} />
            {/* Static segment ranks above the dynamic /workers/:id in React
                Router v6's route matching, so placement relative to it
                doesn't matter — kept here for readability, next to the
                other worker-scoped report/list routes. */}
            <Route path="/workers/competency-gaps" element={<CompetencyGapsReportPage />} />
            <Route path="/workers/:id" element={<WorkerViewPage />} />
            <Route path="/workers/:id/edit" element={<WorkerEditPage />} />
            <Route path="/workers/:id/subordinates" element={<WorkerHierarchyPage />} />
          </Route>

          {/* module_permission_required('jobs') — routes/jobs/routes.py */}
          <Route element={<ProtectedRoute requireModule="jobs" />}>
            <Route path="/jobs" element={<JobsListPage />} />
            <Route path="/jobs/create" element={<JobCreatePage />} />
            <Route path="/jobs/:id" element={<JobViewPage />} />
            <Route path="/jobs/:id/edit" element={<JobEditPage />} />
          </Route>

          {/* module_permission_required('skills') — routes/skills/routes.py */}
          <Route element={<ProtectedRoute requireModule="skills" />}>
            <Route path="/skills" element={<SkillsListPage />} />
            <Route path="/skills/create" element={<SkillCreatePage />} />
            <Route path="/skills/:id/edit" element={<SkillEditPage />} />
          </Route>

          {/* module_permission_required('medical') — routes/medical/routes.py */}
          <Route element={<ProtectedRoute requireModule="medical" />}>
            <Route path="/medical/expiring" element={<MedicalExpiringReportPage />} />
          </Route>

          {/* module_permission_required('bhp') — routes/bhp/routes.py */}
          <Route element={<ProtectedRoute requireModule="bhp" />}>
            <Route path="/bhp/expiring" element={<BhpExpiringReportPage />} />
          </Route>

          {/* module_permission_required('trainings') — routes/trainings/routes.py.
              Every role with `trainings` access (superadmin/hr_manager/trainer/
              viewer, Faza 0's macierz) reaches the list/view/edit pages; the
              page bodies themselves further gate write actions (TrainingViewPage's
              Edit button, ParticipantsTable's add/edit controls) to match the
              backend's finer-grained own_data/role checks. */}
          <Route element={<ProtectedRoute requireModule="trainings" />}>
            <Route path="/trainings" element={<TrainingsListPage />} />
            <Route path="/trainings/:id" element={<TrainingViewPage />} />
            <Route path="/trainings/:id/edit" element={<TrainingEditPage />} />
          </Route>

          {/* POST /trainings/api is role_required('superadmin', 'hr_manager')
              only — `trainer`/`viewer` never get to create a training, unlike
              the broader module access above. */}
          <Route element={<ProtectedRoute guard={({ user }) => user.role === 'superadmin' || user.role === 'hr_manager'} />}>
            <Route path="/trainings/create" element={<TrainingCreatePage />} />
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
