import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { departmentsApi } from '@/lib/api/departments';
import { useApiData } from '@/lib/api/useApiData';
import { DepartmentForm } from './DepartmentForm';

export function DepartmentCreatePage() {
  const navigate = useNavigate();
  const { data } = useApiData(() => departmentsApi.list(), []);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Nowy dział" subtitle="Dodaj dział do słownika" />
        <DepartmentForm
          mode="create"
          allDepartments={data?.departments ?? []}
          onSaved={() => navigate('/departments')}
          onCancel={() => navigate('/departments')}
        />
      </div>
    </div>
  );
}
