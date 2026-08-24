import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { JobForm } from './JobForm';

/** Task 2 — state shape the Pulpit's "Stanowiska bez działu" alert
 * navigates here with (DashboardPage.tsx's onRowClick): `focusDepartment`
 * expands the "Dział" select on mount (JobForm's autoFocusDepartment),
 * `returnTo` overrides where a successful save lands — the dashboard, not
 * this job's own view page — since coming back here is the whole point of
 * having followed the alert in the first place. */
interface JobEditLocationState {
  focusDepartment?: boolean;
  returnTo?: string;
}

export function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { focusDepartment, returnTo } = (location.state as JobEditLocationState | null) ?? {};
  const { data: job, loading, error } = useApiData(() => jobsApi.get(id as string), [id]);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Edytuj stanowisko" subtitle={job?.id} />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !job ? (
          <EmptyState icon="error" title="Nie znaleziono stanowiska" message={error ?? undefined} />
        ) : (
          <JobForm
            mode="edit"
            initial={job}
            autoFocusDepartment={focusDepartment}
            onSaved={(savedId) => navigate(returnTo ?? `/jobs/${encodeURIComponent(savedId)}`)}
            onCancel={() => navigate(returnTo ?? '/jobs')}
          />
        )}
      </div>
    </div>
  );
}
