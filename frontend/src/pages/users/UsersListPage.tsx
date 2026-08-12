import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { usersApi, type UserListItem } from '@/lib/api/users';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

const ROLE_LABELS: Record<string, string> = {
  superuser: 'Superadmin',
  admin: 'Administrator',
  receptionist: 'Recepcjonistka',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktywny' },
  { value: 'inactive', label: 'Nieaktywny' },
];

function getSortValue(row: UserListItem, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'email':
      return row.email;
    case 'role':
      return row.role;
    case 'is_active':
      return row.is_active ? 1 : 0;
    default:
      return null;
  }
}

export function UsersListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const canDelete = hasRole('superuser');

  const { data, loading, error, reload } = useApiData(() => usersApi.list());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(STATUS_OPTIONS.map((o) => o.value)));

  const filtered = useMemo(() => {
    const users = data?.users ?? [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter.has(u.is_active ? 'active' : 'inactive');
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

  async function handleDelete(e: React.MouseEvent, user: UserListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć użytkownika?',
      message: `Konto "${user.full_name}" (${user.email}) zostanie trwale usunięte.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await usersApi.remove(user.id);
      toast.success('Użytkownik usunięty.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć użytkownika.');
    }
  }

  function goToView(user: UserListItem) {
    navigate(`/users/${user.id}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Użytkownicy"
        subtitle="Konta logowania i przypisane role"
        actions={
          <Button variant="primary" onClick={() => navigate('/users/create')}>
            <Icon name="add" size={16} />
            Utwórz
          </Button>
        }
      />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po imieniu lub emailu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="people"
            title="Brak użytkowników"
            message={search || statusFilter.size < STATUS_OPTIONS.length ? 'Żaden użytkownik nie pasuje do filtrów.' : 'Dodaj pierwsze konto.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Imię i nazwisko" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Email" sortKey="email" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Rola" sortKey="role" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh
                      label="Status"
                      sortKey="is_active"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                      filter={{ options: STATUS_OPTIONS, selected: statusFilter, onChange: setStatusFilter }}
                    />
                    <th>Pracownik</th>
                    <th className="text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((u, i) => (
                    <tr
                      key={u.id}
                      onClick={() => goToView(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(u);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz użytkownika ${u.full_name}`}
                    >
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                      <td>
                        <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                          {u.is_active ? 'Aktywny' : 'Nieaktywny'}
                        </span>
                      </td>
                      <td>{u.employee_name ?? '—'}</td>
                      <td>
                        <div className="action-icons">
                          <button
                            type="button"
                            className="action-icon-btn"
                            title="Edytuj"
                            aria-label={`Edytuj ${u.full_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/users/${u.id}/edit`);
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${u.full_name}`}
                              onClick={(e) => handleDelete(e, u)}
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
              {sorted.length} {sorted.length === 1 ? 'wynik' : 'wyników'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
