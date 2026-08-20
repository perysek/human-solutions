import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useServerSort } from '@/lib/useServerSort';
import { trainingsApi, type TrainingListItem } from '@/lib/api/trainings';
import { useAuth } from '@/lib/auth/AuthContext';

const PAGE_SIZE = 25;

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** TRN_1 — training catalog. 4652 rows per IMPLEMENTATION_PLAN.md's data
 * estimate, the collection PaginatedTable's `serverSide` mode actually
 * exists for (same shape as WorkersListPage, cross-cutting decision #7). */
export function TrainingsListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canCreate = hasRole('superadmin', 'hr_manager');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { sortKey, sortOrder, onSort } = useServerSort('training_date', 'asc');

  function resetToFirstPage() {
    setPage(1);
  }

  const { data, loading, error } = useApiData(
    () =>
      trainingsApi.list({
        search: search || undefined,
        sort: sortKey ?? undefined,
        order: sortOrder ?? undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [search, sortKey, sortOrder, page],
  );

  const trainings = data?.trainings ?? [];

  function handleSort(key: string) {
    onSort(key);
    resetToFirstPage();
  }

  function goToView(training: TrainingListItem) {
    navigate(`/trainings/${training.id}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Szkolenia wewnętrzne"
        subtitle="Katalog szkoleń"
        actions={
          canCreate && (
            <Button variant="primary" onClick={() => navigate('/trainings/create')}>
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
              placeholder="Szukaj po nazwie lub powiązanej umiejętności…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetToFirstPage();
              }}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={3} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : trainings.length === 0 ? (
          <EmptyState icon="badge" title="Brak szkoleń" message={search ? 'Żadne szkolenie nie pasuje do wyszukiwania.' : 'Dodaj pierwsze szkolenie.'} />
        ) : (
          <PaginatedTable
            rows={trainings}
            pageSize={PAGE_SIZE}
            serverSide={{ page, totalItems: data?.count ?? 0, onPageChange: setPage }}
          >
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Nazwa" sortKey="description" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableTh label="Data" sortKey="training_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableTh label="Ukończenie" sortKey="completion" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t, i) => (
                    <tr
                      key={t.id}
                      onClick={() => goToView(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(t);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz szkolenie ${t.description}`}
                    >
                      <td>{t.description}</td>
                      <td>{fmt(t.training_date)}</td>
                      <td>{t.completion !== null ? `${t.completion}%` : '—'}</td>
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
