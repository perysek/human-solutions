import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { SelectWrap } from '@/components/ui/SelectWrap';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useServerSort } from '@/lib/useServerSort';
import { workersApi, type WorkerListItem } from '@/lib/api/workers';
import { useAuth } from '@/lib/auth/AuthContext';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktywni' },
  { value: 'inactive', label: 'Nieaktywni' },
  { value: 'all', label: 'Wszyscy' },
];

const GENDER_LABELS: Record<string, string> = {
  Male: 'Mężczyzna',
  Female: 'Kobieta',
  UNKNOWN: 'Nie podano',
};

const PAGE_SIZE = 25;

export function WorkersListPage() {
  const navigate = useNavigate();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const { sortKey, sortOrder, onSort } = useServerSort('surname', 'asc');

  function resetToFirstPage() {
    setPage(1);
  }

  const { data, loading, error } = useApiData(
    () =>
      workersApi.list({
        status,
        search: search || undefined,
        sort: sortKey ?? undefined,
        order: sortOrder ?? undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [status, search, sortKey, sortOrder, page],
  );

  const workers = data?.workers ?? [];

  function handleSort(key: string) {
    onSort(key);
    resetToFirstPage();
  }

  function goToView(worker: WorkerListItem) {
    navigate(`/workers/${encodeURIComponent(worker.id)}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Pracownicy"
        subtitle="Lista pracowników"
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => navigate('/workers/create')}>
              <Icon name="add" size={16} />
              Utwórz
            </Button>
          )
        }
      />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po nazwisku, imieniu lub stanowisku…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetToFirstPage();
              }}
            />
          </div>
          <SelectWrap inline>
            <select
              className="refined-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as 'active' | 'inactive' | 'all');
                resetToFirstPage();
              }}
              aria-label="Filtruj po statusie"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </SelectWrap>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={5} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : workers.length === 0 ? (
          <EmptyState icon="people" title="Brak pracowników" message={search ? 'Żaden pracownik nie pasuje do wyszukiwania.' : 'Dodaj pierwszego pracownika.'} />
        ) : (
          <PaginatedTable
            rows={workers}
            pageSize={PAGE_SIZE}
            serverSide={{ page, totalItems: data?.count ?? 0, onPageChange: setPage }}
          >
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Nazwisko i imię" sortKey="surname" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableTh label="Stanowisko" sortKey="job_id" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <th>Przełożony</th>
                    <th>Płeć</th>
                    <SortableTh label="Data zatrudnienia" sortKey="hire_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <th>Status</th>
                    {canWrite && <th className="text-right">Akcje</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((w, i) => (
                    <tr
                      key={w.id}
                      onClick={() => goToView(w)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(w);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz pracownika ${w.full_name}`}
                    >
                      <td>{w.surname} {w.firstname}</td>
                      <td>{w.job_description ?? '—'}</td>
                      <td>{w.boss_name ?? '—'}</td>
                      <td>{GENDER_LABELS[w.gender] ?? w.gender}</td>
                      <td>{w.hire_date ? new Date(w.hire_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>
                        <span className={`status-badge ${w.is_active ? 'active' : 'inactive'}`}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</span>
                      </td>
                      {canWrite && (
                        <td>
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edytuj"
                              aria-label={`Edytuj ${w.full_name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/workers/${encodeURIComponent(w.id)}/edit`);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                          </div>
                        </td>
                      )}
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
