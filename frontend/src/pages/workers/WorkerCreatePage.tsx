import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { WorkerForm } from './WorkerForm';

export function WorkerCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <PageHeader title="Nowy pracownik" subtitle="Dodaj pracownika" />
      <WorkerForm mode="create" onSaved={(id) => navigate(`/workers/${encodeURIComponent(id)}`)} onCancel={() => navigate('/workers')} />
    </div>
  );
}
