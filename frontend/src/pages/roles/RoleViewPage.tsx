import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { rolesApi } from '@/lib/api/roles';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

export function RoleViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error } = useApiData(() => rolesApi.list());
  const role = data?.roles.find((r) => r.id === Number(id));
  useEscapeAction(() => navigate('/roles'));

  return (
    <div className="refined-page">
      <PageHeader
        title="Rola"
        subtitle={role?.display_name}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/roles')}>
              Wróć do listy
            </Button>
            {role && (
              <Button variant="primary" onClick={() => navigate(`/roles/${role.id}/edit`)}>
                Edytuj
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !role ? (
        <EmptyState icon="error" title="Nie znaleziono roli" message={error ?? undefined} />
      ) : (
        <RolePermissionMatrix value={role.permissions_detail} readOnly />
      )}
    </div>
  );
}
