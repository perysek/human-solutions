import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { SearchInput } from '@/components/ui/SearchInput';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useTableSort } from '@/lib/useTableSort';
import { rolesApi, type RoleListItem } from '@/lib/api/roles';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

function getSortValue(row: RoleListItem, key: string): string | number | null {
  switch (key) {
    case 'display_name':
      return row.display_name;
    case 'access_count':
      return row.access_count;
    case 'is_protected':
      return row.is_protected ? 1 : 0;
    default:
      return null;
  }
}

export function RolesListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const canDelete = hasRole('superadmin');

  const { data, loading, error, reload } = useApiData(() => rolesApi.list());
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    const roles = data?.roles ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.display_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [data, debouncedSearch]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

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

      <div className="search-card">
        <div className="search-wrapper">
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj po nazwie roli…" />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="checklist" title="Brak ról" message={search ? 'Żadna rola nie pasuje do wyszukiwania.' : 'Dodaj pierwszą rolę.'} />
        ) : (
          <PaginatedTable rows={sorted}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Nazwa" sortKey="display_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Moduły z dostępem" sortKey="access_count" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Chroniona" sortKey="is_protected" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th className="text-right"><span className="sr-only">Akcje</span></th>
                    <th className="row-nav-hint-col" aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => goToView(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(r);
                      }}
                      tabIndex={0}
                      style={{
                        cursor: 'pointer',
                        animationDelay: `${Math.min(i, 7) * 30}ms`,
                      }}
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
                      <td className="row-nav-hint-col">
                        <Icon name="chevron_right" size={16} className="row-nav-hint" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        )}
      </div>
    </div>
  );
}
