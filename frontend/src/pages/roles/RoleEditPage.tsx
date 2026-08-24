import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { rolesApi } from '@/lib/api/roles';
import { RoleForm } from './RoleForm';

export function RoleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error } = useApiData(() => rolesApi.list());
  const role = data?.roles.find((r) => r.id === Number(id));

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Edytuj rolę" subtitle={role?.display_name} />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !role ? (
          <EmptyState icon="error" title="Nie znaleziono roli" message={error ?? undefined} />
        ) : (
          <RoleForm mode="edit" initial={role} onSaved={(savedId) => navigate(`/roles/${savedId}`)} onCancel={() => navigate('/roles')} />
        )}
      </div>
    </div>
  );
}
