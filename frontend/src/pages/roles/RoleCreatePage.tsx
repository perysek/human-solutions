import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleForm } from './RoleForm';

export function RoleCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <PageHeader title="Nowa rola" subtitle="Zdefiniuj poziom dostępu" />
      <RoleForm mode="create" onSaved={(id) => navigate(`/roles/${id}`)} onCancel={() => navigate('/roles')} />
    </div>
  );
}
