import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { employeesApi, EMPLOYMENT_STATUS_LABELS, type EmployeeListItem } from '@/lib/api/employees';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: 'active',
  on_leave: 'on-leave',
  terminated: 'terminated',
};

const STATUS_OPTIONS = Object.entries(EMPLOYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

function getSortValue(row: EmployeeListItem, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'position':
      return row.position;
    case 'employment_status':
      return row.employment_status;
    case 'hire_date':
      return row.hire_date;
    default:
      return null;
  }
}

export function EmployeesListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const canDelete = hasRole('superuser');

  const { data, loading, error, reload } = useApiData(() => employeesApi.list());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(STATUS_OPTIONS.map((o) => o.value)));

  const filtered = useMemo(() => {
    const rows = data?.employees ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((e) => {
      const matchesSearch = !q || e.full_name.toLowerCase().includes(q) || (e.position ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter.has(e.employment_status);
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

  async function handleDelete(e: React.MouseEvent, employee: EmployeeListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć pracownika?',
      message: `Rekord "${employee.full_name}" zostanie dezaktywowany.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await employeesApi.remove(employee.id);
      toast.success('Pracownik usunięty.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć pracownika.');
    }
  }

  function goToView(employee: EmployeeListItem) {
    navigate(`/employees/${employee.id}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Pracownicy"
        subtitle="Kadra salonu — dane, stanowiska, formy zatrudnienia"
        actions={
          <Button variant="primary" onClick={() => navigate('/employees/create')}>
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
              placeholder="Szukaj po imieniu, nazwisku lub stanowisku…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <div className="empty-state">
            <p className="empty-text">Ładowanie…</p>
          </div>
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="badge"
            title="Brak pracowników"
            message={search || statusFilter.size < STATUS_OPTIONS.length ? 'Żaden pracownik nie pasuje do filtrów.' : 'Dodaj pierwszego pracownika.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Imię i nazwisko" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Stanowisko" sortKey="position" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh
                      label="Status"
                      sortKey="employment_status"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                      filter={{ options: STATUS_OPTIONS, selected: statusFilter, onChange: setStatusFilter }}
                    />
                    <SortableTh label="Data zatrudnienia" sortKey="hire_date" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th>Kontakt</th>
                    <th className="text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => goToView(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') goToView(e);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      aria-label={`Zobacz pracownika ${e.full_name}`}
                    >
                      <td>{e.full_name}</td>
                      <td>{e.position ?? '—'}</td>
                      <td>
                        <span className={`status-badge ${STATUS_BADGE_CLASS[e.employment_status] ?? 'inactive'}`}>
                          {EMPLOYMENT_STATUS_LABELS[e.employment_status] ?? e.employment_status}
                        </span>
                      </td>
                      <td>{e.hire_date ?? '—'}</td>
                      <td>{e.phone ?? e.email ?? '—'}</td>
                      <td>
                        <div className="action-icons">
                          <button
                            type="button"
                            className="action-icon-btn"
                            title="Edytuj"
                            aria-label={`Edytuj ${e.full_name}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              navigate(`/employees/${e.id}/edit`);
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${e.full_name}`}
                              onClick={(ev) => handleDelete(ev, e)}
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
