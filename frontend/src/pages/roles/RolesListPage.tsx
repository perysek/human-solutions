import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { rolesApi, type RoleListItem } from '@/lib/api/roles';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

export function RolesListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const canDelete = hasRole('superadmin');

  const { data, loading, error, reload } = useApiData(() => rolesApi.list());
  const roles = data?.roles ?? [];

  async function handleDelete(e: React.MouseEvent, role: RoleListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć rolę?',
      message: `Rola "${role.display_name}" zostanie trwale usunięta. Użytkownicy z tą rolą stracą dostęp.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await rolesApi.remove(role.id);
      toast.success('Rola usunięta.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć roli.');
    }
  }

  function goToView(role: RoleListItem) {
    navigate(`/roles/${role.id}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Role"
        subtitle="Poziomy dostępu i uprawnienia modułowe"
        actions={
          <Button variant="primary" onClick={() => navigate('/roles/create')}>
            <Icon name="add" size={16} />
            Utwórz
          </Button>
        }
      />

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : roles.length === 0 ? (
          <EmptyState icon="checklist" title="Brak ról" message="Dodaj pierwszą rolę." />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <th>Nazwa</th>
                    <th>Moduły z dostępem</th>
                    <th>Chroniona</th>
                    <th className="text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => goToView(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(r);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz rolę ${r.display_name}`}
                    >
                      <td>{r.display_name}</td>
                      <td>{r.access_count}</td>
                      <td>{r.is_protected ? 'Tak' : 'Nie'}</td>
                      <td>
                        <div className="action-icons">
                          <button
                            type="button"
                            className="action-icon-btn"
                            title="Edytuj"
                            aria-label={`Edytuj ${r.display_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/roles/${r.id}/edit`);
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          {canDelete && !r.is_protected && (
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${r.display_name}`}
                              onClick={(e) => handleDelete(e, r)}
                            >
                              <Icon name="delete" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              {roles.length} {roles.length === 1 ? 'wynik' : 'wyników'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
