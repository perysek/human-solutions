import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

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
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('jobs');
  const { data: job, loading, error } = useApiData(() => jobsApi.get(id as string), [id]);
  useEscapeAction(() => navigate('/jobs'));

  return (
    <div className="refined-page">
      <PageHeader
        title="Stanowisko"
        subtitle={job?.id}
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
        <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Kod" value={job.id} />
            <Field label="Opis" value={job.description ?? '—'} />
            <Field label="Utworzono" value={job.created_at ? new Date(job.created_at).toLocaleString('pl-PL') : '—'} />
            <Field label="Zaktualizowano" value={job.updated_at ? new Date(job.updated_at).toLocaleString('pl-PL') : '—'} />
          </div>
          {/* Phase 3 (IMPLEMENTATION_PLAN.md §8) adds a "Wymagane umiejętności"
              section here — the job's required-skills matrix (job_skills). */}
        </div>
      )}
    </div>
  );
}
