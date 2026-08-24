import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { TrainingForm } from './TrainingForm';

export function TrainingEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const trainingId = Number(id);
  const { data: training, loading, error } = useApiData(() => trainingsApi.get(trainingId), [trainingId]);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Edytuj szkolenie" subtitle={training?.description} />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !training ? (
          <EmptyState icon="error" title="Nie znaleziono szkolenia" message={error ?? undefined} />
        ) : (
          <TrainingForm
            mode="edit"
            initial={training}
            onSaved={(savedId) => navigate(`/trainings/${savedId}`)}
            onCancel={() => navigate('/trainings')}
          />
        )}
      </div>
    </div>
  );
}
