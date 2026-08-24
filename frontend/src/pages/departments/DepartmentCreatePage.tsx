import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { DepartmentForm } from './DepartmentForm';

export function DepartmentCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Nowy dział" subtitle="Dodaj dział do słownika" />
        <DepartmentForm mode="create" onSaved={() => navigate('/departments')} onCancel={() => navigate('/departments')} />
      </div>
    </div>
  );
}
