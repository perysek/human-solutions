import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmployeeForm } from './EmployeeForm';

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <PageHeader title="Nowy pracownik" subtitle="Dodaj pracownika do kadry salonu" />
      <EmployeeForm mode="create" onSaved={(id) => navigate(`/employees/${id}`)} />
    </div>
  );
}
