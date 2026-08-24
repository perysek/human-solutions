import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrainingForm } from './TrainingForm';

export function TrainingCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Nowe szkolenie" subtitle="Dodaj szkolenie do katalogu" />
        <TrainingForm mode="create" onSaved={(id) => navigate(`/trainings/${id}`)} onCancel={() => navigate('/trainings')} />
      </div>
    </div>
  );
}
