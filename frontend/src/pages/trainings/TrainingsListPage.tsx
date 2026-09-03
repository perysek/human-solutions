import { useEffect, useState } from 'react';
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
import { useServerSort } from '@/lib/useServerSort';
import { trainingsApi, type TrainingListItem } from '@/lib/api/trainings';
import { useAuth } from '@/lib/auth/AuthContext';
import { OpenTrainingsTab } from './OpenTrainingsTab';

const PAGE_SIZE = 25;

type TabKey = 'list' | 'open';

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** TRN_1 — training catalog, now split into two tabs (Task 4): "Lista
 * szkoleń" is the original TRN_1 catalog below, unchanged; "Szkolenia
 * otwarte" (OpenTrainingsTab) is a separate report over the same /trainings
 * route, not a new page — client-side tab state, no router change. 4652
 * rows per IMPLEMENTATION_PLAN.md's data estimate for the catalog, the
 * collection PaginatedTable's `serverSide` mode actually exists for (same
 * shape as WorkersListPage, cross-cutting decision #7). */
export function TrainingsListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canCreate = hasRole('superadmin', 'hr_manager');

  const [tab, setTab] = useState<TabKey>('list');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const { sortKey, sortOrder, onSort } = useServerSort('training_date', 'asc');

  function resetToFirstPage() {
    setPage(1);
  }

  // Page reset lives on the debounced value's own effect, not search's
  // onChange, so it doesn't fire on every keystroke while typing.
  useEffect(() => {
    resetToFirstPage();
  }, [debouncedSearch]);

  const { data, loading, error } = useApiData(
    () =>
      trainingsApi.list({
        search: debouncedSearch || undefined,
        sort: sortKey ?? undefined,
        order: sortOrder ?? undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [debouncedSearch, sortKey, sortOrder, page],
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

      <div className="page-tabs" role="tablist" aria-label="Widok szkoleń">
        <button type="button" role="tab" aria-selected={tab === 'list'} className={`page-tab ${tab === 'list' ? 'is-active' : ''}`} onClick={() => setTab('list')}>
          Lista szkoleń
        </button>
        <button type="button" role="tab" aria-selected={tab === 'open'} className={`page-tab ${tab === 'open' ? 'is-active' : ''}`} onClick={() => setTab('open')}>
          Pracownicy do szkolenia
        </button>
      </div>

      {tab === 'open' ? (
        <OpenTrainingsTab />
      ) : (
        <>
          <div className="search-card">
            <div className="search-wrapper">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Szukaj po nazwie lub powiązanej umiejętności…"
              />
            </div>
          </div>

          <div className="table-container" style={{ flex: 1 }}>
            {loading ? (
              <TableSkeleton cols={6} />
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
                        <th>Prowadzący</th>
                        <SortableTh label="Data" sortKey="training_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                        <th>Data ostatniej sesji</th>
                        <th>Uczestników</th>
                        <SortableTh label="Ukończenie" sortKey="completion" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                        <th className="row-nav-hint-col" aria-hidden="true"></th>
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
                          <td>{t.trainer_names ?? '—'}</td>
                          <td>{fmt(t.training_date)}</td>
                          <td>{fmt(t.last_session_date)}</td>
                          <td>{t.participant_count}</td>
                          <td>{t.completion !== null ? `${t.completion}%` : '—'}</td>
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
        </>
      )}
    </div>
  );
}
