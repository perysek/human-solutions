import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { employeesApi } from '@/lib/api/employees';
import { EmployeeForm } from './EmployeeForm';

export function EmployeeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: employee, loading, error } = useApiData(() => employeesApi.get(Number(id)), [id]);

  return (
    <div className="refined-page">
      <PageHeader title="Edytuj pracownika" subtitle={employee?.full_name} />
      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !employee ? (
        <EmptyState icon="error" title="Nie znaleziono pracownika" message={error ?? undefined} />
      ) : (
        <EmployeeForm mode="edit" initial={employee} onSaved={(savedId) => navigate(`/employees/${savedId}`)} onCancel={() => navigate('/employees')} />
      )}
    </div>
  );
}
