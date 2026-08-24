import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { JobSkillsSection } from './JobSkillsSection';
import { JobWorkersSection } from './JobWorkersSection';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label block mb-1">{label}</label>
      <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{value}</p>
    </div>
  );
}

export function JobViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isModuleReadOnly, hasModuleAccess } = useAuth();
  const canWrite = !isModuleReadOnly('jobs');
  const { data: job, loading, error } = useApiData(() => jobsApi.get(id as string), [id]);
  useEscapeAction(() => navigate('/jobs'));

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader
          title="Stanowisko"
          subtitle={job?.description ?? job?.id}
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate('/jobs')}>
                Wróć do listy
              </Button>
              {job && canWrite && (
                <Button variant="primary" onClick={() => navigate(`/jobs/${encodeURIComponent(job.id)}/edit`)}>
                  Edytuj
                </Button>
              )}
            </>
          }
        />

        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !job ? (
          <EmptyState icon="error" title="Nie znaleziono stanowiska" message={error ?? undefined} />
        ) : (
          <div className="space-y-4">
            <div className="form-card animate-fade-up">
              <div className="form-grid">
                <Field label="Kod" value={job.id} />
                <Field
                  label="Dział"
                  value={
                    job.department_id ? (
                      <Link to="/departments" style={{ color: 'var(--color-focus-ring)' }}>
                        {job.department_name ?? job.department_id}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Typ stanowiska" value={job.is_managerial ? 'Kierownicze' : 'Nie-kierownicze'} />
                <Field
                  label="Stanowisko przełożone"
                  value={
                    job.supervisor_job_id ? (
                      <Link to={`/jobs/${encodeURIComponent(job.supervisor_job_id)}`} style={{ color: 'var(--color-focus-ring)' }}>
                        {job.supervisor_job_description ?? job.supervisor_job_id}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Opis" value={job.description ?? '—'} />
                <Field label="Utworzono" value={job.created_at ? new Date(job.created_at).toLocaleString('pl-PL') : '—'} />
                <Field label="Zaktualizowano" value={job.updated_at ? new Date(job.updated_at).toLocaleString('pl-PL') : '—'} />
              </div>
            </div>

            <JobSkillsSection jobId={job.id} canWrite={canWrite} />

            {/* GET /jobs/api/<id>/workers gates on the 'workers' module, not
                'jobs' (RODO — see routes/jobs/routes.py's comment), so this
                section only renders for roles that actually have that grant —
                today the same superadmin/hr_manager set as 'jobs', but not
                guaranteed to always be. */}
            {hasModuleAccess('workers') && <JobWorkersSection jobId={job.id} />}
          </div>
        )}
      </div>
    </div>
  );
}
