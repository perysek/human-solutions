import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
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

// task1 (this addendum) — WorkersListPage's second filter dropdown.
const NEEDS_ATTENTION_OPTIONS = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'no', label: 'Nie wymaga uwagi' },
  { value: 'yes', label: 'Wymaga uwagi' },
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
  const [needsAttention, setNeedsAttention] = useState<'yes' | 'no' | 'all'>('all');
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
        needs_attention: needsAttention,
        sort: sortKey ?? undefined,
        order: sortOrder ?? undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [status, search, needsAttention, sortKey, sortOrder, page],
  );

  // task2 — stat cards atop the page, independent of the table's own
  // filters (a fixed "active roster" summary, same idea as DashboardPage's
  // own cards — they shouldn't jump around as the user types a search).
  const { data: summary, loading: summaryLoading } = useApiData(() => workersApi.needsAttentionSummary());

  const workers = data?.workers ?? [];

  function handleSort(key: string) {
    onSort(key);
    resetToFirstPage();
  }

  function goToView(worker: WorkerListItem) {
    // viewTransition: true — pairs with the matching view-transition-name on
    // the name cell below and on WorkerViewPage's PageHeader subtitle, so
    // the clicked row's name morphs into the detail page's heading instead
    // of hard-cutting to it.
    navigate(`/workers/${encodeURIComponent(worker.id)}`, { viewTransition: true });
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

      <div className="stats-grid">
        <StatCard
          label="Luka kompetencyjna"
          value={summaryLoading ? '…' : (summary?.gap_count ?? 0)}
          icon="checklist"
          color="orange"
          index={0}
        />
        <StatCard
          label="Wygasłe badania lekarskie"
          value={summaryLoading ? '…' : (summary?.medical_count ?? 0)}
          icon="warning"
          color="orange"
          index={1}
        />
        <StatCard
          label="Wygasłe szkolenia BHP"
          value={summaryLoading ? '…' : (summary?.bhp_count ?? 0)}
          icon="warning"
          color="orange"
          index={2}
        />
        <StatCard
          label="Łącznie wymaga uwagi"
          value={summaryLoading ? '…' : (summary?.total ?? 0)}
          icon="error_outline"
          color="orange"
          index={3}
        />
      </div>

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
          <SearchableSelect
            id="workers-status-filter"
            ariaLabel="Filtruj po statusie"
            fullWidth={false}
            triggerClassName="refined-select"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v as 'active' | 'inactive' | 'all');
              resetToFirstPage();
            }}
          />
          <SearchableSelect
            id="workers-needs-attention-filter"
            ariaLabel="Filtruj po wymaganiu uwagi"
            fullWidth={false}
            triggerClassName="refined-select"
            options={NEEDS_ATTENTION_OPTIONS}
            value={needsAttention}
            onChange={(v) => {
              setNeedsAttention(v as 'yes' | 'no' | 'all');
              resetToFirstPage();
            }}
          />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : workers.length === 0 ? (
          <EmptyState
            icon="people"
            title="Brak pracowników"
            message={search || needsAttention !== 'all' ? 'Żaden pracownik nie pasuje do wyszukiwania/filtrów.' : 'Dodaj pierwszego pracownika.'}
          />
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
                    <SortableTh label="Data zwolnienia" sortKey="fire_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <th>Status</th>
                    {canWrite && <th className="text-right"><span className="sr-only">Akcje</span></th>}
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
                      <td style={{ viewTransitionName: `worker-name-${w.id}` } as React.CSSProperties}>
                        {w.surname} {w.firstname}
                      </td>
                      <td>{w.job_description ?? '—'}</td>
                      <td>{w.boss_name ?? '—'}</td>
                      <td>{GENDER_LABELS[w.gender] ?? w.gender}</td>
                      <td>{w.hire_date ? new Date(w.hire_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>{w.fire_date ? new Date(w.fire_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <StatusBadge status={w.is_active ? 'active' : 'inactive'}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</StatusBadge>
                          {w.needs_attention && (
                            <span
                              title="Wymaga uwagi — luka kompetencyjna, wygasłe badanie lub szkolenie BHP"
                              aria-label="Wymaga uwagi"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-warning)',
                                background: 'rgba(154, 103, 0, 0.12)',
                                borderRadius: '9999px',
                                width: '1.25rem',
                                height: '1.25rem',
                                flexShrink: 0,
                              }}
                            >
                              <Icon name="warning" size={14} />
                            </span>
                          )}
                        </span>
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
