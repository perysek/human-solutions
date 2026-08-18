import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { WorkerForm } from './WorkerForm';

export function WorkerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: worker, loading, error } = useApiData(() => workersApi.get(id as string), [id]);

  return (
    <div className="refined-page">
      <PageHeader title="Edytuj pracownika" subtitle={worker?.full_name} />
      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !worker ? (
        <EmptyState icon="error" title="Nie znaleziono pracownika" message={error ?? undefined} />
      ) : (
        <WorkerForm
          mode="edit"
          initial={worker}
          onSaved={(savedId) => navigate(`/workers/${encodeURIComponent(savedId)}`)}
          onCancel={() => navigate('/workers')}
        />
      )}
    </div>
  );
}
