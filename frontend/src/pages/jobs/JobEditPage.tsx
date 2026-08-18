import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { JobForm } from './JobForm';

export function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, loading, error } = useApiData(() => jobsApi.get(id as string), [id]);

  return (
    <div className="refined-page">
      <PageHeader title="Edytuj stanowisko" subtitle={job?.id} />
      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !job ? (
        <EmptyState icon="error" title="Nie znaleziono stanowiska" message={error ?? undefined} />
      ) : (
        <JobForm
          mode="edit"
          initial={job}
          onSaved={(savedId) => navigate(`/jobs/${encodeURIComponent(savedId)}`)}
          onCancel={() => navigate('/jobs')}
        />
      )}
    </div>
  );
}
