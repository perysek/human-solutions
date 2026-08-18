import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { JobForm } from './JobForm';

export function JobCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <PageHeader title="Nowe stanowisko" subtitle="Dodaj stanowisko do słownika" />
      <JobForm mode="create" onSaved={(id) => navigate(`/jobs/${encodeURIComponent(id)}`)} onCancel={() => navigate('/jobs')} />
    </div>
  );
}
