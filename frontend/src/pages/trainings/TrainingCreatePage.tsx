import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrainingForm } from './TrainingForm';

interface CreateLocationState {
  /** Where 'Zapisz'/'Anuluj' return to — set by WorkerOnboardingTrainingsPage's
   * "Utwórz szkolenie" button so onboarding stays on its own list instead of
   * landing on the new training's own view/the full catalog. */
  returnTo?: string;
  prefillWorkerId?: string;
  prefillWorkerName?: string;
  prefillJobId?: string;
}

export function TrainingCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { returnTo, prefillWorkerId, prefillWorkerName, prefillJobId } = (location.state as CreateLocationState | null) ?? {};
  const prefillWorker =
    prefillWorkerId && prefillWorkerName && prefillJobId ? { id: prefillWorkerId, name: prefillWorkerName, jobId: prefillJobId } : undefined;

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader
          title="Nowe szkolenie"
          subtitle={prefillWorker ? `Szkolenie wstępne — ${prefillWorker.name}` : 'Dodaj szkolenie do katalogu'}
        />
        <TrainingForm
          mode="create"
          prefillWorker={prefillWorker}
          onSaved={(id) => navigate(returnTo ?? `/trainings/${id}`)}
          onCancel={() => navigate(returnTo ?? '/trainings')}
        />
      </div>
    </div>
  );
}
